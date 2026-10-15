// =============================================================
// conexion.ts — MANDAR TRAMAS AL SERVIDOR
// =============================================================

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { construirLoginReq, leerLoginRes, nuevoIdMensaje, RespuestaLogin } from './trama';

const PUERTO_SERVIDOR = 3000; // Puerto del servidor backend
const IP_SERVIDOR_FIJA = '192.168.1.9'; // Tu IP de red Wi-Fi local
const ESPERA_MAXIMA_MS = 30000; // 30 segundos de tiempo límite para desarrollo

function hostDelServidor(): string {
  // 1. Si se definió una IP fija para Wi-Fi y no estamos en web
  if (IP_SERVIDOR_FIJA && Platform.OS !== 'web') {
    return IP_SERVIDOR_FIJA;
  }

  // 2. Navegador Web: el servidor está en la misma máquina
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.hostname;
  }

  // 3. Expo Go (Detecta la IP dinámica proporcionada por Expo)
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    return hostUri.split(':')[0];
  }

  // 4. Emulador de Android estándar por defecto
  if (Platform.OS === 'android') {
    return '10.0.2.2';
  }

  return 'localhost';
}

export const URL_SERVIDOR = `http://${hostDelServidor()}:${PUERTO_SERVIDOR}/trama`;

async function enviarTrama(trama: string): Promise<string> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), ESPERA_MAXIMA_MS);

  try {
    const respuesta = await fetch(URL_SERVIDOR, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: trama,
      signal: control.signal,
    });

    if (!respuesta.ok) {
      throw new Error(`Respuesta del servidor no exitosa (Status: ${respuesta.status})`);
    }

    return await respuesta.text();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Tiempo de espera agotado (${ESPERA_MAXIMA_MS / 1000}s). Verifica que el servidor en ${URL_SERVIDOR} esté activo.`);
    }
    throw new Error(`No se pudo conectar al servidor en ${URL_SERVIDOR}. Verifica la conexión.`);
  } finally {
    clearTimeout(temporizador);
  }
}

export async function loginPorTrama(alias: string, contrasena: string): Promise<RespuestaLogin> {
  const id = nuevoIdMensaje();
  const trama = construirLoginReq(alias, contrasena, id);
  const textoRespuesta = await enviarTrama(trama);
  const res = leerLoginRes(textoRespuesta);

  if (res.idMensaje !== id) {
    throw new Error('La respuesta recibida no corresponde a la solicitud realizada');
  }

  return res;
}