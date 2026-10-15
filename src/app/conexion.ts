// =============================================================
// conexion.ts — MANDAR TRAMAS AL SERVIDOR
// Busca solo la dirección del servidor:
//   - En el navegador (npm run web): usa el mismo equipo (localhost).
//   - En el celular con Expo Go: usa la IP de la PC donde corre Expo,
//     que es la misma PC donde corre el servidor.
// Si el servidor está en OTRA PC, escriban su IP en IP_SERVIDOR_FIJA.
// =============================================================

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { construirLoginReq, leerLoginRes, nuevoIdMensaje, RespuestaLogin } from './trama';

const PUERTO_SERVIDOR = 3000; // el puerto del servidor (PORT en su .env)
const IP_SERVIDOR_FIJA = ''; // ej. '192.168.1.25'. Vacío = detectar sola
const ESPERA_MAXIMA_MS = 10000; // 10 segundos sin respuesta = error

function hostDelServidor(): string {
  if (IP_SERVIDOR_FIJA) return IP_SERVIDOR_FIJA;
  // Navegador: el servidor está en la misma PC
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.hostname;
  // Expo Go: hostUri se ve como "192.168.1.10:8081" -> nos quedamos con la IP
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return hostUri.split(':')[0];
  return 'localhost';
}

export const URL_SERVIDOR = `http://${hostDelServidor()}:${PUERTO_SERVIDOR}/trama`;

async function enviarTrama(trama: string): Promise<string> {
  // Si el servidor no responde en 10 segundos, se cancela
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ESPERA_MAXIMA_MS);
  try {
    const respuesta = await fetch(URL_SERVIDOR, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: trama,
      signal: control.signal,
    });
    return await respuesta.text();
  } finally {
    clearTimeout(temporizador);
  }
}

export async function loginPorTrama(alias: string, contrasena: string): Promise<RespuestaLogin> {
  const id = nuevoIdMensaje();
  const trama = construirLoginReq(alias, contrasena, id);
  const textoRespuesta = await enviarTrama(trama);
  const res = leerLoginRes(textoRespuesta);
  if (res.idMensaje !== id) throw new Error('La respuesta no corresponde a la solicitud');
  return res;
}
