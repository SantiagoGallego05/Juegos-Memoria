// Pantalla "Mis imagenes": cada responsable sube sus propias fotos (por ejemplo,
// de la familia) para usarlas en el Juego de Recuerdos. Son privadas de quien las sube.
// Antes de subirlas, el navegador las reduce (maximo 1280 px, JPG): asi pesan poco,
// se suben rapido y se corrige la rotacion de las fotos tomadas con el celular.
import { $, mostrar, mensaje } from './nav.js';
import { api } from './api.js';
import { sesionExpirada } from './sesion.js';

const MAX_LADO = 1280;
const MAX_BYTES = 2 * 1024 * 1024;     // igual que el limite del servidor

let alVolver = () => {};
let ocupado = false;

export function abrirMisImagenes(volverA) {
  alVolver = volverA;
  mensaje('#imagenes-mensaje');
  $('#imagenes-contador').textContent = '';
  mostrar('pantalla-mis-imagenes');
  cargarLista();
}

// ---------------------------------------------------------------
// Lista
// ---------------------------------------------------------------
async function cargarLista() {
  const galeria = $('#imagenes-galeria');
  try {
    const { imagenes, maximo } = await api('/api/mis-imagenes');
    galeria.replaceChildren();

    $('#imagenes-contador').textContent = imagenes.length
      ? `Tiene ${imagenes.length} de ${maximo} imágenes.`
      : 'Todavía no ha subido imágenes.';
    $('#imagenes-elegir').disabled = imagenes.length >= maximo;

    imagenes.forEach((im) => {
      const item = document.createElement('li');

      const img = document.createElement('img');
      img.src = `/api/mis-imagenes/${im.id}`;
      img.alt = im.nombre;
      img.loading = 'lazy';

      const nombre = document.createElement('span');
      nombre.className = 'nombre-imagen';
      nombre.textContent = im.nombre;
      nombre.title = im.nombre;

      const borrar = document.createElement('button');
      borrar.type = 'button';
      borrar.className = 'boton boton-rojo boton-chico';
      borrar.textContent = 'Eliminar';
      borrar.addEventListener('click', () => eliminar(im));

      item.append(img, nombre, borrar);
      galeria.append(item);
    });
  } catch (err) {
    if (err.estado === 401) return sesionExpirada();
    mensaje('#imagenes-mensaje', err.message);
  }
}

async function eliminar(im) {
  if (!window.confirm(`¿Eliminar la imagen "${im.nombre}"?\nLas respuestas ya guardadas se conservan.`)) return;
  try {
    await api(`/api/mis-imagenes/${im.id}`, { method: 'DELETE' });
    mensaje('#imagenes-mensaje', 'Imagen eliminada.', true);
    cargarLista();
  } catch (err) {
    if (err.estado === 401) return sesionExpirada();
    mensaje('#imagenes-mensaje', err.message);
  }
}

// ---------------------------------------------------------------
// Preparar y subir
// ---------------------------------------------------------------
async function leerImagen(archivo) {
  try {
    return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch {
    // navegadores antiguos no conocen esa opcion
    return createImageBitmap(archivo);
  }
}

// Devuelve un Blob JPG de maximo 1280 px y menos de 2 MB
async function prepararImagen(archivo) {
  if (!archivo.type.startsWith('image/')) {
    throw new Error(`"${archivo.name}" no es una imagen.`);
  }

  let origen;
  try {
    origen = await leerImagen(archivo);
  } catch {
    throw new Error(`No se pudo leer "${archivo.name}". Use una imagen JPG, PNG o WEBP.`);
  }

  const escala = Math.min(1, MAX_LADO / Math.max(origen.width, origen.height));
  const ancho = Math.max(1, Math.round(origen.width * escala));
  const alto = Math.max(1, Math.round(origen.height * escala));

  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#ffffff';            // las partes transparentes (PNG) quedan blancas, no negras
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(origen, 0, 0, ancho, alto);
  if (origen.close) origen.close();

  for (const calidad of [0.85, 0.7, 0.5]) {
    const blob = await new Promise((resolver) => lienzo.toBlob(resolver, 'image/jpeg', calidad));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error(`"${archivo.name}" sigue siendo demasiado pesada.`);
}

async function subirArchivos(archivos) {
  if (ocupado || !archivos.length) return;
  ocupado = true;
  $('#imagenes-elegir').disabled = true;
  mensaje('#imagenes-mensaje');

  let subidas = 0;
  const problemas = [];

  for (let i = 0; i < archivos.length; i++) {
    const archivo = archivos[i];
    mensaje('#imagenes-mensaje', `Subiendo ${i + 1} de ${archivos.length}…`, true);
    try {
      const blob = await prepararImagen(archivo);
      const nombre = archivo.name.replace(/\.[^.]+$/, '').slice(0, 100) || 'Imagen';
      await api(`/api/mis-imagenes?nombre=${encodeURIComponent(nombre)}`, { method: 'POST', body: blob });
      subidas++;
    } catch (err) {
      if (err.estado === 401) {
        ocupado = false;
        return sesionExpirada();
      }
      problemas.push(err.message);
      if (err.estado === 409) break;      // llego al maximo: no tiene sentido seguir
    }
  }

  ocupado = false;
  await cargarLista();

  const partes = [];
  if (subidas) partes.push(`✔ Se subieron ${subidas} ${subidas === 1 ? 'imagen' : 'imágenes'}.`);
  if (problemas.length) partes.push(problemas.join(' '));
  mensaje('#imagenes-mensaje', partes.join(' '), problemas.length === 0);
}

// ---------------------------------------------------------------
// Conexion de los botones
// ---------------------------------------------------------------
export function iniciarImagenes() {
  $('#imagenes-elegir').addEventListener('click', () => $('#imagenes-archivo').click());
  $('#imagenes-archivo').addEventListener('change', (e) => {
    const archivos = [...e.target.files];
    e.target.value = '';                  // permite volver a elegir el mismo archivo
    subirArchivos(archivos);
  });
  $('#imagenes-volver').addEventListener('click', () => alVolver());
}
