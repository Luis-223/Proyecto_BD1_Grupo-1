// =============================================================
// clase_detalle.tsx — DETALLE DE UNA CLASE GRUPAL (por ejemplo, Zumba)
// Muestra la clase, su entrenador y las personas inscritas, y permite
// inscribirse o cancelar. Se abre desde clases_grupales.tsx con ?id=
// Datos desde la base: GET /clases/:id
// =============================================================

import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { cancelarClase, detalleClase, inscribirClase } from './conexion';
import type { DetalleClase } from './conexion';
import { fechaClaseLarga, iconoClase } from '@/components/clases-util';

export default function ClaseDetalle() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const idClase = Number(id);

  const [clase, setClase] = useState<DetalleClase | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async (esRefresco = false) => {
    if (!Number.isInteger(idClase) || idClase <= 0) {
      setError('No se indicó qué clase abrir.');
      setCargando(false);
      return;
    }
    if (esRefresco) setRefrescando(true);
    setError('');
    try {
      setClase(await detalleClase(idClase));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la clase.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, [idClase]);

  useEffect(() => { cargar(); }, [cargar]);

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/clases_grupales' as any));

  const inscribir = async () => {
    if (!clase) return;
    if (!clase.incluye_clases) {
      Alert.alert('Requiere membresía Oro', 'Las clases grupales están incluidas en la membresía Oro.', [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Ver membresía', onPress: () => router.push('/mi_membresia') },
      ]);
      return;
    }
    setProcesando(true);
    try {
      await inscribirClase(clase.id_clase);
      await cargar(true);
      Alert.alert('¡Listo!', `Te inscribiste en ${clase.nombre_clase}.`);
    } catch (e) {
      Alert.alert('No se pudo inscribir', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setProcesando(false);
    }
  };

  const cancelar = () => {
    if (!clase) return;
    Alert.alert('Cancelar inscripción', `¿Quieres salirte de ${clase.nombre_clase}? Tu lugar quedará libre.`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          setProcesando(true);
          try {
            await cancelarClase(clase.id_clase);
            await cargar(true);
          } catch (e) {
            Alert.alert('No se pudo cancelar', e instanceof Error ? e.message : 'Intenta de nuevo.');
          } finally {
            setProcesando(false);
          }
        },
      },
    ]);
  };

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color="#00E676" />
        <Text style={styles.textoCargando}>Cargando clase...</Text>
      </View>
    );
  }

  const lleno = !!clase && clase.cupos_disponibles <= 0;
  const porcentaje = clase && clase.cupo_maximo > 0 ? Math.min(100, Math.round((clase.inscritos / clase.cupo_maximo) * 100)) : 0;

  // Texto y estado del botón principal
  let textoBoton = 'Inscribirme';
  let accion: (() => void) | null = inscribir;
  if (clase?.ya_empezo) { textoBoton = 'La clase ya empezó'; accion = null; }
  else if (clase?.ya_inscrito) { textoBoton = 'Cancelar inscripción'; accion = cancelar; }
  else if (lleno) { textoBoton = 'Clase llena'; accion = null; }
  else if (clase && !clase.incluye_clases) { textoBoton = 'Requiere membresía Oro'; }

  return (
    <View style={styles.fondo}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} tintColor="#00E676" colors={['#00E676']} />}
      >
        <TouchableOpacity style={styles.botonRegresar} onPress={volver}>
          <Ionicons name="arrow-back" size={20} color="#00E676" />
          <Text style={styles.textoRegresar}> Volver a clases</Text>
        </TouchableOpacity>

        {error !== '' && (
          <Pressable style={styles.cajaError} onPress={() => cargar()}>
            <Text style={styles.textoError}>{error}</Text>
            <Text style={styles.textoErrorSub}>Toca aquí para intentar de nuevo.</Text>
          </Pressable>
        )}

        {clase && (
          <>
            {/* Encabezado */}
            <View style={styles.encabezado}>
              <View style={styles.iconoGrande}>
                <MaterialCommunityIcons name={iconoClase(clase.nombre_clase) as any} size={38} color="#00E676" />
              </View>
              <Text style={styles.titulo}>{clase.nombre_clase}</Text>
              <Text style={styles.fecha}>{fechaClaseLarga(clase.fecha_hora)}</Text>
              <Text style={styles.sucursal}>Sucursal {clase.sucursal}</Text>
              {clase.ya_inscrito && <Text style={styles.insignia}>Estás inscrito</Text>}
            </View>

            {/* Cupo */}
            <View style={styles.tarjeta}>
              <View style={styles.filaEntre}>
                <Text style={styles.etiqueta}>Cupo</Text>
                <Text style={[styles.valor, lleno && { color: '#FF5252' }]}>
                  {lleno ? 'Sin lugares' : `${clase.cupos_disponibles} ${clase.cupos_disponibles === 1 ? 'lugar disponible' : 'lugares disponibles'}`}
                </Text>
              </View>
              <View style={styles.barraCupo}>
                <View style={[styles.rellenoCupo, { width: `${porcentaje}%` }, lleno && styles.rellenoLleno]} />
              </View>
              <Text style={styles.textoCupo}>{clase.inscritos} de {clase.cupo_maximo} inscritos</Text>
            </View>

            {/* Entrenador */}
            <Text style={styles.seccion}>Entrenador</Text>
            {clase.entrenador ? (
              <View style={styles.tarjeta}>
                <View style={styles.filaPersona}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarLetra}>{clase.entrenador.nombre.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nombre}>{clase.entrenador.nombre}</Text>
                    <Text style={styles.especialidad}>{clase.entrenador.especialidad || 'Entrenamiento general'}</Text>
                    {clase.entrenador.anios_experiencia !== null && (
                      <Text style={styles.detalle}>
                        {clase.entrenador.anios_experiencia < 1
                          ? 'Menos de 1 año de experiencia'
                          : `${clase.entrenador.anios_experiencia} ${clase.entrenador.anios_experiencia === 1 ? 'año' : 'años'} de experiencia`}
                      </Text>
                    )}
                  </View>
                  {clase.entrenador.nivel ? <Text style={styles.badgeNivel}>{clase.entrenador.nivel}</Text> : null}
                </View>
                <TouchableOpacity style={styles.enlace} onPress={() => router.push('/mi_entrenador')}>
                  <Text style={styles.textoEnlace}>Ver entrenadores</Text>
                  <Ionicons name="chevron-forward" size={16} color="#00E676" />
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.textoVacio}>Esta clase todavía no tiene entrenador asignado.</Text>
            )}

            {/* Participantes */}
            <Text style={styles.seccion}>Participantes ({clase.participantes.length})</Text>
            {clase.participantes.length === 0 ? (
              <Text style={styles.textoVacio}>Nadie se ha inscrito todavía. ¡Sé el primero!</Text>
            ) : (
              <View style={styles.tarjeta}>
                {clase.participantes.map((p, i) => (
                  <View key={`${p.nombre}-${i}`} style={[styles.filaParticipante, i > 0 && styles.separador]}>
                    <View style={[styles.avatarChico, p.soy_yo && styles.avatarYo]}>
                      <Text style={[styles.avatarLetraChica, p.soy_yo && { color: '#020700' }]}>{p.nombre.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.nombreParticipante}>{p.nombre}</Text>
                    {p.soy_yo && <Text style={styles.insigniaYo}>Tú</Text>}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Botón fijo abajo */}
      {clase && (
        <View style={styles.pie}>
          <TouchableOpacity
            style={[
              styles.boton,
              clase.ya_inscrito && !clase.ya_empezo ? styles.botonCancelar : styles.botonInscribir,
              (!accion || (!clase.incluye_clases && !clase.ya_inscrito)) && styles.botonApagado,
              procesando && { opacity: 0.6 },
            ]}
            onPress={accion ?? undefined}
            disabled={!accion || procesando}
          >
            {procesando ? (
              <ActivityIndicator color={clase.ya_inscrito ? '#FF5252' : '#020700'} />
            ) : (
              <Text style={[
                styles.textoBoton,
                clase.ya_inscrito && !clase.ya_empezo ? { color: '#FF5252' }
                  : (!accion || !clase.incluye_clases) ? { color: '#9a9a9a' } : { color: '#020700' },
              ]}>
                {textoBoton}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#020700' },
  container: { flexGrow: 1, padding: 20, paddingTop: 48, paddingBottom: 110 },
  centro: { flex: 1, backgroundColor: '#020700', justifyContent: 'center', alignItems: 'center' },
  textoCargando: { color: '#ffffff', marginTop: 10 },

  botonRegresar: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  textoRegresar: { color: '#00E676', fontSize: 14, fontWeight: 'bold' },

  encabezado: { alignItems: 'center', marginVertical: 8 },
  iconoGrande: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#1C2E1C', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  titulo: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', textAlign: 'center' },
  fecha: { color: '#00E676', fontSize: 15, marginTop: 4 },
  sucursal: { color: '#9a9a9a', fontSize: 13, marginTop: 2 },
  insignia: {
    marginTop: 10, backgroundColor: '#00E676', color: '#020700', fontSize: 12, fontWeight: 'bold',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden',
  },

  seccion: { fontSize: 16, fontWeight: 'bold', color: '#00B0FF', marginTop: 18, marginBottom: 10 },
  tarjeta: { backgroundColor: '#162216', borderRadius: 14, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#223822' },
  filaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  etiqueta: { color: '#9a9a9a', fontSize: 13 },
  valor: { color: '#00E676', fontSize: 14, fontWeight: 'bold' },
  barraCupo: { height: 8, borderRadius: 4, backgroundColor: '#0E170E', marginTop: 10, overflow: 'hidden' },
  rellenoCupo: { height: '100%', backgroundColor: '#00E676' },
  rellenoLleno: { backgroundColor: '#FF5252' },
  textoCupo: { color: '#9a9a9a', fontSize: 12, marginTop: 6 },

  filaPersona: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#5ecb1f', alignItems: 'center', justifyContent: 'center' },
  avatarLetra: { fontSize: 20, fontWeight: 'bold', color: '#030801' },
  nombre: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  especialidad: { color: '#00E676', fontSize: 13, marginTop: 2 },
  detalle: { color: '#9a9a9a', fontSize: 12, marginTop: 2 },
  badgeNivel: {
    backgroundColor: '#1C242E', color: '#00B0FF', fontSize: 12, fontWeight: 'bold',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden',
  },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  textoEnlace: { color: '#00E676', fontSize: 13, fontWeight: 'bold' },

  filaParticipante: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  separador: { borderTopWidth: 1, borderTopColor: '#1F331F' },
  avatarChico: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1C2E1C', alignItems: 'center', justifyContent: 'center' },
  avatarYo: { backgroundColor: '#00E676' },
  avatarLetraChica: { color: '#00E676', fontSize: 14, fontWeight: 'bold' },
  nombreParticipante: { color: '#ffffff', fontSize: 15, flex: 1 },
  insigniaYo: {
    backgroundColor: '#1C2E1C', color: '#00E676', fontSize: 11, fontWeight: 'bold',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden',
  },

  pie: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 24, backgroundColor: '#020700', borderTopWidth: 1, borderTopColor: '#1F331F' },
  boton: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 14, minHeight: 50 },
  botonInscribir: { backgroundColor: '#00E676' },
  botonCancelar: { borderWidth: 1, borderColor: '#FF5252' },
  botonApagado: { backgroundColor: '#2a2a2a', borderWidth: 0 },
  textoBoton: { fontSize: 16, fontWeight: 'bold' },

  cajaError: { backgroundColor: '#2a0f0f', borderColor: '#FF5252', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  textoError: { color: '#ffffff', fontSize: 14 },
  textoErrorSub: { color: '#cccccc', fontSize: 12, marginTop: 2 },
  textoVacio: { color: '#9a9a9a', fontSize: 14 },
});
