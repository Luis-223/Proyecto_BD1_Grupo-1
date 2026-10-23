// =============================================================
// sucursales.tsx — TODAS LAS SUCURSALES
//   Una publicación por sucursal: cabecera con su nombre y municipio
//   y el mapa de su municipio. La sucursal del cliente lleva el anillo verde.
// Datos desde la base: GET /cliente/sucursales
// =============================================================

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import MapaSucursales from '@/components/mapa-sucursales';
import { listarSucursales } from './conexion';
import type { Sucursal } from './conexion';

const lugarDe = (s: Sucursal) => [s.municipio, s.departamento].filter(Boolean).join(', ');

export default function Sucursales() {
  const { width } = useWindowDimensions();

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true); else setCargando(true);
    setError('');
    try {
      setSucursales(await listarSucursales());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las sucursales.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color="#00E676" />
        <Text style={styles.textoCargando}>Cargando sucursales...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.fondo}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} tintColor="#00E676" colors={['#00E676']} />}
    >
      {error !== '' && (
        <Pressable style={styles.cajaError} onPress={() => cargar()}>
          <Text style={styles.textoError}>{error}</Text>
          <Text style={styles.textoErrorSub}>Toca aquí para intentar de nuevo.</Text>
        </Pressable>
      )}
      <Image source={require('../../assets/images/Banner.jpeg')} style={styles.logo} />

      {/* Una publicación por sucursal */}
      {sucursales.map((s) => (
        <View key={s.id_sucursal} style={styles.publicacion}>
          <Cabecera
            titulo={s.nombre}
            subtitulo={lugarDe(s) || 'Guatemala'}
            letra={s.nombre.charAt(0).toUpperCase()}
            esMia={s.es_mia}
          />
          <MapaSucursales sucursales={[s]} alto={width} redondeado={false} />
        </View>
      ))}
    </ScrollView>
  );
}

function Cabecera({ titulo, subtitulo, letra, esMia }: { titulo: string; subtitulo: string; letra: string; esMia: boolean }) {
  return (
    <View style={styles.cabecera}>
      <View style={[styles.anilloChico, esMia ? styles.anilloMio : null]}>
        <View style={styles.circuloChico}>
          <Text style={styles.letraChica}>{letra}</Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.usuario} numberOfLines={1}>{titulo}</Text>
        <Text style={styles.ubicacion} numberOfLines={1}>{subtitulo}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#000000' },
  container: { flexGrow: 1, paddingTop: 44, paddingBottom: 30 },
  centro: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  textoCargando: { color: '#ffffff', marginTop: 10 },
  logo: { width: 150, height: 100, alignSelf: 'auto', marginBottom: 5, resizeMode: 'contain' },

  publicacion: { marginTop: 10, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#262626' },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  anilloChico: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#5eb4ff', alignItems: 'center', justifyContent: 'center' },
  anilloMio: { borderColor: '#00E676' },
  circuloChico: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1C2E1C', alignItems: 'center', justifyContent: 'center' },
  letraChica: { color: '#00E676', fontSize: 14, fontWeight: 'bold' },
  usuario: { color: '#ffffff', fontSize: 14, fontWeight: 'bold' },
  ubicacion: { color: '#d0d0d0', fontSize: 12 },

  cajaError: { backgroundColor: '#2a0f0f', borderColor: '#FF5252', borderWidth: 1, borderRadius: 10, padding: 12, margin: 12 },
  textoError: { color: '#ffffff', fontSize: 14 },
  textoErrorSub: { color: '#cccccc', fontSize: 12, marginTop: 2 },
});
