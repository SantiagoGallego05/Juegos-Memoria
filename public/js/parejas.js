// Juego de Parejas (version web): exige sesion, pide el nombre del adulto mayor y
// la dificultad (tamaño del tablero), y guarda tablero, intentos y tiempo en MySQL
// al terminar cada partida.
import { $, mostrar, mensaje, formatearFecha } from './nav.js';
import { api } from './api.js';
import { obtenerUsuario, exigirSesion, sesionExpirada, cerrarSesion } from './sesion.js';

// Debe coincidir con TABLEROS en server.js
const NIVELES = [
  { id: 'facil',   nombre: 'Fácil',   columnas: 3, filas: 2 },
  { id: 'normal',  nombre: 'Normal',  columnas: 4, filas: 2 },
  { id: 'medio',   nombre: 'Medio',   columnas: 4, filas: 3 },
  { id: 'dificil', nombre: 'Difícil', columnas: 4, filas: 4 },
  { id: 'experto', nombre: 'Experto', columnas: 5, filas: 4 }
];
const NIVEL_INICIAL = 'normal';

// El tablero mas grande usa 10 parejas; se sortean entre estas 12
const SIMBOLOS = [
  { nombre: 'MANZANA', simbolo: '🍎' }, { nombre: 'CAFÉ', simbolo: '☕' },
  { nombre: 'CASA', simbolo: '🏠' },    { nombre: 'FLORES', simbolo: '🌸' },
  { nombre: 'PERRO', simbolo: '🐶' },   { nombre: 'CARRO', simbolo: '🚗' },
  { nombre: 'BALÓN', simbolo: '⚽' },   { nombre: 'PASTEL', simbolo: '🎂' },
  { nombre: 'SOL', simbolo: '🌞' },     { nombre: 'PEZ', simbolo: '🐟' },
  { nombre: 'GLOBO', simbolo: '🎈' },   { nombre: 'LIBRO', simbolo: '📖' }
];
const MS_ANTES_DE_COMPROBAR = 800;
const MS_ANTES_DE_OCULTAR = 500;

let nivel = NIVELES.find((n) => n.id === NIVEL_INICIAL);
let totalParejas = 0;
let cartas = [];
let primera = null;
let bloqueado = false;
let intentos = 0;
let encontradas = 0;
let temporizadores = [];

let paciente = '';          // adulto mayor que esta jugando
let inicio = 0;             // marca de tiempo del primer clic de la partida
let pendiente = null;       // resultado que aun no se ha guardado en la base de datos

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------
function mezclar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function esperar(fn, ms) {
  temporizadores.push(setTimeout(fn, ms));
}

function formatearTiempo(segundos) {
  const m = Math.floor(segundos / 60);
  const s = String(segundos % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function describirTablero(columnas, filas) {
  const n = NIVELES.find((x) => x.columnas === columnas && x.filas === filas);
  return n ? `${n.nombre} (${columnas} × ${filas})` : `${columnas} × ${filas}`;
}

function actualizarInformacion() {
  $('#parejas-contador').textContent = `Parejas: ${encontradas} / ${totalParejas}`;
  $('#parejas-intentos').textContent = `Intentos: ${intentos}`;
}

// ---------------------------------------------------------------
// Entrada: sesion, adulto mayor y dificultad
// ---------------------------------------------------------------
export function abrirParejas() {
  return exigirSesion({ titulo: 'Juego de Parejas', alIniciar: irADatosParejas });
}

function pintarNiveles() {
  const contenedor = $('#niveles-parejas');
  contenedor.replaceChildren();
  NIVELES.forEach((n) => {
    const etiqueta = document.createElement('label');
    etiqueta.className = 'opcion';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'nivel';
    radio.value = n.id;
    radio.defaultChecked = n.id === NIVEL_INICIAL;

    const titulo = document.createElement('span');
    titulo.className = 'opcion-titulo';
    titulo.textContent = n.nombre;

    const detalle = document.createElement('span');
    detalle.className = 'opcion-detalle';
    detalle.textContent = `${n.columnas} × ${n.filas} · ${n.columnas * n.filas} tarjetas (${(n.columnas * n.filas) / 2} parejas)`;

    etiqueta.append(radio, titulo, detalle);
    contenedor.append(etiqueta);
  });
}

// conservar=true: se vuelve desde el juego y se recuerdan el nombre y el nivel
function irADatosParejas(conservar = false) {
  detenerParejas();
  const usuario = obtenerUsuario();
  $('#datos-parejas-responsable').textContent =
    `Responsable: ${usuario.nombreResponsable} (usuario: ${usuario.usuario})`;

  $('#form-datos-parejas').reset();
  if (conservar && paciente) {
    $('#datos-parejas-paciente').value = paciente;
    const radio = document.querySelector(`#niveles-parejas input[value="${nivel.id}"]`);
    if (radio) radio.checked = true;
  }

  mensaje('#datos-parejas-mensaje', usuario.correo ? '' :
    'Consejo: agregue un correo de recuperación para poder restablecer su contraseña si la olvida.', true);
  mostrar('pantalla-datos-parejas');
  $('#datos-parejas-paciente').focus();
}

function empezarConPaciente(e) {
  e.preventDefault();
  const nombre = $('#datos-parejas-paciente').value.trim();
  if (!nombre) {
    mensaje('#datos-parejas-mensaje', 'Ingrese el nombre del adulto mayor.');
    return;
  }
  const elegido = document.querySelector('#niveles-parejas input[name="nivel"]:checked');
  nivel = NIVELES.find((n) => n.id === (elegido && elegido.value)) || NIVELES.find((n) => n.id === NIVEL_INICIAL);

  paciente = nombre;
  $('#parejas-jugador').textContent =
    `Adulto mayor: ${paciente} · Nivel: ${describirTablero(nivel.columnas, nivel.filas)}`;
  reiniciarParejas();
  mostrar('pantalla-parejas');
}

// ---------------------------------------------------------------
// Tablero
// ---------------------------------------------------------------
function pintarCarta(carta) {
  const b = carta.boton;
  b.className = 'carta';
  if (carta.descubierta) b.classList.add('descubierta');
  if (carta.encontrada) b.classList.add('encontrada');

  if (carta.descubierta) {
    b.replaceChildren();
    const simbolo = document.createElement('span');
    simbolo.className = 'carta-simbolo';
    simbolo.textContent = carta.simbolo;
    const nombre = document.createElement('span');
    nombre.className = 'carta-nombre';
    nombre.textContent = carta.nombre;
    b.append(simbolo, nombre);
    b.setAttribute('aria-label', carta.nombre);
  } else {
    b.textContent = '?';
    b.setAttribute('aria-label', 'Tarjeta oculta');
  }
}

function crearTablero() {
  totalParejas = (nivel.columnas * nivel.filas) / 2;
  const elegidos = mezclar(SIMBOLOS).slice(0, totalParejas);
  const pares = elegidos.flatMap((p) => [
    { ...p, descubierta: false, encontrada: false },
    { ...p, descubierta: false, encontrada: false }
  ]);
  cartas = mezclar(pares);

  const tablero = $('#tablero');
  tablero.replaceChildren();
  tablero.style.setProperty('--columnas', String(nivel.columnas));
  tablero.dataset.columnas = String(nivel.columnas);

  cartas.forEach((carta) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.addEventListener('click', () => seleccionar(carta));
    carta.boton = boton;
    pintarCarta(carta);
    tablero.append(boton);
  });
}

function seleccionar(carta) {
  if (bloqueado || carta.encontrada || carta.descubierta) return;

  if (!inicio) inicio = Date.now(); // el tiempo empieza con la primera tarjeta

  carta.descubierta = true;
  pintarCarta(carta);

  if (!primera) {
    primera = carta;
    $('#parejas-mensaje').textContent = 'Seleccione otra tarjeta';
    return;
  }

  const segunda = carta;
  const anterior = primera;
  primera = null;
  bloqueado = true;
  intentos++;

  esperar(() => comprobar(anterior, segunda), MS_ANTES_DE_COMPROBAR);
}

function comprobar(a, b) {
  if (a.nombre === b.nombre) {
    a.encontrada = b.encontrada = true;
    encontradas++;
    pintarCarta(a);
    pintarCarta(b);
    a.boton.disabled = b.boton.disabled = true;
    $('#parejas-mensaje').textContent = '🎉 ¡Muy bien! ¡Pareja encontrada!';
    actualizarInformacion();
    bloqueado = false;

    if (encontradas === totalParejas) terminarPartida();
  } else {
    $('#parejas-mensaje').textContent = 'Casi… inténtelo nuevamente';
    actualizarInformacion();
    esperar(() => {
      a.descubierta = b.descubierta = false;
      pintarCarta(a);
      pintarCarta(b);
      bloqueado = false;
    }, MS_ANTES_DE_OCULTAR);
  }
}

// ---------------------------------------------------------------
// Fin de la partida y guardado
// ---------------------------------------------------------------
function terminarPartida() {
  const duracionSeg = Math.max(0, Math.round((Date.now() - inicio) / 1000));
  pendiente = {
    nombrePaciente: paciente,
    columnas: nivel.columnas,
    filas: nivel.filas,
    intentos,
    duracionSeg
  };

  $('#parejas-intentos-final').textContent = String(intentos);
  $('#parejas-tiempo-final').textContent = formatearTiempo(duracionSeg);
  $('#parejas-victoria').hidden = false;
  guardarResultado();
}

async function guardarResultado() {
  const datos = pendiente;
  if (!datos) return;

  const reintentar = $('#parejas-reintentar-guardado');
  reintentar.hidden = true;
  reintentar.disabled = true;
  mensaje('#parejas-guardado', 'Guardando la partida…', true);

  try {
    await api('/api/parejas', { method: 'POST', body: datos });
    if (pendiente === datos) pendiente = null;
    mensaje('#parejas-guardado', '✔ Partida guardada.', true);
  } catch (err) {
    if (err.estado === 401) {
      pendiente = null;
      return sesionExpirada('Su sesión terminó y la última partida no se guardó. Inicie sesión de nuevo.');
    }
    mensaje('#parejas-guardado', `No se pudo guardar: ${err.message}`);
    reintentar.hidden = false;
  } finally {
    reintentar.disabled = false;
  }
}

export function reiniciarParejas() {
  detenerParejas();
  primera = null;
  bloqueado = false;
  intentos = 0;
  encontradas = 0;
  inicio = 0;
  pendiente = null;
  $('#parejas-victoria').hidden = true;
  $('#parejas-reintentar-guardado').hidden = true;
  mensaje('#parejas-guardado');
  $('#parejas-mensaje').textContent = 'Seleccione una tarjeta';
  crearTablero();            // calcula totalParejas
  actualizarInformacion();
}

export function detenerParejas() {
  temporizadores.forEach(clearTimeout);
  temporizadores = [];
}

// ---------------------------------------------------------------
// Historial guardado en la base de datos
// ---------------------------------------------------------------
async function abrirHistorialParejas() {
  detenerParejas();
  mensaje('#historial-parejas-mensaje');
  const tabla = $('#historial-parejas-tabla');
  const cuerpo = tabla.querySelector('tbody');
  cuerpo.replaceChildren();
  tabla.hidden = true;
  mostrar('pantalla-historial-parejas');

  try {
    const { partidas } = await api('/api/parejas');
    if (!partidas.length) {
      mensaje('#historial-parejas-mensaje', 'Todavía no hay partidas guardadas.', true);
      return;
    }
    partidas.forEach((p) => {
      const fila = document.createElement('tr');
      [
        p.nombrePaciente,
        formatearFecha(p.fecha),
        describirTablero(p.columnas, p.filas),
        String(p.intentos),
        formatearTiempo(p.duracionSeg)
      ].forEach((valor) => {
        const celda = document.createElement('td');
        celda.textContent = valor;
        fila.append(celda);
      });
      cuerpo.append(fila);
    });
    tabla.hidden = false;
  } catch (err) {
    if (err.estado === 401) return sesionExpirada();
    mensaje('#historial-parejas-mensaje', err.message);
  }
}

// ---------------------------------------------------------------
// Conexion de los botones
// ---------------------------------------------------------------
export function iniciarParejas() {
  pintarNiveles();

  $('#form-datos-parejas').addEventListener('submit', empezarConPaciente);
  $('#datos-parejas-historial').addEventListener('click', abrirHistorialParejas);
  $('#datos-parejas-salir').addEventListener('click', cerrarSesion);

  $('#parejas-cambiar').addEventListener('click', () => irADatosParejas(true));
  $('#parejas-reiniciar').addEventListener('click', reiniciarParejas);
  $('#parejas-otra').addEventListener('click', reiniciarParejas);
  $('#parejas-reintentar-guardado').addEventListener('click', guardarResultado);
  $('#parejas-ver-historial').addEventListener('click', abrirHistorialParejas);
  $('#parejas-ayuda').addEventListener('click', () => $('#dialogo-ayuda').showModal());
  $('#ayuda-cerrar').addEventListener('click', () => $('#dialogo-ayuda').close());

  $('#historial-parejas-volver').addEventListener('click', () => irADatosParejas(true));
}
