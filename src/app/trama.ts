// =============================================================
// trama.ts — ARMAR Y LEER TRAMAS (protocolo FM del servidor)
// =============================================================

const PROTOCOLO = 'FM';
const VERSION = '1'; // Debe ser IGUAL a la del servidor
const SEP = '|';
const SEP_REGISTRO = '~'; // Separa un elemento de otro: "1^Masculino~2^Femenino"
const SEP_DATO = '^';     // Separa los datos de un elemento: "1^Masculino"[cite: 23]

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

export type RespuestaSignup = {
  idMensaje: string;
  codigo: string;
  detalle: string;
  idUsuario: string;
};

// Mismo formato { label, value } que usan los Dropdown de react-native-element-dropdown[cite: 23]
export type Opcion = { label: string; value: string };
export type OpcionMunicipio = Opcion & { idDepartamento: string };
export type OpcionMembresia = Opcion & { precio: number; duracion: number };

export type Catalogos = {
  generos: Opcion[];
  departamentos: Opcion[];
  municipios: OpcionMunicipio[];
  sucursales: Opcion[];
  metodosPago: Opcion[];
  membresias: OpcionMembresia[];
  preguntas: Opcion[];
};

export type RespuestaCatalogos = {
  idMensaje: string;
  codigo: string;
  detalle: string;
  catalogos: Catalogos;
};

let contador = 1000;
export function nuevoIdMensaje(): string {
  contador += 1;
  return String(contador);
}

// Ningún dato puede llevar el separador ni saltos de línea: rompería la trama[cite: 23]
function validarCampos(datos: string[]): void {
  if (datos.some((d) => d.includes(SEP) || d.includes('\n') || d.includes('\r'))) {
    throw new Error('Ningún campo puede contener el carácter | ni saltos de línea');
  }
}

export function construirLoginReq(alias: string, contrasena: string, idMensaje: string): string {
  validarCampos([alias, contrasena]);
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
  const datos = [
    alias, correo, contrasena, nombre, apellidos, fechaNacimiento, genero, dpiNit,
    telefono, departamento, municipio, sucursal, metodoPago, membresia, meses,
    tarjetaSegura, cvvSeguro, pregunta, respuesta,
  ];
  validarCampos(datos);
  return [PROTOCOLO, VERSION, 'SIGNUP_REQ', idMensaje, ...datos].join(SEP) + '\n';
}

export function leerSignupRes(trama: string): RespuestaSignup {
  const c = trama.trim().split(SEP);
  if (c.length < 7 || c[0] !== PROTOCOLO || c[2] !== 'SIGNUP_RES') {
    throw new Error('Trama de respuesta inválida');
  }
  return { idMensaje: c[3], codigo: c[4], detalle: c[5], idUsuario: c[6] };
}

export function construirCatalogosReq(idMensaje: string): string {
  return [PROTOCOLO, VERSION, 'CATALOGOS_REQ', idMensaje].join(SEP) + '\n';
}

function leerLista(campo?: string): string[][] {
  if (!campo) return [];
  return campo.split(SEP_REGISTRO).map((registro) => registro.split(SEP_DATO));
}

function leerOpciones(campo?: string): Opcion[] {
  return leerLista(campo).map(([id, nombre]) => ({ label: nombre, value: id }));
}

export function leerCatalogosRes(trama: string): RespuestaCatalogos {
  const c = trama.trim().split(SEP);
  if (c.length < 13 || c[0] !== PROTOCOLO || c[2] !== 'CATALOGOS_RES') {
    throw new Error('Trama de respuesta inválida');
  }
  return {
    idMensaje: c[3],
    codigo: c[4],
    detalle: c[5],
    catalogos: {
      generos: leerOpciones(c[6]),
      departamentos: leerOpciones(c[7]),
      municipios: leerLista(c[8]).map(([id, idDepartamento, nombre]) => ({
        label: nombre,
        value: id,
        idDepartamento,
      })),
      sucursales: leerOpciones(c[9]),
      metodosPago: leerOpciones(c[10]),
      membresias: leerLista(c[11]).map(([id, nombre, precio, duracion]) => ({
        label: nombre,
        value: id,
        precio: Number(precio),
        duracion: Number(duracion),
      })),
      preguntas: leerOpciones(c[12]),
    },
  };
}