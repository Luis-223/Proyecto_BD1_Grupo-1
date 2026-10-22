// servicios/recuperacion.js — PASOS 1 Y 2 DE "RECUPERAR CONTRASEÑA" (r_contra.tsx)
//   1. obtenerPregunta(alias)            -> la pregunta de seguridad de ese alias
//   2. verificarRespuesta(alias, id, p)  -> ¿la palabra clave es correcta? (no cambia nada)
//   3. El cambio de contraseña lo sigue haciendo cuentas.recuperarContrasena
//      (trama RECUPERAR), que vuelve a revisar la palabra clave.
//
// No usa procedimientos nuevos: lee con los que ya existen
// (usp_ObtenerRespuestasSeguridad y usp_ListarPreguntasSeguridad).
//
// Para que nadie pueda averiguar qué alias existen, si el alias no existe
// (o no tiene palabra clave) se devuelve igual una pregunta, siempre la misma
// para ese alias, y la respuesta nunca será correcta.

const crypto = require('crypto');
const argon2 = require('argon2');
const { sql, conectar } = require('../db');
const { crearLimitador } = require('../seguridad');
const { ErrorApp } = require('../errores');

// 5 respuestas incorrectas = alias bloqueado 15 minutos para este paso
const limiteVerificar = crearLimitador({ maximo: 5, minutos: 15 });

const texto = (valor) => (valor === undefined || valor === null ? '' : String(valor));
// Igual que en cuentas.js: "Firulais " = "firulais"
const normalizarPalabra = (palabra) => texto(palabra).normalize('NFC').trim().toLowerCase();

// Mismo tiempo de respuesta aunque el alias no exista
const OPCIONES_ARGON2 = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
let hashFalso = null;
async function gastarTiempoIgual(valor) {
  if (!hashFalso) hashFalso = await argon2.hash('alias-que-no-existe', OPCIONES_ARGON2);
  await argon2.verify(hashFalso, valor || 'x').catch(() => false);
}

async function leerRespuestas(alias) {
  const pool = await conectar();
  const resultado = await pool.request()
    .input('alias', sql.VarChar(60), alias)
    .execute('usp_ObtenerRespuestasSeguridad');
  return resultado.recordset; // [{ id_alias, id_pregunta, respuesta_argon2 }]
}

async function leerPreguntas() {
  const pool = await conectar();
  const resultado = await pool.request().execute('usp_ListarPreguntasSeguridad');
  return resultado.recordset; // [{ id_pregunta, texto_pregunta }]
}

// PASO 1: la pregunta asociada al alias
async function obtenerPregunta(aliasRecibido) {
  const alias = texto(aliasRecibido).trim();
  if (!alias) throw new ErrorApp('DATOS', 'Escribe tu usuario o alias');

  const [respuestas, preguntas] = await Promise.all([leerRespuestas(alias), leerPreguntas()]);
  if (preguntas.length === 0) throw new ErrorApp('NO_EXISTE', 'No hay preguntas de seguridad registradas');

  let elegida;
  if (respuestas.length > 0) {
    // Si tiene varias, se usa siempre la de menor id (la misma cada vez)
    const idPregunta = Math.min(...respuestas.map((r) => r.id_pregunta));
    elegida = preguntas.find((p) => p.id_pregunta === idPregunta);
  }
  if (!elegida) {
    // Alias inexistente o sin palabra clave: pregunta "de relleno", estable para ese alias
    const indice = crypto.createHash('sha256').update(alias.toLowerCase()).digest().readUInt32BE(0) % preguntas.length;
    elegida = preguntas[indice];
  }

  return { idPregunta: elegida.id_pregunta, pregunta: elegida.texto_pregunta };
}

// PASO 2: revisar la respuesta sin cambiar la contraseña
async function verificarRespuesta(aliasRecibido, idPreguntaRecibida, palabraRecibida) {
  const alias = texto(aliasRecibido).trim();
  const palabra = normalizarPalabra(palabraRecibida);
  const idPregunta = Number(idPreguntaRecibida);

  if (!alias || !palabra) throw new ErrorApp('DATOS', 'Escribe tu respuesta');

  const espera = limiteVerificar.minutosBloqueado(alias);
  if (espera > 0) {
    throw new ErrorApp('INTENTOS', `Demasiados intentos. Intenta de nuevo en ${espera} minutos.`);
  }

  const respuesta = (await leerRespuestas(alias))
    .find((r) => r.id_pregunta === idPregunta && r.respuesta_argon2);

  let correcta = false;
  if (respuesta) {
    correcta = await argon2.verify(respuesta.respuesta_argon2, palabra).catch(() => false);
  } else {
    await gastarTiempoIgual(palabra);
  }

  if (!correcta) {
    limiteVerificar.registrarFallo(alias);
    throw new ErrorApp('CREDENCIALES', 'La respuesta no es correcta');
  }
  limiteVerificar.limpiar(alias);
  return { mensaje: 'Respuesta correcta' };
}

module.exports = { obtenerPregunta, verificarRespuesta };
