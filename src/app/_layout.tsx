import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {/* CAMBIO: Stack en vez de Slot. Slot solo muestra la pantalla actual y no guarda
          historial, así que router.back() y el botón atrás del teléfono no tenían a
          dónde regresar. headerShown: false deja las pantallas sin barra superior, como antes. */}
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
