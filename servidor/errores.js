// errores.js — ERRORES CON NOMBRE
// Cuando algo sale mal (clave incorrecta, sesión vencida...), el
// código lanza un ErrorApp con un TIPO. Después, cada forma de
// responder lo traduce a lo suyo:
//   - las rutas JSON  -> un código HTTP (401, 403...)
//   - las tramas      -> un código de dos dígitos (01, 02...)
// Así el mismo error se explica igual en las dos.

// TIPO -> [código HTTP, código de trama]
const TIPOS = {
  DATOS: [400, '05'], // faltan datos o vienen mal escritos
  CREDENCIALES: [401, '01'], // usuario, contraseña o palabra clave incorrectos
  BLOQUEADO: [403, '02'], // usuario suspendido o bloqueado
  INTENTOS: [429, '03'], // demasiados intentos seguidos
  SESION: [401, '04'], // no hay token, o venció
  SIN_PERMISO: [403, '06'], // no puede usar esa sección (ej. membresía vencida)
  NEGOCIO: [400, '07'], // la base rechazó la operación (sin cupo, etc.)
  NO_EXISTE: [404, '08'], // lo que pidió no existe o no es suyo
};

class ErrorApp extends Error {
  constructor(tipo, mensaje) {
    super(mensaje);
    this.tipo = tipo;
  }
}

// Convierte cualquier error en { http, trama, mensaje, inesperado }
function traducirError(error, mensajeGeneral = 'Error inesperado en el servidor') {
  if (error instanceof ErrorApp && TIPOS[error.tipo]) {
    const [http, trama] = TIPOS[error.tipo];
    return { http, trama, mensaje: error.message, inesperado: false };
  }
  // Los THROW de SQL Server con número >= 50000 son mensajes para el usuario
  if (error && error.number >= 50000) {
    return { http: 400, trama: '07', mensaje: error.message, inesperado: false };
  }
  return { http: 500, trama: '99', mensaje: mensajeGeneral, inesperado: true };
}

// Para las rutas JSON: responde con el código HTTP correcto
function responderError(res, error, mensajeGeneral) {
  const t = traducirError(error, mensajeGeneral);
  if (t.inesperado) console.error(error); // solo los inesperados ensucian la consola
  return res.status(t.http).json({ error: t.mensaje });
}

module.exports = { ErrorApp, traducirError, responderError };