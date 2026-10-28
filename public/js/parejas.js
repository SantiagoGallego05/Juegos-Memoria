// Juego de Parejas (version web): exige sesion, pide el nombre del adulto mayor
// y guarda intentos y tiempo en MySQL al terminar cada partida.
import { $, mostrar, mensaje, formatearFecha } from './nav.js';
import { api } from './api.js';
import { obtenerUsuario, exigirSesion, sesionExpirada, cerrarSesion } from './sesion.js';

const PAREJAS = [
  { nombre: 'MANZANA', simbolo: '🍎' },
  { nombre: 'CAFÉ', simbolo: '☕' },
  { nombre: 'CASA', simbolo: '🏠' },
  { nombre: 'FLORES', simbolo: '🌸' }
];
const MS_ANTES_DE_COMPROBAR = 800;
const MS_ANTES_DE_OCULTAR = 500;

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

function actualizarInformacion() {
  $('#parejas-contador').textContent = `Parejas: ${encontradas} / ${PAREJAS.length}`;
  $('#parejas-intentos').textContent = `Intentos: ${intentos}`;
}

// ---------------------------------------------------------------
// Entrada: sesion y datos del adulto mayor
// ---------------------------------------------------------------
export function abrirParejas() {
  return exigirSesion({ titulo: 'Juego de Parejas', alIniciar: irADatosParejas });
}

function irADatosParejas() {
  detenerParejas();
  const usuario = obtenerUsuario();
  $('#datos-parejas-responsable').textContent =
    `Responsable: ${usuario.nombreResponsable} (usuario: ${usuario.usuario})`;
  $('#form-datos-parejas').reset();
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
  paciente = nombre;
  $('#parejas-jugador').textContent = `Adulto mayor: ${paciente}`;
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
  const pares = PAREJAS.flatMap((p) => [
    { ...p, descubierta: false, encontrada: false },
    { ...p, descubierta: false, encontrada: false }
  ]);
  cartas = mezclar(pares);

  const tablero = $('#tablero');
  tablero.replaceChildren();
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

    if (encontradas === PAREJAS.length) terminarPartida();
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
  pendiente = { nombrePaciente: paciente, intentos, duracionSeg };

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
  actualizarInformacion();
  crearTablero();
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
      [p.nombrePaciente, formatearFecha(p.fecha), String(p.intentos), formatearTiempo(p.duracionSeg)]
        .forEach((valor) => {
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
  $('#form-datos-parejas').addEventListener('submit', empezarConPaciente);
  $('#datos-parejas-historial').addEventListener('click', abrirHistorialParejas);
  $('#datos-parejas-salir').addEventListener('click', cerrarSesion);

  $('#parejas-cambiar').addEventListener('click', irADatosParejas);
  $('#parejas-reiniciar').addEventListener('click', reiniciarParejas);
  $('#parejas-otra').addEventListener('click', reiniciarParejas);
  $('#parejas-reintentar-guardado').addEventListener('click', guardarResultado);
  $('#parejas-ver-historial').addEventListener('click', abrirHistorialParejas);
  $('#parejas-ayuda').addEventListener('click', () => $('#dialogo-ayuda').showModal());
  $('#ayuda-cerrar').addEventListener('click', () => $('#dialogo-ayuda').close());

  $('#historial-parejas-volver').addEventListener('click', irADatosParejas);
}
