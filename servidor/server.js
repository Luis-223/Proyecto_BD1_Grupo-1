// server.js — ARCHIVO PRINCIPAL DEL SERVIDOR
// Aquí se arma el servidor: se cargan las herramientas, se conectan
// las rutas de cada sección y se enciende en el puerto del .env.
// Las rutas en sí viven en la carpeta "rutas".
require('dotenv').config(); // 1. Cargar el .env ANTES que todo lo demás

// HERRAMIENTAS
const express = require('express'); // el servidor web
const cors = require('cors'); // permite que la app (otro dispositivo) se conecte
const http = require('http'); // Socket.io necesita el servidor http "puro"
const { Server } = require('socket.io'); // tiempo real
const { conectar } = require('./db');
const { configurarSocket } = require('./socket');

// Sin la clave para firmar tokens el login no puede funcionar
if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en el archivo .env. Agrégala y vuelve a arrancar.');
  process.exit(1);
}

//CREAR EL SERVIDOR
const app = express();
app.use(express.json()); // entender datos JSON que manda la app
app.use(cors()); // aceptar peticiones de la app móvil

const servidorHttp = http.createServer(app);
const io = new Server(servidorHttp, { cors: { origin: '*' } });
configurarSocket(io);
app.set('io', io); // así las rutas pueden mandar avisos en tiempo real


//RUTAS DE PRUEBA
// GET /  -> confirma que el servidor está encendido
app.get('/', (req, res) => {
  res.send('¡El servidor de FitManager está funcionando!');
});

// GET /salud -> confirma que el servidor llega a la base de datos
app.get('/salud', async (req, res) => {
  try {
    const pool = await conectar();
    await pool.request().query('SELECT 1 AS ok');
    res.json({ servidor: 'ok', baseDeDatos: 'ok' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ servidor: 'ok', baseDeDatos: 'sin conexión' });
  }
});

//RUTAS DE CADA SECCIÓN (cada archivo está en la carpeta rutas)
app.use('/trama', require('./rutas/trama')); // TRAMAS: lo que usa la app (FM|1|...)
app.use('/auth', require('./rutas/auth')); // inicio de sesión y palabra clave
app.use('/cliente', require('./rutas/cliente')); // membresía, rutinas, metas, notificaciones
app.use('/clases', require('./rutas/clases')); // clases grupales e inscripción

//ERRORES GENERALES
// Ruta que no existe
app.use((req, res) => {
  res.status(404).json({ error: `No existe la ruta ${req.method} ${req.originalUrl}` });
});

// JSON mal escrito o cualquier error no previsto
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El JSON enviado no es válido' });
  }
  console.error(error);
  res.status(500).json({ error: 'Error inesperado en el servidor' });
});

//ENCENDER EL SERVIDOR
// '0.0.0.0' = acepta conexiones de otros equipos de la red (la app)
const PUERTO = Number(process.env.PORT) || 3000;
servidorHttp.listen(PUERTO, '0.0.0.0', () => {
  console.log(`Servidor FitManager corriendo en http://localhost:${PUERTO}`);
});