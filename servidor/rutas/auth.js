// rutas/auth.js — INICIO DE SESIÓN Y PALABRA CLAVE
//   POST /auth/login      -> iniciar sesión con alias y contraseña
//   POST /auth/recuperar  -> cambiar la contraseña con la palabra clave
//   GET  /auth/yo         -> ver quién inició sesión (prueba del token)
// Las contraseñas y palabras clave las revisa la BASE DE DATOS con
// sus procedimientos. El servidor nunca las guarda ni las compara.

const express = require('express');
const { sql, conectar, responderErrorSql } = require('../db');
const { crearToken, verificarToken, crearLimitador } = require('../seguridad');

const router = express.Router();

// Estados de la tabla Estado que NO pueden iniciar sesión.
// Ajusta los nombres a los que tenga tu tabla (SELECT * FROM Estado).
const ESTADOS_SIN_ACCESO = ['inactivo', 'suspendido', 'bloqueado'];

// 5 intentos fallidos = alias bloqueado 15 minutos (uno para cada ruta)
const limiteLogin = crearLimitador({ maximo: 5, minutos: 15 });
const limiteRecuperar = crearLimitador({ maximo: 5, minutos: 15 });

// POST /auth/login
// Recibe: { "alias": "...", "contrasena": "..." }
// Responde: { token, usuario: { nombre, roles, ... } }
router.post('/login', async (req, res) => {
  const alias = (req.body.alias || '').trim();
  const contrasena = req.body.contrasena || '';

  if (!alias || !contrasena) {
    return res.status(400).json({ error: 'Escribe tu usuario y tu contraseña' });
  }

  // ¿Este alias está bloqueado por muchos intentos?
  const espera = limiteLogin.minutosBloqueado(alias);
  if (espera > 0) {
    return res.status(429).json({ error: `Demasiados intentos. Intenta de nuevo en ${espera} minutos.` });
  }

  try {
    const pool = await conectar();

    // La base de datos revisa la contraseña y guarda el intento en LoginLog
    const validacion = await pool.request()
      .input('alias', sql.VarChar(60), alias)
      .input('contrasena_plana', sql.VarChar(100), contrasena)
      .execute('usp_ValidarLogin');

    if (validacion.recordset[0]?.resultado !== 'Exitoso') {
      limiteLogin.registrarFallo(alias);
      // Mismo mensaje si el alias no existe o la clave está mal: así nadie
      // puede averiguar qué alias existen
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    limiteLogin.limpiar(alias);

    //  Datos de la persona: nombre, estado y si es cliente o entrenador
    const datos = await pool.request()
      .input('alias', sql.VarChar(60), alias)
      .query(`
        SELECT a.id_alias, u.id_usuario, u.primer_nombre_us, u.primer_apellido_us,
               e.nombre_estado, c.id_cliente, en.id_entrenador,
               COALESCE(c.id_sucursal, en.id_sucursal) AS id_sucursal,
               s.nombre_sucursal
        FROM AliasUsuario a
        JOIN Usuario u          ON u.id_usuario  = a.id_usuario
        JOIN Estado e           ON e.id_estado   = u.id_estado
        LEFT JOIN Cliente c     ON c.id_usuario  = u.id_usuario
        LEFT JOIN Entrenador en ON en.id_usuario = u.id_usuario
        LEFT JOIN Sucursal s    ON s.id_sucursal = COALESCE(c.id_sucursal, en.id_sucursal)
        WHERE a.alias = @alias`);
    const u = datos.recordset[0];

    // ¿Su usuario está activo?
    if (ESTADOS_SIN_ACCESO.includes((u.nombre_estado || '').toLowerCase())) {
      return res.status(403).json({ error: 'Tu usuario no está activo. Acércate a tu sucursal.' });
    }

    //Sus roles (Cliente, Entrenador, Administrador...)
    const resultadoRoles = await pool.request()
      .input('id_usuario', sql.Int, u.id_usuario)
      .query(`
        SELECT r.nombre_rol
        FROM UsuarioRol ur
        JOIN Rol r ON r.id_rol = ur.id_rol
        WHERE ur.id_usuario = @id_usuario`);
    const roles = resultadoRoles.recordset.map((r) => r.nombre_rol);

    //Crear el token con lo que el servidor necesita saber en cada petición
    const token = crearToken({
      id_usuario: u.id_usuario,
      id_alias: u.id_alias,
      id_cliente: u.id_cliente,
      id_entrenador: u.id_entrenador,
      id_sucursal: u.id_sucursal,
      roles,
    });

    //Responder: el token + datos para mostrar en la app
    res.json({
      token,
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
    });
  } catch (error) {
    responderErrorSql(res, error, 'No se pudo iniciar sesión');
  }
});

// POST /auth/recuperar
// Recibe: { "alias": "...", "palabra_clave": "...", "contrasena_nueva": "..." }
// Usa el procedimiento usp_RestablecerConPalabraClave del equipo de BD.
// Si ellos le ponen otro nombre o parámetros, cámbialos aquí abajo.
router.post('/recuperar', async (req, res) => {
  const alias = (req.body.alias || '').trim();
  const palabraClave = req.body.palabra_clave || '';
  const contrasenaNueva = req.body.contrasena_nueva || '';

  if (!alias || !palabraClave || !contrasenaNueva) {
    return res.status(400).json({ error: 'Escribe tu usuario, tu palabra clave y la contraseña nueva' });
  }
  if (contrasenaNueva.length < 8) {
    return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 8 caracteres' });
  }

  // ¿Bloqueado por muchos intentos?
  const espera = limiteRecuperar.minutosBloqueado(alias);
  if (espera > 0) {
    return res.status(429).json({ error: `Demasiados intentos. Intenta de nuevo en ${espera} minutos.` });
  }

  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('alias', sql.VarChar(60), alias)
      .input('respuesta', sql.VarChar(100), palabraClave)
      .input('contrasena_nueva', sql.VarChar(100), contrasenaNueva)
      .execute('usp_RestablecerConPalabraClave');

    if (resultado.recordset[0]?.resultado !== 'Exitoso') {
      limiteRecuperar.registrarFallo(alias);
      return res.status(401).json({ error: 'Usuario o palabra clave incorrectos' });
    }

    limiteRecuperar.limpiar(alias);
    limiteLogin.limpiar(alias); // si estaba bloqueado en el login, se desbloquea
    res.json({ mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (error) {
    responderErrorSql(res, error, 'No se pudo cambiar la contraseña');
  }
});


// GET /auth/yo  (necesita token)
// Devuelve los datos guardados dentro del token. Sirve para que la
// app sepa si la sesión sigue activa al abrirse.
// -------------------------------------------------------------
router.get('/yo', verificarToken, (req, res) => {
  res.json(req.usuario);
});

module.exports = router;