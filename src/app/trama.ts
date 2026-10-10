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
  };
}