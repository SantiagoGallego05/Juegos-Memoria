// Pequeño ayudante para llamar a la API del servidor.
// body puede ser un objeto (se envia como JSON) o un Blob (por ejemplo, una imagen).
export async function api(url, { method = 'GET', body } = {}) {
  const opciones = { method, credentials: 'same-origin', headers: {} };

  if (body instanceof Blob) {
    opciones.headers['Content-Type'] = body.type || 'application/octet-stream';
    opciones.body = body;
  } else if (body !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(body);
  }

  let respuesta;
  try {
    respuesta = await fetch(url, opciones);
  } catch {
    throw new Error('No se pudo conectar con el servidor.');
  }

  let datos = {};
  try { datos = await respuesta.json(); } catch { /* respuesta sin cuerpo */ }

  if (!respuesta.ok) {
    const error = new Error(datos.error || 'Error del servidor.');
    error.estado = respuesta.status;
    throw error;
  }
  return datos;
}
