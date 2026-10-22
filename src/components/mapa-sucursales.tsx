// =============================================================
// mapa-sucursales.tsx — MAPA CON UNA O VARIAS SUCURSALES
// Lo usan mi_sucursal.tsx (una sucursal, se puede mover) y
// sucursales.tsx (publicaciones estilo Instagram, mapa fijo).
//
// CAMBIO: antes usaba react-native-maps (Google Maps). En el APK de Android
// Google Maps exige una clave de API y, sin ella, la app se cerraba al abrir
// el mapa. Ahora el mapa es OpenStreetMap (Leaflet) dentro de un WebView:
// no necesita clave, es gratis y funciona igual en Expo Go y en el APK.
//   npx expo install react-native-webview
// =============================================================

import { Linking, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type PuntoSucursal = {
  id_sucursal: number;
  nombre: string;
  municipio: string | null;
  latitud: number | null;
  longitud: number | null;
  es_mia?: boolean;
};

type Props = {
  sucursales: PuntoSucursal[];
  alto: number;
  interactivo?: boolean; // false = mapa fijo (dentro de listas que se desplazan)
  redondeado?: boolean;
};

// Origen que se informa a OpenStreetMap al pedir el mapa (lo piden sus reglas de uso)
const ORIGEN = 'https://fitmanager.sysmonitor-grupo3.online/';

const conUbicacion = (s: PuntoSucursal) =>
  s.latitud !== null && s.longitud !== null && Number.isFinite(s.latitud) && Number.isFinite(s.longitud);

// Abre Google Maps (o el navegador) con la ruta hacia la sucursal.
// Abrir un enlace no necesita clave de Google.
export function abrirComoLlegar(s: PuntoSucursal & { departamento?: string | null }) {
  const destino = conUbicacion(s)
    ? `${s.latitud},${s.longitud}`
    : encodeURIComponent([s.nombre, s.municipio, s.departamento, 'Guatemala'].filter(Boolean).join(', '));
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destino}`);
}

// Página HTML con Leaflet. Los datos van como JSON; "<" se escapa para que
// un nombre con "</script>" no pueda romper la página.
function paginaMapa(puntos: PuntoSucursal[], interactivo: boolean): string {
  const datos = JSON.stringify(
    puntos.map((p) => ({ lat: p.latitud, lng: p.longitud, nombre: p.nombre, municipio: p.municipio ?? '', mia: !!p.es_mia }))
  ).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #mapa { margin: 0; padding: 0; width: 100%; height: 100%; background: #0E170E; }
  .leaflet-tooltip.etiqueta { background: #020700; color: #fff; border: 1px solid #00E676; border-radius: 6px;
    font: bold 12px sans-serif; padding: 2px 6px; box-shadow: none; }
  .leaflet-tooltip.etiqueta:before { display: none; }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head><body><div id="mapa"></div>
<script>
  var puntos = ${datos};
  var interactivo = ${interactivo ? 'true' : 'false'};
  var mapa = L.map('mapa', {
    zoomControl: interactivo, dragging: interactivo, touchZoom: interactivo, doubleClickZoom: interactivo,
    scrollWheelZoom: false, boxZoom: false, keyboard: false
  });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap'
  }).addTo(mapa);
  var limites = [];
  puntos.forEach(function (p) {
    var color = p.mia ? '#00E676' : '#00B0FF';
    L.circleMarker([p.lat, p.lng], { radius: 10, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 1 })
      .addTo(mapa)
      .bindTooltip(puntos.length > 1 ? (p.municipio || p.nombre) : p.nombre,
                   { permanent: true, direction: 'top', offset: [0, -10], className: 'etiqueta' });
    limites.push([p.lat, p.lng]);
  });
  if (limites.length === 1) mapa.setView(limites[0], 13);         // un municipio
  else mapa.fitBounds(limites, { padding: [40, 40], maxZoom: 12 }); // todas las sucursales
</script>
</body></html>`;
}

export default function MapaSucursales({ sucursales, alto, interactivo = false, redondeado = true }: Props) {
  const puntos = sucursales.filter(conUbicacion);

  if (puntos.length === 0) {
    return (
      <View style={[styles.sinMapa, { height: alto }, redondeado && styles.redondeado]}>
        <MaterialCommunityIcons name="map-marker-question-outline" size={36} color="#555" />
        <Text style={styles.textoSinMapa}>Ubicación pendiente</Text>
        <Text style={styles.textoSinMapaSub}>Falta asignar el municipio de esta sucursal en la base.</Text>
      </View>
    );
  }

  return (
    // pointerEvents="none" en los mapas fijos: así el dedo desplaza la lista y no el mapa
    <View style={[{ height: alto }, redondeado && styles.redondeado, styles.contenedor]} pointerEvents={interactivo ? 'auto' : 'none'}>
      <WebView
        style={styles.web}
        originWhitelist={['*']}
        source={{ html: paginaMapa(puntos, interactivo), baseUrl: ORIGEN }}
        scrollEnabled={false}
        nestedScrollEnabled={interactivo}   // Android: mover el mapa dentro de la pantalla que se desplaza
        setSupportMultipleWindows={false}
        overScrollMode="never"
        // Los enlaces del mapa (por ejemplo, "© OpenStreetMap") se abren en el navegador, no dentro del mapa
        onShouldStartLoadWithRequest={(pedido: { url: string }) => {
          if (pedido.url.startsWith(ORIGEN) || pedido.url === 'about:blank') return true;
          Linking.openURL(pedido.url).catch(() => {});
          return false;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { overflow: 'hidden', backgroundColor: '#0E170E' },
  web: { flex: 1, backgroundColor: '#0E170E' },
  redondeado: { borderRadius: 14 },
  sinMapa: {
    backgroundColor: '#0E170E', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: '#1F331F', paddingHorizontal: 20,
  },
  textoSinMapa: { color: '#d0d0d0', fontSize: 14, fontWeight: 'bold' },
  textoSinMapaSub: { color: '#777', fontSize: 12, textAlign: 'center' },
});
