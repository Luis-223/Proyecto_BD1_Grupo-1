// =============================================================
// sucursales.tsx — TODAS LAS SUCURSALES, ESTILO INSTAGRAM
//   - Arriba, "historias": un círculo por sucursal; al tocarlo baja a su publicación
//   - Primera publicación: mapa con todos los municipios donde hay sucursales
//   - Una publicación por sucursal: mapa de su municipio, acciones
//     (favorita, llamar, cómo llegar, compartir) y su descripción
// Datos desde la base: GET /cliente/sucursales
// =============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text,
  TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapaSucursales, { abrirComoLlegar } from '@/components/mapa-sucursales';
import { listarSucursales } from './conexion';
import type { Sucursal } from './conexion';

const LLAVE_FAVORITAS = '@sucursales_favoritas';
const lugarDe = (s: Sucursal) => [s.municipio, s.departamento].filter(Boolean).join(', ');

export default function Sucursales() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scroll = useRef<any>(null);
  const posiciones = useRef<Record<number, number>>({}); // id_sucursal -> posición de su publicación

  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [favoritas, setFavoritas] = useState<number[]>([]);

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

  useEffect(() => {
    cargar();
    // Las favoritas se guardan solo en este teléfono
    AsyncStorage.getItem(LLAVE_FAVORITAS)
      .then((texto) => { if (texto) setFavoritas(JSON.parse(texto)); })
      .catch(() => {});
  }, [cargar]);

  const alternarFavorita = (id: number) => {
    const nuevas = favoritas.includes(id) ? favoritas.filter((f) => f !== id) : [...favoritas, id];
    setFavoritas(nuevas);
    AsyncStorage.setItem(LLAVE_FAVORITAS, JSON.stringify(nuevas)).catch(() => {});
  };

  const compartir = (s: Sucursal) => {
    const ubicacion = s.latitud !== null && s.longitud !== null
      ? `\nhttps://www.google.com/maps/search/?api=1&query=${s.latitud},${s.longitud}` : '';
    Share.share({
      message: `FitManager ${s.nombre}${lugarDe(s) ? ` — ${lugarDe(s)}` : ''}`
        + `${s.direccion ? `\n${s.direccion}` : ''}${s.telefono ? `\nTel. ${s.telefono}` : ''}${ubicacion}`,
    }).catch(() => {});
  };

  const irA = (id: number) => {
    const y = posiciones.current[id];
    if (y !== undefined) scroll.current?.scrollTo({ y: y - 8, animated: true });
  };

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color="#00E676" />
        <Text style={styles.textoCargando}>Cargando sucursales...</Text>
      </View>
    );
  }

  const municipios = Array.from(new Set(sucursales.map((s) => s.municipio).filter(Boolean)));
  const totalMiembros = sucursales.reduce((suma, s) => suma + s.miembros, 0);

  return (
    <ScrollView
      ref={scroll}
      style={styles.fondo}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} tintColor="#00E676" colors={['#00E676']} />}
    >
      {/* Barra superior */}
      <View style={styles.barra}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/perfil'))} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.marca}>Fit<Text style={{ color: '#00E676' }}>Manager</Text></Text>
        <View style={{ width: 24 }} />
      </View>

      {error !== '' && (
        <Pressable style={styles.cajaError} onPress={() => cargar()}>
          <Text style={styles.textoError}>{error}</Text>
          <Text style={styles.textoErrorSub}>Toca aquí para intentar de nuevo.</Text>
        </Pressable>
      )}

      {/* Historias */}
      {sucursales.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.historias} contentContainerStyle={styles.historiasContenido}>
          {sucursales.map((s) => (
            <Pressable key={s.id_sucursal} style={styles.historia} onPress={() => irA(s.id_sucursal)}>
              <View style={[styles.anillo, s.es_mia && styles.anilloMio]}>
                <View style={styles.circulo}>
                  <Text style={styles.letra}>{s.nombre.charAt(0).toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.textoHistoria} numberOfLines={1}>{s.es_mia ? 'Tu sucursal' : (s.municipio || s.nombre)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Publicación 1: mapa con todos los municipios */}
      {sucursales.length > 0 && (
        <View style={styles.publicacion}>
          <Cabecera titulo="FitManager" subtitulo="Guatemala" letra="F" />
          <MapaSucursales sucursales={sucursales} alto={width} redondeado={false} />
          <View style={styles.cuerpo}>
            <Text style={styles.metricas}>
              {sucursales.length} {sucursales.length === 1 ? 'sucursal' : 'sucursales'} · {totalMiembros} miembros
            </Text>
            <Text style={styles.descripcion}>
              <Text style={styles.negrita}>FitManager </Text>
              {municipios.length > 0
                ? `Estamos en ${municipios.length} ${municipios.length === 1 ? 'municipio' : 'municipios'}: ${municipios.join(', ')}.`
                : 'Conoce todas nuestras sucursales.'}
            </Text>
          </View>
        </View>
      )}

      {/* Una publicación por sucursal */}
      {sucursales.map((s) => {
        const favorita = favoritas.includes(s.id_sucursal);
        return (
          <View
            key={s.id_sucursal}
            style={styles.publicacion}
            onLayout={(e: LayoutChangeEvent) => { posiciones.current[s.id_sucursal] = e.nativeEvent.layout.y; }}
          >
            <Cabecera
              titulo={s.nombre}
              subtitulo={lugarDe(s) || 'Guatemala'}
              letra={s.nombre.charAt(0).toUpperCase()}
              insignia={s.es_mia ? 'Tu sucursal' : undefined}
            />

            <MapaSucursales sucursales={[s]} alto={width} redondeado={false} />

            {/* Acciones */}
            <View style={styles.acciones}>
              <TouchableOpacity onPress={() => alternarFavorita(s.id_sucursal)} hitSlop={8}>
                <Ionicons name={favorita ? 'heart' : 'heart-outline'} size={27} color={favorita ? '#FF3B5C' : '#ffffff'} />
              </TouchableOpacity>
              {s.telefono ? (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${s.telefono}`)} hitSlop={8}>
                  <Ionicons name="call-outline" size={25} color="#ffffff" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => abrirComoLlegar(s)} hitSlop={8}>
                <Ionicons name="navigate-outline" size={25} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => compartir(s)} hitSlop={8}>
                <Ionicons name="paper-plane-outline" size={25} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <View style={styles.cuerpo}>
              <Text style={styles.metricas}>
                {s.miembros} miembros · {s.entrenadores} {s.entrenadores === 1 ? 'entrenador' : 'entrenadores'} · {s.clases_semana} {s.clases_semana === 1 ? 'clase' : 'clases'} esta semana
              </Text>
              <Text style={styles.descripcion}>
                <Text style={styles.negrita}>{s.nombre} </Text>
                {s.direccion || 'Dirección por confirmar.'}
              </Text>
              {s.telefono ? <Text style={styles.detalle}>📞 {s.telefono}</Text> : null}
              {s.es_mia ? (
                <TouchableOpacity onPress={() => router.push('/mi_sucursal')}>
                  <Text style={styles.verMas}>Ver más de tu sucursal</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}

      {sucursales.length > 0 && (
        <Text style={styles.atribucion}>Ubicación aproximada por municipio · datos de © OpenStreetMap</Text>
      )}
    </ScrollView>
  );
}

function Cabecera({ titulo, subtitulo, letra, insignia }: { titulo: string; subtitulo: string; letra: string; insignia?: string }) {
  return (
    <View style={styles.cabecera}>
      <View style={[styles.anilloChico, insignia ? styles.anilloMio : null]}>
        <View style={styles.circuloChico}>
          <Text style={styles.letraChica}>{letra}</Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.usuario} numberOfLines={1}>{titulo}</Text>
        <Text style={styles.ubicacion} numberOfLines={1}>{subtitulo}</Text>
      </View>
      {insignia ? <Text style={styles.insignia}>{insignia}</Text> : <Ionicons name="ellipsis-horizontal" size={20} color="#ffffff" />}
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#000000' },
  container: { flexGrow: 1, paddingTop: 44, paddingBottom: 30 },
  centro: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  textoCargando: { color: '#ffffff', marginTop: 10 },

  barra: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10 },
  marca: { color: '#ffffff', fontSize: 24, fontWeight: 'bold', fontStyle: 'italic' },

  historias: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#262626' },
  historiasContenido: { paddingHorizontal: 10, paddingVertical: 10, gap: 14 },
  historia: { alignItems: 'center', width: 72 },
  anillo: { width: 68, height: 68, borderRadius: 34, padding: 3, borderWidth: 2, borderColor: '#5eb4ff', alignItems: 'center', justifyContent: 'center' },
  anilloMio: { borderColor: '#00E676' },
  circulo: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1C2E1C', alignItems: 'center', justifyContent: 'center' },
  letra: { color: '#00E676', fontSize: 22, fontWeight: 'bold' },
  textoHistoria: { color: '#ffffff', fontSize: 11, marginTop: 5, maxWidth: 72 },

  publicacion: { marginTop: 10, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#262626' },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  anilloChico: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#5eb4ff', alignItems: 'center', justifyContent: 'center' },
  circuloChico: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1C2E1C', alignItems: 'center', justifyContent: 'center' },
  letraChica: { color: '#00E676', fontSize: 14, fontWeight: 'bold' },
  usuario: { color: '#ffffff', fontSize: 14, fontWeight: 'bold' },
  ubicacion: { color: '#d0d0d0', fontSize: 12 },
  insignia: {
    backgroundColor: '#00E676', color: '#020700', fontSize: 11, fontWeight: 'bold',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden',
  },

  acciones: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 12, paddingTop: 10 },
  cuerpo: { paddingHorizontal: 12, paddingTop: 8, gap: 4 },
  metricas: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  descripcion: { color: '#ffffff', fontSize: 14, lineHeight: 19 },
  negrita: { fontWeight: 'bold' },
  detalle: { color: '#d0d0d0', fontSize: 13 },
  verMas: { color: '#9a9a9a', fontSize: 13, marginTop: 2 },

  atribucion: { color: '#666', fontSize: 11, textAlign: 'center', marginTop: 16 },

  cajaError: { backgroundColor: '#2a0f0f', borderColor: '#FF5252', borderWidth: 1, borderRadius: 10, padding: 12, margin: 12 },
  textoError: { color: '#ffffff', fontSize: 14 },
  textoErrorSub: { color: '#cccccc', fontSize: 12, marginTop: 2 },
});
