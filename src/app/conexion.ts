// =============================================================
// conexion.ts — MANDAR TRAMAS AL SERVIDOR
// =============================================================

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  construirLoginReq,
  leerLoginRes,
  nuevoIdMensaje,
  leerSignupRes,
  construirCatalogosReq,
  leerCatalogosRes,
  construirMembresiaReq,
  leerMembresiaRes,
  construirPreguntaAliasReq,
  leerPreguntaAliasRes,
  construirVerificarRespuestaReq,
  construirRecuperarReq,
  leerRespuestaSimple,
  construirCodigoEnviarReq,    // NUEVO: recuperar por correo
  construirCodigoVerificarReq, // NUEVO: recuperar por correo
} from './trama';
import type {
  RespuestaLogin, RespuestaSignup, RespuestaCatalogos, RespuestaMembresia,
  RespuestaPreguntaAlias, RespuestaSimple,
} from './trama';
import { obtenerSesion, guardarSesion } from './sesion';

// Servidor publicado en internet (Azure, con HTTPS).
// Para probar contra el servidor de tu PC en la red local, déjalo vacío: ''
const URL_PUBLICA = 'https://fitmanager.sysmonitor-grupo3.online';

const PUERTO_SERVIDOR = 3000;
const IP_SERVIDOR_FIJA = '192.168.0.75';
// La base gratuita de Azure tarda hasta un minuto en "despertar":
// la primera petición puede tardar, por eso se espera hasta 75 s
const ESPERA_MAXIMA_MS = 75000;

function hostDelServidor(): string {
  if (IP_SERVIDOR_FIJA && Platform.OS !== 'web') {
    return IP_SERVIDOR_FIJA;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.hostname;
  }
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    return hostUri.split(':')[0];
  }
  if (Platform.OS === 'android') {
    return '10.0.2.2';
  }
  return 'localhost';
}

// NUEVO: la raíz del servidor, para las rutas JSON (/cliente/...).
// Con URL_PUBLICA: https://fitmanager.sysmonitor-grupo3.online
// Sin URL_PUBLICA: http://<IP de tu PC>:3000
export const URL_BASE = URL_PUBLICA
  ? URL_PUBLICA
  : `http://${hostDelServidor()}:${PUERTO_SERVIDOR}`;

export const URL_SERVIDOR = `${URL_BASE}/trama`;

async function enviarTrama(trama: string): Promise<string> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ESPERA_MAXIMA_MS);

  try {
    const respuesta = await fetch(URL_SERVIDOR, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: trama,
      signal: control.signal,
    });

    if (!respuesta.ok) {
      throw new Error(`Respuesta del servidor no exitosa (Status: ${respuesta.status})`);
    }

    return await respuesta.text();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Tiempo de espera agotado (${ESPERA_MAXIMA_MS / 1000}s). Verifica que el servidor en ${URL_SERVIDOR} esté activo.`);
    }
    // Si el servidor SÍ respondió con un error HTTP, no lo disfrazamos de "no se pudo conectar"
    if (typeof error?.message === 'string' && error.message.startsWith('Respuesta del servidor')) {
      throw error;
    }
    throw new Error(`No se pudo conectar al servidor en ${URL_SERVIDOR}. Verifica la conexión.`);
  } finally {
    clearTimeout(temporizador);
  }
}

// Pide una ruta JSON protegida (manda el token de la sesión).
// CAMBIO: acepta POST y DELETE, y datos en el cuerpo (metas, chat)
async function pedirJson<T>(ruta: string, metodo: 'GET' | 'POST' | 'DELETE' = 'GET', cuerpo?: object): Promise<T> {
  const sesion = obtenerSesion();
  if (!sesion?.token) {
    throw new Error('Debes iniciar sesión otra vez.');
  }

  const url = `${URL_BASE}${ruta}`;
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ESPERA_MAXIMA_MS);

  try {
    const respuesta = await fetch(url, {
      method: metodo,
      headers: cuerpo
        ? { Authorization: `Bearer ${sesion.token}`, 'Content-Type': 'application/json' }
        : { Authorization: `Bearer ${sesion.token}` },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: control.signal,
    });
    const datos = await respuesta.json().catch(() => null);

    if (!respuesta.ok) {
      // El servidor manda { error: '...' } en 401/403/500
      throw new Error(datos?.error || `Respuesta del servidor no exitosa (Status: ${respuesta.status})`);
    }
    return datos as T;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Tiempo de espera agotado (${ESPERA_MAXIMA_MS / 1000}s) al consultar ${url}.`);
    }
    if (error instanceof Error && error.message) throw error;
    throw new Error(`No se pudo conectar al servidor en ${url}.`);
  } finally {
    clearTimeout(temporizador);
  }
}

export async function loginPorTrama(alias: string, contrasena: string): Promise<RespuestaLogin> {
  const id = nuevoIdMensaje();
  const trama = construirLoginReq(alias, contrasena, id);
  const textoRespuesta = await enviarTrama(trama);
  const res = leerLoginRes(textoRespuesta);

  if (res.idMensaje !== id) {
    throw new Error('La respuesta recibida no corresponde a la solicitud realizada');
  }

  return res;
}

export async function signupPorTrama(idMensaje: string, trama: string): Promise<RespuestaSignup> {
  const textoRespuesta = await enviarTrama(trama);
  const res = leerSignupRes(textoRespuesta);

  if (res.idMensaje !== idMensaje) {
    throw new Error('La respuesta recibida no corresponde a la solicitud realizada');
  }

  return res;
}

export async function catalogosPorTrama(): Promise<RespuestaCatalogos> {
  const id = nuevoIdMensaje();
  const textoRespuesta = await enviarTrama(construirCatalogosReq(id));
  const res = leerCatalogosRes(textoRespuesta);

  if (res.idMensaje !== id) {
    throw new Error('La respuesta recibida no corresponde a la solicitud realizada');
  }

  return res;
}

// =============================================================
// MEMBRESÍA
// =============================================================

// Lo que devuelve GET /cliente/membresia (rutas/cliente.js del servidor)
export type InfoMembresia = {
  activa: boolean;
  id_tipo_membresia?: number;
  tipo?: string;
  // Meses pagados que quedan (desde hoy), agrupados por plan
  restantes?: { id_tipo_membresia: number; nombre_tipo: string; meses: number }[];
  fecha_inicio?: string;
  fecha_fin?: string;
  pagado_hasta?: string;
  mensaje?: string;
  ultima?: { tipo: string; fecha_inicio: string; fecha_fin: string; estado: string } | null;
  beneficios?: { codigo: string; nombre_beneficio: string; descripcion: string | null }[];
};

// NUEVO: consulta la membresía vigente del cliente que inició sesión
export function consultarMembresia(): Promise<InfoMembresia> {
  return pedirJson<InfoMembresia>('/cliente/membresia');
}

// NUEVO: antes mi_membresia.tsx importaba esta función pero no existía.
// Paga (o registra que pagará en sucursal) usando la trama MEMBRESIA.
export async function membresiaPorTrama(
  metodoPago: string,
  membresia: string,
  meses: string,
  esCambioTipo: string
): Promise<RespuestaMembresia> {
  const sesion = obtenerSesion();
  if (!sesion?.token) {
    throw new Error('Debes iniciar sesión otra vez.');
  }

  const id = nuevoIdMensaje();
  const trama = construirMembresiaReq(id, sesion.token, metodoPago, membresia, meses, esCambioTipo);
  const res = leerMembresiaRes(await enviarTrama(trama));

  if (res.idMensaje !== id) {
    throw new Error('La respuesta recibida no corresponde a la solicitud realizada');
  }

  // Si pagó una membresía vencida, el servidor manda un token nuevo con acceso COMPLETO
  if (res.codigo === '00' && res.token) {
    guardarSesion({ ...sesion, token: res.token, acceso: res.acceso || sesion.acceso });
  }

  return res;
}

// =============================================================
// RECUPERAR CONTRASEÑA (r_contra.tsx) — no necesitan sesión
// =============================================================

function revisarId<T extends { idMensaje: string }>(res: T, id: string): T {
  if (res.idMensaje !== id) {
    throw new Error('La respuesta recibida no corresponde a la solicitud realizada');
  }
  return res;
}

// Paso 1: la pregunta de seguridad asociada al alias
export async function preguntaPorAlias(alias: string): Promise<RespuestaPreguntaAlias> {
  const id = nuevoIdMensaje();
  return revisarId(leerPreguntaAliasRes(await enviarTrama(construirPreguntaAliasReq(id, alias))), id);
}

// Paso 2: ¿la respuesta es correcta? (no cambia la contraseña)
export async function verificarRespuestaPorTrama(alias: string, idPregunta: string, palabra: string): Promise<RespuestaSimple> {
  const id = nuevoIdMensaje();
  const texto = await enviarTrama(construirVerificarRespuestaReq(id, alias, idPregunta, palabra));
  return revisarId(leerRespuestaSimple(texto, 'VERIFICAR_RESPUESTA'), id);
}

// Paso 3: guardar la contraseña nueva (el servidor vuelve a revisar la respuesta)
export async function recuperarPorTrama(alias: string, palabra: string, nueva: string): Promise<RespuestaSimple> {
  const id = nuevoIdMensaje();
  const texto = await enviarTrama(construirRecuperarReq(id, alias, palabra, nueva));
  return revisarId(leerRespuestaSimple(texto, 'RECUPERAR'), id);
}

// =============================================================
// NUEVO — RECUPERAR CONTRASEÑA POR CORREO (correo.tsx) — sin sesión
// =============================================================

// Paso 1: pedir que el servidor mande un código de 6 dígitos al correo del alias
export async function enviarCodigoPorCorreo(alias: string): Promise<RespuestaSimple> {
  const id = nuevoIdMensaje();
  const texto = await enviarTrama(construirCodigoEnviarReq(id, alias));
  return revisarId(leerRespuestaSimple(texto, 'CODIGO_ENVIAR'), id);
}

// Paso 2: mandar el código y la contraseña nueva
export async function recuperarConCodigoPorTrama(alias: string, codigo: string, nueva: string): Promise<RespuestaSimple> {
  const id = nuevoIdMensaje();
  const texto = await enviarTrama(construirCodigoVerificarReq(id, alias, codigo, nueva));
  return revisarId(leerRespuestaSimple(texto, 'CODIGO_VERIFICAR'), id);
}

// =============================================================
// ENTRENADORES (mi_entrenador.tsx) — rutas /cliente/entrenadores
// =============================================================

export type Entrenador = {
  id_entrenador: number;
  nombre: string;
  especialidad: string | null;
  nivel: string | null;
  sucursal: string;
  fecha_contratacion: string | null;
  anios_experiencia: number | null;
  clientes_activos: number;
  clases_proximas: number;
  mis_rutinas: number;     // rutinas que ya le hizo a este cliente
  asignado: boolean;       // true = ya es uno de sus entrenadores
  asignado_desde: string | null;
};

export function listarEntrenadores(): Promise<Entrenador[]> {
  return pedirJson<Entrenador[]>('/cliente/entrenadores');
}

export function agregarEntrenador(idEntrenador: number): Promise<{ mensaje: string }> {
  return pedirJson(`/cliente/entrenadores/${idEntrenador}`, 'POST');
}

export function quitarEntrenador(idEntrenador: number): Promise<{ mensaje: string }> {
  return pedirJson(`/cliente/entrenadores/${idEntrenador}`, 'DELETE');
}

// =============================================================
// RUTINAS (mi_rutina.tsx) — rutas /cliente/rutinas
// =============================================================

export type RutinaResumen = {
  id_rutina: number;
  nombre_rutina: string;
  fecha_creacion: string;
  entrenador: string;
};

export type SerieRutina = {
  numero: number;
  repeticiones: number;
  peso_objetivo: number | null;
  descanso_segundos: number;
};

export type EjercicioRutina = {
  id_bloque_ejercicio: number;
  orden: number;
  nombre: string;
  grupo_muscular: string | null;
  unidad: string;          // reps, seg o min
  series: SerieRutina[];
};

export type RutinaDetalle = {
  id_rutina: number;
  nombre_rutina: string;
  fecha_creacion: string;
  dias: { id_dia_rutina: number; numero_dia: number; nombre_dia: string | null; ejercicios: EjercicioRutina[] }[];
};

export function listarRutinas(): Promise<RutinaResumen[]> {
  return pedirJson<RutinaResumen[]>('/cliente/rutinas');
}

export function obtenerRutina(idRutina: number): Promise<RutinaDetalle> {
  return pedirJson<RutinaDetalle>(`/cliente/rutinas/${idRutina}`);
}

// =============================================================
// MIS PAGOS (mis_pagos.tsx) — GET /cliente/pagos
// =============================================================

export type LineaFactura = {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
};

export type PagoCliente = {
  id_factura: number;
  numero: string;
  fecha_emision: string;
  total: number;
  estado: string;          // Pagada, Anulada...
  sucursal: string;
  metodo: string;          // Efectivo, Tarjeta...
  fecha_pago: string | null;
  referencia: string | null;
  pagado: number;
  tipo: 'Membresía' | 'Productos' | 'Otro';
  detalle: LineaFactura[];
};

export function listarPagos(): Promise<PagoCliente[]> {
  return pedirJson<PagoCliente[]>('/cliente/pagos');
}

// =============================================================
// SUCURSALES (mi_sucursal.tsx y sucursales.tsx) — GET /cliente/sucursales
// =============================================================

export type Sucursal = {
  id_sucursal: number;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  municipio: string | null;
  departamento: string | null;
  latitud: number | null;  // null = todavía sin ubicación (no se muestra mapa)
  longitud: number | null;
  entrenadores: number;
  clases_semana: number;   // clases grupales en los próximos 7 días
  miembros: number;
  es_mia: boolean;
};

export function listarSucursales(): Promise<Sucursal[]> {
  return pedirJson<Sucursal[]>('/cliente/sucursales');
}

// =============================================================
// CLASES GRUPALES (clases_grupales.tsx y clase_detalle.tsx) — rutas /clases
// =============================================================

export type ClaseGrupal = {
  id_clase: number;
  nombre_clase: string;
  fecha_hora: string;
  cupo_maximo: number;
  nombre_sucursal: string;
  cupos_disponibles: number;
  ya_inscrito: boolean;
  entrenador: string | null;
};

export type ListaClases = {
  membresia_incluye_clases: boolean; // false = su membresía no incluye clases (requiere Oro)
  clases: ClaseGrupal[];
};

export type DetalleClase = {
  id_clase: number;
  nombre_clase: string;
  fecha_hora: string;
  cupo_maximo: number;
  sucursal: string;
  inscritos: number;
  cupos_disponibles: number;
  ya_inscrito: boolean;
  ya_empezo: boolean;
  incluye_clases: boolean;
  entrenador: {
    id_entrenador: number;
    nombre: string;
    especialidad: string | null;
    nivel: string | null;
    anios_experiencia: number | null;
  } | null;
  participantes: { nombre: string; fecha_inscripcion: string; soy_yo: boolean }[];
};

export function listarClases(): Promise<ListaClases> {
  return pedirJson<ListaClases>('/clases');
}

export function detalleClase(idClase: number): Promise<DetalleClase> {
  return pedirJson<DetalleClase>(`/clases/${idClase}`);
}

export function inscribirClase(idClase: number): Promise<{ mensaje: string; cupos_disponibles: number }> {
  return pedirJson(`/clases/${idClase}/inscribir`, 'POST');
}

export function cancelarClase(idClase: number): Promise<{ mensaje: string; cupos_disponibles: number }> {
  return pedirJson(`/clases/${idClase}/inscripcion`, 'DELETE');
}

// =============================================================
// METAS (mis_metas.tsx) — rutas /cliente/metas
// =============================================================

export type TipoMeta = 'Peso' | 'Fuerza' | 'Distancia' | 'Asistencia' | 'Personalizada';

export type Meta = {
  id_meta: number;
  tipo_meta: TipoMeta | string;
  descripcion: string;
  unidad_medida: string | null;
  valor_inicial: number | null;
  valor_objetivo: number | null;
  valor_actual: number | null;
  progreso: number;            // 0 a 100
  fecha_inicio: string;
  fecha_objetivo: string | null;
  estado: 'En progreso' | 'Cumplida' | 'Cancelada' | string;
  dias_restantes: number | null;
  avances: { id_avance: number; fecha: string; valor: number; nota: string | null }[];
};

export type NuevaMeta = {
  tipo_meta: TipoMeta;
  descripcion: string;
  valor_inicial?: number | null;
  valor_objetivo: number;
  unidad_medida: string;
  fecha_objetivo: string;      // AAAA-MM-DD
};

export function listarMetas(): Promise<Meta[]> {
  return pedirJson<Meta[]>('/cliente/metas');
}

export function crearMeta(meta: NuevaMeta): Promise<{ mensaje: string; id_meta: number }> {
  return pedirJson('/cliente/metas', 'POST', meta);
}

export function registrarAvance(idMeta: number, valor: number, nota?: string): Promise<{ mensaje: string; estado: string; progreso: number }> {
  return pedirJson(`/cliente/metas/${idMeta}/avances`, 'POST', { valor, nota });
}

export function cancelarMeta(idMeta: number): Promise<{ mensaje: string }> {
  return pedirJson(`/cliente/metas/${idMeta}/cancelar`, 'POST');
}

// =============================================================
// CHAT CON SU SUCURSAL (chat.tsx) — rutas /cliente/chat
// =============================================================

export type MensajeChat = {
  id_mensaje: number;
  texto: string;
  fecha: string;
  de_cliente: boolean;         // true = lo escribió el cliente; false = la sucursal
  autor: string;               // "Tú" o el nombre de quien respondió en la sucursal
  leido: boolean;
};

export type Chat = {
  sucursal: string;
  mensajes: MensajeChat[];
};

// despues = id del último mensaje que ya se tiene (para pedir solo los nuevos)
export function leerChat(despues = 0): Promise<Chat> {
  return pedirJson<Chat>(`/cliente/chat?despues=${despues}`);
}

export function enviarMensaje(texto: string): Promise<MensajeChat> {
  return pedirJson<MensajeChat>('/cliente/chat', 'POST', { texto });
}

export function mensajesSinLeer(): Promise<{ sin_leer: number }> {
  return pedirJson('/cliente/chat/sin-leer');
}
