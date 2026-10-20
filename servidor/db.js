
require('dotenv').config(); // lee los datos del archivo .env
const sql = require('mssql'); // librería para hablar con SQL Server

// DATOS DE CONEXIÓN (salen del .env, nunca escritos aquí)
const configuracion = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER, // 'localhost'
  database: process.env.DB_NAME, // 'FitManager'
  port: Number(process.env.DB_PORT) || 1433,
  // La base gratuita de Azure se "duerme" si nadie la usa y tarda hasta
  // un minuto en despertar: se espera 60 s antes de dar error
  connectionTimeout: Number(process.env.DB_CONNECTION_TIMEOUT) || 60000,
  requestTimeout: 30000,
  options: {
    // En la PC: DB_ENCRYPT vacío o false (red local, sin cifrar)
    // En Azure SQL: DB_ENCRYPT=true (Azure exige conexión cifrada)
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_ENCRYPT !== 'true', // solo se confía a ciegas en la PC propia
    useUTC: false, // las fechas de la base están en hora de Guatemala, no en hora universal
  },
  pool: {
    max: 10, // hasta 10 conexiones a la vez
    min: 0,
    idleTimeoutMillis: 30000, // cierra las que no se usan en 30 segundos
  },
};


// CONECTAR
// La primera vez abre la conexión; las siguientes devuelve la misma.
// Si falla, la olvida para volver a intentarlo en la próxima petición.
let conexion = null;

function conectar() {
  if (!conexion) {
    conexion = new sql.ConnectionPool(configuracion)
      .connect()
      .then((pool) => {
        console.log('Conectado a SQL Server, base:', configuracion.database);
        return pool;
      })
      .catch((error) => {
        conexion = null; // para reintentar la próxima vez
        throw error;
      });
  }
  return conexion;
}


// RESPONDER ERRORES DE LA BASE DE DATOS
// Los procedimientos del equipo de BD usan THROW con números
// 50000 o más y un mensaje claro (ej: "La clase ya no tiene cupo.").
// Esos mensajes se pasan tal cual a la app. Cualquier otro error
// se muestra en la terminal y la app recibe un mensaje general.
function responderErrorSql(res, error, mensajeGeneral) {
  if (error && error.number >= 50000) {
    return res.status(400).json({ error: error.message });
  }
  console.error(error);
  return res.status(500).json({ error: mensajeGeneral });
}

module.exports = { sql, conectar, responderErrorSql };