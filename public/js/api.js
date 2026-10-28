// Pequeño ayudante para llamar a la API del servidor
export async function api(url, { method = 'GET', body } = {}) {
  const opciones = {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }
  };
  if (body !== undefined) opciones.body = JSON.stringify(body);

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
