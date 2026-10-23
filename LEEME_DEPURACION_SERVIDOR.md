# FitManager — Servidor depurado (octubre 2026)

Este paquete contiene SOLO los archivos del servidor (`servidor/`) que cambiaron al
eliminar código sin uso. Las dos apps (móvil y escritorio) siguen funcionando igual:
solo se quitó lo que ningún cliente llama o que no tiene efecto visible.

## 1. Archivos modificados (reemplazar en servidor/)

| Archivo | Qué se quitó o cambió |
|---|---|
| server.js | Socket.io (http.createServer, Server, configurarSocket, app.set('io')); la montura `/auth`; el `express.text` global (anulaba el límite de 10 KB de `/trama`). Ahora arranca con `app.listen`. |
| db.js | `responderErrorSql` (duplicaba `errores.responderError`); el segundo `require('dotenv').config()` |
| seguridad.js | Exportaciones sin uso `tieneAccesoCompleto` y `MENSAJE_LIMITADO` (la lógica sigue dentro de `soloAccesoCompleto`) |
| errores.js | Sin cambios de código (solo comentario); se incluye para que el paquete quede completo |
| rutas/trama.js | Tramas sin cliente: SESION, PREGUNTAS, PALABRA_CLAVE, CAMBIAR_CLAVE; nombres `tarjeta` y `cvv` del SIGNUP (las posiciones se conservan) |
| rutas/cliente.js | Rutas sin cliente: `/asistencias`, `/notificaciones`, `/notificaciones/:id/leida`; usa `responderError` |
| rutas/clases.js | Ruta `/mias`, parámetro `?sucursal=` (la app nunca lo manda), aviso `clase_actualizada` por Socket.io; usa `responderError` |
| servicios/cuentas.js | `guardarPalabraClave`, `cambiarContrasena`, `listarPreguntas`, `exigirContrasenaActual` (solo los usaban `/auth` y las tramas quitadas) |
| package.json | Quita `socket.io`; agrega `nodemailer` (lo usa servicios/correo.js y no estaba declarado) |

## 2. Archivos a eliminar

- `servidor/socket.js`
- `servidor/rutas/auth.js`
- Carpeta `FitManager-servidor/` (copia antigua del servidor, sin escritorio.js ni servicios nuevos): archivar

## 3. Pasos para aplicarlo en la VM

```
cd /opt/fitmanager/servidor
# copiar los archivos de este paquete encima de los actuales y borrar socket.js y rutas/auth.js
npm uninstall socket.io
npm ls nodemailer          # confirma la versión instalada a mano y ajústala en package.json si difiere
sudo systemctl restart fitmanager
curl -s http://127.0.0.1:3000/salud
```

El archivo de Apache puede quedarse igual (`upgrade=websocket` ya no se usa, pero no estorba).

## 4. Verificación realizada

- `node --check` de cada archivo: sin errores de sintaxis.
- `tsc --allowJs --checkJs --noUnusedLocals`: sin variables, funciones ni imports sin uso, y sin nombres indefinidos.
- Prueba de carga con librerías simuladas: el servidor arranca, registra sus rutas y responde
  LOGIN, PREGUNTA_ALIAS y MEMBRESIA; una trama quitada (SESION, CAMBIAR_CLAVE) responde
  código 05 "Tipo de trama desconocido", igual que cualquier tipo inexistente.

## 5. NO se cambió (documentado como riesgo)

- El registro de la app acepta 7 caracteres y el servidor exige 8.
- Los limitadores de intentos viven en memoria (se reinician con el servicio).
- `usp_ValidarLogin` (SHA-256) se sigue usando para migrar cuentas antiguas: no borrarlo mientras queden hashes viejos.
- Código repetido entre cuentas.js y recuperacion.js (opciones Argon2, `gastarTiempoIgual`, `normalizarPalabra`).
