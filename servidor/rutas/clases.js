// rutas/clases.js — CLASES GRUPALES
//   GET  /clases                 -> próximas clases de su sucursal
//   GET  /clases/mias            -> clases en las que está inscrito
//   POST /clases/:id/inscribir   -> inscribirse en una clase
//
// La inscripción la valida la base de datos (usp_InscribirClase):
// que la clase exista, no haya pasado, tenga cupo y que la membresía
// incluya clases. Si algo falla, la app recibe el mensaje de la base.
const express = require('express');
const { sql, conectar, responderErrorSql } = require('../db');
const { verificarToken, soloClientes } = require('../seguridad');

const router = express.Router();
router.use(verificarToken, soloClientes); // todas necesitan token y ser cliente

// GET /clases?sucursal=2
// Próximas clases de su sucursal (u otra si manda ?sucursal=).
// Incluye cupos disponibles, si ya está inscrito y si su membresía
// incluye clases (para que la app muestre "Requiere membresía Oro").
router.get('/', async (req, res) => {
  const idSucursal = Number(req.query.sucursal) || req.usuario.id_sucursal;
  const idCliente = req.usuario.id_cliente;

  try {
    const pool = await conectar();

    // 1. Las clases que todavía no empiezan
    const clases = await pool.request()
      .input('id_sucursal', sql.Int, idSucursal)
      .input('id_cliente', sql.Int, idCliente)
      .query(`
        SELECT c.id_clase, c.nombre_clase, c.fecha_hora, c.cupo_maximo, s.nombre_sucursal,
               c.cupo_maximo - (SELECT COUNT(*) FROM ClienteClase cc
                                WHERE cc.id_clase = c.id_clase) AS cupos_disponibles,
               CAST(CASE WHEN EXISTS (SELECT 1 FROM ClienteClase cc
                                      WHERE cc.id_clase = c.id_clase AND cc.id_cliente = @id_cliente)
                         THEN 1 ELSE 0 END AS BIT) AS ya_inscrito,
               entrenador.nombre AS entrenador
        FROM ClaseGrupal c
        JOIN Sucursal s ON s.id_sucursal = c.id_sucursal
        OUTER APPLY (            -- el entrenador asignado a la clase (si hay)
          SELECT TOP 1 u.primer_nombre_us + ' ' + u.primer_apellido_us AS nombre
          FROM AsignacionEntrenador ae
          JOIN Entrenador en ON en.id_entrenador = ae.id_entrenador
          JOIN Usuario u     ON u.id_usuario     = en.id_usuario
          WHERE ae.id_clase = c.id_clase
          ORDER BY ae.fecha_asignacion DESC
        ) AS entrenador
        WHERE c.id_sucursal = @id_sucursal AND c.fecha_hora > GETDATE()
        ORDER BY c.fecha_hora`);

    // ¿Su membresía incluye clases grupales hoy?
    const beneficio = await pool.request()
      .input('id_cliente', sql.Int, idCliente)
      .query(`SELECT dbo.fn_TieneBeneficio(@id_cliente, 'CLASES', CAST(GETDATE() AS DATE)) AS incluye_clases`);

    res.json({
      membresia_incluye_clases: beneficio.recordset[0].incluye_clases === true,
      clases: clases.recordset,
    });
  } catch (error) {
    responderErrorSql(res, error, 'No se pudieron consultar las clases');
  }
});

// GET /clases/mias
// Clases futuras en las que ya está inscrito.
// -------------------------------------------------------------
router.get('/mias', async (req, res) => {
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .query(`
        SELECT c.id_clase, c.nombre_clase, c.fecha_hora, s.nombre_sucursal, cc.fecha_inscripcion
        FROM ClienteClase cc
        JOIN ClaseGrupal c ON c.id_clase    = cc.id_clase
        JOIN Sucursal s    ON s.id_sucursal = c.id_sucursal
        WHERE cc.id_cliente = @id_cliente AND c.fecha_hora > GETDATE()
        ORDER BY c.fecha_hora`);
    res.json(resultado.recordset);
  } catch (error) {
    responderErrorSql(res, error, 'No se pudieron consultar tus clases');
  }
});

// POST /clases/:id/inscribir
// Inscribe al cliente y avisa EN TIEMPO REAL a todos los de esa
// sucursal cuántos cupos quedan (evento "clase_actualizada").
router.post('/:id/inscribir', async (req, res) => {
  const idClase = Number(req.params.id);
  if (!Number.isInteger(idClase) || idClase <= 0) {
    return res.status(400).json({ error: 'El número de clase no es válido' });
  }

  try {
    const pool = await conectar();

    //La base de datos valida e inscribe
    await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .input('id_clase', sql.Int, idClase)
      .execute('usp_InscribirClase');

    //Cupos que quedan y sucursal de la clase
    const estado = await pool.request()
      .input('id_clase', sql.Int, idClase)
      .query(`
        SELECT c.id_sucursal,
               c.cupo_maximo - (SELECT COUNT(*) FROM ClienteClase cc
                                WHERE cc.id_clase = c.id_clase) AS cupos_disponibles
        FROM ClaseGrupal c
        WHERE c.id_clase = @id_clase`);
    const { id_sucursal, cupos_disponibles } = estado.recordset[0];

    //Aviso en tiempo real a la sala de esa sucursal
    req.app.get('io')
      .to(`sucursal:${id_sucursal}`)
      .emit('clase_actualizada', { id_clase: idClase, cupos_disponibles });

    res.status(201).json({ mensaje: 'Inscripción exitosa', id_clase: idClase, cupos_disponibles });
  } catch (error) {
    // Aquí llegan los mensajes de la base: "La clase ya no tiene cupo.", etc.
    responderErrorSql(res, error, 'No se pudo completar la inscripción');
  }
});

module.exports = router;