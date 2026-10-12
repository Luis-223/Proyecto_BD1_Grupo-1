// seguridad.js — TOKENS DE SESIÓN Y LÍMITE DE INTENTOS
// Aquí vive todo lo que protege las rutas:
//   - crear el token cuando alguien inicia sesión
//   - revisar el token en cada petición
//   - permitir ciertas rutas solo a clientes
//   - bloquear un alias después de varios intentos fallidos
const jwt = require('jsonwebtoken'); // crea y revisa los tokens

// CREAR TOKEN
// El token es como un "gafete" firmado por el servidor. La app lo
// guarda y lo manda en cada petición. Dentro lleva quién es la
// persona; nadie puede cambiarlo sin la clave JWT_SECRET del .env.

function crearToken(datos) {
  return jwt.sign(datos, process.env.JWT_SECRET, { expiresIn: '8h' }); // dura 8 horas
}

// VERIFICAR TOKEN (se pone antes de las rutas protegidas)
// La app debe mandar el encabezado:  Authorization: Bearer <token>
// Si el token es válido, sus datos quedan en req.usuario.
function verificarToken(req, res, next) {
  const encabezado = req.headers.authorization || '';
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Debes iniciar sesión' });
  }
  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next(); // todo bien: continúa a la ruta
  } catch {
    return res.status(401).json({ error: 'La sesión expiró o no es válida. Inicia sesión otra vez.' });
  }
}

// SOLO CLIENTES
// Para rutas como "mi membresía": el usuario debe ser cliente del
// gimnasio (tener id_cliente). Se usa DESPUÉS de verificarToken.

function soloClientes(req, res, next) {
  if (!req.usuario || !req.usuario.id_cliente) {
    return res.status(403).json({ error: 'Esta sección es solo para clientes del gimnasio' });
  }
  next();
}

// LÍMITE DE INTENTOS
// Cuenta los intentos fallidos por alias. Después de "maximo"
// fallos, bloquea ese alias "minutos" minutos. Los datos viven en
// la memoria del servidor: si lo reinicias, los contadores se borran.

function crearLimitador({ maximo, minutos }) {
  const registros = new Map(); // alias -> { fallos, bloqueadoHasta }

  return {
    // ¿Está bloqueado? Devuelve los minutos que faltan (0 = no bloqueado)
    minutosBloqueado(alias) {
      const registro = registros.get(alias);
      if (!registro || !registro.bloqueadoHasta) return 0;
      const restante = registro.bloqueadoHasta - Date.now();
      if (restante <= 0) {
        registros.delete(alias); // ya pasó el tiempo: empieza de cero
        return 0;
      }
      return Math.ceil(restante / 60000);
    },
    // Sumar un intento fallido
    registrarFallo(alias) {
      const registro = registros.get(alias) || { fallos: 0, bloqueadoHasta: 0 };
      registro.fallos += 1;
      if (registro.fallos >= maximo) {
        registro.bloqueadoHasta = Date.now() + minutos * 60000;
      }
      registros.set(alias, registro);
    },
    // Si acertó, se borra su contador
    limpiar(alias) {
      registros.delete(alias);
    },
  };
}

module.exports = { crearToken, verificarToken, soloClientes, crearLimitador };