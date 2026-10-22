// rutas/cliente.js — DATOS DEL CLIENTE QUE INICIÓ SESIÓN
//   GET /cliente/membresia                    -> membresía vigente y beneficios
//   GET /cliente/pagos                        -> sus facturas y pagos (aunque la membresía esté vencida)
//   GET /cliente/sucursales                   -> todas las sucursales con su ubicación (mapas)
//   GET /cliente/asistencias                  -> historial de entradas
//   GET /cliente/rutinas                      -> lista de sus rutinas
//   GET /cliente/rutinas/:id                  -> detalle: días, ejercicios y series
//   GET    /cliente/entrenadores              -> entrenadores de su sucursal (y cuáles son suyos)
//   POST   /cliente/entrenadores/:id          -> agregar un entrenador
//   DELETE /cliente/entrenadores/:id          -> quitar un entrenador
//   GET /cliente/metas                        -> sus metas
//   GET /cliente/notificaciones               -> sus avisos
//   PUT /cliente/notificaciones/:id/leida     -> marcar un aviso como leído
//
// Todas necesitan token y que la persona sea cliente. El id_cliente
// sale del TOKEN, nunca de lo que mande la app: así nadie puede ver
// los datos de otro cliente cambiando un número.
const express = require('express');
const { sql, conectar, responderErrorSql } = require('../db');
const { verificarToken, soloClientes, soloAccesoCompleto } = require('../seguridad');
const { completarUbicaciones } = require('../servicios/ubicaciones'); // NUEVO: mapas de sucursales
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

    //Membresía vigente hoy
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

    // NUEVO: meses pagados que quedan (desde hoy), agrupados por plan.
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

    //  Beneficios de su tipo de membresía
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
      id_tipo_membresia: membresia.id_tipo_membresia, // NUEVO: para comparar por id, no por nombre
      tipo: membresia.nombre_tipo,
      fecha_inicio: membresia.fecha_inicio,
      fecha_fin: membresia.fecha_fin,
      pagado_hasta: hasta.recordset[0].pagado_hasta,
      restantes: restantes.recordset, // NUEVO: [{ id_tipo_membresia, nombre_tipo, meses }]
      beneficios: beneficios.recordset,
    });
  } catch (error) {
    responderErrorSql(res, error, 'No se pudo consultar tu membresía');
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
    responderErrorSql(res, error, 'No se pudieron consultar tus pagos');
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
    responderErrorSql(res, error, 'No se pudieron consultar las sucursales');
  }
});

// Desde aquí, las rutas exigen membresía al día (acceso completo)
router.use(soloAccesoCompleto);

// GET /cliente/asistencias?limite=30
// Sus últimas entradas al gimnasio (por defecto 30, máximo 100).
router.get('/asistencias', async (req, res) => {
  const limite = Math.min(numeroValido(req.query.limite) || 30, 100);
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .input('limite', sql.Int, limite)
      .query(`
        SELECT TOP (@limite) a.fecha_hora_ingreso, s.nombre_sucursal,
               a.membresia_validada AS acceso_permitido
        FROM Asistencia a
        JOIN Sucursal s ON s.id_sucursal = a.id_sucursal
        WHERE a.id_cliente = @id_cliente
        ORDER BY a.fecha_hora_ingreso DESC`);
    res.json(resultado.recordset);
  } catch (error) {
    responderErrorSql(res, error, 'No se pudo consultar tus asistencias');
  }
});


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
    responderErrorSql(res, error, 'No se pudo consultar tus rutinas');
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

    //  Todos sus días, ejercicios y series
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

    // Agrupar: cada día con sus ejercicios, cada ejercicio con sus series
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
    responderErrorSql(res, error, 'No se pudo consultar la rutina');
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
    responderErrorSql(res, error, 'No se pudieron consultar los entrenadores');
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
    responderErrorSql(res, error, 'No se pudo agregar el entrenador');
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
    responderErrorSql(res, error, 'No se pudo quitar el entrenador');
  }
});

// GET /cliente/metas
// Primero las que están en progreso, luego las cumplidas/canceladas.
router.get('/metas', async (req, res) => {
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .query(`
        SELECT id_meta, tipo_meta, descripcion, valor_objetivo, unidad_medida,
               fecha_inicio, fecha_objetivo, estado
        FROM Meta
        WHERE id_cliente = @id_cliente
        ORDER BY CASE WHEN estado = 'En progreso' THEN 0 ELSE 1 END, fecha_objetivo`);
    res.json(resultado.recordset);
  } catch (error) {
    responderErrorSql(res, error, 'No se pudo consultar tus metas');
  }
});


// GET /cliente/notificaciones
// Sus últimos 50 avisos, los más recientes primero.

router.get('/notificaciones', async (req, res) => {
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .query(`
        SELECT TOP 50 id_notificacion, tipo_notificacion, mensaje, fecha_generada, leida
        FROM Notificacion
        WHERE id_cliente = @id_cliente
        ORDER BY fecha_generada DESC`);
    res.json(resultado.recordset);
  } catch (error) {
    responderErrorSql(res, error, 'No se pudo consultar tus notificaciones');
  }
});

// PUT /cliente/notificaciones/:id/leida
// Marca un aviso como leído (solo si es de este cliente).

router.put('/notificaciones/:id/leida', async (req, res) => {
  const idNotificacion = numeroValido(req.params.id);
  if (!idNotificacion) {
    return res.status(400).json({ error: 'El número de notificación no es válido' });
  }

  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_notificacion', sql.Int, idNotificacion)
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .query(`
        UPDATE Notificacion SET leida = 1
        WHERE id_notificacion = @id_notificacion AND id_cliente = @id_cliente`);

    if (resultado.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'No se encontró esa notificación' });
    }
    res.json({ mensaje: 'Notificación marcada como leída' });
  } catch (error) {
    responderErrorSql(res, error, 'No se pudo actualizar la notificación');
  }
});

module.exports = router;
