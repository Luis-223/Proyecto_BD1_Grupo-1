// rutas/auth.js — CUENTAS EN FORMATO JSON
//   POST /auth/login          -> iniciar sesión con alias y contraseña
//   POST /auth/recuperar      -> nueva contraseña usando la palabra clave
//   GET  /auth/preguntas      -> lista de preguntas de seguridad
//   GET  /auth/yo             -> ver quién inició sesión (prueba del token)
//   PUT  /auth/palabra-clave  -> guardar o cambiar la palabra clave (con sesión)
//   PUT  /auth/contrasena     -> cambiar la contraseña (con sesión)
// La app usa TRAMAS (rutas/trama.js). Estas rutas JSON hacen lo mismo
// y sirven para probar con PowerShell. Las dos usan servicios/cuentas.js.
const express = require('express');
const cuentas = require('../servicios/cuentas');
const { verificarToken } = require('../seguridad');
const { responderError } = require('../errores');

const router = express.Router();

// POST /auth/login
// Recibe:   { "alias": "...", "contrasena": "..." }
// Responde: { token, acceso, mensaje, usuario: { nombre, roles, ... } }
router.post('/login', async (req, res) => {
  try {
    const resultado = await cuentas.iniciarSesion(req.body.alias, req.body.contrasena);
    res.json(resultado);
  } catch (error) {
    responderError(res, error, 'No se pudo iniciar sesión');
  }
});

// POST /auth/recuperar
// Recibe: { "alias": "...", "palabra_clave": "...", "contrasena_nueva": "..." }
router.post('/recuperar', async (req, res) => {
  try {
    const resultado = await cuentas.recuperarContrasena(
      req.body.alias, req.body.palabra_clave, req.body.contrasena_nueva);
    res.json(resultado);
  } catch (error) {
    responderError(res, error, 'No se pudo cambiar la contraseña');
  }
});

// GET /auth/preguntas
// Para la pantalla donde el usuario elige su pregunta de seguridad
router.get('/preguntas', async (req, res) => {
  try {
    res.json(await cuentas.listarPreguntas());
  } catch (error) {
    responderError(res, error, 'No se pudieron consultar las preguntas');
  }
});

// GET /auth/yo  (necesita token)
// Devuelve los datos guardados dentro del token
router.get('/yo', verificarToken, (req, res) => {
  res.json(req.usuario);
});

// PUT /auth/palabra-clave  (necesita token)
// Recibe: { "contrasena_actual": "...", "palabra_clave": "...", "id_pregunta": 1 }
// id_pregunta es opcional: si no viene, se usa la primera pregunta.
router.put('/palabra-clave', verificarToken, async (req, res) => {
  try {
    const resultado = await cuentas.guardarPalabraClave(
      req.usuario, req.body.contrasena_actual, req.body.palabra_clave, req.body.id_pregunta);
    res.json(resultado);
  } catch (error) {
    responderError(res, error, 'No se pudo guardar la palabra clave');
  }
});

// PUT /auth/contrasena  (necesita token)
// Recibe: { "contrasena_actual": "...", "contrasena_nueva": "..." }
router.put('/contrasena', verificarToken, async (req, res) => {
  try {
    const resultado = await cuentas.cambiarContrasena(
      req.usuario, req.body.contrasena_actual, req.body.contrasena_nueva);
    res.json(resultado);
  } catch (error) {
    responderError(res, error, 'No se pudo cambiar la contraseña');
  }
});

module.exports = router;