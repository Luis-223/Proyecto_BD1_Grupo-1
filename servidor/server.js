// server.js

// Cargamos el .env ANTES que todo lo demás
require('dotenv').config();

// Traemos las herramientas que instalamos
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { conectar, sql } = require('./db');
const { enviarCodigoVerificacion } = require('./mailer');

// Creamos la aplicación y el servidor de tiempo real
const app = express();
app.use(express.json()); // entender JSON
app.use(cors());         // permitir que la app del celular se conecte

const servidorHttp = http.createServer(app);
const io = new Server(servidorHttp, { cors: { origin: '*' } });

// Cuando la app se conecta o se desconecta en tiempo real
io.on('connection', (socket) => {
  console.log('Un cliente se conectó:', socket.id);
  socket.on('disconnect', () => {
    console.log('Un cliente se desconectó:', socket.id);
  });
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('¡El servidor está funcionando!');
});

// GET /usuarios: lista de usuarios (sin código ni token, por seguridad)
app.get('/usuarios', async (req, res) => {
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .query('SELECT Id, Nombre, Correo, Verificado FROM Usuarios');
    res.json(resultado.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo consultar la base de datos' });
  }
});

// POST /usuarios: crea un usuario y avisa a la app al instante
app.post('/usuarios', async (req, res) => {
  const { nombre, correo } = req.body;
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('nombre', sql.NVarChar(100), nombre)
      .input('correo', sql.NVarChar(150), correo)
      .query(`INSERT INTO Usuarios (Nombre, Correo)
              OUTPUT INSERTED.Id, INSERTED.Nombre, INSERTED.Correo, INSERTED.Verificado
              VALUES (@nombre, @correo)`);
    const nuevo = resultado.recordset[0];
    io.emit('usuario_nuevo', nuevo); // ← aviso en tiempo real a todas las apps
    res.status(201).json(nuevo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo crear el usuario' });
  }
});

// POST /enviar-codigo: genera un código, lo GUARDA y lo manda por correo
app.post('/enviar-codigo', async (req, res) => {
  const { correo } = req.body;
  const codigo = Math.floor(100000 + Math.random() * 900000).toString();
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('correo', sql.NVarChar(150), correo)
      .input('codigo', sql.NVarChar(6), codigo)
      .query('UPDATE Usuarios SET CodigoVerificacion = @codigo WHERE Correo = @correo');
    if (resultado.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Ese correo no está registrado' });
    }
    await enviarCodigoVerificacion(correo, codigo);
    res.json({ mensaje: 'Código enviado, revisa tu correo' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo enviar el correo' });
  }
});

// POST /verificar-codigo: revisa si el código es correcto
app.post('/verificar-codigo', async (req, res) => {
  const { correo, codigo } = req.body;
  try {
    const pool = await conectar();
    const resultado = await pool.request()
      .input('correo', sql.NVarChar(150), correo)
      .input('codigo', sql.NVarChar(6), String(codigo))
      .query(`UPDATE Usuarios SET Verificado = 1, CodigoVerificacion = NULL
              WHERE Correo = @correo AND CodigoVerificacion = @codigo`);
    if (resultado.rowsAffected[0] === 0) {
      return res.status(400).json({ error: 'Código incorrecto' });
    }
    io.emit('usuario_verificado', { correo }); // ← aviso en tiempo real
    res.json({ mensaje: 'Correo verificado' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo verificar' });
  }
});

// Encendemos el servidor
// '0.0.0.0' = acepta conexiones de otros equipos del WiFi (tu celular)
const PUERTO = process.env.PORT || 3000;
servidorHttp.listen(PUERTO, '0.0.0.0', () => {
  console.log(`Servidor + Socket.io corriendo en http://localhost:${PUERTO}`);
});