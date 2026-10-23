// rutas/cliente.js — DATOS DEL CLIENTE QUE INICIÓ SESIÓN
//   GET    /cliente/membresia                 -> membresía vigente y beneficios
//   GET    /cliente/pagos                     -> sus facturas y pagos (aunque la membresía esté vencida)
//   GET    /cliente/sucursales                -> todas las sucursales con su ubicación (mapas)
//   GET    /cliente/chat                      -> mensajes con su sucursal (?despues=<id>)
//   POST   /cliente/chat                      -> enviar mensaje a su sucursal
//   GET    /cliente/chat/sin-leer             -> cuántas respuestas de recepción no ha leído
//   GET    /cliente/rutinas                   -> lista de sus rutinas
//   GET    /cliente/rutinas/:id               -> detalle: días, ejercicios y series
//   GET    /cliente/entrenadores              -> entrenadores de su sucursal (y cuáles son suyos)
//   POST   /cliente/entrenadores/:id          -> agregar un entrenador
//   DELETE /cliente/entrenadores/:id          -> quitar un entrenador
//   GET    /cliente/metas                     -> sus metas con progreso y avances
//   POST   /cliente/metas                     -> crear meta
//   POST   /cliente/metas/:id/avances         -> registrar un avance
//   POST   /cliente/metas/:id/cancelar        -> cancelar una meta
//
// Todas necesitan token y que la persona sea cliente. El id_cliente
// sale del TOKEN, nunca de lo que mande la app: así nadie puede ver
// los datos de otro cliente cambiando un número.
const express = require('express');
const { sql, conectar } = require('../db');
const { verificarToken, soloClientes, soloAccesoCompleto } = require('../seguridad');
const { responderError } = require('../errores');
const { completarUbicaciones } = require('../servicios/ubicaciones'); // mapas de sucursales
const router = express.Router();
router.use(verificarToken, soloClientes); // protege TODAS las rutas de este archivo

// Convierte un parámetro de la URL en número entero válido (o null)
function numeroValido(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

// GET /cliente/membresia
// La membresía que cubre HOY (no suspendida), hasta cuándo tiene
// pagado (si pagó varios meses) y qué beneficios incluye.
router.get('/membresia', async (req, res) => {
  try {
    const pool = await conectar();
    const idCliente = req.usuario.id_cliente;

    // Membresía vigente hoy
    const actual = await pool.request()
      .input('id_cliente', sql.Int, idCliente)
      .query(`
        SELECT TOP 1 m.id_membresia, m.id_tipo_membresia, t.nombre_tipo,
               m.fecha_inicio, m.fecha_fin, m.estado
        FROM Membresia m
        JOIN TipoMembresia t ON t.id_tipo_membresia = m.id_tipo_membresia
        WHERE m.id_cliente = @id_cliente
          AND m.estado <> 'Suspendida'
          AND CAST(GETDATE() AS DATE) BETWEEN m.fecha_inicio AND m.fecha_fin
        ORDER BY m.fecha_fin DESC`);

    if (actual.recordset.length === 0) {
      // Sin membresía vigente: la última que tuvo, para mostrar "venció el ..."
      const ultima = await pool.request()
        .input('id_cliente', sql.Int, idCliente)
        .query(`
          SELECT TOP 1 t.nombre_tipo AS tipo, m.fecha_inicio, m.fecha_fin, m.estado
          FROM Membresia m
          JOIN TipoMembresia t ON t.id_tipo_membresia = m.id_tipo_membresia
          WHERE m.id_cliente = @id_cliente
          ORDER BY m.fecha_fin DESC`);
      return res.json({
        activa: false,
        mensaje: 'No tienes una membresía vigente',
        ultima: ultima.recordset[0] || null,
        restantes: [],
      });
    }
    const membresia = actual.recordset[0];

    // Hasta cuándo tiene pagado (incluye meses futuros ya pagados)
    const hasta = await pool.request()
      .input('id_cliente', sql.Int, idCliente)
      .query(`
        SELECT MAX(fecha_fin) AS pagado_hasta
        FROM Membresia
        WHERE id_cliente = @id_cliente AND estado <> 'Suspendida'
          AND fecha_fin >= CAST(GETDATE() AS DATE)`);

    // Meses pagados que quedan (desde hoy), agrupados por plan.
    // La app los usa para calcular cuánto cuesta cambiar de plan:
    // (precio del plan nuevo - precio del plan de esos meses) x meses.
    // Es la misma cuenta que hace usp_CambiarPlanApp al cobrar.
    const restantes = await pool.request()
      .input('id_cliente', sql.Int, idCliente)
      .query(`
        SELECT m.id_tipo_membresia, t.nombre_tipo, COUNT(*) AS meses
        FROM Membresia m
        JOIN TipoMembresia t ON t.id_tipo_membresia = m.id_tipo_membresia
        WHERE m.id_cliente = @id_cliente AND m.estado <> 'Suspendida'
          AND m.fecha_fin >= CAST(GETDATE() AS DATE)
        GROUP BY m.id_tipo_membresia, t.nombre_tipo`);

    // Beneficios de su tipo de membresía
    const beneficios = await pool.request()
      .input('id_tipo', sql.Int, membresia.id_tipo_membresia)
      .query(`
        SELECT b.codigo, b.nombre_beneficio, b.descripcion
        FROM TipoMembresiaBeneficio tb
        JOIN Beneficio b ON b.id_beneficio = tb.id_beneficio
        WHERE tb.id_tipo_membresia = @id_tipo
        ORDER BY b.nombre_beneficio`);

    res.json({
      activa: true,
      id_tipo_membresia: membresia.id_tipo_membresia, // para comparar por id, no por nombre
      tipo: membresia.nombre_tipo,
      fecha_inicio: membresia.fecha_inicio,
      fecha_fin: membresia.fecha_fin,
      pagado_hasta: hasta.recordset[0].pagado_hasta,
      restantes: restantes.recordset, // [{ id_tipo_membresia, nombre_tipo, meses }]
      beneficios: beneficios.recordset,
    });
  } catch (error) {
    responderError(res, error, 'No se pudo consultar tu membresía');
  }
});

// GET /cliente/pagos
// Todas sus facturas (la más reciente primero) con su pago y sus líneas.
// Está ANTES de soloAccesoCompleto: con la membresía vencida también
// puede ver lo que ha pagado.
router.get('/pagos', async (req, res) => {
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .execute('usp_App_ListarPagos');
    const [facturas = [], lineas = []] = resultado.recordsets;

    // Juntar las líneas con su factura
    const porFactura = new Map(facturas.map((f) => [f.id_factura, { ...f, detalle: [] }]));
    for (const linea of lineas) {
      porFactura.get(linea.id_factura)?.detalle.push({
        descripcion: linea.descripcion,
        cantidad: linea.cantidad,
        precio_unitario: linea.precio_unitario,
        subtotal: linea.subtotal,
      });
    }
    res.json([...porFactura.values()]);
  } catch (error) {
    responderError(res, error, 'No se pudieron consultar tus pagos');
  }
});

// GET /cliente/sucursales
// Todas las sucursales con municipio, departamento y coordenadas para el
// mapa. La del cliente viene primero, con es_mia = true. Las coordenadas
// que falten se completan una sola vez (servicios/ubicaciones.js).
router.get('/sucursales', async (req, res) => {
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .execute('usp_App_ListarSucursales');
    const sucursales = resultado.recordset.map((s) => ({
      ...s,
      latitud: s.latitud === null ? null : Number(s.latitud),
      longitud: s.longitud === null ? null : Number(s.longitud),
    }));
    res.json(await completarUbicaciones(sucursales));
  } catch (error) {
    responderError(res, error, 'No se pudieron consultar las sucursales');
  }
});

// =============================================================
// CHAT CON SU SUCURSAL (chat.tsx) — procedimientos de 13_chat.sql
// Está ANTES de soloAccesoCompleto: con la membresía vencida también
// puede escribirle a recepción (por ejemplo, para renovar).
// La recepción contesta desde la app de escritorio (PRINCIPAL.py).
// =============================================================

function mensajeChat(m) {
  return {
    id_mensaje: m.id_mensaje,
    texto: m.texto,
    fecha: m.fecha,                 // "AAAA-MM-DDTHH:MM:SS" en hora de Guatemala
    de_cliente: Boolean(m.de_cliente),
    autor: m.autor,
    leido: Boolean(m.leido),
  };
}

// GET /cliente/chat?despues=<id>
// Sin "despues": los últimos 100 mensajes. Con "despues": solo los nuevos.
router.get('/chat', async (req, res) => {
  const despues = req.query.despues === undefined || req.query.despues === '0' ? 0 : numeroValido(req.query.despues);
  if (despues === null) return res.status(400).json({ error: 'El parámetro despues no es válido' });
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .input('despues', sql.Int, despues)
      .execute('usp_App_ChatListar');
    const [sucursal = [], mensajes = []] = resultado.recordsets;
    res.json({ sucursal: sucursal[0]?.sucursal ?? '', mensajes: mensajes.map(mensajeChat) });
  } catch (error) {
    responderError(res, error, 'No se pudo cargar el chat');
  }
});

// POST /cliente/chat   { texto }
router.post('/chat', async (req, res) => {
  const texto = typeof req.body?.texto === 'string' ? req.body.texto.trim() : '';
  if (!texto) return res.status(400).json({ error: 'Escribe un mensaje' });
  if (texto.length > 1000) return res.status(400).json({ error: 'El mensaje es muy largo (máximo 1000 letras)' });
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .input('texto', sql.NVarChar(1000), texto)
      .execute('usp_App_ChatEnviar');
    res.status(201).json(mensajeChat(resultado.recordset[0]));
  } catch (error) {
    responderError(res, error, 'No se pudo enviar el mensaje');
  }
});

// GET /cliente/chat/sin-leer  → { sin_leer }
router.get('/chat/sin-leer', async (req, res) => {
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .execute('usp_App_ChatSinLeer');
    res.json({ sin_leer: Number(resultado.recordset[0]?.sin_leer || 0) });
  } catch (error) {
    responderError(res, error, 'No se pudo consultar el chat');
  }
});

// Desde aquí, las rutas exigen membresía al día (acceso completo)
router.use(soloAccesoCompleto);

// GET /cliente/rutinas
// Lista de sus rutinas con el nombre del entrenador que la creó.
router.get('/rutinas', async (req, res) => {
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .query(`
        SELECT r.id_rutina, r.nombre_rutina, r.fecha_creacion,
               u.primer_nombre_us + ' ' + u.primer_apellido_us AS entrenador
        FROM Rutina r
        JOIN Entrenador en ON en.id_entrenador = r.id_entrenador
        JOIN Usuario u     ON u.id_usuario     = en.id_usuario
        WHERE r.id_cliente = @id_cliente
        ORDER BY r.fecha_creacion DESC`);
    res.json(resultado.recordset);
  } catch (error) {
    responderError(res, error, 'No se pudo consultar tus rutinas');
  }
});

// GET /cliente/rutinas/:id
// Detalle de una rutina: días -> ejercicios -> series.
// La base devuelve una fila por serie; aquí se agrupan en ese orden.
router.get('/rutinas/:id', async (req, res) => {
  const idRutina = numeroValido(req.params.id);
  if (!idRutina) {
    return res.status(400).json({ error: 'El número de rutina no es válido' });
  }

  try {
    const pool = await conectar();

    // 1. Confirmar que la rutina es de este cliente
    const rutina = await pool.request()
      .input('id_rutina', sql.Int, idRutina)
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .query(`
        SELECT id_rutina, nombre_rutina, fecha_creacion
        FROM Rutina
        WHERE id_rutina = @id_rutina AND id_cliente = @id_cliente`);
    if (rutina.recordset.length === 0) {
      return res.status(404).json({ error: 'No se encontró esa rutina' });
    }

    // 2. Todos sus días, ejercicios y series
    const filas = await pool.request()
      .input('id_rutina', sql.Int, idRutina)
      .query(`
        SELECT d.id_dia_rutina, d.numero_dia, d.nombre_dia,
               b.id_bloque_ejercicio, b.orden, e.nombre_ejercicio, e.unidad_medida,
               g.nombre_grupo, se.numero_serie, se.repeticiones, se.peso_objetivo,
               se.descanso_segundos
        FROM DiaRutina d
        LEFT JOIN BloqueEjercicio b ON b.id_dia_rutina       = d.id_dia_rutina
        LEFT JOIN Ejercicio e       ON e.id_ejercicio        = b.id_ejercicio
        LEFT JOIN GrupoMuscular g   ON g.id_grupo_muscular   = e.id_grupo_muscular
        LEFT JOIN SerieEjercicio se ON se.id_bloque_ejercicio = b.id_bloque_ejercicio
        WHERE d.id_rutina = @id_rutina
        ORDER BY d.numero_dia, b.orden, se.numero_serie`);

    // 3. Agrupar: cada día con sus ejercicios, cada ejercicio con sus series
    const dias = [];
    for (const fila of filas.recordset) {
      let dia = dias.find((d) => d.id_dia_rutina === fila.id_dia_rutina);
      if (!dia) {
        dia = { id_dia_rutina: fila.id_dia_rutina, numero_dia: fila.numero_dia, nombre_dia: fila.nombre_dia, ejercicios: [] };
        dias.push(dia);
      }
      if (!fila.id_bloque_ejercicio) continue; // día sin ejercicios todavía

      let ejercicio = dia.ejercicios.find((x) => x.id_bloque_ejercicio === fila.id_bloque_ejercicio);
      if (!ejercicio) {
        ejercicio = {
          id_bloque_ejercicio: fila.id_bloque_ejercicio,
          orden: fila.orden,
          nombre: fila.nombre_ejercicio,
          grupo_muscular: fila.nombre_grupo,
          unidad: fila.unidad_medida, // reps, seg o min
          series: [],
        };
        dia.ejercicios.push(ejercicio);
      }
      if (fila.numero_serie !== null) {
        ejercicio.series.push({
          numero: fila.numero_serie,
          repeticiones: fila.repeticiones,
          peso_objetivo: fila.peso_objetivo,
          descanso_segundos: fila.descanso_segundos,
        });
      }
    }

    res.json({ ...rutina.recordset[0], dias });
  } catch (error) {
    responderError(res, error, 'No se pudo consultar la rutina');
  }
});

// =============================================================
// ENTRENADORES (pantalla mi_entrenador.tsx)
// Todo pasa por procedimientos de 07_entrenadores.sql: ahí viven las
// reglas (solo su sucursal, varios a la vez, sin duplicados).
// =============================================================

// GET /cliente/entrenadores
// Entrenadores de su sucursal con sus datos; "asignado" = ya es suyo.
router.get('/entrenadores', async (req, res) => {
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .execute('usp_App_ListarEntrenadores');
    res.json(resultado.recordset);
  } catch (error) {
    responderError(res, error, 'No se pudieron consultar los entrenadores');
  }
});

// POST /cliente/entrenadores/:id   -> agregar ese entrenador
router.post('/entrenadores/:id', async (req, res) => {
  const idEntrenador = numeroValido(req.params.id);
  if (!idEntrenador) {
    return res.status(400).json({ error: 'El número de entrenador no es válido' });
  }
  try {
    const pool = await conectar();
    await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .input('id_entrenador', sql.Int, idEntrenador)
      .input('id_usuario', sql.Int, req.usuario.id_usuario)
      .execute('usp_App_AgregarEntrenador');
    res.status(201).json({ mensaje: 'Entrenador agregado' });
  } catch (error) {
    responderError(res, error, 'No se pudo agregar el entrenador');
  }
});

// DELETE /cliente/entrenadores/:id -> quitar ese entrenador (la asignación se cierra, no se borra)
router.delete('/entrenadores/:id', async (req, res) => {
  const idEntrenador = numeroValido(req.params.id);
  if (!idEntrenador) {
    return res.status(400).json({ error: 'El número de entrenador no es válido' });
  }
  try {
    const pool = await conectar();
    await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .input('id_entrenador', sql.Int, idEntrenador)
      .execute('usp_App_QuitarEntrenador');
    res.json({ mensaje: 'Entrenador quitado' });
  } catch (error) {
    responderError(res, error, 'No se pudo quitar el entrenador');
  }
});

// =============================================================
// METAS (pantalla mis_metas.tsx) — procedimientos de 12_metas.sql
// =============================================================

// "72.5" → 72.5   |   "", "abc", "-3" → null
function numeroPositivo(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// GET /cliente/metas
// Sus metas con valor actual y progreso (0-100), y los avances de cada una.
router.get('/metas', async (req, res) => {
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .execute('usp_App_ListarMetas');
    const [metas = [], avances = []] = resultado.recordsets;

    const porMeta = new Map(metas.map((m) => [m.id_meta, {
      ...m,
      valor_inicial: m.valor_inicial === null ? null : Number(m.valor_inicial),
      valor_objetivo: m.valor_objetivo === null ? null : Number(m.valor_objetivo),
      valor_actual: m.valor_actual === null ? null : Number(m.valor_actual),
      progreso: Number(m.progreso),
      avances: [],
    }]));
    for (const a of avances) {
      porMeta.get(a.id_meta)?.avances.push({ id_avance: a.id_avance, fecha: a.fecha, valor: Number(a.valor), nota: a.nota });
    }
    res.json([...porMeta.values()]);
  } catch (error) {
    responderError(res, error, 'No se pudo consultar tus metas');
  }
});

// POST /cliente/metas
// { tipo_meta, descripcion, valor_inicial?, valor_objetivo, unidad_medida, fecha_objetivo: "AAAA-MM-DD" }
router.post('/metas', async (req, res) => {
  const d = req.body || {};
  const fecha = String(d.fecha_objetivo || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'La fecha objetivo no es válida' });
  }
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .input('tipo_meta', sql.VarChar(50), String(d.tipo_meta || ''))
      .input('descripcion', sql.VarChar(255), String(d.descripcion || '').slice(0, 255))
      .input('valor_inicial', sql.Decimal(10, 2), numeroPositivo(d.valor_inicial))
      .input('valor_objetivo', sql.Decimal(10, 2), numeroPositivo(d.valor_objetivo))
      .input('unidad_medida', sql.VarChar(15), String(d.unidad_medida || '').slice(0, 15))
      .input('fecha_objetivo', sql.VarChar(10), fecha)
      .execute('usp_App_CrearMeta');
    res.status(201).json({ mensaje: 'Meta creada', id_meta: resultado.recordset[0]?.id_meta });
  } catch (error) {
    responderError(res, error, 'No se pudo crear la meta');
  }
});

// POST /cliente/metas/:id/avances   { valor, nota? }
router.post('/metas/:id/avances', async (req, res) => {
  const idMeta = numeroValido(req.params.id);
  if (!idMeta) return res.status(400).json({ error: 'El número de meta no es válido' });
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .input('id_meta', sql.Int, idMeta)
      .input('valor', sql.Decimal(10, 2), numeroPositivo(req.body?.valor))
      .input('nota', sql.VarChar(150), req.body?.nota ? String(req.body.nota).slice(0, 150) : null)
      .execute('usp_App_RegistrarAvance');
    const fila = resultado.recordset[0] || {};
    res.status(201).json({
      mensaje: fila.estado === 'Cumplida' ? '¡Meta cumplida!' : 'Avance registrado',
      estado: fila.estado,
      progreso: Number(fila.progreso || 0),
    });
  } catch (error) {
    responderError(res, error, 'No se pudo registrar el avance');
  }
});

// POST /cliente/metas/:id/cancelar
router.post('/metas/:id/cancelar', async (req, res) => {
  const idMeta = numeroValido(req.params.id);
  if (!idMeta) return res.status(400).json({ error: 'El número de meta no es válido' });
  try {
    const pool = await conectar();
    await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .input('id_meta', sql.Int, idMeta)
      .execute('usp_App_CancelarMeta');
    res.json({ mensaje: 'Meta cancelada' });
  } catch (error) {
    responderError(res, error, 'No se pudo cancelar la meta');
  }
});

module.exports = router;
