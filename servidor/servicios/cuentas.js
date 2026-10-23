// servicios/cuentas.js — CONTRASEÑAS Y PALABRA CLAVE CON ARGON2
// Aquí está la lógica de las cuentas. La usan dos "puertas":
//   - rutas/auth.js   (peticiones JSON, para probar con PowerShell)
//   - rutas/trama.js  (tramas FM|1|..., las que usa la app)
// Así las dos se comportan exactamente igual.
//
// Cómo se protegen las contraseñas:
//   - La app manda la contraseña tal cual (nunca se guarda).
//   - El servidor la convierte en un hash Argon2id y la base solo
//     guarda ese hash. Argon2 es lento a propósito: si alguien se
//     roba la tabla, adivinar contraseñas le costaría muchísimo.
//   - Usuarios viejos (hash SHA-256): la primera vez que inician
//     sesión bien, su contraseña se pasa a Argon2 y el hash viejo
//     se borra. Nadie tiene que cambiar su contraseña.

const crypto = require('crypto');                // NUEVO: genera el código de 6 dígitos al azar
const argon2 = require('argon2');
const { sql, conectar } = require('../db');
const { crearToken, crearLimitador } = require('../seguridad');
const { ErrorApp } = require('../errores');
const correo = require('./correo');              // NUEVO: envía el código por correo

//  AJUSTES
// Argon2id con los valores mínimos que recomienda OWASP:
// 19 MiB de memoria, 2 pasadas, 1 hilo. Tarda unos milisegundos.
const OPCIONES_ARGON2 = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

// Estados de la tabla Estado (en minúsculas)
const ESTADOS_BLOQUEADOS = ['suspendido', 'bloqueado']; // no pueden entrar
const ESTADOS_LIMITADOS = ['inactivo']; // entran, pero solo a membresía y pago

const LARGO_MINIMO_CONTRASENA = 8;
const LARGO_MAXIMO_CONTRASENA = 100; // el procedimiento viejo acepta hasta 100
const LARGO_MINIMO_PALABRA = 4;

// 5 intentos fallidos = alias bloqueado 15 minutos
const limiteLogin = crearLimitador({ maximo: 5, minutos: 15 });
const limiteRecuperar = crearLimitador({ maximo: 5, minutos: 15 });

// NUEVO — Recuperación con código por correo
const MINUTOS_CODIGO = 10;                       // Vigencia del código (igual que en el SQL)
const FORMATO_CODIGO = /^\d{6}$/;                // Exactamente 6 dígitos
// Mismo mensaje exista o no el alias: así nadie averigua qué usuarios hay
const MENSAJE_CODIGO_ENVIADO =
  'Si el usuario existe y tiene un correo registrado, te enviamos un código. Revisa tu bandeja y la carpeta de spam.';
// 3 pedidos por alias cada 15 minutos (también para alias que no existen)
const limiteEnvioCodigo = crearLimitador({ maximo: 3, minutos: 15 });

// AYUDANTES
const texto = (valor) => (valor === undefined || valor === null ? '' : String(valor));

// La palabra clave se compara sin importar mayúsculas ni espacios
// al inicio o al final: "Firulais " = "firulais"
const normalizarPalabra = (palabra) => texto(palabra).normalize('NFC').trim().toLowerCase();

function validarContrasenaNueva(contrasena) {
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) {
    throw new ErrorApp('DATOS', `La contraseña nueva debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres`);
  }
  if (contrasena.length > LARGO_MAXIMO_CONTRASENA) {
    throw new ErrorApp('DATOS', `La contraseña no puede pasar de ${LARGO_MAXIMO_CONTRASENA} caracteres`);
  }
}
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;               // AAAA-MM-DD, por ejemplo 2000-05-10
const FORMATO_CORREO = /^\S+@\S+\.\S+$/;                    // algo@algo.algo

// "Juan  Carlos" → { primero: 'Juan', segundo: 'Carlos' }
// La app manda el nombre completo en un campo; la tabla Usuario lo tiene separado
function separarNombre(completo) {
  const partes = texto(completo).trim().split(/\s+/).filter(Boolean); // Corta por espacios, ignora los dobles
  return {
    primero: partes[0] || '',                               // La primera palabra
    segundo: partes.slice(1).join(' ') || null,             // El resto (o null si no hay)
  };
}
// Si el alias no existe igual se hace un cálculo Argon2 (contra un hash
// falso). Así la respuesta tarda lo mismo y nadie puede averiguar qué
// alias existen midiendo el tiempo.
let hashFalso = null;
async function gastarTiempoIgual(valor) {
  if (!hashFalso) hashFalso = await argon2.hash('alias-que-no-existe', OPCIONES_ARGON2);
  await argon2.verify(hashFalso, valor || 'x').catch(() => false);
}

// Compara sin lanzar error si el hash guardado está dañado
async function coincide(hashGuardado, valor) {
  try {
    return await argon2.verify(hashGuardado, valor);
  } catch {
    return false;
  }
}

async function guardarContrasena(pool, idAlias, contrasena) {
  const hash = await argon2.hash(contrasena, OPCIONES_ARGON2);
  await pool.request()
    .input('id_alias', sql.Int, idAlias)
    .input('contrasena_argon2', sql.VarChar(255), hash)
    .execute('usp_GuardarContrasenaArgon2');
}

async function registrarIntento(pool, idAlias, exitoso) {
  await pool.request()
    .input('id_alias', sql.Int, idAlias)
    .input('resultado', sql.VarChar(20), exitoso ? 'Exitoso' : 'Fallido')
    .execute('usp_RegistrarIntentoLogin');
}

// COMPROBAR UNA CONTRASEÑA
// Devuelve el id_alias si es correcta, o null si no.
// Registra el intento en LoginLog y migra a Argon2 si hacía falta.
async function comprobarContrasena(pool, alias, contrasena) {
  const resultado = await pool.request()
    .input('alias', sql.VarChar(60), alias)
    .execute('usp_ObtenerCredencial');
  const credencial = resultado.recordset[0];

  // El alias no existe
  if (!credencial) {
    await gastarTiempoIgual(contrasena);
    return null;
  }

  // Ya está en Argon2: el servidor compara
  if (credencial.contrasena_argon2) {
    const correcta = await coincide(credencial.contrasena_argon2, contrasena);
    await registrarIntento(pool, credencial.id_alias, correcta);
    return correcta ? credencial.id_alias : null;
  }

  // Todavía tiene el hash viejo: lo revisa el procedimiento de antes
  //    (ese procedimiento ya guarda el intento en LoginLog)
  if (credencial.tiene_hash_viejo) {
    const viejo = await pool.request()
      .input('alias', sql.VarChar(60), alias)
      .input('contrasena_plana', sql.VarChar(100), contrasena)
      .execute('usp_ValidarLogin');
    if (viejo.recordset[0]?.resultado !== 'Exitoso') return null;

    await guardarContrasena(pool, credencial.id_alias, contrasena); // migración a Argon2
    return credencial.id_alias;
  }

  // No tiene ninguna contraseña guardada
  await gastarTiempoIgual(contrasena);
  await registrarIntento(pool, credencial.id_alias, false);
  return null;
}

// Revisa la contraseña actual en cambios con sesión iniciada, con el
// mismo límite de intentos que el login
async function exigirContrasenaActual(pool, usuario, contrasena) {
  const espera = limiteLogin.minutosBloqueado(usuario.alias);
  if (espera > 0) {
    throw new ErrorApp('INTENTOS', `Demasiados intentos. Intenta de nuevo en ${espera} minutos.`);
  }
  const idAlias = await comprobarContrasena(pool, usuario.alias, contrasena);
  if (!idAlias) {
    limiteLogin.registrarFallo(usuario.alias);
    throw new ErrorApp('CREDENCIALES', 'La contraseña actual no es correcta');
  }
  limiteLogin.limpiar(usuario.alias);
  return idAlias;
}

// INICIAR SESIÓN
// Devuelve { token, acceso, mensaje, usuario }
//   acceso = 'completo'  -> puede usar toda la app
//   acceso = 'limitado'  -> membresía vencida: solo membresía y pago
async function iniciarSesion(aliasRecibido, contrasenaRecibida) {
  const alias = texto(aliasRecibido).trim();
  const contrasena = texto(contrasenaRecibida);

  if (!alias || !contrasena) {
    throw new ErrorApp('DATOS', 'Escribe tu usuario y tu contraseña');
  }
  if (contrasena.length > LARGO_MAXIMO_CONTRASENA) {
    throw new ErrorApp('CREDENCIALES', 'Usuario o contraseña incorrectos');
  }

  const espera = limiteLogin.minutosBloqueado(alias);
  if (espera > 0) {
    throw new ErrorApp('INTENTOS', `Demasiados intentos. Intenta de nuevo en ${espera} minutos.`);
  }

  const pool = await conectar();
  const idAlias = await comprobarContrasena(pool, alias, contrasena);
  if (!idAlias) {
    limiteLogin.registrarFallo(alias);
    // Mismo mensaje si el alias no existe o la clave está mal
    throw new ErrorApp('CREDENCIALES', 'Usuario o contraseña incorrectos');
  }
  limiteLogin.limpiar(alias);

  // Datos de la persona: nombre, estado y si es cliente o entrenador
  const datos = await pool.request()
    .input('id_alias', sql.Int, idAlias)
    .query(`
      SELECT a.id_alias, a.alias, u.id_usuario, u.primer_nombre_us, u.primer_apellido_us,
             e.nombre_estado, c.id_cliente, en.id_entrenador,
             COALESCE(c.id_sucursal, en.id_sucursal) AS id_sucursal,
             s.nombre_sucursal
      FROM AliasUsuario a
      JOIN Usuario u          ON u.id_usuario  = a.id_usuario
      JOIN Estado e           ON e.id_estado   = u.id_estado
      LEFT JOIN Cliente c     ON c.id_usuario  = u.id_usuario
      LEFT JOIN Entrenador en ON en.id_usuario = u.id_usuario
      LEFT JOIN Sucursal s    ON s.id_sucursal = COALESCE(c.id_sucursal, en.id_sucursal)
      WHERE a.id_alias = @id_alias`);
  const u = datos.recordset[0];

  const estado = texto(u.nombre_estado).toLowerCase();
  if (ESTADOS_BLOQUEADOS.includes(estado)) {
    throw new ErrorApp('BLOQUEADO', 'Tu usuario no está activo. Acércate a tu sucursal.');
  }
  const acceso = ESTADOS_LIMITADOS.includes(estado) ? 'limitado' : 'completo';

  // Roles (Cliente, Entrenador, Administrador...)
  const resultadoRoles = await pool.request()
    .input('id_usuario', sql.Int, u.id_usuario)
    .query(`
      SELECT r.nombre_rol
      FROM UsuarioRol ur
      JOIN Rol r ON r.id_rol = ur.id_rol
      WHERE ur.id_usuario = @id_usuario`);
  const roles = resultadoRoles.recordset.map((r) => r.nombre_rol);

  const token = crearToken({
    id_usuario: u.id_usuario,
    id_alias: u.id_alias,
    alias: u.alias,
    id_cliente: u.id_cliente,
    id_entrenador: u.id_entrenador,
    id_sucursal: u.id_sucursal,
    roles,
    acceso,
  });

  return {
    token,
    acceso,
    mensaje: acceso === 'limitado'
      ? 'Tu membresía venció. Solo puedes ver tu membresía y renovarla.'
      : 'Bienvenido',
    usuario: {
      id_usuario: u.id_usuario,
      nombre: `${u.primer_nombre_us} ${u.primer_apellido_us}`,
      estado: u.nombre_estado,
      id_cliente: u.id_cliente,
      id_entrenador: u.id_entrenador,
      id_sucursal: u.id_sucursal,
      sucursal: u.nombre_sucursal,
      roles,
    },
  };
}

// RECUPERAR CONTRASEÑA CON LA PALABRA CLAVE (sin sesión)
async function recuperarContrasena(aliasRecibido, palabraRecibida, nuevaRecibida) {
  const alias = texto(aliasRecibido).trim();
  const palabra = normalizarPalabra(palabraRecibida);
  const nueva = texto(nuevaRecibida);

  if (!alias || !palabra || !nueva) {
    throw new ErrorApp('DATOS', 'Escribe tu usuario, tu palabra clave y la contraseña nueva');
  }
  validarContrasenaNueva(nueva);

  const espera = limiteRecuperar.minutosBloqueado(alias);
  if (espera > 0) {
    throw new ErrorApp('INTENTOS', `Demasiados intentos. Intenta de nuevo en ${espera} minutos.`);
  }

  const pool = await conectar();
  const resultado = await pool.request()
    .input('alias', sql.VarChar(60), alias)
    .execute('usp_ObtenerRespuestasSeguridad');
  const respuestas = resultado.recordset;

  let idAlias = null;
  if (respuestas.length === 0) {
    await gastarTiempoIgual(palabra); // alias inexistente o sin palabra clave
  } else {
    for (const r of respuestas) {
      if (await coincide(r.respuesta_argon2, palabra)) {
        idAlias = r.id_alias;
        break;
      }
    }
  }

  if (!idAlias) {
    limiteRecuperar.registrarFallo(alias);
    throw new ErrorApp('CREDENCIALES', 'Usuario o palabra clave incorrectos');
  }

  await guardarContrasena(pool, idAlias, nueva);
  limiteRecuperar.limpiar(alias);
  limiteLogin.limpiar(alias); // si estaba bloqueado en el login, se desbloquea
  return { mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
}

// NUEVO — RECUPERAR CONTRASEÑA CON UN CÓDIGO POR CORREO (sin sesión)
// Paso 1: genera un código de 6 dígitos, guarda SOLO su hash y lo envía.
async function enviarCodigoRecuperacion(aliasRecibido) {
  const alias = texto(aliasRecibido).trim();
  if (!alias) throw new ErrorApp('DATOS', 'Escribe tu usuario');

  // Límite en memoria: cuenta TODOS los pedidos, exista o no el alias
  const espera = limiteEnvioCodigo.minutosBloqueado(alias);
  if (espera > 0) {
    throw new ErrorApp('INTENTOS', `Ya pediste varios códigos. Intenta de nuevo en ${espera} minutos.`);
  }
  limiteEnvioCodigo.registrarFallo(alias);

  const pool = await conectar();
  const resultado = await pool.request()
    .input('alias', sql.VarChar(60), alias)
    .execute('usp_ObtenerCorreoRecuperacion');
  const cuenta = resultado.recordset[0];

  // Alias inexistente o sin correo: misma respuesta y casi el mismo tiempo
  if (!cuenta) {
    await gastarTiempoIgual(alias);
    return { mensaje: MENSAJE_CODIGO_ENVIADO };
  }

  // randomInt usa el generador seguro del sistema (Math.random NO sirve para esto)
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); // "004217"
  const hash = await argon2.hash(codigo, OPCIONES_ARGON2);

  await pool.request()
    .input('id_alias', sql.Int, cuenta.id_alias)
    .input('codigo_hash', sql.VarChar(255), hash)
    .input('minutos', sql.Int, MINUTOS_CODIGO)
    .execute('usp_GuardarCodigoRecuperacion');

  // El correo se envía "en segundo plano": la respuesta no espera a Gmail.
  // Así tarda lo mismo que un alias inexistente. Si falla, queda en la consola.
  correo.enviarCodigoRecuperacion({
    para: cuenta.correo_recuperacion,
    nombre: cuenta.nombre,
    codigo,
    minutos: MINUTOS_CODIGO,
  }).catch((error) => console.error(`No se pudo enviar el código a "${alias}":`, error.message));

  return { mensaje: MENSAJE_CODIGO_ENVIADO };
}

// Paso 2: revisa el código y, si es correcto, cambia la contraseña.
async function recuperarConCodigo(aliasRecibido, codigoRecibido, nuevaRecibida) {
  const alias = texto(aliasRecibido).trim();
  const codigo = texto(codigoRecibido).trim();
  const nueva = texto(nuevaRecibida);

  if (!alias || !codigo || !nueva) {
    throw new ErrorApp('DATOS', 'Escribe tu usuario, el código y la contraseña nueva');
  }
  if (!FORMATO_CODIGO.test(codigo)) throw new ErrorApp('DATOS', 'El código debe tener 6 dígitos');
  validarContrasenaNueva(nueva);

  const espera = limiteRecuperar.minutosBloqueado(alias);
  if (espera > 0) {
    throw new ErrorApp('INTENTOS', `Demasiados intentos. Intenta de nuevo en ${espera} minutos.`);
  }

  const pool = await conectar();
  const resultado = await pool.request()
    .input('alias', sql.VarChar(60), alias)
    .execute('usp_ObtenerCodigoRecuperacion');
  const vigente = resultado.recordset[0];

  // No hay código vigente (no existe, venció, ya se usó o se acabaron los intentos)
  if (!vigente) {
    await gastarTiempoIgual(codigo);
    limiteRecuperar.registrarFallo(alias);
    throw new ErrorApp('CREDENCIALES', 'El código no es válido o ya venció. Pide uno nuevo.');
  }

  const correcto = await coincide(vigente.codigo_hash, codigo);

  // Cuenta el intento (si es correcto, el código queda usado y no sirve otra vez)
  const intento = await pool.request()
    .input('id_codigo', sql.Int, vigente.id_codigo)
    .input('exitoso', sql.Bit, correcto ? 1 : 0)
    .execute('usp_RegistrarIntentoCodigo');

  if (!correcto) {
    limiteRecuperar.registrarFallo(alias);
    const quedan = intento.recordset[0]?.intentos_restantes ?? 0;
    throw new ErrorApp('CREDENCIALES', quedan > 0
      ? `Código incorrecto. Te quedan ${quedan} intentos.`
      : 'Código incorrecto. Ese código ya no sirve: pide uno nuevo.');
  }

  await guardarContrasena(pool, vigente.id_alias, nueva);
  limiteRecuperar.limpiar(alias);
  limiteLogin.limpiar(alias);       // si estaba bloqueado en el login, se desbloquea
  limiteEnvioCodigo.limpiar(alias); // ya terminó: puede pedir otro código si lo necesita
  return { mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
}

// GUARDAR O CAMBIAR LA PALABRA CLAVE (con sesión iniciada)
// Pide la contraseña actual: así, si alguien encuentra el teléfono
// con la sesión abierta, no puede cambiar la palabra clave.
async function guardarPalabraClave(usuario, contrasenaActualRecibida, palabraRecibida, idPreguntaRecibida) {
  const contrasenaActual = texto(contrasenaActualRecibida);
  const palabra = normalizarPalabra(palabraRecibida);
  const idPregunta = idPreguntaRecibida === undefined || idPreguntaRecibida === null || idPreguntaRecibida === ''
    ? null
    : Number(idPreguntaRecibida);

  if (!contrasenaActual || !palabra) {
    throw new ErrorApp('DATOS', 'Escribe tu contraseña actual y tu palabra clave');
  }
  if (palabra.length < LARGO_MINIMO_PALABRA) {
    throw new ErrorApp('DATOS', `La palabra clave debe tener al menos ${LARGO_MINIMO_PALABRA} caracteres`);
  }
  if (idPregunta !== null && (!Number.isInteger(idPregunta) || idPregunta <= 0)) {
    throw new ErrorApp('DATOS', 'La pregunta de seguridad no es válida');
  }
  if (!usuario || !usuario.alias) {
    throw new ErrorApp('SESION', 'La sesión expiró o no es válida. Inicia sesión otra vez.');
  }

  const pool = await conectar();
  const idAlias = await exigirContrasenaActual(pool, usuario, contrasenaActual);

  const hash = await argon2.hash(palabra, OPCIONES_ARGON2);
  await pool.request()
    .input('id_alias', sql.Int, idAlias)
    .input('id_pregunta', sql.Int, idPregunta)
    .input('respuesta_argon2', sql.VarChar(255), hash)
    .execute('usp_GuardarRespuestaSeguridad');
  return { mensaje: 'Palabra clave guardada' };
}

// CAMBIAR LA CONTRASEÑA (con sesión iniciada)
async function cambiarContrasena(usuario, actualRecibida, nuevaRecibida) {
  const actual = texto(actualRecibida);
  const nueva = texto(nuevaRecibida);

  if (!actual || !nueva) throw new ErrorApp('DATOS', 'Escribe tu contraseña actual y la nueva');
  validarContrasenaNueva(nueva);
  if (actual === nueva) throw new ErrorApp('DATOS', 'La contraseña nueva debe ser distinta de la actual');
  if (!usuario || !usuario.alias) {
    throw new ErrorApp('SESION', 'La sesión expiró o no es válida. Inicia sesión otra vez.');
  }

  const pool = await conectar();
  const idAlias = await exigirContrasenaActual(pool, usuario, actual);

  await guardarContrasena(pool, idAlias, nueva);
  return { mensaje: 'Contraseña cambiada' };
}

// LISTA DE PREGUNTAS DE SEGURIDAD (sin sesión)
async function listarPreguntas() {
  const pool = await conectar();
  const resultado = await pool.request().execute('usp_ListarPreguntasSeguridad');
  return resultado.recordset; // [{ id_pregunta, texto_pregunta }]
}
// LISTAS PARA EL REGISTRO (sin sesión): todo lo que la app necesita para sus desplegables
async function listarCatalogos() {
  const pool = await conectar();
  const r = await pool.request().execute('usp_ListarCatalogos');
  // recordsets es un arreglo con una tabla por cada SELECT del procedimiento, en el mismo orden
  const [generos, departamentos, municipios, sucursales, metodosPago, membresias, preguntas] = r.recordsets;
  return { generos, departamentos, municipios, sucursales, metodosPago, membresias, preguntas };
}
// REGISTRAR UNA CUENTA NUEVA (sin sesión)
// "5" → 5   |   "abc", "0", "-3", "" → null
const aEntero = (valor) => {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;   // Solo enteros positivos
};

// REGISTRAR UNA CUENTA NUEVA (sin sesión)
// Dos caminos: paga ahora (método de pago con id) o paga en la sucursal (método vacío)
async function registrarCuenta(d) {
  // 1. Limpiar
  const alias = texto(d.alias).trim();
  const correo = texto(d.correo).trim().toLowerCase();
  const telefono = texto(d.telefono).trim();
  const contrasena = texto(d.contrasena);
  const palabra = normalizarPalabra(d.palabra);
  const fecha = texto(d.fechaNacimiento).trim();
  const nitDpi = texto(d.dpiNit).trim();
  const nombre = separarNombre(d.nombre);
  const apellido = separarNombre(d.apellidos);
  const ids = {                                        // Catálogos obligatorios
    genero: aEntero(d.genero),
    departamento: aEntero(d.departamento),
    municipio: aEntero(d.municipio),
    sucursal: aEntero(d.sucursal),
    pregunta: aEntero(d.idPregunta),
  };
  const pago = {                                       // Datos de pago (opcionales)
    metodo: aEntero(d.metodoPago),                     // Vacío o "SUCURSAL" → null
    membresia: aEntero(d.membresia),
    meses: aEntero(d.meses),
  };
  const pagaAhora = pago.metodo !== null;              // Si trae método de pago válido, paga ahora

  // 2. Validar
  if (!alias || !correo || !contrasena || !nitDpi || !nombre.primero || !apellido.primero) {
    throw new ErrorApp('DATOS', 'Completa todos los campos obligatorios');
  }
  if (!FORMATO_CORREO.test(correo)) throw new ErrorApp('DATOS', 'El correo no es válido');
  if (!FORMATO_FECHA.test(fecha)) {
    throw new ErrorApp('DATOS', 'La fecha de nacimiento debe tener el formato AAAA-MM-DD');
  }
  if (new Date(fecha) > new Date()) {                  // NUEVO: nada de fechas futuras
    throw new ErrorApp('DATOS', 'La fecha de nacimiento no puede ser futura');
  }
  validarContrasenaNueva(contrasena);
  if (palabra.length < LARGO_MINIMO_PALABRA) {
    throw new ErrorApp('DATOS', `La palabra clave debe tener al menos ${LARGO_MINIMO_PALABRA} caracteres`);
  }
  if (Object.values(ids).includes(null)) {
    throw new ErrorApp('DATOS', 'Revisa género, departamento, municipio, sucursal y pregunta');
  }
  if (pagaAhora) {                                     // Solo si paga ahora, exigimos membresía y meses
    if (!pago.membresia) throw new ErrorApp('DATOS', 'Elige un tipo de membresía');
    if (!pago.meses || pago.meses > 12) throw new ErrorApp('DATOS', 'Se pueden pagar entre 1 y 12 meses');
  }

  // 3. Cifrar
  const [hashContrasena, hashPalabra] = await Promise.all([
    argon2.hash(contrasena, OPCIONES_ARGON2),
    argon2.hash(palabra, OPCIONES_ARGON2),
  ]);

  // 4. Guardar
  const pool = await conectar();
  const resultado = await pool.request()
    .input('alias', sql.VarChar(60), alias)
    .input('correo', sql.VarChar(100), correo)
    .input('telefono', sql.VarChar(20), telefono || null)
    .input('contrasena_argon2', sql.VarChar(255), hashContrasena)
    .input('primer_nombre', sql.VarChar(50), nombre.primero)
    .input('segundo_nombre', sql.VarChar(50), nombre.segundo)
    .input('primer_apellido', sql.VarChar(50), apellido.primero)
    .input('segundo_apellido', sql.VarChar(50), apellido.segundo)
    .input('fecha_nacimiento', sql.Date, new Date(fecha))
    .input('id_genero', sql.Int, ids.genero)
    .input('nit_dpi', sql.VarChar(20), nitDpi)
    .input('id_departamento', sql.Int, ids.departamento)
    .input('id_municipio', sql.Int, ids.municipio)
    .input('id_sucursal', sql.Int, ids.sucursal)
    .input('id_metodo_pago', sql.Int, pagaAhora ? pago.metodo : null)       // null = paga en sucursal
    .input('id_tipo_membresia', sql.Int, pagaAhora ? pago.membresia : null)
    .input('meses', sql.Int, pagaAhora ? pago.meses : null)
    .input('id_pregunta', sql.Int, ids.pregunta)
    .input('respuesta_argon2', sql.VarChar(255), hashPalabra)
    .execute('usp_RegistrarCliente');

  // 5. Responder según el camino
  const filas = resultado.recordsets.at(-1) || [];
  return {
    mensaje: pagaAhora
      ? 'Cuenta creada. Ya puedes iniciar sesión.'
      : 'Cuenta creada. Paga tu membresía en tu sucursal para tener acceso completo.',
    idUsuario: filas[0]?.id_usuario,
  };
}
module.exports = {
  iniciarSesion,
  recuperarContrasena,
  enviarCodigoRecuperacion, // NUEVO
  recuperarConCodigo,       // NUEVO
  guardarPalabraClave,
  cambiarContrasena,
  listarPreguntas,
  registrarCuenta,
  listarCatalogos,
};