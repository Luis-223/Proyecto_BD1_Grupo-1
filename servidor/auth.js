// auth.js — rutas de inicio de sesión
require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');          // crea y revisa los tokens de sesión
const { conectar, sql } = require('./db');

const router = express.Router();

// POST /auth/login  →  { "alias": "...", "contrasena": "..." }
router.post('/login', async (req, res) => {
  const { alias, contrasena } = req.body;
  if (!alias || !contrasena) {
    return res.status(400).json({ error: 'Escribe tu usuario y tu contraseña' });
  }

  try {
    const pool = await conectar();

    // La base de datos revisa la contraseña y guarda el intento en LoginLog
    const validacion = await pool.request()
      .input('alias', sql.VarChar(60), alias)
      .input('contrasena_plana', sql.VarChar(100), contrasena)
      .execute('usp_ValidarLogin');

    if (validacion.recordset[0]?.resultado !== 'Exitoso') {
      // Mismo mensaje si el usuario no existe o si la clave está mal (es más seguro)
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    // Buscamos quién es la persona
    const datos = await pool.request()
      .input('alias', sql.VarChar(60), alias)
      .query(`SELECT a.id_alias, u.id_usuario, u.primer_nombre_us, u.primer_apellido_us,
                     e.nombre_estado, c.id_cliente, c.id_sucursal, en.id_entrenador
              FROM AliasUsuario a
              JOIN Usuario u          ON u.id_usuario = a.id_usuario
              JOIN Estado e           ON e.id_estado  = u.id_estado
              LEFT JOIN Cliente c     ON c.id_usuario = u.id_usuario
              LEFT JOIN Entrenador en ON en.id_usuario = u.id_usuario
              WHERE a.alias = @alias`);
    const u = datos.recordset[0];

    // Sus roles (Cliente, Entrenador, Administrador...)
    const resultadoRoles = await pool.request()
      .input('id_usuario', sql.Int, u.id_usuario)
      .query(`SELECT r.nombre_rol FROM UsuarioRol ur
              JOIN Rol r ON r.id_rol = ur.id_rol
              WHERE ur.id_usuario = @id_usuario`);
    const roles = resultadoRoles.recordset.map((r) => r.nombre_rol);

    // Creamos el token: la "credencial" que la app manda en cada petición
    const token = jwt.sign(
      {
        id_usuario: u.id_usuario,
        id_alias: u.id_alias,
        id_cliente: u.id_cliente,
        id_entrenador: u.id_entrenador,
        roles,
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' } // la sesión dura 8 horas
    );

    res.json({
      token,
      usuario: {
        id_usuario: u.id_usuario,
        nombre: `${u.primer_nombre_us} ${u.primer_apellido_us}`,
        estado: u.nombre_estado,
        id_cliente: u.id_cliente,
        id_entrenador: u.id_entrenador,
        id_sucursal: u.id_sucursal,
        roles,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo iniciar sesión' });
  }
});

// Revisa el token antes de dejar pasar a una ruta protegida
function verificarToken(req, res, next) {
  const encabezado = req.headers.authorization || '';
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Debes iniciar sesión' });
  }
  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET); // datos guardados en el token
    next();
  } catch {
    return res.status(401).json({ error: 'La sesión expiró o no es válida' });
  }
}

// GET /auth/yo  →  devuelve quién inició sesión (sirve para probar el token)
router.get('/yo', verificarToken, (req, res) => {
  res.json(req.usuario);
});

module.exports = { router, verificarToken };