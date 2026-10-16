// =============================================================
// trama.ts — ARMAR Y LEER TRAMAS (protocolo FM del servidor)
// =============================================================

const PROTOCOLO = 'FM';
const VERSION = '2'; // Versión actualizada para el registro
const SEP = '|';

export type RespuestaLogin = {
  idMensaje: string;
  codigo: string;
  detalle: string;
  idUsuario: string;
  nombre: string;
  rol: string;
  token: string;
  acceso: string;
};

let contador = 1000;
export function nuevoIdMensaje(): string {
  contador += 1;
  return String(contador);
}

export function construirLoginReq(alias: string, contrasena: string, idMensaje: string): string {
  if (alias.includes(SEP) || contrasena.includes(SEP)) {
    throw new Error('El usuario y la contraseña no pueden contener el carácter |');
  }
  return [PROTOCOLO, VERSION, 'LOGIN_REQ', idMensaje, alias, contrasena].join(SEP) + '\n';
}

export function leerLoginRes(trama: string): RespuestaLogin {
  const c = trama.trim().split(SEP);
  if (c.length < 9 || c[0] !== PROTOCOLO || c[2] !== 'LOGIN_RES') {
    throw new Error('Trama de respuesta inválida');
  }
  return {
    idMensaje: c[3],
    codigo: c[4],
    detalle: c[5],
    idUsuario: c[6],
    nombre: c[7],
    rol: c[8],
    token: c[9] ?? '',
    acceso: c[10] ?? '',
  };
}

// --- NUEVA FUNCIÓN PARA ARMAR LA TRAMA DE REGISTRO (Estilo idéntico al login) ---
export function construirSignupReq(
  idMensaje: string,
  alias: string,
  correo: string,
  contrasena: string,
  nombre: string,
  apellidos: string,
  fechaNacimiento: string,
  genero: string,
  dpiNit: string,
  telefono: string,
  departamento: string,
  municipio: string,
  sucursal: string,
  metodoPago: string,
  membresia: string,
  meses: string,
  tarjetaSegura: string,
  cvvSeguro: string,
  pregunta: string,
  respuesta: string
): string {
  if (alias.includes(SEP) || correo.includes(SEP)) {
    throw new Error('Los campos no pueden contener el carácter |');
  }

  return [
    PROTOCOLO,
    VERSION,
    'SIGNUP_REQ',
    idMensaje,
    alias,
    correo,
    contrasena,
    nombre,
    apellidos,
    fechaNacimiento,
    genero,
    dpiNit,
    telefono,
    departamento,
    municipio,
    sucursal,
    metodoPago,
    membresia,
    meses,
    tarjetaSegura,
    cvvSeguro,
    pregunta,
    respuesta
  ].join(SEP) + '\n';
}