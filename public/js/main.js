import { $, mostrar } from './nav.js';
import { iniciarSesionUI, abrirRestablecer } from './sesion.js';
import { iniciarParejas, abrirParejas, detenerParejas } from './parejas.js';
import { iniciarRecuerdos, abrirRecuerdos, detenerRecuerdos } from './recuerdos.js';

iniciarSesionUI();
iniciarParejas();
iniciarRecuerdos();

$('#btn-abrir-parejas').addEventListener('click', abrirParejas);
$('#btn-abrir-recuerdos').addEventListener('click', abrirRecuerdos);

// Todos los botones "← Menú de juegos"
document.querySelectorAll('[data-volver-menu]').forEach((boton) => {
  boton.addEventListener('click', () => {
    detenerParejas();
    detenerRecuerdos();
    mostrar('pantalla-menu');
  });
});

// Si la persona llega desde el enlace del correo (.../#restablecer=<token>)
const enlace = location.hash.match(/^#restablecer=([a-f0-9]{64})$/);
if (enlace) {
  // Se borra el token de la barra de direcciones para que no quede en el historial
  history.replaceState(null, '', location.pathname + location.search);
  abrirRestablecer(enlace[1]);
}
