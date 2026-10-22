// servicios/ubicaciones.js — COORDENADAS DE LAS SUCURSALES PARA LOS MAPAS
// Si una sucursal tiene municipio pero no latitud/longitud, se busca el
// centro de ese municipio en OpenStreetMap (Nominatim) UNA sola vez y se
// guarda en la base (usp_App_GuardarUbicacionSucursal). Después ya no se
// vuelve a consultar: la base sirve de caché.
//
// Reglas de uso de Nominatim que se respetan aquí:
//   - máximo 1 consulta por segundo (se hacen una por una, con pausa)
//   - User-Agent que identifica a la app
//   - se puede apagar sin tocar el código: GEOCODIFICAR=no en el .env
//
// Si escribes a mano las coordenadas de una sucursal, nunca se tocan.

const { sql, conectar } = require('../db');

const URL_NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const AGENTE = 'FitManager/1.0 (app de gimnasio, proyecto universitario Grupo 1)';
const PAUSA_MS = 1100;           // > 1 s entre consultas
const ESPERA_MS = 6000;          // tiempo máximo por consulta
const MAXIMO_POR_PEDIDO = 5;     // para no demorar mucho la respuesta a la app
const REINTENTAR_EN_MS = 24 * 60 * 60 * 1000; // si no se encontró, no repetir en 24 h

const intentadas = new Map();    // id_sucursal -> momento del último intento fallido
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let ultimaConsulta = 0;

async function buscarCoordenadas(municipio, departamento) {
  // Respetar 1 consulta por segundo aunque lleguen varios pedidos seguidos
  const falta = ultimaConsulta + PAUSA_MS - Date.now();
  if (falta > 0) await esperar(falta);
  ultimaConsulta = Date.now();

  const parametros = new URLSearchParams({
    q: [municipio, departamento, 'Guatemala'].filter(Boolean).join(', '),
    format: 'json',
    limit: '1',
    countrycodes: 'gt',
  });

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ESPERA_MS);
  try {
    const respuesta = await fetch(`${URL_NOMINATIM}?${parametros}`, {
      headers: { 'User-Agent': AGENTE, 'Accept-Language': 'es' },
      signal: control.signal,
    });
    if (!respuesta.ok) return null;
    const [lugar] = await respuesta.json();
    if (!lugar) return null;
    const latitud = Number(lugar.lat);
    const longitud = Number(lugar.lon);
    return Number.isFinite(latitud) && Number.isFinite(longitud) ? { latitud, longitud } : null;
  } catch {
    return null; // sin internet, tiempo agotado, etc.: el mapa simplemente no se muestra
  } finally {
    clearTimeout(temporizador);
  }
}

// Recibe las filas de usp_App_ListarSucursales y completa (y guarda) las que
// tienen municipio pero no coordenadas. Modifica las filas recibidas.
async function completarUbicaciones(sucursales) {
  if (String(process.env.GEOCODIFICAR || '').toLowerCase() === 'no') return sucursales;

  const pendientes = sucursales
    .filter((s) => (s.latitud === null || s.longitud === null) && s.municipio)
    .filter((s) => !intentadas.has(s.id_sucursal) || Date.now() - intentadas.get(s.id_sucursal) > REINTENTAR_EN_MS)
    .slice(0, MAXIMO_POR_PEDIDO);

  for (const s of pendientes) {
    const punto = await buscarCoordenadas(s.municipio, s.departamento);
    if (!punto) {
      intentadas.set(s.id_sucursal, Date.now());
      continue;
    }
    try {
      const pool = await conectar();
      await pool.request()
        .input('id_sucursal', sql.Int, s.id_sucursal)
        .input('latitud', sql.Decimal(9, 6), punto.latitud)
        .input('longitud', sql.Decimal(9, 6), punto.longitud)
        .execute('usp_App_GuardarUbicacionSucursal');
      s.latitud = punto.latitud;
      s.longitud = punto.longitud;
      intentadas.delete(s.id_sucursal);
    } catch (error) {
      console.error(`[UBICACIONES] No se pudo guardar la ubicación de la sucursal ${s.id_sucursal}:`, error.message);
      intentadas.set(s.id_sucursal, Date.now());
    }
  }
  return sucursales;
}

module.exports = { completarUbicaciones };
