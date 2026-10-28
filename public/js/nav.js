// Utilidades de navegacion y presentacion compartidas
export const $ = (selector) => document.querySelector(selector);

export function mostrar(idPantalla) {
  document.querySelectorAll('.pantalla').forEach((p) => {
    p.classList.toggle('activa', p.id === idPantalla);
  });
  window.scrollTo(0, 0);
}

// Escribe un mensaje en un <p>; exito=true lo pinta en verde
export function mensaje(selector, texto = '', exito = false) {
  const el = $(selector);
  el.textContent = texto;
  el.classList.toggle('ok', exito);
}

export function formatearFecha(valor) {
  return new Date(valor).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}
