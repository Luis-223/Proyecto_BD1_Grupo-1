import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

// La pantalla de carga nativa (fondo oscuro + logo de app.json) se queda
// hasta que la app está lista; luego se oculta.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // CAMBIO: antes aquí estaba <AnimatedSplashOverlay /> de la plantilla de Expo.
  // Esa animación es la pantalla celeste con el logo blanco de Expo (la "^")
  // que salía antes de entrar. Se quitó; ahora solo se oculta la pantalla de
  // carga cuando la app ya dibujó la primera pantalla.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* CAMBIO: Stack en vez de Slot. Slot solo muestra la pantalla actual y no guarda
          historial, así que router.back() y el botón atrás del teléfono no tenían a
          dónde regresar. headerShown: false deja las pantallas sin barra superior, como antes. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#020700' } }} />
    </ThemeProvider>
  );
}
