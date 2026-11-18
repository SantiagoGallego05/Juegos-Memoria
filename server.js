require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const { enviarRecuperacion } = require('./correo');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const CARPETA_IMAGENES = path.join(__dirname, 'public', 'imagenes');
const EXTENSIONES_VALIDAS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];
const CANTIDAD_IMAGENES = 5;
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_BASE = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');

// ------------------------------------------------------------
// Configuracion general
// ------------------------------------------------------------
let secreto = process.env.SESSION_SECRET;
if (!secreto || secreto.startsWith('cambie_esto')) {
  secreto = crypto.randomBytes(32).toString('hex');
  console.warn('AVISO: defina SESSION_SECRET en el archivo .env (las sesiones se perderan al reiniciar).');
}

// Detras del proxy del hosting (Render, etc.) hace falta para que las cookies
// seguras y la IP de cada visitante funcionen bien.
app.set('trust proxy', 1);

app.use(express.json({ limit: '100kb' }));
app.use(session({
  secret: secreto,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // en produccion use HTTPS
    maxAge: 1000 * 60 * 60 * 8                      // 8 horas
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Lo usa el hosting para saber que la aplicacion esta viva
app.get('/salud', (req, res) => res.json({ ok: true }));

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
function texto(valor, max) {
  return typeof valor === 'string' ? valor.trim().slice(0, max) : '';
}

function requiereSesion(req, res, next) {
  if (!req.session.usuario) {
    return res.status(401).json({ error: 'Debe iniciar sesión.' });
  }
  next();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Limite sencillo de peticiones por IP (en memoria), para frenar abusos
function limitador({ ventanaMs, max, mensaje }) {
  const registro = new Map();
  setInterval(() => {
    const ahora = Date.now();
    for (const [ip, e] of registro) if (e.reinicio < ahora) registro.delete(ip);
  }, ventanaMs).unref();

  return (req, res, next) => {
    const ahora = Date.now();
    let e = registro.get(req.ip);
    if (!e || e.reinicio < ahora) {
      e = { cuenta: 0, reinicio: ahora + ventanaMs };
      registro.set(req.ip, e);
    }
    if (++e.cuenta > max) return res.status(429).json({ error: mensaje });
    next();
  };
}

const MENSAJE_LIMITE = 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
const limiteRecuperar = limitador({ ventanaMs: 15 * 60 * 1000, max: 8, mensaje: MENSAJE_LIMITE });
const limiteRestablecer = limitador({ ventanaMs: 15 * 60 * 1000, max: 15, mensaje: MENSAJE_LIMITE });

function listarImagenes() {
  if (!fs.existsSync(CARPETA_IMAGENES)) return [];
  return fs.readdirSync(CARPETA_IMAGENES).filter(nombre =>
    EXTENSIONES_VALIDAS.includes(path.extname(nombre).toLowerCase())
  );
}

function mezclar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function guardarSesion(req, usuario) {
  return new Promise((resolve, reject) => {
    // regenerate evita el robo de sesion (session fixation)
    req.session.regenerate(err => {
      if (err) return reject(err);
      req.session.usuario = usuario;
      req.session.save(err2 => (err2 ? reject(err2) : resolve()));
    });
  });
}

// ------------------------------------------------------------
// Cuentas: registro, login, logout
// ------------------------------------------------------------
app.post('/api/registro', async (req, res, next) => {
  try {
    const nombre = texto(req.body.nombreResponsable, 100);
    const usuario = texto(req.body.usuario, 50);
    const correo = texto(req.body.correo, 150).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const confirmar = typeof req.body.confirmar === 'string' ? req.body.confirmar : '';

    if (!nombre || !usuario || !correo || !password) {
      return res.status(400).json({ error: 'Complete todos los campos.' });
    }
    if (!CORREO_VALIDO.test(correo)) {
      return res.status(400).json({ error: 'Escriba un correo válido.' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres.' });
    }
    if (password.length > 72) {
      return res.status(400).json({ error: 'La contraseña es demasiado larga (máximo 72).' });
    }
    if (password !== confirmar) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden.' });
    }

    const hash = await bcrypt.hash(password, 10);
    try {
      await pool.execute(
        'INSERT INTO usuarios (usuario, password_hash, nombre_responsable, correo) VALUES (?, ?, ?, ?)',
        [usuario, hash, nombre, correo]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        const motivo = String(err.sqlMessage || err.message).includes('uq_usuarios_correo')
          ? 'Ese correo ya está registrado en otra cuenta.'
          : 'Ese usuario ya existe. Elija otro.';
        return res.status(409).json({ error: motivo });
      }
      throw err;
    }
    res.status(201).json({ ok: true, usuario });
  } catch (err) { next(err); }
});

app.post('/api/login', async (req, res, next) => {
  try {
    const usuario = texto(req.body.usuario, 50);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!usuario || !password) {
      return res.status(400).json({ error: 'Ingrese usuario y contraseña.' });
    }

    const [filas] = await pool.execute(
      'SELECT id, usuario, password_hash, nombre_responsable, correo FROM usuarios WHERE usuario = ?',
      [usuario]
    );
    const fila = filas[0];
    const valido = fila && await bcrypt.compare(password, fila.password_hash);
    if (!valido) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const datos = {
      id: fila.id,
      usuario: fila.usuario,
      nombreResponsable: fila.nombre_responsable,
      correo: fila.correo
    };
    await guardarSesion(req, datos);
    res.json(datos);
  } catch (err) { next(err); }
});

app.post('/api/logout', (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

app.get('/api/yo', (req, res) => {
  res.json({ usuario: req.session.usuario || null });
});

// ------------------------------------------------------------
// Recuperacion de contraseña
// ------------------------------------------------------------
const RESPUESTA_RECUPERAR =
  'Si el correo está registrado, recibirá un enlace para elegir una nueva contraseña. ' +
  'Puede tardar unos minutos; revise también la carpeta de spam.';

async function enviarEnlaceRecuperacion(correo) {
  const [filas] = await pool.execute(
    'SELECT id, nombre_responsable FROM usuarios WHERE correo = ?',
    [correo]
  );
  if (!filas.length) return; // no se avisa al visitante si el correo existe o no

  const { id, nombre_responsable: nombre } = filas[0];

  await pool.execute('DELETE FROM recuperaciones WHERE expira_en < NOW()');

  // Evita llenar de correos a alguien: maximo un enlace por minuto
  const [recientes] = await pool.execute(
    'SELECT 1 FROM recuperaciones WHERE usuario_id = ? AND creado_en > DATE_SUB(NOW(), INTERVAL 1 MINUTE) LIMIT 1',
    [id]
  );
  if (recientes.length) return;

  const token = crypto.randomBytes(32).toString('hex');
  await pool.execute('DELETE FROM recuperaciones WHERE usuario_id = ?', [id]);
  await pool.execute(
    'INSERT INTO recuperaciones (usuario_id, token_hash, expira_en) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))',
    [id, hashToken(token)]
  );

  // El token va despues del # para que no quede en registros del servidor
  await enviarRecuperacion({ para: correo, nombre, enlace: `${URL_BASE}/#restablecer=${token}` });
}

app.post('/api/recuperar', limiteRecuperar, (req, res) => {
  const correo = texto(req.body.correo, 150).toLowerCase();
  if (!CORREO_VALIDO.test(correo)) {
    return res.status(400).json({ error: 'Escriba un correo válido.' });
  }

  // Se responde de inmediato y el resto se hace aparte: asi la respuesta y su
  // tiempo son iguales exista o no el correo.
  res.json({ ok: true, mensaje: RESPUESTA_RECUPERAR });
  enviarEnlaceRecuperacion(correo).catch((err) => {
    console.error('Recuperación de contraseña:', err.message);
  });
});

app.post('/api/restablecer', limiteRestablecer, async (req, res, next) => {
  let conexion;
  try {
    const token = typeof req.body.token === 'string' ? req.body.token : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const confirmar = typeof req.body.confirmar === 'string' ? req.body.confirmar : '';

    if (!/^[a-f0-9]{64}$/.test(token)) {
      return res.status(400).json({ error: 'El enlace no es válido. Solicite uno nuevo.' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres.' });
    }
    if (password.length > 72) {
      return res.status(400).json({ error: 'La contraseña es demasiado larga (máximo 72).' });
    }
    if (password !== confirmar) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden.' });
    }

    const nuevoHash = await bcrypt.hash(password, 10);

    conexion = await pool.getConnection();
    await conexion.beginTransaction();

    // FOR UPDATE: si llegan dos solicitudes con el mismo enlace, solo una gana
    const [filas] = await conexion.execute(
      'SELECT usuario_id FROM recuperaciones WHERE token_hash = ? AND expira_en > NOW() FOR UPDATE',
      [hashToken(token)]
    );
    if (!filas.length) {
      await conexion.rollback();
      return res.status(400).json({ error: 'El enlace venció o ya fue usado. Solicite uno nuevo.' });
    }

    const usuarioId = filas[0].usuario_id;
    await conexion.execute('UPDATE usuarios SET password_hash = ? WHERE id = ?', [nuevoHash, usuarioId]);
    await conexion.execute('DELETE FROM recuperaciones WHERE usuario_id = ?', [usuarioId]);
    await conexion.commit();

    res.json({ ok: true });
  } catch (err) {
    if (conexion) await conexion.rollback().catch(() => {});
    next(err);
  } finally {
    if (conexion) conexion.release();
  }
});

// Agregar o cambiar el correo de recuperacion (pide la contraseña actual)
app.put('/api/correo', requiereSesion, async (req, res, next) => {
  try {
    const correo = texto(req.body.correo, 150).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!CORREO_VALIDO.test(correo)) {
      return res.status(400).json({ error: 'Escriba un correo válido.' });
    }

    const [filas] = await pool.execute(
      'SELECT password_hash FROM usuarios WHERE id = ?',
      [req.session.usuario.id]
    );
    const correcta = filas.length && await bcrypt.compare(password, filas[0].password_hash);
    if (!correcta) {
      // 403 y no 401: el navegador usa 401 para "su sesion terminó"
      return res.status(403).json({ error: 'La contraseña actual no es correcta.' });
    }

    try {
      await pool.execute('UPDATE usuarios SET correo = ? WHERE id = ?', [correo, req.session.usuario.id]);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Ese correo ya está registrado en otra cuenta.' });
      }
      throw err;
    }

    req.session.usuario.correo = correo;
    res.json({ ok: true, correo });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------
// Juego de Recuerdos
// ------------------------------------------------------------

// Elige 5 imagenes al azar. ?fuente=juego (las de la carpeta public/imagenes),
// mias (las que subio el responsable) o todas (ambas).
const FUENTES = ['juego', 'mias', 'todas'];

app.get('/api/imagenes/aleatorias', requiereSesion, async (req, res, next) => {
  try {
    const fuente = FUENTES.includes(req.query.fuente) ? req.query.fuente : 'juego';
    const candidatas = [];

    if (fuente !== 'mias') {
      for (const nombre of listarImagenes()) {
        candidatas.push({ nombre, url: `imagenes/${encodeURIComponent(nombre)}`, imagenId: null });
      }
    }

    let propias = 0;
    if (fuente !== 'juego') {
      const [filas] = await pool.execute(
        'SELECT id, nombre FROM imagenes_usuario WHERE usuario_id = ?',
        [req.session.usuario.id]
      );
      propias = filas.length;
      for (const f of filas) {
        candidatas.push({ nombre: f.nombre, url: `/api/mis-imagenes/${f.id}`, imagenId: f.id });
      }
    }

    if (candidatas.length < CANTIDAD_IMAGENES) {
      const error = fuente === 'mias'
        ? `Necesita al menos ${CANTIDAD_IMAGENES} imágenes propias. Ahora tiene ${propias}.`
        : `Se necesitan al menos ${CANTIDAD_IMAGENES} imágenes. Encontradas: ${candidatas.length}.`;
      return res.status(400).json({ error });
    }
    res.json({ imagenes: mezclar(candidatas).slice(0, CANTIDAD_IMAGENES) });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------
// Mis imagenes: fotos que sube cada responsable (privadas de quien las sube)
// ------------------------------------------------------------
const MAX_IMAGENES_USUARIO = 30;
const MAX_BYTES_IMAGEN = 2 * 1024 * 1024;
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];

// Se mira el contenido real del archivo, no lo que diga el navegador
function detectarTipo(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function limpiarNombre(valor) {
  if (typeof valor !== 'string') return '';
  return valor.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100);
}

app.get('/api/mis-imagenes', requiereSesion, async (req, res, next) => {
  try {
    const [filas] = await pool.execute(
      `SELECT id, nombre, bytes, creada_en AS creada
         FROM imagenes_usuario
        WHERE usuario_id = ?
        ORDER BY creada_en DESC, id DESC`,
      [req.session.usuario.id]
    );
    res.json({ imagenes: filas, maximo: MAX_IMAGENES_USUARIO });
  } catch (err) { next(err); }
});

app.post('/api/mis-imagenes', requiereSesion,
  express.raw({ type: TIPOS_IMAGEN, limit: MAX_BYTES_IMAGEN + 1024 }),
  async (req, res, next) => {
    try {
      const datos = req.body;
      if (!Buffer.isBuffer(datos) || datos.length === 0) {
        return res.status(400).json({ error: 'Envíe una imagen JPG, PNG o WEBP.' });
      }
      if (datos.length > MAX_BYTES_IMAGEN) {
        return res.status(413).json({ error: 'La imagen es demasiado grande (máximo 2 MB).' });
      }
      const tipo = detectarTipo(datos);
      if (!tipo) {
        return res.status(400).json({ error: 'El archivo no es una imagen válida (use JPG, PNG o WEBP).' });
      }

      const usuarioId = req.session.usuario.id;
      const [cuenta] = await pool.execute(
        'SELECT COUNT(*) AS total FROM imagenes_usuario WHERE usuario_id = ?',
        [usuarioId]
      );
      if (Number(cuenta[0].total) >= MAX_IMAGENES_USUARIO) {
        return res.status(409).json({
          error: `Llegó al máximo de ${MAX_IMAGENES_USUARIO} imágenes. Elimine alguna para subir otra.`
        });
      }

      const nombre = limpiarNombre(req.query.nombre) || 'Imagen';
      const [r] = await pool.execute(
        'INSERT INTO imagenes_usuario (usuario_id, nombre, tipo, bytes, datos) VALUES (?, ?, ?, ?, ?)',
        [usuarioId, nombre, tipo, datos.length, datos]
      );
      res.status(201).json({ ok: true, id: r.insertId, nombre });
    } catch (err) { next(err); }
  });

app.get('/api/mis-imagenes/:id', requiereSesion, async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Identificador no válido.' });
    }
    const [filas] = await pool.execute(
      'SELECT tipo, datos FROM imagenes_usuario WHERE id = ? AND usuario_id = ?',
      [id, req.session.usuario.id]
    );
    if (!filas.length) {
      return res.status(404).json({ error: 'Imagen no encontrada.' });
    }
    res.set({
      'Content-Type': filas[0].tipo,
      // no-cache: el navegador siempre vuelve a preguntar, y aqui se revisa la
      // sesion; asi, en un computador compartido, otra cuenta no ve fotos ajenas
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox"
    });
    res.send(filas[0].datos);
  } catch (err) { next(err); }
});

app.delete('/api/mis-imagenes/:id', requiereSesion, async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Identificador no válido.' });
    }
    const [r] = await pool.execute(
      'DELETE FROM imagenes_usuario WHERE id = ? AND usuario_id = ?',
      [id, req.session.usuario.id]
    );
    if (!r.affectedRows) {
      return res.status(404).json({ error: 'Imagen no encontrada.' });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Guarda una partida completa (equivale al antiguo Resultado_*.txt)
app.post('/api/partidas', requiereSesion, async (req, res, next) => {
  let conexion;
  try {
    const nombrePaciente = texto(req.body.nombrePaciente, 100);
    const respuestas = req.body.respuestas;

    if (!nombrePaciente) {
      return res.status(400).json({ error: 'Falta el nombre del adulto mayor.' });
    }
    if (!Array.isArray(respuestas) || respuestas.length !== CANTIDAD_IMAGENES) {
      return res.status(400).json({ error: `Se esperaban ${CANTIDAD_IMAGENES} respuestas.` });
    }

    const permitidas = new Set(listarImagenes());
    const hayId = (r) => r && r.imagenId !== null && r.imagenId !== undefined;

    // Las imagenes propias se comprueban en la base: deben ser de este usuario
    const ids = respuestas.filter(hayId).map((r) => r.imagenId);
    if (!ids.every((id) => Number.isInteger(id) && id > 0)) {
      return res.status(400).json({ error: 'Imagen no válida en la partida.' });
    }
    const propias = new Map();
    if (ids.length) {
      const [encontradas] = await pool.execute(
        `SELECT id, nombre FROM imagenes_usuario WHERE usuario_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
        [req.session.usuario.id, ...ids]
      );
      encontradas.forEach((f) => propias.set(f.id, f.nombre));
    }

    const filas = [];
    for (let i = 0; i < respuestas.length; i++) {
      const r = respuestas[i] || {};
      const respuesta = texto(r.respuesta, 2000);
      let imagen;
      let imagenId = null;
      if (hayId(r)) {
        imagenId = r.imagenId;
        imagen = propias.get(imagenId);          // el nombre sale de la base, no del navegador
      } else {
        const nombre = texto(r.imagen, 255);
        imagen = permitidas.has(nombre) ? nombre : undefined;
      }
      if (!imagen) {
        return res.status(400).json({ error: 'Imagen no válida en la partida.' });
      }
      filas.push([i + 1, imagen, imagenId, respuesta]);
    }

    conexion = await pool.getConnection();
    await conexion.beginTransaction();

    const [resultado] = await conexion.execute(
      'INSERT INTO partidas (usuario_id, nombre_paciente) VALUES (?, ?)',
      [req.session.usuario.id, nombrePaciente]
    );
    const partidaId = resultado.insertId;

    await conexion.query(
      'INSERT INTO respuestas (partida_id, orden, imagen, imagen_id, respuesta) VALUES ?',
      [filas.map(f => [partidaId, ...f])]
    );

    await conexion.commit();
    res.status(201).json({ ok: true, partidaId });
  } catch (err) {
    if (conexion) await conexion.rollback().catch(() => {});
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(409).json({ error: 'Una de las imágenes ya no existe. Inicie una partida nueva.' });
    }
    next(err);
  } finally {
    if (conexion) conexion.release();
  }
});

// Historial del responsable que inicio sesion
app.get('/api/partidas', requiereSesion, async (req, res, next) => {
  try {
    const [filas] = await pool.execute(
      `SELECT id, nombre_paciente AS nombrePaciente, fecha
         FROM partidas
        WHERE usuario_id = ?
        ORDER BY fecha DESC, id DESC
        LIMIT 100`,
      [req.session.usuario.id]
    );
    res.json({ partidas: filas });
  } catch (err) { next(err); }
});

app.get('/api/partidas/:id', requiereSesion, async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Identificador no válido.' });
    }

    const [partidas] = await pool.execute(
      `SELECT id, nombre_paciente AS nombrePaciente, fecha
         FROM partidas WHERE id = ? AND usuario_id = ?`,
      [id, req.session.usuario.id]
    );
    if (!partidas.length) {
      return res.status(404).json({ error: 'Partida no encontrada.' });
    }

    const [respuestas] = await pool.execute(
      'SELECT orden, imagen, imagen_id AS imagenId, respuesta FROM respuestas WHERE partida_id = ? ORDER BY orden',
      [id]
    );
    res.json({ partida: partidas[0], respuestas });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------
// Juego de Parejas
// ------------------------------------------------------------
// Tableros permitidos [columnas, filas]. Debe coincidir con public/js/parejas.js
const TABLEROS = [[3, 2], [4, 2], [4, 3], [4, 4], [5, 4]];

app.post('/api/parejas', requiereSesion, async (req, res, next) => {
  try {
    const nombrePaciente = texto(req.body.nombrePaciente, 100);
    const { intentos, duracionSeg, columnas, filas } = req.body;

    if (!nombrePaciente) {
      return res.status(400).json({ error: 'Falta el nombre del adulto mayor.' });
    }
    if (!TABLEROS.some(([c, f]) => c === columnas && f === filas)) {
      return res.status(400).json({ error: 'Tamaño de tablero no válido.' });
    }
    const parejas = (columnas * filas) / 2;   // el minimo posible de intentos es una pareja por intento
    if (!Number.isInteger(intentos) || intentos < parejas || intentos > 999 ||
        !Number.isInteger(duracionSeg) || duracionSeg < 0 || duracionSeg > 60000) {
      return res.status(400).json({ error: 'Datos de la partida no válidos.' });
    }

    const [r] = await pool.execute(
      `INSERT INTO partidas_parejas (usuario_id, nombre_paciente, columnas, filas, intentos, duracion_seg)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.session.usuario.id, nombrePaciente, columnas, filas, intentos, duracionSeg]
    );
    res.status(201).json({ ok: true, partidaId: r.insertId });
  } catch (err) { next(err); }
});

app.get('/api/parejas', requiereSesion, async (req, res, next) => {
  try {
    const [filas] = await pool.execute(
      `SELECT id, nombre_paciente AS nombrePaciente, columnas, filas, intentos,
              duracion_seg AS duracionSeg, fecha
         FROM partidas_parejas
        WHERE usuario_id = ?
        ORDER BY fecha DESC, id DESC
        LIMIT 100`,
      [req.session.usuario.id]
    );
    res.json({ partidas: filas });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------
// Errores
// ------------------------------------------------------------
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El archivo es demasiado grande.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Solicitud no válida.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error del servidor. Intente de nuevo.' });
});

// Verifica la conexion a MySQL al arrancar
pool.query('SELECT 1')
  .then(() => {
    app.listen(PORT, () => console.log(`Servidor listo en http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('No se pudo conectar a MySQL:', err.message);
    console.error('Revise el archivo .env y que el servidor MySQL esté encendido.');
    process.exit(1);
  });
