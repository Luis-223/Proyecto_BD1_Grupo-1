// servicios/membresias.js — PAGAR, RENOVAR O CAMBIAR DE PLAN DESDE LA APP
// Lo usa rutas/trama.js (trama MEMBRESIA).
//
// Tres caminos:
//   - Agregar meses (esCambioTipo = 0), con tarjeta: usp_PagarMembresiaApp.
//     Si ya tiene meses pagados, los nuevos empiezan cuando terminan esos.
//     Si el usuario estaba Inactivo (membresía vencida), vuelve a Activo.
//   - Cambiar de plan (esCambioTipo = 1), con tarjeta: usp_CambiarPlanApp.
//     Los meses que ya pagó pasan al plan nuevo y solo paga la diferencia
//     (ej. Plata Q145 → Oro Q160, 6 meses: 6 x Q15 = Q90). La fecha
//     "pagado hasta" no cambia.
//   - Pago en sucursal (método "SUCURSAL" o vacío): no se cobra nada aquí;
//     la recepción lo factura cuando la persona pague.
//
// El id_cliente sale del TOKEN, nunca de la trama: nadie puede pagar
// (ni ver) la membresía de otro cliente cambiando un número.

const { sql, conectar } = require('../db');
const { crearToken } = require('../seguridad');
const { ErrorApp } = require('../errores');

// "5" → 5   |   "abc", "0", "-3", "", "SUCURSAL" → null
const aEntero = (valor) => {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Date de SQL (useUTC: false = hora local del servidor) → "AAAA-MM-DD"
function aFechaTexto(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return '';
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}
const aFechaGt = (texto) => (texto ? texto.split('-').reverse().join('/') : '');
const aQuetzales = (n) => `Q${Number(n || 0).toFixed(2).replace(/\.00$/, '')}`;

// Ejecuta un procedimiento y explica los errores de CONFIGURACIÓN de la base
// en vez de mostrar "Error inesperado en el servidor". El detalle queda en el log.
async function ejecutar(nombre, archivoSql, parametros) {
  const pool = await conectar();
  const pedido = pool.request();
  for (const [campo, valor] of Object.entries(parametros)) pedido.input(campo, sql.Int, valor);
  try {
    return await pedido.execute(nombre);
  } catch (error) {
    if (error && (error.number === 2812 || error.number === 229)) {
      console.error(`[MEMBRESIA] Error de configuración en SQL (${nombre}):`, error.number, error.message);
      throw new ErrorApp('NEGOCIO', error.number === 2812
        ? `El pago en línea no está disponible: falta instalar ${nombre} (${archivoSql}).`
        : `El pago en línea no está disponible: el usuario de la base no tiene permiso sobre ${nombre}.`);
    }
    throw error; // los THROW >= 50000 se muestran tal cual; el resto queda como error 99 con su detalle en el log
  }
}

async function pagarMembresia(usuario, metodoRecibido, membresiaRecibida, mesesRecibidos, esCambioRecibido) {
  if (!usuario || !usuario.id_cliente) {
    throw new ErrorApp('SIN_PERMISO', 'Esta sección es solo para clientes del gimnasio');
  }

  const metodo = aEntero(metodoRecibido);
  const membresia = aEntero(membresiaRecibida);
  const meses = aEntero(mesesRecibidos);
  const esCambioTipo = String(esCambioRecibido) === '1';

  if (!membresia) throw new ErrorApp('DATOS', 'Elige un tipo de membresía');
  if (!esCambioTipo && (!meses || meses > 12)) {
    throw new ErrorApp('DATOS', 'Se pueden pagar entre 1 y 12 meses');
  }

  const accesoActual = (usuario.acceso || 'completo').toUpperCase();

  // Pago en sucursal: no se cobra nada desde la app
  if (metodo === null) {
    return {
      mensaje: esCambioTipo
        ? 'Acércate a tu sucursal para pagar la diferencia y cambiar tu plan.'
        : 'Acércate a tu sucursal para realizar el pago. Tu membresía se activará cuando quede registrado.',
      pagadoHasta: '',
      token: '',
      acceso: accesoActual,
    };
  }

  let mensaje;
  let pagadoHasta;

  if (esCambioTipo) {
    const resultado = await ejecutar('usp_CambiarPlanApp', '05_cambio_plan.sql', {
      id_cliente: usuario.id_cliente,
      id_tipo_nuevo: membresia,
      id_metodo_pago: metodo,
    });
    // Último resultado: { pagado_hasta, total, meses_cambiados, plan_nuevo }
    const fila = (resultado.recordsets.at(-1) || [])[0] || {};
    pagadoHasta = aFechaTexto(fila.pagado_hasta);
    const cantidad = Number(fila.meses_cambiados) || 0;
    mensaje = `Cambiaste a ${fila.plan_nuevo || 'tu nuevo plan'}. Pagaste ${aQuetzales(fila.total)} de diferencia `
      + `por ${cantidad} ${cantidad === 1 ? 'mes' : 'meses'}`
      + (pagadoHasta ? `. Pagado hasta el ${aFechaGt(pagadoHasta)}.` : '.');
  } else {
    const resultado = await ejecutar('usp_PagarMembresiaApp', '03_membresia.sql', {
      id_cliente: usuario.id_cliente,
      id_tipo_membresia: membresia,
      id_metodo_pago: metodo,
      meses,
    });
    // Último resultado: { pagado_hasta, total }
    const fila = (resultado.recordsets.at(-1) || [])[0] || {};
    pagadoHasta = aFechaTexto(fila.pagado_hasta);
    mensaje = pagadoHasta
      ? `Pago registrado. Tu membresía está pagada hasta el ${aFechaGt(pagadoHasta)}.`
      : 'Pago registrado.';
  }

  // Token nuevo con acceso completo: si la membresía estaba vencida, la persona
  // ya no tiene que cerrar sesión y volver a entrar. (iat/exp se quitan porque
  // jwt.sign no acepta "exp" junto con expiresIn.)
  const { iat, exp, ...datosToken } = usuario; // eslint-disable-line no-unused-vars
  const token = crearToken({ ...datosToken, acceso: 'completo' });

  return { mensaje, pagadoHasta, token, acceso: 'COMPLETO' };
}

module.exports = { pagarMembresia };
