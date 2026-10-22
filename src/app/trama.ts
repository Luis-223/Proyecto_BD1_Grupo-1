// =============================================================
// trama.ts — ARMAR Y LEER TRAMAS (protocolo FM del servidor)
// =============================================================

const PROTOCOLO = 'FM';
const VERSION = '1'; // Debe ser IGUAL a la del servidor
const SEP = '|';
const SEP_REGISTRO = '~'; // Separa un elemento de otro: "1^Masculino~2^Femenino"
const SEP_DATO = '^';     // Separa los datos de un elemento: "1^Masculino"

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

// CAMBIO: el servidor ahora devuelve hasta cuándo quedó pagado y un token
// nuevo (con acceso COMPLETO si la membresía estaba vencida y se pagó).
export type RespuestaMembresia = {
  idMensaje: string;
  codigo: string;
  detalle: string;
  pagadoHasta: string; // AAAA-MM-DD, vacío si no se cobró nada (pago en sucursal)
  token: string;       // vacío si no cambió
  acceso: string;      // COMPLETO o LIMITADO
};

// Mismo formato { label, value } que usan los Dropdown de react-native-element-dropdown
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

// Ningún dato puede llevar el separador ni saltos de línea: rompería la trama
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

// MEMBRESIA_REQ: token | idMetodoPago (o SUCURSAL) | idTipoMembresia | meses | esCambioTipo
// CAMBIO: el TOKEN va como primer campo, igual que las demás tramas con sesión
// (SESION, PALABRA_CLAVE, CAMBIAR_CLAVE). Sin él, el servidor no sabe quién paga.
export function construirMembresiaReq(
  idMensaje: string,
  token: string,
  metodoPago: string,
  membresia: string,
  meses: string,
  esCambioTipo: string
): string {
  const datos = [token, metodoPago, membresia, meses, esCambioTipo];
  validarCampos(datos);
  return [PROTOCOLO, VERSION, 'MEMBRESIA_REQ', idMensaje, ...datos].join(SEP) + '\n';
}

// MEMBRESIA_RES: pagadoHasta | token | acceso
export function leerMembresiaRes(trama: string): RespuestaMembresia {
  const c = trama.trim().split(SEP);
  if (c.length < 6 || c[0] !== PROTOCOLO || c[2] !== 'MEMBRESIA_RES') {
    throw new Error('Trama de respuesta inválida');
  }
  return {
    idMensaje: c[3],
    codigo: c[4],
    detalle: c[5],
    pagadoHasta: c[6] ?? '',
    token: c[7] ?? '',
    acceso: c[8] ?? '',
  };
}

// =============================================================
// RECUPERAR CONTRASEÑA (r_contra.tsx)
// Los nombres de trama van en MAYÚSCULAS: el servidor rechaza
// cualquier otro formato ("ReQCon_REQ" respondería "Trama inválida").
// =============================================================

export type RespuestaPreguntaAlias = {
  idMensaje: string;
  codigo: string;
  detalle: string;
  idPregunta: string;
  pregunta: string;
};

export type RespuestaSimple = {
  idMensaje: string;
  codigo: string;
  detalle: string;
};

// Paso 1 — PREGUNTA_ALIAS_REQ: alias
export function construirPreguntaAliasReq(idMensaje: string, alias: string): string {
  validarCampos([alias]);
  return [PROTOCOLO, VERSION, 'PREGUNTA_ALIAS_REQ', idMensaje, alias].join(SEP) + '\n';
}

// PREGUNTA_ALIAS_RES: idPregunta | texto de la pregunta
export function leerPreguntaAliasRes(trama: string): RespuestaPreguntaAlias {
  const c = trama.trim().split(SEP);
  if (c.length < 6 || c[0] !== PROTOCOLO || c[2] !== 'PREGUNTA_ALIAS_RES') {
    throw new Error('Trama de respuesta inválida');
  }
  return { idMensaje: c[3], codigo: c[4], detalle: c[5], idPregunta: c[6] ?? '', pregunta: c[7] ?? '' };
}

// Paso 2 — VERIFICAR_RESPUESTA_REQ: alias | idPregunta | palabra clave
export function construirVerificarRespuestaReq(idMensaje: string, alias: string, idPregunta: string, palabra: string): string {
  validarCampos([alias, idPregunta, palabra]);
  return [PROTOCOLO, VERSION, 'VERIFICAR_RESPUESTA_REQ', idMensaje, alias, idPregunta, palabra].join(SEP) + '\n';
}

// Paso 3 — RECUPERAR_REQ: alias | palabra clave | contraseña nueva
export function construirRecuperarReq(idMensaje: string, alias: string, palabra: string, nueva: string): string {
  validarCampos([alias, palabra, nueva]);
  return [PROTOCOLO, VERSION, 'RECUPERAR_REQ', idMensaje, alias, palabra, nueva].join(SEP) + '\n';
}

// VERIFICAR_RESPUESTA_RES y RECUPERAR_RES solo traen código y detalle
export function leerRespuestaSimple(trama: string, tipo: string): RespuestaSimple {
  const c = trama.trim().split(SEP);
  if (c.length < 6 || c[0] !== PROTOCOLO || c[2] !== `${tipo}_RES`) {
    throw new Error('Trama de respuesta inválida');
  }
  return { idMensaje: c[3], codigo: c[4], detalle: c[5] };
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
