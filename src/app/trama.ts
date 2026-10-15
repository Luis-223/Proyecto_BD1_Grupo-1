// =============================================================
// trama.ts — ARMAR Y LEER TRAMAS (protocolo FM del servidor)
// Pedido:    FM|1|LOGIN_REQ|<idMensaje>|<alias>|<contraseña>
// Respuesta: FM|1|LOGIN_RES|<idMensaje>|<código>|<detalle>|<idUsuario>|<nombre>|<rol>|<token>|<acceso>
// código 00 = todo bien. Otro código = el detalle explica qué pasó.
// =============================================================

const PROTOCOLO = 'FM';
const VERSION = '1';
const SEP = '|';

export type RespuestaLogin = {
  idMensaje: string;
  codigo: string;
  detalle: string;
  idUsuario: string;
  nombre: string;
  rol: string;
  token: string; // NUEVO: se manda en las siguientes tramas para probar quién es
  acceso: string; // NUEVO: COMPLETO, o LIMITADO si la membresía venció
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
    token: c[9] ?? '', // NUEVO (posición 9)
    acceso: c[10] ?? '', // NUEVO (posición 10)
  };
}