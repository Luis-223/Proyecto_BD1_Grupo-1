// =============================================================
// server.js — ARCHIVO PRINCIPAL DEL SERVIDOR
// =============================================================
require('dotenv').config(); // 1. Cargar el .env ANTES que todo lo demás

// HERRAMIENTAS
const express = require('express'); // El servidor web
const cors = require('cors'); // Permite que la app (otro dispositivo) se conecte
const http = require('http'); // Socket.io necesita el servidor http "puro"
const { Server } = require('socket.io'); // Tiempo real
const { conectar } = require('./db');
const { configurarSocket } = require('./socket');

// Sin la clave para firmar tokens el login no puede funcionar
if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en el archivo .env. Agrégala y vuelve a arrancar.');
  process.exit(1);
}

// CREAR EL SERVIDOR
const app = express();

// MIDDLEWARES DE LECTURA Y SEGURIDAD
app.use(cors()); // Aceptar peticiones de la app móvil
app.use(express.json()); // Entender datos JSON
app.use(express.text({ type: ['text/plain', 'text/*'] })); // OPTIMIZACIÓN: Permite procesar de inmediato las tramas de texto

// OPTIMIZACIÓN DE RESPUESTA RÁPIDA EN TRAMAS (Evita delay de socket/Keep-Alive)
app.use('/trama', (req, res, next) => {
  res.setHeader('Connection', 'close'); // Fuerza el cierre del canal al responder
  if (req.socket) {
    req.socket.setNoDelay(true); // Desactiva el algoritmo de Nagle para despacho inmediato de bytes TCP
  }
  next();
});

const servidorHttp = http.createServer(app);
const io = new Server(servidorHttp, { cors: { origin: '*' } });
configurarSocket(io);
app.set('io', io); // Así las rutas pueden mandar avisos en tiempo real

// RUTAS DE PRUEBA
// GET / -> Confirma que el servidor está encendido
app.get('/', (req, res) => {
  res.send('¡El servidor de FitManager está funcionando!');
});

// GET /salud -> Confirma que el servidor llega a la base de datos
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

// RUTAS DE CADA SECCIÓN
app.use('/trama', require('./rutas/trama')); // TRAMAS: lo que usa la app (FM|1|...)
app.use('/auth', require('./rutas/auth')); // Inicio de sesión y palabra clave
app.use('/cliente', require('./rutas/cliente')); // Membresía, rutinas, metas, notificaciones
app.use('/clases', require('./rutas/clases')); // Clases grupales e inscripción

// ERRORES GENERALES
// Ruta que no existe
app.use((req, res) => {
  res.status(404).json({ error: `No existe la ruta ${req.method} ${req.originalUrl}` });
});

// JSON o formato mal escrito
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El formato de los datos enviados no es válido' });
  }
  console.error(error);
  res.status(500).json({ error: 'Error inesperado en el servidor' });
});

// ENCENDER EL SERVIDOR Y PRECALENTAR CONEXIÓN A BASE DE DATOS
const PUERTO = Number(process.env.PORT) || 3000;
// En la PC: 0.0.0.0 (el teléfono se conecta por la red local)
// En el servidor: HOST=127.0.0.1 (solo Apache llega a Node; desde internet se entra por HTTPS)
const HOST = process.env.HOST || '0.0.0.0';

async function arrancarServidor() {
  try {
    // Inicializar pool de base de datos desde el arranque
    await conectar();
    console.log('Conexión inicial a la Base de Datos establecida.');

    servidorHttp.listen(PUERTO, HOST, () => {
      console.log(`Servidor FitManager corriendo en http://${HOST}:${PUERTO}`);
    });
  } catch (err) {
    console.error('Error al conectar a la Base de Datos al iniciar:', err);
    // Arrancar el servidor HTTP aun si falla la BD para permitir diagnóstico
    servidorHttp.listen(PUERTO, HOST, () => {
      console.log(`Servidor iniciado en puerto ${PUERTO} (Sin conexión a BD)`);
    });
  }
}

arrancarServidor();