// rutas/escritorio.js — RUTAS DE LA APP DE ESCRITORIO (PRINCIPAL.py) EN FORMATO JSON
//
//   POST /escritorio/login                      -> inicia sesión (personal de sucursal)
//   GET  /escritorio/resumen                    -> tarjetas de Inicio
//   GET  /escritorio/catalogos                  -> clientes, membresías, métodos de pago, entrenadores
//   POST /escritorio/membresias/actualizar      -> pasa a "Vencida" las membresías que ya terminaron
//   GET  /escritorio/facturas                   -> historial (?cantidad=100)
//   GET  /escritorio/facturas/:id               -> detalle completo (para el PDF)
//   POST /escritorio/facturas/membresia         -> factura una membresía
//   GET  /escritorio/clases                     -> próximas clases
//   PUT  /escritorio/clases/:id/horario         -> cambia el horario de una clase
//   GET  /escritorio/asignaciones               -> clientes y sus entrenadores
//   POST /escritorio/entrenadores/agregar       -> agrega un entrenador a un cliente
//   POST /escritorio/entrenadores/quitar        -> quita un entrenador de un cliente
//   GET  /escritorio/productos                  -> catálogo con existencias
//   POST /escritorio/ventas                     -> vende productos en una factura
//   GET  /escritorio/chat/conversaciones        -> chats de la sucursal
//   GET  /escritorio/chat/clientes?buscar=      -> buscar un cliente para empezar un chat
//   GET  /escritorio/chat/sin-leer              -> mensajes sin leer (número del menú)
//   GET  /escritorio/chat/:id_cliente/mensajes  -> mensajes (?despues=<id_mensaje>)
//   POST /escritorio/chat/:id_cliente/mensajes  -> enviar un mensaje
//
// Seguridad:
//   - Todas (menos /login) exigen el token del encabezado  Authorization: Bearer <token>.
//   - El token de escritorio lleva tipo = 'escritorio'. El token de un cliente de la
//     app móvil NO sirve aquí, y el de escritorio no sirve en las rutas de clientes.
//   - id_sucursal e id_usuario SIEMPRE salen del token, nunca de lo que mande la app:
//     una recepción no puede facturar en otra sucursal ni a nombre de otro empleado.
//   - Solo se ejecutan los procedimientos escritos aquí (lista fija); la app no puede
//     pedir que se ejecute otra cosa.
//
// Las respuestas son  { tablas: [ [filas del 1er resultado], [filas del 2do], ... ] }
// igual que los "recordsets" del procedimiento. Las fechas salen como texto
// 'YYYY-MM-DDTHH:mm:ss' con la misma hora que tiene la base (sin conversión de zona).
const express = require('express');
const cuentas = require('../servicios/cuentas');
const { sql, conectar } = require('../db');
const { crearToken, leerToken, verificarToken } = require('../seguridad');
const { ErrorApp, responderError } = require('../errores');

const router = express.Router();

// Roles que NO pueden usar la app de sucursal (un cliente no debe poder facturar)
const ROLES_SIN_ACCESO = ['cliente'];
const LARGO_MAXIMO_MENSAJE = 1000;

// AYUDANTES
const pad = (n) => String(n).padStart(2, '0');

// Date -> 'YYYY-MM-DDTHH:mm:ss' con los componentes LOCALES: db.js usa useUTC:false, así que
// los componentes locales del Date son exactamente la hora que tiene la base.
function fechaTexto(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function aJson(valor) {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : fechaTexto(valor);
  if (Array.isArray(valor)) return valor.map(aJson);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, aJson(v)]));
  }
  return valor;
}

function entero(valor, nombre, { minimo = 1, maximo = 2147483647 } = {}) {
  const n = Number(valor);
  if (valor === '' || valor === null || valor === undefined || !Number.isInteger(n) || n < minimo || n > maximo) {
    throw new ErrorApp('DATOS', `Dato no válido: ${nombre}`);
  }
  return n;
}

function textoOpcional(valor, maximo) {
  if (valor === undefined || valor === null) return null;
  const t = String(valor).trim();
  return t === '' ? null : t.slice(0, maximo);
}

// '2026-10-25 18:30' o '2026-10-25T18:30:00' -> Date (hora local = hora de la base)
function leerFechaHora(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(valor || '').trim());
  if (!m) throw new ErrorApp('DATOS', 'La fecha y hora debe verse así: 2026-10-25 18:30');
  const [, a, mes, d, h, mi, s] = m.map(Number);
  const fecha = new Date(a, mes - 1, d, h, mi, s || 0);
  if (fecha.getMonth() !== mes - 1 || fecha.getDate() !== d || h > 23 || mi > 59) {
    throw new ErrorApp('DATOS', 'La fecha y hora no es válida');
  }
  return fecha;
}

// Ejecuta un procedimiento y devuelve sus resultados como lista de tablas
async function ejecutar(procedimiento, parametros = []) {
  const pool = await conectar();
  const peticion = pool.request();
  for (const [nombre, tipo, valor] of parametros) peticion.input(nombre, tipo, valor);
  const resultado = await peticion.execute(procedimiento);
  return resultado.recordsets.map((tabla) => Array.from(tabla));
}

// Responde con { tablas }
const enviar = (res, tablas) => res.json({ tablas: aJson(tablas) });

// Envuelve una ruta: cualquier error se traduce igual que en /auth
const ruta = (mensajeGeneral, funcion) => async (req, res) => {
  try {
    await funcion(req, res);
  } catch (error) {
    responderError(res, error, mensajeGeneral);
  }
};

// SOLO PERSONAL DE SUCURSAL (se usa después de verificarToken)
function soloEscritorio(req, res, next) {
  if (!req.usuario || req.usuario.tipo !== 'escritorio') {
    return res.status(403).json({ error: 'Esta sección es solo para la app de escritorio de las sucursales' });
  }
  next();
}
const protegida = [verificarToken, soloEscritorio];

// POST /escritorio/login
// Recibe:   { "alias": "...", "contrasena": "...", "id_sucursal": 1 }
// Responde: { token, usuario: { id_alias, alias, id_usuario, nombre, estado, roles, id_sucursal, sucursal } }
router.post('/login', ruta('No se pudo iniciar sesión', async (req, res) => {
  const idSucursal = entero(req.body.id_sucursal, 'La sucursal (ID_SUCURSAL)');

  // 1) Usuario y contraseña: la MISMA lógica que la app móvil (Argon2, migración desde
  //    SHA-256, límite de 5 intentos / 15 minutos por alias, usuario bloqueado...)
  const sesion = await cuentas.iniciarSesion(req.body.alias, req.body.contrasena);
  const idAlias = leerToken(sesion.token).id_alias;

  // 2) Datos del empleado en esta sucursal (también revisa que la sucursal exista)
  const [filas] = await ejecutar('usp_Escritorio_DatosEmpleado', [
    ['id_alias', sql.Int, idAlias],
    ['id_sucursal', sql.Int, idSucursal],
  ]);
  const empleado = filas && filas[0];
  if (!empleado) throw new ErrorApp('CREDENCIALES', 'Usuario o contraseña incorrectos');

  // 3) Un cliente solo no puede usar la app de sucursal
  const roles = String(empleado.roles || '').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (!roles.some((r) => !ROLES_SIN_ACCESO.includes(r))) {
    throw new ErrorApp('SIN_PERMISO', 'Tu usuario no tiene permiso para usar la app de sucursal.');
  }

  // 4) Las cuentas de recepción de sucursal (DPI 'EMP-SUC-<id>') solo sirven en SU sucursal
  const pool = await conectar();
  const dpi = await pool.request()
    .input('id_usuario', sql.Int, empleado.id_usuario)
    .query('SELECT nit_dpi FROM Usuario WHERE id_usuario = @id_usuario');
  const propia = /^EMP-SUC-(\d+)$/.exec(String((dpi.recordset[0] || {}).nit_dpi || ''));
  if (propia && Number(propia[1]) !== idSucursal) {
    throw new ErrorApp('SIN_PERMISO', 'Esta cuenta pertenece a otra sucursal. Revisa ID_SUCURSAL en escritorio.env.');
  }

  const token = crearToken({
    tipo: 'escritorio',
    id_usuario: empleado.id_usuario,
    id_alias: empleado.id_alias,
    alias: empleado.alias,
    id_sucursal: empleado.id_sucursal,
    roles,
  });
  res.json({ token, usuario: aJson(empleado) });
}));

// INICIO
router.get('/resumen', protegida, ruta('No se pudo cargar el resumen', async (req, res) => {
  enviar(res, await ejecutar('usp_Escritorio_Resumen', [['id_sucursal', sql.Int, req.usuario.id_sucursal]]));
}));

router.get('/catalogos', protegida, ruta('No se pudieron cargar los catálogos', async (req, res) => {
  enviar(res, await ejecutar('usp_Escritorio_Catalogos', [['id_sucursal', sql.Int, req.usuario.id_sucursal]]));
}));

router.post('/membresias/actualizar', protegida, ruta('No se pudieron actualizar las membresías', async (req, res) => {
  enviar(res, await ejecutar('usp_ActualizarEstadoMembresias'));
}));

// FACTURACIÓN
router.get('/facturas', protegida, ruta('No se pudieron cargar las facturas', async (req, res) => {
  const cantidad = req.query.cantidad === undefined ? 100 : entero(req.query.cantidad, 'La cantidad', { maximo: 500 });
  enviar(res, await ejecutar('usp_Escritorio_ListarFacturas', [
    ['id_sucursal', sql.Int, req.usuario.id_sucursal],
    ['cantidad', sql.Int, cantidad],
  ]));
}));

router.get('/facturas/:id', protegida, ruta('No se pudo cargar la factura', async (req, res) => {
  enviar(res, await ejecutar('usp_Escritorio_DetalleFactura', [
    ['id_factura', sql.Int, entero(req.params.id, 'La factura')],
    ['id_sucursal', sql.Int, req.usuario.id_sucursal],
  ]));
}));

router.post('/facturas/membresia', protegida, ruta('No se pudo facturar la membresía', async (req, res) => {
  enviar(res, await ejecutar('usp_Escritorio_FacturarMembresia', [
    ['id_cliente', sql.Int, entero(req.body.id_cliente, 'El cliente')],
    ['id_tipo_membresia', sql.Int, entero(req.body.id_tipo_membresia, 'La membresía')],
    ['id_metodo_pago', sql.Int, entero(req.body.id_metodo_pago, 'El método de pago')],
    ['meses', sql.Int, entero(req.body.meses, 'Los meses', { maximo: 36 })],
    ['id_sucursal', sql.Int, req.usuario.id_sucursal],
    ['id_usuario', sql.Int, req.usuario.id_usuario],
  ]));
}));

// CLASES
router.get('/clases', protegida, ruta('No se pudieron cargar las clases', async (req, res) => {
  enviar(res, await ejecutar('usp_Escritorio_ListarClases', [['id_sucursal', sql.Int, req.usuario.id_sucursal]]));
}));

router.put('/clases/:id/horario', protegida, ruta('No se pudo cambiar el horario', async (req, res) => {
  enviar(res, await ejecutar('usp_Escritorio_CambiarHorarioClase', [
    ['id_clase', sql.Int, entero(req.params.id, 'La clase')],
    ['id_sucursal', sql.Int, req.usuario.id_sucursal],
    ['nueva_fecha_hora', sql.DateTime, leerFechaHora(req.body.nueva_fecha_hora)],
    ['motivo', sql.VarChar(150), textoOpcional(req.body.motivo, 150)],
    ['id_usuario', sql.Int, req.usuario.id_usuario],
  ]));
}));

// ENTRENADORES
router.get('/asignaciones', protegida, ruta('No se pudieron cargar los entrenadores', async (req, res) => {
  enviar(res, await ejecutar('usp_Escritorio_ListarAsignaciones', [['id_sucursal', sql.Int, req.usuario.id_sucursal]]));
}));

router.post('/entrenadores/agregar', protegida, ruta('No se pudo agregar el entrenador', async (req, res) => {
  enviar(res, await ejecutar('usp_Escritorio_CambiarEntrenador', [
    ['id_cliente', sql.Int, entero(req.body.id_cliente, 'El cliente')],
    ['id_entrenador', sql.Int, entero(req.body.id_entrenador, 'El entrenador')],
    ['motivo', sql.VarChar(150), textoOpcional(req.body.motivo, 150)],
    ['id_usuario', sql.Int, req.usuario.id_usuario],
  ]));
}));

router.post('/entrenadores/quitar', protegida, ruta('No se pudo quitar el entrenador', async (req, res) => {
  enviar(res, await ejecutar('usp_Escritorio_QuitarEntrenador', [
    ['id_cliente', sql.Int, entero(req.body.id_cliente, 'El cliente')],
    ['id_entrenador', sql.Int, entero(req.body.id_entrenador, 'El entrenador')],
    ['id_sucursal', sql.Int, req.usuario.id_sucursal],
  ]));
}));

// PRODUCTOS
router.get('/productos', protegida, ruta('No se pudieron cargar los productos', async (req, res) => {
  enviar(res, await ejecutar('usp_Escritorio_ListarProductos', [['id_sucursal', sql.Int, req.usuario.id_sucursal]]));
}));

// Recibe: { id_cliente, id_metodo_pago, productos: [ { id_producto, cantidad }, ... ] }
router.post('/ventas', protegida, ruta('No se pudo registrar la venta', async (req, res) => {
  const lista = Array.isArray(req.body.productos) ? req.body.productos : [];
  if (lista.length === 0 || lista.length > 100) throw new ErrorApp('DATOS', 'Agrega al menos un producto');
  const productos = lista.map((p) => ({
    id_producto: entero(p && p.id_producto, 'El producto'),
    cantidad: entero(p && p.cantidad, 'La cantidad', { maximo: 10000 }),
  }));
  enviar(res, await ejecutar('usp_Escritorio_VenderProductos', [
    ['id_cliente', sql.Int, entero(req.body.id_cliente, 'El cliente')],
    ['id_sucursal', sql.Int, req.usuario.id_sucursal],
    ['id_metodo_pago', sql.Int, entero(req.body.id_metodo_pago, 'El método de pago')],
    ['id_usuario', sql.Int, req.usuario.id_usuario],
    ['productos', sql.NVarChar(sql.MAX), JSON.stringify(productos)],
  ]));
}));

// CHAT CON CLIENTES (el mismo chat de la app móvil: tabla ChatMensaje, 13_chat.sql)
router.get('/chat/conversaciones', protegida, ruta('No se pudieron cargar los chats', async (req, res) => {
  enviar(res, await ejecutar('usp_Escritorio_ChatConversaciones', [['id_sucursal', sql.Int, req.usuario.id_sucursal]]));
}));

router.get('/chat/clientes', protegida, ruta('No se pudo buscar al cliente', async (req, res) => {
  enviar(res, await ejecutar('usp_Escritorio_ChatBuscarClientes', [
    ['id_sucursal', sql.Int, req.usuario.id_sucursal],
    ['buscar', sql.NVarChar(100), String(req.query.buscar || '').trim().slice(0, 100)],
  ]));
}));

router.get('/chat/sin-leer', protegida, ruta('No se pudo consultar el chat', async (req, res) => {
  enviar(res, await ejecutar('usp_Escritorio_ChatSinLeer', [['id_sucursal', sql.Int, req.usuario.id_sucursal]]));
}));

router.get('/chat/:id_cliente/mensajes', protegida, ruta('No se pudieron cargar los mensajes', async (req, res) => {
  const despues = req.query.despues === undefined ? 0 : entero(req.query.despues, 'El mensaje', { minimo: 0 });
  enviar(res, await ejecutar('usp_Escritorio_ChatMensajes', [
    ['id_sucursal', sql.Int, req.usuario.id_sucursal],
    ['id_cliente', sql.Int, entero(req.params.id_cliente, 'El cliente')],
    ['despues', sql.Int, despues],
  ]));
}));

router.post('/chat/:id_cliente/mensajes', protegida, ruta('No se pudo enviar el mensaje', async (req, res) => {
  const texto = String(req.body.texto === undefined || req.body.texto === null ? '' : req.body.texto).trim();
  if (!texto) throw new ErrorApp('DATOS', 'Escribe un mensaje.');
  if (texto.length > LARGO_MAXIMO_MENSAJE) {
    throw new ErrorApp('DATOS', `El mensaje es muy largo (máximo ${LARGO_MAXIMO_MENSAJE} caracteres).`);
  }
  // La app móvil consulta el chat cada pocos segundos, así que no hace falta aviso en tiempo real
  enviar(res, await ejecutar('usp_Escritorio_ChatEnviar', [
    ['id_sucursal', sql.Int, req.usuario.id_sucursal],
    ['id_cliente', sql.Int, entero(req.params.id_cliente, 'El cliente')],
    ['id_usuario', sql.Int, req.usuario.id_usuario],
    ['texto', sql.NVarChar(LARGO_MAXIMO_MENSAJE), texto],
  ]));
}));

module.exports = router;
