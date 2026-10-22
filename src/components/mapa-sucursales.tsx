// =============================================================
// mapa-sucursales.tsx — MAPA CON UNA O VARIAS SUCURSALES
// Lo usan mi_sucursal.tsx (una sucursal, se puede mover) y
// sucursales.tsx (publicaciones estilo Instagram, mapa fijo).
// Usa react-native-maps, que viene incluido en Expo Go:
//   npx expo install react-native-maps
// =============================================================

import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
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

const conUbicacion = (s: PuntoSucursal) =>
  s.latitud !== null && s.longitud !== null && Number.isFinite(s.latitud) && Number.isFinite(s.longitud);

// Región que muestra todos los puntos. Con uno solo, se ve el municipio.
export function regionPara(puntos: { latitud: number; longitud: number }[]) {
  const lats = puntos.map((p) => p.latitud);
  const lngs = puntos.map((p) => p.longitud);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    // Un municipio se ve bien con ~0.08 grados; con varios, se deja margen
    latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.08),
    longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.08),
  };
}

// Abre Google Maps (o el navegador) con la ruta hacia la sucursal
export function abrirComoLlegar(s: PuntoSucursal & { departamento?: string | null }) {
  const destino = conUbicacion(s)
    ? `${s.latitud},${s.longitud}`
    : encodeURIComponent([s.nombre, s.municipio, s.departamento, 'Guatemala'].filter(Boolean).join(', '));
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destino}`);
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

  const region = regionPara(puntos.map((p) => ({ latitud: p.latitud as number, longitud: p.longitud as number })));

  return (
    // pointerEvents="none" en los mapas fijos: así el dedo desplaza la lista y no el mapa
    <View style={[{ height: alto }, redondeado && styles.redondeado, styles.contenedor]} pointerEvents={interactivo ? 'auto' : 'none'}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        scrollEnabled={interactivo}
        zoomEnabled={interactivo}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        // En Android, liteMode dibuja una imagen fija del mapa: mucho más liviano en listas largas
        liteMode={Platform.OS === 'android' && !interactivo}
      >
        {puntos.map((s) => (
          <Marker
            key={s.id_sucursal}
            coordinate={{ latitude: s.latitud as number, longitude: s.longitud as number }}
            title={s.nombre}
            description={s.municipio ?? undefined}
            pinColor={s.es_mia ? 'green' : 'red'}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { overflow: 'hidden', backgroundColor: '#0E170E' },
  redondeado: { borderRadius: 14 },
  sinMapa: {
    backgroundColor: '#0E170E', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: '#1F331F', paddingHorizontal: 20,
  },
  textoSinMapa: { color: '#d0d0d0', fontSize: 14, fontWeight: 'bold' },
  textoSinMapaSub: { color: '#777', fontSize: 12, textAlign: 'center' },
});
