// rutas/clases.js — CLASES GRUPALES
//   GET    /clases                   -> próximas clases de su sucursal
//   GET    /clases/:id               -> detalle: entrenador y participantes
//   POST   /clases/:id/inscribir     -> inscribirse en una clase
//   DELETE /clases/:id/inscripcion   -> cancelar su inscripción
//
// La inscripción la valida la base de datos (usp_InscribirClase):
// que la clase exista, no haya pasado, tenga cupo y que la membresía
// incluya clases. Si algo falla, la app recibe el mensaje de la base.
const express = require('express');
const { sql, conectar } = require('../db');
const { verificarToken, soloClientes, soloAccesoCompleto } = require('../seguridad');
const { responderError } = require('../errores');

const router = express.Router();
router.use(verificarToken, soloClientes, soloAccesoCompleto); // token, ser cliente y membresía al día

// Convierte el :id de la URL en número entero válido (o null)
function idValido(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

// GET /clases
// Próximas clases de la sucursal del cliente (sale del token).
// Incluye cupos disponibles, si ya está inscrito y si su membresía
// incluye clases (para que la app muestre "Requiere membresía Oro").
router.get('/', async (req, res) => {
  const idSucursal = req.usuario.id_sucursal;
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
          ORDER BY ae.fecha_asignacion DESC, ae.id_asignacion DESC
        ) AS entrenador
        WHERE c.id_sucursal = @id_sucursal AND c.fecha_hora > GETDATE()
        ORDER BY c.fecha_hora`);

    // 2. ¿Su membresía incluye clases grupales hoy?
    const beneficio = await pool.request()
      .input('id_cliente', sql.Int, idCliente)
      .query(`SELECT dbo.fn_TieneBeneficio(@id_cliente, 'CLASES', CAST(GETDATE() AS DATE)) AS incluye_clases`);

    res.json({
      membresia_incluye_clases: beneficio.recordset[0].incluye_clases === true,
      clases: clases.recordset,
    });
  } catch (error) {
    responderError(res, error, 'No se pudieron consultar las clases');
  }
});

// GET /clases/:id
// La clase, su entrenador y quiénes están inscritos (usp_App_DetalleClase).
// De los demás solo llega "Nombre I.", sin datos de contacto.
router.get('/:id', async (req, res) => {
  const idClase = idValido(req.params.id);
  if (!idClase) {
    return res.status(400).json({ error: 'El número de clase no es válido' });
  }
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_clase', sql.Int, idClase)
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .execute('usp_App_DetalleClase');
    const [[clase] = [], participantes = []] = resultado.recordsets;
    if (!clase) {
      return res.status(404).json({ error: 'No se encontró esa clase' });
    }

    const { id_entrenador, entrenador, entrenador_especialidad, entrenador_nivel, entrenador_anios, ...datos } = clase;
    res.json({
      ...datos,
      entrenador: id_entrenador
        ? { id_entrenador, nombre: entrenador, especialidad: entrenador_especialidad, nivel: entrenador_nivel, anios_experiencia: entrenador_anios }
        : null,
      participantes,
    });
  } catch (error) {
    responderError(res, error, 'No se pudo consultar la clase');
  }
});

// POST /clases/:id/inscribir
// La base valida e inscribe; la respuesta lleva los cupos que quedan.
router.post('/:id/inscribir', async (req, res) => {
  const idClase = idValido(req.params.id);
  if (!idClase) {
    return res.status(400).json({ error: 'El número de clase no es válido' });
  }

  try {
    const pool = await conectar();

    // 1. La base de datos valida e inscribe
    await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .input('id_clase', sql.Int, idClase)
      .execute('usp_InscribirClase');

    // 2. Cupos que quedan
    const estado = await pool.request()
      .input('id_clase', sql.Int, idClase)
      .query(`
        SELECT c.cupo_maximo - (SELECT COUNT(*) FROM ClienteClase cc
                                WHERE cc.id_clase = c.id_clase) AS cupos_disponibles
        FROM ClaseGrupal c
        WHERE c.id_clase = @id_clase`);
    const { cupos_disponibles } = estado.recordset[0];

    res.status(201).json({ mensaje: 'Inscripción exitosa', id_clase: idClase, cupos_disponibles });
  } catch (error) {
    // Aquí llegan los mensajes de la base: "La clase ya no tiene cupo.", etc.
    responderError(res, error, 'No se pudo completar la inscripción');
  }
});

// DELETE /clases/:id/inscripcion
// Cancela su inscripción si la clase no ha empezado.
router.delete('/:id/inscripcion', async (req, res) => {
  const idClase = idValido(req.params.id);
  if (!idClase) {
    return res.status(400).json({ error: 'El número de clase no es válido' });
  }
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('id_cliente', sql.Int, req.usuario.id_cliente)
      .input('id_clase', sql.Int, idClase)
      .execute('usp_App_CancelarInscripcion');
    const { cupos_disponibles } = resultado.recordset[0] || {};

    res.json({ mensaje: 'Inscripción cancelada', id_clase: idClase, cupos_disponibles });
  } catch (error) {
    responderError(res, error, 'No se pudo cancelar la inscripción');
  }
});

module.exports = router;
