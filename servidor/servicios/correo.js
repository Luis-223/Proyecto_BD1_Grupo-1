// servicios/correo.js — ENVÍO DE CORREOS (nodemailer)
// Por ahora solo envía el código para recuperar la contraseña.
//
// Datos en el .env (nunca en el código ni en GitHub):
//   SMTP_HOST=smtp.gmail.com
//   SMTP_PORT=465
//   SMTP_USER=correo-del-proyecto@gmail.com
//   SMTP_PASS="xxxx xxxx xxxx xxxx"          (contraseña de aplicación de Gmail)
//   CORREO_REMITENTE="FitManager <correo-del-proyecto@gmail.com>"

const nodemailer = require('nodemailer');

// El "transporte" se crea una sola vez, la primera vez que se envía algo
let transporte = null;
function obtenerTransporte() {
  if (transporte) return transporte;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error('Faltan SMTP_HOST, SMTP_USER o SMTP_PASS en el .env');
  }

  const puerto = Number(SMTP_PORT) || 465;
  transporte = nodemailer.createTransport({
    host: SMTP_HOST,
    port: puerto,
    secure: puerto === 465, // 465 = conexión cifrada desde el inicio; 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporte;
}

// Evita que un nombre con < > & rompa (o inyecte) el HTML del correo
const escaparHtml = (texto) => String(texto ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Envía el código de recuperación. Lanza un error si el envío falla.
async function enviarCodigoRecuperacion({ para, nombre, codigo, minutos }) {
  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:';

  await obtenerTransporte().sendMail({
    from: process.env.CORREO_REMITENTE || process.env.SMTP_USER,
    to: para,
    subject: `Tu código para recuperar la contraseña: ${codigo}`,
    // Versión de texto plano (la leen los clientes de correo sin HTML)
    text:
      `${saludo}\n\n` +
      `Tu código para cambiar la contraseña de FitManager es: ${codigo}\n\n` +
      `Vence en ${minutos} minutos y sirve una sola vez.\n` +
      'Si no lo pediste, ignora este correo: tu contraseña no cambia.',
    // Versión con formato
    html:
      `<p>${escaparHtml(saludo)}</p>` +
      '<p>Tu código para cambiar la contraseña de FitManager es:</p>' +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${escaparHtml(codigo)}</p>` +
      `<p>Vence en ${minutos} minutos y sirve una sola vez.</p>` +
      '<p style="color:#666">Si no lo pediste, ignora este correo: tu contraseña no cambia.</p>',
  });
}

module.exports = { enviarCodigoRecuperacion };
