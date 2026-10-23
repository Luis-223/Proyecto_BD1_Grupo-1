// =============================================================
// mi_entrenador.tsx — ELEGIR ENTRENADORES
// Muestra los entrenadores de la sucursal del cliente (desde la base,
// GET /cliente/entrenadores) con sus datos, y permite agregar o quitar
// los que quiera. Puede tener varios a la vez.
// =============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,Image
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { agregarEntrenador, listarEntrenadores, quitarEntrenador } from './conexion';
import type { Entrenador } from './conexion';

const TODAS = 'Todas';

function formatearFecha(valor?: string | null): string {
  if (!valor) return '';
  const [anio, mes, dia] = String(valor).slice(0, 10).split('-');
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : String(valor);
}

function textoExperiencia(e: Entrenador): string {
  if (e.anios_experiencia === null || e.anios_experiencia === undefined) return 'Sin dato';
  if (e.anios_experiencia < 1) return 'Menos de 1 año';
  return `${e.anios_experiencia} ${e.anios_experiencia === 1 ? 'año' : 'años'}`;
}

export default function MiEntrenador() {
  const router = useRouter();
  const [entrenadores, setEntrenadores] = useState<Entrenador[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [refrescando, setRefrescando] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [procesando, setProcesando] = useState<number | null>(null); // id del entrenador que se está guardando
  const [especialidad, setEspecialidad] = useState<string>(TODAS);

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true); else setCargando(true);
    setError('');
    try {
      setEntrenadores(await listarEntrenadores());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los entrenadores.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Especialidades que existen en la base, para filtrar según lo que necesita el cliente
  const especialidades = useMemo(() => {
    const unicas = new Set(entrenadores.map((e) => e.especialidad?.trim()).filter(Boolean) as string[]);
    return [TODAS, ...Array.from(unicas).sort()];
  }, [entrenadores]);

  const visibles = entrenadores.filter((e) => especialidad === TODAS || e.especialidad?.trim() === especialidad);
  const mios = visibles.filter((e) => e.asignado);
  const disponibles = visibles.filter((e) => !e.asignado);
  const totalMios = entrenadores.filter((e) => e.asignado).length;

  const agregar = async (e: Entrenador) => {
    setProcesando(e.id_entrenador);
    try {
      await agregarEntrenador(e.id_entrenador);
      await cargar(true);
      Alert.alert('Entrenador agregado', `${e.nombre} ahora es uno de tus entrenadores.`);
    } catch (err) {
      Alert.alert('No se pudo agregar', err instanceof Error ? err.message : 'Intenta de nuevo.');
    } finally {
      setProcesando(null);
    }
  };

  const quitar = (e: Entrenador) => {
    Alert.alert(
      'Quitar entrenador',
      `¿Quieres quitar a ${e.nombre} de tus entrenadores? Las rutinas que ya te hizo se conservan.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: async () => {
            setProcesando(e.id_entrenador);
            try {
              await quitarEntrenador(e.id_entrenador);
              await cargar(true);
            } catch (err) {
              Alert.alert('No se pudo quitar', err instanceof Error ? err.message : 'Intenta de nuevo.');
            } finally {
              setProcesando(null);
            }
          },
        },
      ]
    );
  };

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/perfil'));

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color="#00E676" />
        <Text style={styles.textoCargando}>Cargando entrenadores...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.fondo}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} tintColor="#00E676" colors={['#00E676']} />}
    >
      <Image source={require('../../assets/images/Banner.jpeg')} style={styles.logo} />
      
      {error !== '' && (
        <Pressable style={styles.cajaError} onPress={() => cargar()}>
          <Text style={styles.textoError}>{error}</Text>
          <Text style={styles.textoErrorSub}>Toca aquí para intentar de nuevo.</Text>
        </Pressable>
      )}

      {error === '' && entrenadores.length === 0 && (
        <View style={styles.cajaVacia}>
          <MaterialCommunityIcons name="account-search" size={40} color="#555" />
          <Text style={styles.textoVacio}>Tu sucursal todavía no tiene entrenadores registrados.</Text>
        </View>
      )}

      {/* Filtro por especialidad */}
      {especialidades.length > 2 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filaFiltros} contentContainerStyle={{ gap: 8 }}>
          {especialidades.map((esp) => (
            <Pressable
              key={esp}
              onPress={() => setEspecialidad(esp)}
              style={[styles.chip, especialidad === esp && styles.chipActivo]}
            >
              <Text style={[styles.textoChip, especialidad === esp && styles.textoChipActivo]}>{esp}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {mios.length > 0 && <Text style={styles.seccion}>Mis entrenadores</Text>}
      {mios.map((e) => (
        <TarjetaEntrenador key={e.id_entrenador} e={e} ocupado={procesando === e.id_entrenador} onPress={() => quitar(e)} />
      ))}

      {disponibles.length > 0 && <Text style={styles.seccion}>Disponibles</Text>}
      {disponibles.map((e) => (
        <TarjetaEntrenador key={e.id_entrenador} e={e} ocupado={procesando === e.id_entrenador} onPress={() => agregar(e)} />
      ))}

      {entrenadores.length > 0 && visibles.length === 0 && (
        <Text style={styles.textoVacio}>No hay entrenadores con la especialidad “{especialidad}”.</Text>
      )}
    </ScrollView>
  );
}

function TarjetaEntrenador({ e, ocupado, onPress }: { e: Entrenador; ocupado: boolean; onPress: () => void }) {
  return (
    <View style={[styles.tarjeta, e.asignado && styles.tarjetaMia]}>
      <View style={styles.filaCabecera}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetra}>{e.nombre.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nombre} numberOfLines={1}>{e.nombre}</Text>
          <Text style={styles.especialidad}>{e.especialidad || 'Entrenamiento general'}</Text>
        </View>
        {e.nivel ? <Text style={styles.badgeNivel}>{e.nivel}</Text> : null}
      </View>

      <View style={styles.filaDatos}>
        <Dato icono="briefcase-outline" etiqueta="Experiencia" valor={textoExperiencia(e)} />
        <Dato icono="account-group-outline" etiqueta="Clientes" valor={String(e.clientes_activos)} />
        <Dato icono="calendar-clock" etiqueta="Clases próximas" valor={String(e.clases_proximas)} />
      </View>

      {e.asignado && (
        <Text style={styles.textoMio}>
          Tu entrenador{e.asignado_desde ? ` desde el ${formatearFecha(e.asignado_desde)}` : ''}
          {e.mis_rutinas > 0 ? ` · ${e.mis_rutinas} ${e.mis_rutinas === 1 ? 'rutina' : 'rutinas'} para ti` : ''}
        </Text>
      )}

      <TouchableOpacity
        style={[styles.boton, e.asignado ? styles.botonQuitar : styles.botonAgregar, ocupado && { opacity: 0.6 }]}
        onPress={onPress}
        disabled={ocupado}
      >
        {ocupado ? (
          <ActivityIndicator color={e.asignado ? '#FF5252' : '#020700'} />
        ) : (
          <>
            <Ionicons name={e.asignado ? 'person-remove-outline' : 'person-add-outline'} size={18} color={e.asignado ? '#FF5252' : '#020700'} />
            <Text style={[styles.textoBoton, e.asignado ? styles.textoBotonQuitar : styles.textoBotonAgregar]}>
              {e.asignado ? 'Quitar' : 'Agregar'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function Dato({ icono, etiqueta, valor }: { icono: string; etiqueta: string; valor: string }) {
  return (
    <View style={styles.dato}>
      <MaterialCommunityIcons name={icono as any} size={18} color="#00E676" />
      <Text style={styles.datoValor}>{valor}</Text>
      <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#020700' },
  container: { flexGrow: 1, backgroundColor: '#020700', padding: 20, paddingTop: 48 },
  centro: { flex: 1, backgroundColor: '#020700', justifyContent: 'center', alignItems: 'center' },
  textoCargando: { color: '#ffffff', marginTop: 10 },
  logo: { width: 150, height: 100, alignSelf: 'auto', marginBottom: 5, resizeMode: 'contain' },
  botonRegresar: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  textoRegresar: { color: '#00E676', fontSize: 14, fontWeight: 'bold' },
  tituloHeader: { fontSize: 22, fontWeight: 'bold', color: '#ffffff' },
  subtitulo: { color: '#9a9a9a', fontSize: 13, marginTop: 4, marginBottom: 12 },
  seccion: { fontSize: 16, fontWeight: 'bold', color: '#00B0FF', marginTop: 12, marginBottom: 10 },

  filaFiltros: { flexGrow: 0, marginBottom: 6 },
  chip: { borderWidth: 1, borderColor: '#223822', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#0E170E' },
  chipActivo: { backgroundColor: '#00E676', borderColor: '#00E676' },
  textoChip: { color: '#d0d0d0', fontSize: 13 },
  textoChipActivo: { color: '#020700', fontWeight: 'bold' },

  tarjeta: { backgroundColor: '#162216', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#223822' },
  tarjetaMia: { borderColor: '#00E676' },
  filaCabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#5ecb1f', alignItems: 'center', justifyContent: 'center' },
  avatarLetra: { fontSize: 20, fontWeight: 'bold', color: '#030801' },
  nombre: { color: '#ffffff', fontSize: 17, fontWeight: 'bold' },
  especialidad: { color: '#00E676', fontSize: 13, marginTop: 2 },
  badgeNivel: {
    backgroundColor: '#1C242E', color: '#00B0FF', fontSize: 12, fontWeight: 'bold',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: 'hidden',
  },

  filaDatos: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, gap: 8 },
  dato: { flex: 1, backgroundColor: '#0E170E', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  datoValor: { color: '#ffffff', fontSize: 14, fontWeight: 'bold', marginTop: 4 },
  datoEtiqueta: { color: '#9a9a9a', fontSize: 11, marginTop: 2, textAlign: 'center' },

  textoMio: { color: '#9a9a9a', fontSize: 12, marginTop: 10 },

  boton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 11, marginTop: 14, minHeight: 44 },
  botonAgregar: { backgroundColor: '#00E676' },
  botonQuitar: { borderWidth: 1, borderColor: '#FF5252' },
  textoBoton: { fontSize: 15, fontWeight: 'bold' },
  textoBotonAgregar: { color: '#020700' },
  textoBotonQuitar: { color: '#FF5252' },

  cajaError: { backgroundColor: '#2a0f0f', borderColor: '#FF5252', borderWidth: 1, borderRadius: 10, padding: 12, marginVertical: 10 },
  textoError: { color: '#ffffff', fontSize: 14 },
  textoErrorSub: { color: '#cccccc', fontSize: 12, marginTop: 2 },
  cajaVacia: { alignItems: 'center', marginTop: 40, gap: 10 },
  textoVacio: { color: '#9a9a9a', fontSize: 14, textAlign: 'center', marginTop: 10 },
});
