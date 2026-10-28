// Inicio de sesion, registro, recuperacion de contraseña y correo de recuperacion,
// compartidos por los dos juegos. Cada juego indica con exigirSesion() que pantalla
// mostrar cuando el responsable ya haya iniciado sesion.
import { $, mostrar, mensaje } from './nav.js';
import { api } from './api.js';

let usuario = null;                 // { id, usuario, nombreResponsable, correo }
let alIniciarSesion = () => mostrar('pantalla-menu');
let tituloLogin = 'Iniciar sesión';
let tokenRecuperacion = '';         // viene del enlace que llega por correo

export function obtenerUsuario() {
  return usuario;
}

export async function exigirSesion({ titulo, alIniciar }) {
  tituloLogin = titulo;
  alIniciarSesion = alIniciar;
  try {
    usuario = (await api('/api/yo')).usuario;
  } catch {
    usuario = null;
  }
  if (usuario) alIniciar();
  else irALogin();
}

export function irALogin(texto = '', exito = false) {
  $('#t-login').textContent = tituloLogin;
  $('#form-login').reset();
  mensaje('#login-mensaje', texto, exito);
  mostrar('pantalla-login');
  $('#login-usuario').focus();
}

export function sesionExpirada(texto = 'Su sesión terminó. Inicie sesión de nuevo.') {
  usuario = null;
  irALogin(texto);
}

export async function cerrarSesion() {
  try { await api('/api/logout', { method: 'POST' }); } catch { /* se cierra igual en pantalla */ }
  usuario = null;
  irALogin();
}

// ---------------------------------------------------------------
// Login y registro
// ---------------------------------------------------------------
async function enviarLogin(e) {
  e.preventDefault();
  mensaje('#login-mensaje');
  try {
    usuario = await api('/api/login', {
      method: 'POST',
      body: {
        usuario: $('#login-usuario').value,
        password: $('#login-password').value
      }
    });
    $('#form-login').reset();
    alIniciarSesion();
  } catch (err) {
    mensaje('#login-mensaje', err.message);
  }
}

async function enviarRegistro(e) {
  e.preventDefault();
  mensaje('#registro-mensaje');
  try {
    const { usuario: nuevo } = await api('/api/registro', {
      method: 'POST',
      body: {
        nombreResponsable: $('#reg-nombre').value,
        usuario: $('#reg-usuario').value,
        correo: $('#reg-correo').value,
        password: $('#reg-password').value,
        confirmar: $('#reg-confirmar').value
      }
    });
    $('#form-registro').reset();
    irALogin('Cuenta creada correctamente. Ahora puede iniciar sesión.', true);
    $('#login-usuario').value = nuevo;
    $('#login-password').focus();
  } catch (err) {
    mensaje('#registro-mensaje', err.message);
  }
}

// ---------------------------------------------------------------
// Recuperar contraseña
// ---------------------------------------------------------------
function irAOlvido() {
  $('#form-olvido').reset();
  mensaje('#olvido-mensaje');
  $('#olvido-enviar').disabled = false;
  mostrar('pantalla-olvido');
  $('#olvido-correo').focus();
}

async function enviarOlvido(e) {
  e.preventDefault();
  mensaje('#olvido-mensaje');
  const boton = $('#olvido-enviar');
  boton.disabled = true;
  try {
    const { mensaje: texto } = await api('/api/recuperar', {
      method: 'POST',
      body: { correo: $('#olvido-correo').value }
    });
    mensaje('#olvido-mensaje', texto, true);
    // Se deja un respiro antes de permitir otro envio
    setTimeout(() => { boton.disabled = false; }, 15000);
  } catch (err) {
    mensaje('#olvido-mensaje', err.message);
    boton.disabled = false;
  }
}

// Se llama desde main.js cuando la persona llega desde el enlace del correo
export function abrirRestablecer(token) {
  tokenRecuperacion = token;
  $('#form-restablecer').reset();
  mensaje('#rest-mensaje');
  $('#rest-guardar').disabled = false;
  mostrar('pantalla-restablecer');
  $('#rest-password').focus();
}

async function enviarRestablecer(e) {
  e.preventDefault();
  mensaje('#rest-mensaje');
  const boton = $('#rest-guardar');
  boton.disabled = true;
  try {
    await api('/api/restablecer', {
      method: 'POST',
      body: {
        token: tokenRecuperacion,
        password: $('#rest-password').value,
        confirmar: $('#rest-confirmar').value
      }
    });
    tokenRecuperacion = '';
    $('#form-restablecer').reset();
    irALogin('Contraseña actualizada. Ya puede iniciar sesión.', true);
  } catch (err) {
    mensaje('#rest-mensaje', err.message);
    boton.disabled = false;
  }
}

// ---------------------------------------------------------------
// Correo de recuperacion (con la sesion iniciada)
// ---------------------------------------------------------------
export function irACorreo() {
  $('#form-correo').reset();
  mensaje('#correo-mensaje');
  $('#correo-actual').textContent = usuario && usuario.correo
    ? `Correo actual: ${usuario.correo}`
    : 'Todavía no tiene un correo registrado. Agréguelo para poder recuperar su contraseña.';
  mostrar('pantalla-correo');
  $('#correo-nuevo').focus();
}

async function enviarCorreo(e) {
  e.preventDefault();
  mensaje('#correo-mensaje');
  try {
    const { correo } = await api('/api/correo', {
      method: 'PUT',
      body: {
        correo: $('#correo-nuevo').value,
        password: $('#correo-password').value
      }
    });
    usuario.correo = correo;
    $('#form-correo').reset();
    $('#correo-actual').textContent = `Correo actual: ${correo}`;
    mensaje('#correo-mensaje', '✔ Correo guardado.', true);
  } catch (err) {
    if (err.estado === 401) return sesionExpirada();
    mensaje('#correo-mensaje', err.message);
  }
}

// ---------------------------------------------------------------
// Conexion de los botones
// ---------------------------------------------------------------
export function iniciarSesionUI() {
  $('#form-login').addEventListener('submit', enviarLogin);
  $('#ir-registro').addEventListener('click', () => {
    $('#form-registro').reset();
    mensaje('#registro-mensaje');
    mostrar('pantalla-registro');
    $('#reg-nombre').focus();
  });
  $('#form-registro').addEventListener('submit', enviarRegistro);
  $('#registro-volver').addEventListener('click', () => irALogin());

  $('#ir-olvido').addEventListener('click', irAOlvido);
  $('#form-olvido').addEventListener('submit', enviarOlvido);
  $('#olvido-volver').addEventListener('click', () => irALogin());

  $('#form-restablecer').addEventListener('submit', enviarRestablecer);
  $('#rest-nuevo-enlace').addEventListener('click', irAOlvido);

  $('#datos-correo').addEventListener('click', irACorreo);
  $('#datos-parejas-correo').addEventListener('click', irACorreo);
  $('#form-correo').addEventListener('submit', enviarCorreo);
  $('#correo-volver').addEventListener('click', () => alIniciarSesion());
}
