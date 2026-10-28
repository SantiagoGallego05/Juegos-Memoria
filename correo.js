require('dotenv').config();

// Envio de correos por la API web de Brevo (plan gratis: 300 correos al dia).
// Se usa una API web y no SMTP porque muchos hostings gratuitos (como Render)
// bloquean los puertos de SMTP.
//
// Variables de entorno:
//   BREVO_API_KEY       clave de la API de Brevo
//   CORREO_REMITENTE    correo verificado en Brevo desde el que se envia
//   CORREO_NOMBRE       (opcional) nombre que ve quien recibe el correo
//
// Sin esas variables, y SOLO fuera de produccion, el correo no se envia: el
// contenido (con el enlace) se imprime en la consola para poder probar en local.

const NOMBRE_REMITENTE = process.env.CORREO_NOMBRE || 'Juegos de memoria';

function escaparHtml(valor) {
  return String(valor).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function enviarCorreo({ para, asunto, texto, html }) {
  const clave = process.env.BREVO_API_KEY;
  const remitente = process.env.CORREO_REMITENTE;

  if (!clave || !remitente) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('El envío de correo no está configurado (BREVO_API_KEY y CORREO_REMITENTE).');
    }
    console.log('\n--- MODO DESARROLLO: correo NO enviado (falta BREVO_API_KEY) ---');
    console.log(`Para:   ${para}\nAsunto: ${asunto}\n\n${texto}\n------------------------------------------------------------\n`);
    return;
  }

  const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': clave
    },
    body: JSON.stringify({
      sender: { name: NOMBRE_REMITENTE, email: remitente },
      to: [{ email: para }],
      subject: asunto,
      textContent: texto,
      htmlContent: html
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    throw new Error(`Brevo respondió ${respuesta.status}: ${detalle.slice(0, 300)}`);
  }
}

function enviarRecuperacion({ para, nombre, enlace }) {
  const texto =
`Hola ${nombre},

Recibimos una solicitud para restablecer su contraseña.
Abra este enlace para elegir una nueva (vale por 1 hora y solo se puede usar una vez):

${enlace}

Si usted no hizo esta solicitud, ignore este mensaje: su contraseña no cambiará.`;

  const html =
`<div style="font-family:Verdana,Arial,sans-serif;font-size:17px;color:#13233a;max-width:520px">
  <p>Hola ${escaparHtml(nombre)},</p>
  <p>Recibimos una solicitud para restablecer su contraseña.</p>
  <p><a href="${escaparHtml(enlace)}"
        style="display:inline-block;background:#1558b0;color:#fff;text-decoration:none;
               padding:14px 24px;border-radius:10px;font-weight:bold">Elegir una nueva contraseña</a></p>
  <p style="font-size:15px;color:#4a5a70">El enlace vale por 1 hora y solo se puede usar una vez.
     Si el botón no funciona, copie esta dirección en el navegador:<br>${escaparHtml(enlace)}</p>
  <p style="font-size:15px;color:#4a5a70">Si usted no hizo esta solicitud, ignore este mensaje:
     su contraseña no cambiará.</p>
</div>`;

  return enviarCorreo({ para, asunto: 'Restablecer su contraseña', texto, html });
}

module.exports = { enviarCorreo, enviarRecuperacion, escaparHtml };
