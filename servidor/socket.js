// socket.js — TIEMPO REAL CON SOCKET.IO
// Solo se pueden conectar usuarios con sesión iniciada (token).
// Cada conexión entra a "salas" para recibir solo lo que le toca:
//   - cliente:<id_cliente>   -> avisos personales
//   - sucursal:<id_sucursal> -> avisos de su sucursal (ej: cupos de clases)
//
// En la app se conecta así:
//   io(SERVIDOR, { auth: { token } })

const jwt = require('jsonwebtoken');

function configurarSocket(io) {
  // 1. REVISAR EL TOKEN ANTES DE ACEPTAR LA CONEXIÓN
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Debes iniciar sesión'));
    }
    try {
      socket.usuario = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('La sesión expiró o no es válida'));
    }
  });
   // AL CONECTARSE: ENTRAR A SUS SALAS
  io.on('connection', (socket) => {
    const usuario = socket.usuario;

    if (usuario.id_cliente) socket.join(`cliente:${usuario.id_cliente}`);
    if (usuario.id_sucursal) socket.join(`sucursal:${usuario.id_sucursal}`);

    console.log(`Tiempo real: conectado el usuario ${usuario.id_usuario} (${socket.id})`);

    socket.on('disconnect', () => {
      console.log(`Tiempo real: desconectado el usuario ${usuario.id_usuario}`);
    });
  });
}

module.exports = { configurarSocket };