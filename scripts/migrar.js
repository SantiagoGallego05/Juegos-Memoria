// Pone al dia una base de datos ya creada con versiones anteriores del proyecto.
// Revisa que tablas y columnas faltan y agrega solo esas, asi que se puede
// ejecutar las veces que quiera (no repite ni borra nada).
//   npm run migrar
// Funciona igual en MySQL local y en la base de datos de la nube (segun su .env).
// ENV_FILE permite usar otro archivo de configuracion (por ejemplo .env.nube)
require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { leerSentencias } = require('./crear_tablas');

// Columnas agregadas despues de la primera version. Si la tabla ya existia sin
// ellas, se agregan; si la tabla es nueva, ya las trae y no se hace nada.
const COLUMNAS_NUEVAS = [
  {
    tabla: 'usuarios', columna: 'correo',
    sql: 'ALTER TABLE usuarios ADD COLUMN correo VARCHAR(150) NULL AFTER nombre_responsable, ' +
         'ADD UNIQUE KEY uq_usuarios_correo (correo)'
  },
  {
    tabla: 'partidas_parejas', columna: 'columnas',
    sql: 'ALTER TABLE partidas_parejas ADD COLUMN columnas TINYINT UNSIGNED NOT NULL DEFAULT 4 AFTER nombre_paciente'
  },
  {
    tabla: 'partidas_parejas', columna: 'filas',
    sql: 'ALTER TABLE partidas_parejas ADD COLUMN filas TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER columnas'
  },
  {
    // requiere que exista la tabla imagenes_usuario (se crea en el paso 1)
    tabla: 'respuestas', columna: 'imagen_id',
    sql: 'ALTER TABLE respuestas ADD COLUMN imagen_id INT UNSIGNED NULL AFTER imagen, ' +
         'ADD KEY idx_respuestas_imagen (imagen_id), ' +
         'ADD CONSTRAINT fk_respuestas_imagen FOREIGN KEY (imagen_id) REFERENCES imagenes_usuario (id) ON DELETE SET NULL'
  }
];

async function tablaExiste(db, tabla) {
  const [f] = await db.query(
    'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [tabla]
  );
  return Number(f[0].n) > 0;
}

async function columnaExiste(db, tabla, columna) {
  const [f] = await db.query(
    'SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [tabla, columna]
  );
  return Number(f[0].n) > 0;
}

async function migrar(db, registrar = console.log) {
  const hechos = [];

  // 1) Tablas que falten (las que ya existen no se tocan)
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  for (const sentencia of leerSentencias(sql)) {
    const tabla = (sentencia.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i) || [])[1];
    const existia = tabla ? await tablaExiste(db, tabla) : true;
    await db.query(sentencia);
    if (tabla && !existia) {
      hechos.push(`tabla ${tabla}`);
      registrar(`Creada la tabla ${tabla}`);
    }
  }

  // 2) Columnas que falten en tablas que ya existian
  for (const { tabla, columna, sql: alter } of COLUMNAS_NUEVAS) {
    if (!(await columnaExiste(db, tabla, columna))) {
      await db.query(alter);
      hechos.push(`${tabla}.${columna}`);
      registrar(`Agregada la columna ${tabla}.${columna}`);
    }
  }

  registrar(hechos.length ? 'Listo: la base de datos quedó al día.' : 'La base de datos ya estaba al día. No se cambió nada.');
  return hechos;
}

if (require.main === module) {
  migrar(pool)
    .then(() => pool.end())
    .catch((err) => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

module.exports = { migrar };
