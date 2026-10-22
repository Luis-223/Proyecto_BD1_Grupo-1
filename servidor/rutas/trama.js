// rutas/trama.js — PROTOCOLO DE TRAMAS (lo que usa la app)
//   POST /trama   (Content-Type: text/plain)
//
// La app manda UNA línea de texto con campos separados por "|":
//   FM|1|<TIPO>_REQ|<idMensaje>|<campo1>|<campo2>|...
// y el servidor responde otra línea:
//   FM|1|<TIPO>_RES|<idMensaje>|<código>|<detalle>|<campo1>|...
//
//   FM         = protocolo FitManager       1 = versión
//   idMensaje  = número que elige la app; se devuelve igual para
//                que sepa a qué pregunta corresponde la respuesta
//   código     = 00 bien | 01 credenciales incorrectas | 02 usuario bloqueado
//                03 demasiados intentos | 04 sesión inválida o vencida
//                05 trama o datos inválidos | 06 sin permiso (membresía vencida)
//                07 rechazado por la base | 08 no existe | 99 error del servidor
//   detalle    = mensaje para mostrar al usuario
//
// Las tramas que necesitan sesión llevan el TOKEN como primer campo.
// Las listas van en un solo campo: registros separados por "~" y
// datos de cada registro separados por "^".

const express = require('express');
const cuentas = require('../servicios/cuentas');
const membresias = require('../servicios/membresias'); // NUEVO
const recuperacion = require('../servicios/recuperacion'); // NUEVO: pasos 1 y 2 de r_contra.tsx
const { leerToken } = require('../seguridad');
const { traducirError } = require('../errores');

const router = express.Router();

const PROTOCOLO = 'FM';
const VERSION = '1';
const SEP = '|';
const SEP_REGISTRO = '~';
const SEP_DATO = '^';

// AYUDANTES
// Ningún dato puede llevar separadores ni saltos de línea: se
// cambian por un espacio para no romper la trama.
const aTexto = (valor) => (valor === undefined || valor === null ? '' : String(valor));
const limpiarCampo = (valor) => aTexto(valor).replace(/[|\r\n]/g, ' '); // campo normal
const limpiarDato = (valor) => aTexto(valor).replace(/[|~^\r\n]/g, ' '); // dato dentro de una lista

// Arma una lista: [[1, 'Pilates'], [2, 'Spinning']] -> "1^Pilates~2^Spinning"
const lista = (filas) => filas.map((fila) => fila.map(limpiarDato).join(SEP_DATO)).join(SEP_REGISTRO);

function armarTrama(tipo, idMensaje, codigo, detalle, campos) {
  return [PROTOCOLO, VERSION, `${tipo}_RES`, limpiarCampo(idMensaje), codigo, limpiarCampo(detalle),
    ...campos.map(limpiarCampo)].join(SEP) + '\n';
}

// Lee el token del primer campo (para tramas con sesión)
function sesion(datos) {
  return leerToken(datos[0]);
}

// TIPOS DE TRAMA
// Cada tipo dice cuántos campos devuelve ("campos") y qué hace
// ("ejecutar"). Si hay error, se devuelven esos campos vacíos:
// así la app siempre recibe el mismo número de campos.
const TIPOS = {
  // LOGIN_REQ: alias | contraseña
  // LOGIN_RES: idUsuario | nombre | rol | token | acceso
  //   (los primeros 3 son los que ya lee trama.ts; token y acceso son nuevos)
  //   rol    = roles separados por coma, ej. "Cliente"
  //   acceso = COMPLETO o LIMITADO (membresía vencida)
  LOGIN: {
    campos: 5,
    async ejecutar([alias, contrasena]) {
      const r = await cuentas.iniciarSesion(alias, contrasena);
      return {
        detalle: r.mensaje,
        campos: [r.usuario.id_usuario, r.usuario.nombre, r.usuario.roles.join(','), r.token, r.acceso.toUpperCase()],
      };
    },
  },

  // SESION_REQ: token          -> ¿sigue válida la sesión? (al abrir la app)
  // SESION_RES: idUsuario | rol | acceso
  SESION: {
    campos: 3,
    async ejecutar(datos) {
      const u = sesion(datos);
      return {
        detalle: 'Sesión válida',
        campos: [u.id_usuario, (u.roles || []).join(','), (u.acceso || 'completo').toUpperCase()],
      };
    },
  },

  // RECUPERAR_REQ: alias | palabra clave | contraseña nueva
  // RECUPERAR_RES: (sin campos extra)
  RECUPERAR: {
    campos: 0,
    async ejecutar([alias, palabra, nueva]) {
      const r = await cuentas.recuperarContrasena(alias, palabra, nueva);
      return { detalle: r.mensaje, campos: [] };
    },
  },

  // NUEVO — Recuperar contraseña, paso 1 (r_contra.tsx)
  // PREGUNTA_ALIAS_REQ: alias
  // PREGUNTA_ALIAS_RES: idPregunta | texto de la pregunta
  PREGUNTA_ALIAS: {
    campos: 2,
    async ejecutar([alias]) {
      const r = await recuperacion.obtenerPregunta(alias);
      return { detalle: 'Pregunta de seguridad', campos: [r.idPregunta, r.pregunta] };
    },
  },

  // NUEVO — Recuperar contraseña, paso 2: revisa la respuesta SIN cambiar nada
  // VERIFICAR_RESPUESTA_REQ: alias | idPregunta | palabra clave
  // VERIFICAR_RESPUESTA_RES: (sin campos extra)
  // El paso 3 usa RECUPERAR_REQ (alias | palabra clave | contraseña nueva).
  VERIFICAR_RESPUESTA: {
    campos: 0,
    async ejecutar([alias, idPregunta, palabra]) {
      const r = await recuperacion.verificarRespuesta(alias, idPregunta, palabra);
      return { detalle: r.mensaje, campos: [] };
    },
  },

  // PREGUNTAS_REQ: (sin campos)
  // PREGUNTAS_RES: lista "idPregunta^texto~idPregunta^texto"
  PREGUNTAS: {
    campos: 1,
    async ejecutar() {
      const preguntas = await cuentas.listarPreguntas();
      return {
        detalle: `${preguntas.length} preguntas`,
        campos: [lista(preguntas.map((p) => [p.id_pregunta, p.texto_pregunta]))],
      };
    },
  },

  // PALABRA_CLAVE_REQ: token | contraseña actual | palabra clave | idPregunta (opcional)
  // PALABRA_CLAVE_RES: (sin campos extra)
  PALABRA_CLAVE: {
    campos: 0,
    async ejecutar(datos) {
      const u = sesion(datos);
      const [, actual, palabra, idPregunta] = datos;
      const r = await cuentas.guardarPalabraClave(u, actual, palabra, idPregunta);
      return { detalle: r.mensaje, campos: [] };
    },
  },

  // CAMBIAR_CLAVE_REQ: token | contraseña actual | contraseña nueva
  // CAMBIAR_CLAVE_RES: (sin campos extra)
  CAMBIAR_CLAVE: {
    campos: 0,
    async ejecutar(datos) {
      const u = sesion(datos);
      const [, actual, nueva] = datos;
      const r = await cuentas.cambiarContrasena(u, actual, nueva);
      return { detalle: r.mensaje, campos: [] };
    },
  },

  SIGNUP: {
    campos: 1,                                         // Devuelve una casilla: el id del usuario nuevo
    async ejecutar([
      alias, correo, contrasena, nombre, apellidos,    // El orden DEBE ser el mismo de construirSignupReq
      fechaNacimiento, genero, dpiNit, telefono,
      departamento, municipio, sucursal, metodoPago,
      membresia, meses, tarjeta, cvv, idPregunta, palabra,
    ]) {
      const r = await cuentas.registrarCuenta({
        alias, correo, contrasena, nombre, apellidos,
        fechaNacimiento, genero, dpiNit, telefono,
        departamento, municipio, sucursal, metodoPago,
        membresia, meses, idPregunta, palabra,
      });
      return { detalle: r.mensaje, campos: [r.idUsuario] };
    },
  },

  // NUEVO — antes no existía y la app recibía "Tipo de trama desconocido: MEMBRESIA"
  // MEMBRESIA_REQ: token | idMetodoPago (o SUCURSAL) | idTipoMembresia | meses | esCambioTipo
  // MEMBRESIA_RES: pagadoHasta (AAAA-MM-DD) | token nuevo | acceso
  //   No usa soloAccesoCompleto: quien tiene la membresía vencida (LIMITADO)
  //   justamente necesita esta trama para renovarla.
  MEMBRESIA: {
    campos: 3,
    async ejecutar(datos) {
      const u = sesion(datos);
      const [, metodoPago, membresia, meses, esCambioTipo] = datos;
      const r = await membresias.pagarMembresia(u, metodoPago, membresia, meses, esCambioTipo);
      return { detalle: r.mensaje, campos: [r.pagadoHasta, r.token, r.acceso] };
    },
  },

  // CATALOGOS_REQ: (sin campos)
  // CATALOGOS_RES: generos | departamentos | municipios | sucursales | metodosPago | membresias | preguntas
  //   Cada campo es una lista "id^nombre~id^nombre", excepto:
  //   municipios = "id^idDepartamento^nombre"   (para filtrar por departamento)
  //   membresias = "id^nombre^precio^duracion"  (para calcular el total en la app)
  CATALOGOS: {
    campos: 7,
    async ejecutar() {
      const c = await cuentas.listarCatalogos();
      return {
        detalle: 'Catálogos',
        campos: [
          lista(c.generos.map((g) => [g.id, g.nombre])),
          lista(c.departamentos.map((d) => [d.id, d.nombre])),
          lista(c.municipios.map((m) => [m.id, m.id_departamento, m.nombre])),
          lista(c.sucursales.map((s) => [s.id, s.nombre])),
          lista(c.metodosPago.map((p) => [p.id, p.nombre])),
          lista(c.membresias.map((t) => [t.id, t.nombre, t.precio, t.duracion])),
          lista(c.preguntas.map((p) => [p.id, p.nombre])),
        ],
      };
    },
  },
};
// 3. RECIBIR UNA TRAMA
// Siempre responde HTTP 200 con una trama: el resultado real va en
// el campo "código". Solo se acepta texto (máximo 10 KB).
router.post('/', express.text({ type: () => true, limit: '10kb' }), async (req, res) => {
  res.type('text/plain; charset=utf-8');

  const texto = typeof req.body === 'string' ? req.body.replace(/\r?\n$/, '') : '';
  const c = texto.split(SEP);
  const idMensaje = c[3] || '0';

  //¿Tiene la forma FM|1|ALGO_REQ|id ?
  if (c.length < 4 || c[0] !== PROTOCOLO || c[1] !== VERSION || !/^[A-Z_]+_REQ$/.test(c[2]) || !c[3]) {
    return res.send(armarTrama('ERROR', idMensaje, '05', 'Trama inválida', []));
  }

  // ¿Conocemos ese tipo?
  const tipo = c[2].slice(0, -4); // quita "_REQ"
  const definicion = TIPOS[tipo];
  if (!definicion) {
    return res.send(armarTrama(tipo, idMensaje, '05', `Tipo de trama desconocido: ${tipo}`, []));
  }

  // Ejecutar
  const vacios = Array(definicion.campos).fill('');
  try {
    const resultado = await definicion.ejecutar(c.slice(4));
    res.send(armarTrama(tipo, idMensaje, '00', resultado.detalle, resultado.campos));
  } catch (error) {
    const t = traducirError(error);
    if (t.inesperado) console.error(error);
    res.send(armarTrama(tipo, idMensaje, t.trama, t.mensaje, vacios));
  }

});


module.exports = router;
