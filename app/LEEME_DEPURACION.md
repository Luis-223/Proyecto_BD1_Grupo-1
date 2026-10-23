# FitManager — Código depurado (octubre 2026)

Este paquete contiene SOLO los archivos que cambiaron al eliminar código sin uso.
Copie cada archivo sobre su ruta original. El comportamiento visible de las apps
NO cambia: solo se quitó código que nunca se ejecutaba o nunca se mostraba.

## 1. Archivos modificados (reemplazar)

| Ruta | Qué se quitó |
|---|---|
| src/app/perfil.tsx | variable `rol` sin uso, estilo `chevronCaja` |
| src/app/mi_entrenador.tsx | `useRouter`/`router`, función `volver`, `totalMios`, 4 estilos del botón regresar |
| src/app/mis_pagos.tsx | `router`, `Ionicons`, `TouchableOpacity`, 3 estilos |
| src/app/mis_metas.tsx | `useRouter`/`router`, 3 estilos |
| src/app/mi_sucursal.tsx | `router`, `Linking`, `TouchableOpacity`, `Ionicons`, import `abrirComoLlegar`, 10 estilos de botones retirados |
| src/app/sucursales.tsx | lógica de favoritas (AsyncStorage), compartir, `irA`, posiciones/onLayout, ref del scroll, `municipios`, `totalMiembros`, ~20 estilos de "historias" y acciones |
| src/app/chat.tsx | parámetro `contenido` de `enviar`, 5 estilos de sugerencias |
| src/app/clases_grupales.tsx | 4 estilos |
| src/app/sign_up.tsx | 3 estilos, `return;` sobrante |
| src/app/entrenamiento.tsx | import `React` por defecto, estilo `segmentoBarra` |
| src/app/mi_rutina.tsx | import `React` por defecto |
| src/components/animated-icon.tsx | `AnimatedIcon`, keyframes, constantes y 4 estilos del logo animado |
| src/components/animated-icon.web.tsx | todo menos `AnimatedSplashOverlay` (devuelve null) |
| src/components/mapa-sucursales.tsx | función exportada `abrirComoLlegar` (ninguna pantalla la usa) |
| package.json | script `reset-project` |
| PRINCIPAL.py (raíz y las 2 copias de EscritorioApp) | `self.id_usuario` y `self.id_sucursal` (el servidor los toma del token) |
| factura_pdf.py (raíz y las 2 copias) | estilo `pie` sin uso |

## 2. Archivos a eliminar

Pantallas muertas (ninguna navegación llega a ellas):
- src/app/start.tsx, src/app/explore.tsx, src/app/recuperar.tsx, src/app/prueba_podo.tsx

Restos de la plantilla de Expo:
- src/components/app-tabs.tsx, app-tabs.web.tsx, external-link.tsx, themed-text.tsx,
  themed-view.tsx, hint-row.tsx, web-badge.tsx, ui/collapsible.tsx, animated-icon.module.css
- src/constants/theme.ts
- src/hooks/use-theme.ts, use-color-scheme.ts, use-color-scheme.web.ts
- src/global.css
- scripts/reset-project.js

Imágenes sin referencia:
- assets/images/expo-badge.png, expo-badge-white.png, react-logo.png, react-logo@2x.png,
  react-logo@3x.png, tutorial-web.png, logo-glow.png, Logo.jpeg, Logo_.png, splash-icon.jpeg,
  assets/images/tabIcons/ (carpeta completa)

Carpetas que no forman parte de la entrega (mover a un archivo histórico):
- app/ (prototipo nativo Kotlin "GymApp")
- FitManager-servidor/ (copia antigua del servidor; la vigente es servidor/)

## 3. Dependencias candidatas a quitar (verificar antes con `npx expo install --check`)
lodash, @types/lodash, @expo/ui, expo-glass-effect, expo-device, expo-status-bar,
expo-symbols, expo-web-browser

## 4. Verificación realizada
- `tsc --noEmit --noUnusedLocals` sobre src/app y src/components: 0 avisos de código sin uso.
- Script propio de estilos (StyleSheet.create): 0 estilos sin uso.
- `python -m py_compile` de PRINCIPAL.py y factura_pdf.py: correcto.
- Análisis AST de Python: sin imports, variables ni atributos sin uso.

## 5. NO se cambió (documentado como riesgo, requiere decisión del equipo)
- sign_up.tsx acepta contraseñas de 7 caracteres; el servidor exige 8.
- entrenamiento.tsx tiene el usuario 'Spartan223' fijo.
- escritorio.env de las sucursales tiene VERIFICAR_SSL=false y PERMITIR_HTTP=true activos.
- servidor/package.json no declara nodemailer (lo usa servicios/correo.js).
- README.md tiene marcas de conflicto de git sin resolver.
