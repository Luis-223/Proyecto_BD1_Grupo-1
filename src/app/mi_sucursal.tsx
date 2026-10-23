// =============================================================
// mi_sucursal.tsx — LA SUCURSAL DEL CLIENTE
// Mapa del municipio donde está su sucursal, sus datos y accesos rápidos.
// Datos desde la base: GET /cliente/sucursales (la que tiene es_mia).
// =============================================================

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,Image
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import MapaSucursales, { abrirComoLlegar } from '@/components/mapa-sucursales';
import { listarSucursales } from './conexion';
import type { Sucursal } from './conexion';

export default function MiSucursal() {
  const router = useRouter();
  const [sucursal, setSucursal] = useState<Sucursal | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const todas = await listarSucursales();
      const mia = todas.find((s) => s.es_mia) ?? null;
      setSucursal(mia);
      if (!mia) setError('No encontramos tu sucursal. Acércate a recepción para revisarlo.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar tu sucursal.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color="#00E676" />
        <Text style={styles.textoCargando}>Cargando tu sucursal...</Text>
      </View>
    );
  }

  const lugar = sucursal ? [sucursal.municipio, sucursal.departamento].filter(Boolean).join(', ') : '';

  return (
    <ScrollView style={styles.fondo} contentContainerStyle={styles.container}>
       <Image source={require('../../assets/images/Banner.jpeg')} style={styles.logo} />
      {error !== '' && (
        <Pressable style={styles.cajaError} onPress={cargar}>
          <Text style={styles.textoError}>{error}</Text>
          <Text style={styles.textoErrorSub}>Toca aquí para intentar de nuevo.</Text>
        </Pressable>
      )}

      {sucursal && (
        <>
          <Text style={styles.nombre}>{sucursal.nombre}</Text>
          {lugar ? (
            <View style={styles.filaLugar}>
              <MaterialCommunityIcons name="map-marker" size={16} color="#00E676" />
              <Text style={styles.lugar}>{lugar}</Text>
            </View>
          ) : null}

          {/* Mapa del municipio (se puede mover y acercar) */}
          <View style={{ marginTop: 14 }}>
            <MapaSucursales sucursales={[{ ...sucursal, es_mia: true }]} alto={280} interactivo />
          </View>

          {/* Datos */}
          <View style={styles.tarjeta}>
            <Dato icono="map-marker-outline" etiqueta="Dirección" valor={sucursal.direccion || 'Sin dirección registrada'} />
            <Dato icono="phone-outline" etiqueta="Teléfono" valor={sucursal.telefono || 'Sin teléfono registrado'} />
          </View>

          <View style={styles.filaNumeros}>
            <Numero valor={sucursal.entrenadores} etiqueta="Entrenadores" />
            <Numero valor={sucursal.clases_semana} etiqueta="Clases esta semana" />
            <Numero valor={sucursal.miembros} etiqueta="Miembros" />
          </View>

         
        </>
      )}
    </ScrollView>
  );
}

function Dato({ icono, etiqueta, valor }: { icono: string; etiqueta: string; valor: string }) {
  return (
    <View style={styles.dato}>
      <MaterialCommunityIcons name={icono as any} size={20} color="#00E676" />
      <View style={{ flex: 1 }}>
        <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
        <Text style={styles.datoValor}>{valor}</Text>
      </View>
    </View>
  );
}

function Numero({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <View style={styles.numero}>
      <Text style={styles.numeroValor}>{valor}</Text>
      <Text style={styles.numeroEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#020700' },
  container: { flexGrow: 1, padding: 20, paddingTop: 48, paddingBottom: 40 },
  logo: { width: 150, height: 100, alignSelf: 'auto', marginBottom: 5, resizeMode: 'contain' },
  centro: { flex: 1, backgroundColor: '#020700', justifyContent: 'center', alignItems: 'center' },
  textoCargando: { color: '#ffffff', marginTop: 10 },

  botonRegresar: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  textoRegresar: { color: '#00E676', fontSize: 14, fontWeight: 'bold' },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#ffffff', marginBottom: 14 },

  nombre: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  filaLugar: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  lugar: { color: '#00E676', fontSize: 14 },

  tarjeta: { backgroundColor: '#162216', borderRadius: 14, padding: 14, marginTop: 14, borderWidth: 1, borderColor: '#223822', gap: 12 },
  dato: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  datoEtiqueta: { color: '#9a9a9a', fontSize: 12 },
  datoValor: { color: '#ffffff', fontSize: 15, marginTop: 2 },

  filaNumeros: { flexDirection: 'row', gap: 8, marginTop: 12 },
  numero: { flex: 1, backgroundColor: '#0E170E', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#1F331F' },
  numeroValor: { color: '#00E676', fontSize: 22, fontWeight: 'bold' },
  numeroEtiqueta: { color: '#9a9a9a', fontSize: 11, marginTop: 2, textAlign: 'center' },

  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 16 },
  boton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 10, paddingVertical: 12, borderWidth: 1, borderColor: '#00E676', minHeight: 46,
  },
  botonPrincipal: { backgroundColor: '#00E676' },
  textoBoton: { color: '#00E676', fontWeight: 'bold', fontSize: 15 },
  textoBotonPrincipal: { color: '#020700', fontWeight: 'bold', fontSize: 15 },

  enlace: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1F331F', marginTop: 6,
  },
  textoEnlace: { color: '#ffffff', fontSize: 15 },

  cajaError: { backgroundColor: '#2a0f0f', borderColor: '#FF5252', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  textoError: { color: '#ffffff', fontSize: 14 },
  textoErrorSub: { color: '#cccccc', fontSize: 12, marginTop: 2 },
});
