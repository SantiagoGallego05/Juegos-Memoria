// Juego de Recuerdos (version web): 5 imagenes al azar, respuestas escritas
// o por voz y guardado en MySQL a traves de la API.
import { $, mostrar, mensaje, formatearFecha } from './nav.js';
import { api } from './api.js';
import { obtenerUsuario, exigirSesion, sesionExpirada, cerrarSesion } from './sesion.js';
import { abrirMisImagenes } from './imagenes.js';

const SEGUNDOS_CRONOMETRO = 5;
const CANTIDAD_MINIMA = 5;           // imagenes por partida

let paciente = '';
let imagenes = [];
let respuestas = [];
let indice = 0;
let temporizador = null;

function rutaImagen(nombre) {
  return `imagenes/${encodeURIComponent(nombre)}`;
}

function sesionPerdida() {
  detenerGrabacion();
  sesionExpirada();
}

// ---------------------------------------------------------------
// Entrada al juego
// ---------------------------------------------------------------
export function abrirRecuerdos() {
  return exigirSesion({ titulo: 'Juego de Recuerdos', alIniciar: irADatos });
}

function irADatos() {
  const usuario = obtenerUsuario();
  $('#datos-responsable').textContent =
    `Responsable: ${usuario.nombreResponsable} (usuario: ${usuario.usuario})`;
  $('#form-datos').reset();
  mensaje('#datos-mensaje', usuario.correo ? '' :
    'Consejo: agregue un correo de recuperación para poder restablecer su contraseña si la olvida.', true);
  $('#datos-iniciar').disabled = false;
  mostrar('pantalla-datos');
  $('#datos-paciente').focus();
  actualizarFuentes();
}

// Habilita "Solo las mias" / "Las del juego y las mias" segun cuantas imagenes propias hay
async function actualizarFuentes() {
  const mias = document.querySelector('#form-datos input[name="fuente"][value="mias"]');
  const todas = document.querySelector('#form-datos input[name="fuente"][value="todas"]');
  try {
    const { imagenes } = await api('/api/mis-imagenes');
    const total = imagenes.length;
    mias.disabled = total < CANTIDAD_MINIMA;
    todas.disabled = total === 0;
    $('#fuente-mias-detalle').textContent = total >= CANTIDAD_MINIMA
      ? `Tiene ${total} imágenes subidas`
      : `Tiene ${total}; necesita al menos ${CANTIDAD_MINIMA}. Súbalas en «Mis imágenes».`;
    const elegida = document.querySelector('#form-datos input[name="fuente"]:checked');
    if (elegida && elegida.disabled) {
      document.querySelector('#form-datos input[name="fuente"][value="juego"]').checked = true;
    }
  } catch (err) {
    if (err.estado === 401) return sesionPerdida();
    mias.disabled = true;
    todas.disabled = true;
  }
}

// ---------------------------------------------------------------
// Inicio de partida
// ---------------------------------------------------------------
async function iniciarPartida(e) {
  e.preventDefault();
  const nombre = $('#datos-paciente').value.trim();
  if (!nombre) {
    mensaje('#datos-mensaje', 'Ingrese el nombre del adulto mayor.');
    return;
  }

  mensaje('#datos-mensaje');
  $('#datos-iniciar').disabled = true;
  try {
    const fuente = document.querySelector('#form-datos input[name="fuente"]:checked').value;
    const datos = await api(`/api/imagenes/aleatorias?fuente=${encodeURIComponent(fuente)}`);
    paciente = nombre;
    imagenes = datos.imagenes;
    respuestas = imagenes.map(() => '');
    indice = 0;
    iniciarCronometro();
  } catch (err) {
    if (err.estado === 401) return sesionPerdida();
    mensaje('#datos-mensaje', err.message);
  } finally {
    $('#datos-iniciar').disabled = false;
  }
}

function iniciarCronometro() {
  let restantes = SEGUNDOS_CRONOMETRO;
  $('#cronometro').textContent = String(restantes);
  mostrar('pantalla-cronometro');

  clearInterval(temporizador);
  temporizador = setInterval(() => {
    restantes--;
    if (restantes > 0) {
      $('#cronometro').textContent = String(restantes);
    } else {
      clearInterval(temporizador);
      mostrarImagenActual();
    }
  }, 1000);
}

// ---------------------------------------------------------------
// Imagen y respuesta
// ---------------------------------------------------------------
function mostrarImagenActual() {
  detenerGrabacion();
  $('#imagen-contador').textContent = `Imagen ${indice + 1} de ${imagenes.length}`;
  $('#imagen-respuesta').value = respuestas[indice] || '';
  mensaje('#imagen-mensaje');
  $('#estado-grabacion').textContent = '';

  const img = $('#imagen-actual');
  img.alt = `Imagen ${indice + 1} de ${imagenes.length}`;
  img.onerror = () => mensaje('#imagen-mensaje', 'No se pudo cargar la imagen. Puede continuar con la siguiente.');
  img.src = imagenes[indice].url;

  const ultima = indice === imagenes.length - 1;
  $('#btn-siguiente').textContent = ultima ? 'Finalizar' : 'Siguiente';
  $('#btn-siguiente').disabled = false;

  mostrar('pantalla-imagen');
  $('#imagen-respuesta').focus();
}

async function avanzar() {
  detenerGrabacion();
  respuestas[indice] = $('#imagen-respuesta').value.trim();

  if (indice < imagenes.length - 1) {
    indice++;
    mostrarImagenActual();
  } else {
    await guardarPartida();
  }
}

async function guardarPartida() {
  const boton = $('#btn-siguiente');
  boton.disabled = true;
  mensaje('#imagen-mensaje', 'Guardando…', true);

  try {
    const { partidaId } = await api('/api/partidas', {
      method: 'POST',
      body: {
        nombrePaciente: paciente,
        respuestas: imagenes.map((im, i) => ({ imagen: im.nombre, imagenId: im.imagenId, respuesta: respuestas[i] }))
      }
    });
    $('#final-mensaje').textContent =
      `Las respuestas quedaron guardadas en la base de datos (partida n.º ${partidaId}).`;
    mostrar('pantalla-final');
  } catch (err) {
    if (err.estado === 401) return sesionPerdida();
    // Las respuestas siguen en pantalla: se puede volver a intentar
    mensaje('#imagen-mensaje', `No se pudo guardar: ${err.message} Presione Finalizar para reintentar.`);
    boton.disabled = false;
  }
}

// ---------------------------------------------------------------
// Respuesta por voz (reconocimiento del navegador)
// ---------------------------------------------------------------
const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
let reconocedor = null;
let grabando = false;
let textoBase = '';
let huboErrorVoz = false;

function estadoGrabacion(texto) {
  $('#estado-grabacion').textContent = texto;
}

function ponerBotonMicrofono(activo) {
  const b = $('#btn-microfono');
  b.classList.toggle('grabando', activo);
  b.textContent = activo ? '⏹ Detener grabación' : '🎤 Grabar respuesta';
}

function alternarGrabacion() {
  if (!Reconocimiento) {
    estadoGrabacion('Este navegador no permite responder hablando. Use Chrome o Edge, o escriba la respuesta.');
    return;
  }
  if (grabando) {
    reconocedor.stop();
    return;
  }

  const area = $('#imagen-respuesta');
  textoBase = area.value.trim();
  huboErrorVoz = false;

  reconocedor = new Reconocimiento();
  reconocedor.lang = 'es-CO';
  reconocedor.continuous = true;
  reconocedor.interimResults = true;

  reconocedor.onresult = (evento) => {
    let dicho = '';
    for (let i = 0; i < evento.results.length; i++) {
      dicho += evento.results[i][0].transcript + ' ';
    }
    area.value = (textoBase ? textoBase + ' ' : '') + dicho.trim();
  };

  reconocedor.onerror = (evento) => {
    huboErrorVoz = true;
    const mensajes = {
      'not-allowed': 'Permita el uso del micrófono en el navegador e intente de nuevo.',
      'service-not-allowed': 'Permita el uso del micrófono en el navegador e intente de nuevo.',
      'no-speech': 'No se escuchó nada. Intente de nuevo.',
      'audio-capture': 'No se encontró un micrófono.',
      'network': 'El reconocimiento de voz necesita conexión a internet.'
    };
    estadoGrabacion(mensajes[evento.error] || 'No se pudo usar el micrófono. Puede escribir la respuesta.');
  };

  reconocedor.onend = () => {
    grabando = false;
    ponerBotonMicrofono(false);
    if (!huboErrorVoz) {
      estadoGrabacion('Grabación terminada. Puede corregir el texto si lo desea.');
    }
  };

  try {
    reconocedor.start();
    grabando = true;
    ponerBotonMicrofono(true);
    estadoGrabacion('🎙 Escuchando… hable ahora.');
  } catch {
    estadoGrabacion('No se pudo iniciar el micrófono.');
  }
}

function detenerGrabacion() {
  if (reconocedor && grabando) {
    reconocedor.onend = null;
    reconocedor.abort();
  }
  grabando = false;
  ponerBotonMicrofono(false);
}

// ---------------------------------------------------------------
// Historial guardado en la base de datos
// ---------------------------------------------------------------

async function abrirHistorial() {
  mensaje('#historial-mensaje');
  $('#historial-detalle').hidden = true;
  const lista = $('#historial-lista');
  lista.replaceChildren();
  mostrar('pantalla-historial');

  try {
    const { partidas } = await api('/api/partidas');
    if (!partidas.length) {
      mensaje('#historial-mensaje', 'Todavía no hay partidas guardadas.', true);
      return;
    }
    partidas.forEach((p) => {
      const li = document.createElement('li');
      const boton = document.createElement('button');
      boton.type = 'button';
      const nombre = document.createElement('strong');
      nombre.textContent = p.nombrePaciente;
      const fecha = document.createElement('span');
      fecha.className = 'fecha';
      fecha.textContent = formatearFecha(p.fecha);
      boton.append(nombre, fecha);
      boton.addEventListener('click', () => verDetalle(p.id));
      li.append(boton);
      lista.append(li);
    });
  } catch (err) {
    if (err.estado === 401) return sesionPerdida();
    mensaje('#historial-mensaje', err.message);
  }
}

async function verDetalle(id) {
  const contenedor = $('#historial-detalle');
  try {
    const { partida, respuestas: filas } = await api(`/api/partidas/${id}`);
    contenedor.replaceChildren();

    const titulo = document.createElement('h2');
    titulo.textContent = partida.nombrePaciente;
    const fecha = document.createElement('p');
    fecha.className = 'nota';
    fecha.textContent = formatearFecha(partida.fecha);
    contenedor.append(titulo, fecha);

    filas.forEach((f) => {
      const item = document.createElement('div');
      item.className = 'detalle-item';

      const img = document.createElement('img');
      img.src = f.imagenId ? `/api/mis-imagenes/${f.imagenId}` : rutaImagen(f.imagen);
      img.onerror = () => {                     // por ejemplo, una imagen propia que se eliminó despues
        const aviso = document.createElement('div');
        aviso.className = 'imagen-eliminada';
        aviso.textContent = 'Imagen no disponible';
        img.replaceWith(aviso);
      };
      img.alt = `Imagen ${f.orden}`;

      const texto = document.createElement('p');
      const etiqueta = document.createElement('strong');
      etiqueta.textContent = `Imagen ${f.orden}: `;
      texto.append(etiqueta);
      if (f.respuesta) {
        texto.append(document.createTextNode(f.respuesta));
      } else {
        const vacio = document.createElement('span');
        vacio.className = 'sin-respuesta';
        vacio.textContent = '(sin respuesta)';
        texto.append(vacio);
      }

      item.append(img, texto);
      contenedor.append(item);
    });

    contenedor.hidden = false;
    contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    if (err.estado === 401) return sesionPerdida();
    mensaje('#historial-mensaje', err.message);
  }
}

// ---------------------------------------------------------------
// Conexion de los botones
// ---------------------------------------------------------------
export function detenerRecuerdos() {
  clearInterval(temporizador);
  detenerGrabacion();
}

export function iniciarRecuerdos() {
  $('#form-datos').addEventListener('submit', iniciarPartida);
  $('#datos-salir').addEventListener('click', cerrarSesion);
  $('#datos-historial').addEventListener('click', abrirHistorial);
  $('#datos-imagenes').addEventListener('click', () => abrirMisImagenes(irADatos));

  $('#btn-microfono').addEventListener('click', alternarGrabacion);
  $('#btn-siguiente').addEventListener('click', avanzar);

  $('#final-nueva').addEventListener('click', irADatos);
  $('#final-historial').addEventListener('click', abrirHistorial);
  $('#final-salir').addEventListener('click', cerrarSesion);

  $('#historial-volver').addEventListener('click', irADatos);
}
