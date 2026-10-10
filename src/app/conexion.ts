import { construirLoginReq, leerLoginRes, nuevoIdMensaje, RespuestaLogin } from './trama';

// Cambien esto por la IP y el puerto reales de su servidor
const URL_SERVIDOR = 'http://192.168.1.50:5000/trama';

async function enviarTrama(trama: string): Promise<string> {
  const respuesta = await fetch(URL_SERVIDOR, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: trama,
  });
  return await respuesta.text();
}

export async function loginPorTrama(alias: string, contrasena: string): Promise<RespuestaLogin> {
  const id = nuevoIdMensaje();
  const trama = construirLoginReq(alias, contrasena, id);
  const textoRespuesta = await enviarTrama(trama);
  const res = leerLoginRes(textoRespuesta);
  if (res.idMensaje !== id) throw new Error('La respuesta no corresponde a la solicitud');
  return res;
}