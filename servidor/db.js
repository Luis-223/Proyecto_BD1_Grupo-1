// db.js
const sql = require('mssql');   // la librería que instalamos

// Configuración de conexión, usando los datos del .env (nunca escritos aquí directo)
const config = {
  user: process.env.DB_USER,           // usuario que creamos: app_backend
  password: process.env.DB_PASSWORD,   // la contraseña que le pusiste
  server: process.env.DB_SERVER,       // ej: 'localhost' o 'NOMBREPC\\SQLEXPRESS'
  database: process.env.DB_NAME,       // nombre de tu base de datos
  options: {
    encrypt: false,               // en desarrollo local normalmente no hace falta
    trustServerCertificate: true, // necesario para conexiones locales sin certificado
  },
};

// Esta función abre la conexión y la deja lista para usarse en cualquier parte del código
async function conectar() {
  try {
    const pool = await sql.connect(config); // "pool" = grupo de conexiones reutilizables
    console.log('Conectado a SQL Server correctamente');
    return pool;
  } catch (error) {
    console.error('Error al conectar a SQL Server:', error);
  }
}

module.exports = { conectar, sql };