// =============================================================
// clases_grupales.tsx — CLASES GRUPALES DE SU SUCURSAL
// Igual que mi_entrenador: arriba "Mis clases", abajo "Próximas clases",
// con botón para inscribirse o cancelar. Al tocar una clase (por ejemplo
// Zumba) se abre clase_detalle.tsx con el entrenador y los participantes.
// Datos desde la base: GET /clases
// =============================================================

import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,Image
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { cancelarClase, inscribirClase, listarClases } from './conexion';
import type { ClaseGrupal } from './conexion';
import { fechaClaseCorta, iconoClase } from '@/components/clases-util';

const TODAS = 'Todas';

export default function ClasesGrupales() {
  const router = useRouter();
  const [clases, setClases] = useState<ClaseGrupal[]>([]);
  const [incluyeClases, setIncluyeClases] = useState<boolean>(true);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [procesando, setProcesando] = useState<number | null>(null);
  const [tipo, setTipo] = useState<string>(TODAS);

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true);
    setError('');
    try {
      const res = await listarClases();
      setClases(res.clases);
      setIncluyeClases(res.membresia_incluye_clases);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las clases.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  // Se recarga cada vez que se vuelve a esta pantalla (por ejemplo, desde el detalle)
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const tipos = useMemo(
    () => [TODAS, ...Array.from(new Set(clases.map((c) => c.nombre_clase.trim()))).sort()],
    [clases]
  );
  const visibles = clases.filter((c) => tipo === TODAS || c.nombre_clase.trim() === tipo);
  const mias = visibles.filter((c) => c.ya_inscrito);
  const proximas = visibles.filter((c) => !c.ya_inscrito);

  const inscribir = async (c: ClaseGrupal) => {
    if (!incluyeClases) {
      Alert.alert('Requiere membresía Oro', 'Las clases grupales están incluidas en la membresía Oro.', [
        { text: 'Ahora no', style: 'cancel' },
        { text: 'Ver membresía', onPress: () => router.push('/mi_membresia') },
      ]);
      return;
    }
    setProcesando(c.id_clase);
    try {
      await inscribirClase(c.id_clase);
      await cargar(true);
      Alert.alert('¡Listo!', `Te inscribiste en ${c.nombre_clase} (${fechaClaseCorta(c.fecha_hora)}).`);
    } catch (e) {
      Alert.alert('No se pudo inscribir', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setProcesando(null);
    }
  };

  const cancelar = (c: ClaseGrupal) => {
    Alert.alert('Cancelar inscripción', `¿Quieres salirte de ${c.nombre_clase} (${fechaClaseCorta(c.fecha_hora)})? Tu lugar quedará libre.`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          setProcesando(c.id_clase);
          try {
            await cancelarClase(c.id_clase);
            await cargar(true);
          } catch (e) {
            Alert.alert('No se pudo cancelar', e instanceof Error ? e.message : 'Intenta de nuevo.');
          } finally {
            setProcesando(null);
          }
        },
      },
    ]);
  };

  const abrirDetalle = (c: ClaseGrupal) => router.push({ pathname: '/clase_detalle', params: { id: String(c.id_clase) } } as any);

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color="#00E676" />
        <Text style={styles.textoCargando}>Cargando clases...</Text>
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

      {!incluyeClases && (
        <View style={styles.aviso}>
          <Text style={styles.avisoTexto}>Las clases grupales están incluidas en la membresía Oro.</Text>
          <TouchableOpacity onPress={() => router.push('/mi_membresia')}>
            <Text style={styles.avisoEnlace}>Mejorar mi membresía</Text>
          </TouchableOpacity>
        </View>
      )}

      {error !== '' && (
        <Pressable style={styles.cajaError} onPress={() => cargar()}>
          <Text style={styles.textoError}>{error}</Text>
          <Text style={styles.textoErrorSub}>Toca aquí para intentar de nuevo.</Text>
        </Pressable>
      )}

      {error === '' && clases.length === 0 && (
        <View style={styles.cajaVacia}>
          <MaterialCommunityIcons name="calendar-blank" size={40} color="#555" />
          <Text style={styles.textoVacio}>No hay clases programadas en tu sucursal por ahora.</Text>
        </View>
      )}

      {/* Filtro por tipo de clase (Zumba, Yoga, ...) */}
      {tipos.length > 2 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filaFiltros} contentContainerStyle={{ gap: 8 }}>
          {tipos.map((t) => (
            <Pressable key={t} onPress={() => setTipo(t)} style={[styles.chip, tipo === t && styles.chipActivo]}>
              <Text style={[styles.textoChip, tipo === t && styles.textoChipActivo]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {mias.length > 0 && <Text style={styles.seccion}>Mis clases</Text>}
      {mias.map((c) => (
        <TarjetaClase key={c.id_clase} c={c} ocupado={procesando === c.id_clase}
          onAbrir={() => abrirDetalle(c)} onAccion={() => cancelar(c)} />
      ))}

      {proximas.length > 0 && <Text style={styles.seccion}>Próximas clases</Text>}
      {proximas.map((c) => (
        <TarjetaClase key={c.id_clase} c={c} ocupado={procesando === c.id_clase} bloqueada={!incluyeClases}
          onAbrir={() => abrirDetalle(c)} onAccion={() => inscribir(c)} />
      ))}

      {clases.length > 0 && visibles.length === 0 && (
        <Text style={styles.textoVacio}>No hay clases de “{tipo}” próximamente.</Text>
      )}
    </ScrollView>
  );
}

function TarjetaClase({ c, ocupado, bloqueada, onAbrir, onAccion }: {
  c: ClaseGrupal; ocupado: boolean; bloqueada?: boolean; onAbrir: () => void; onAccion: () => void;
}) {
  const inscritos = c.cupo_maximo - c.cupos_disponibles;
  const lleno = c.cupos_disponibles <= 0;
  const porcentaje = c.cupo_maximo > 0 ? Math.min(100, Math.round((inscritos / c.cupo_maximo) * 100)) : 0;
  const deshabilitado = ocupado || (!c.ya_inscrito && lleno);
  const apagado = !c.ya_inscrito && (lleno || !!bloqueada); // gris: no se puede inscribir

  return (
    <Pressable style={[styles.tarjeta, c.ya_inscrito && styles.tarjetaMia]} onPress={onAbrir}>
      <View style={styles.filaCabecera}>
        <View style={styles.icono}>
          <MaterialCommunityIcons name={iconoClase(c.nombre_clase) as any} size={24} color="#00E676" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nombre}>{c.nombre_clase}</Text>
          <Text style={styles.fecha}>{fechaClaseCorta(c.fecha_hora)}</Text>
          <Text style={styles.entrenador}>{c.entrenador ? `Con ${c.entrenador}` : 'Entrenador por asignar'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9a9a9a" />
      </View>

      {/* Cupo */}
      <View style={styles.barraCupo}>
        <View style={[styles.rellenoCupo, { width: `${porcentaje}%` }, lleno && styles.rellenoLleno]} />
      </View>
      <Text style={styles.textoCupo}>
        {inscritos} de {c.cupo_maximo} inscritos · {lleno ? 'Sin cupo' : `${c.cupos_disponibles} ${c.cupos_disponibles === 1 ? 'lugar' : 'lugares'}`}
      </Text>

      <TouchableOpacity
        style={[
          styles.boton,
          c.ya_inscrito ? styles.botonCancelar : styles.botonInscribir,
          apagado && styles.botonApagado,
          ocupado && { opacity: 0.6 },
        ]}
        onPress={onAccion}
        disabled={deshabilitado}
      >
        {ocupado ? (
          <ActivityIndicator color={c.ya_inscrito ? '#FF5252' : '#020700'} />
        ) : (
          <Text style={[styles.textoBoton, c.ya_inscrito ? styles.textoBotonCancelar : apagado ? styles.textoBotonApagado : styles.textoBotonInscribir]}>
            {c.ya_inscrito ? 'Cancelar inscripción' : lleno ? 'Clase llena' : bloqueada ? 'Requiere Oro' : 'Inscribirme'}
          </Text>
        )}
      </TouchableOpacity>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#020700' },
  container: { flexGrow: 1, padding: 20, paddingTop: 48 },
  centro: { flex: 1, backgroundColor: '#020700', justifyContent: 'center', alignItems: 'center' },
  textoCargando: { color: '#ffffff', marginTop: 10 },
  logo: { width: 150, height: 100, alignSelf: 'auto', marginBottom: 5, resizeMode: 'contain' },

  botonRegresar: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  textoRegresar: { color: '#00E676', fontSize: 14, fontWeight: 'bold' },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#ffffff' },
  subtitulo: { color: '#9a9a9a', fontSize: 13, marginTop: 4, marginBottom: 12 },
  seccion: { fontSize: 16, fontWeight: 'bold', color: '#00B0FF', marginTop: 12, marginBottom: 10 },

  aviso: { backgroundColor: '#3a2a00', borderRadius: 12, padding: 12, marginBottom: 10 },
  avisoTexto: { color: '#ffd166', fontSize: 14, fontWeight: '600' },
  avisoEnlace: { color: '#ffffff', fontSize: 13, marginTop: 6, textDecorationLine: 'underline' },

  filaFiltros: { flexGrow: 0, marginBottom: 6 },
  chip: { borderWidth: 1, borderColor: '#223822', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#0E170E' },
  chipActivo: { backgroundColor: '#00E676', borderColor: '#00E676' },
  textoChip: { color: '#d0d0d0', fontSize: 13 },
  textoChipActivo: { color: '#020700', fontWeight: 'bold' },

  tarjeta: { backgroundColor: '#162216', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#223822' },
  tarjetaMia: { borderColor: '#00E676' },
  filaCabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icono: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#1C2E1C', alignItems: 'center', justifyContent: 'center' },
  nombre: { color: '#ffffff', fontSize: 17, fontWeight: 'bold' },
  fecha: { color: '#00E676', fontSize: 13, marginTop: 2 },
  entrenador: { color: '#9a9a9a', fontSize: 12, marginTop: 2 },

  barraCupo: { height: 6, borderRadius: 3, backgroundColor: '#0E170E', marginTop: 14, overflow: 'hidden' },
  rellenoCupo: { height: '100%', backgroundColor: '#00E676' },
  rellenoLleno: { backgroundColor: '#FF5252' },
  textoCupo: { color: '#9a9a9a', fontSize: 12, marginTop: 6 },

  boton: { alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 11, marginTop: 12, minHeight: 44 },
  botonInscribir: { backgroundColor: '#00E676' },
  botonCancelar: { borderWidth: 1, borderColor: '#FF5252' },
  botonApagado: { backgroundColor: '#2a2a2a' },
  textoBoton: { fontSize: 15, fontWeight: 'bold' },
  textoBotonInscribir: { color: '#020700' },
  textoBotonCancelar: { color: '#FF5252' },
  textoBotonApagado: { color: '#9a9a9a' },

  cajaError: { backgroundColor: '#2a0f0f', borderColor: '#FF5252', borderWidth: 1, borderRadius: 10, padding: 12, marginVertical: 10 },
  textoError: { color: '#ffffff', fontSize: 14 },
  textoErrorSub: { color: '#cccccc', fontSize: 12, marginTop: 2 },
  cajaVacia: { alignItems: 'center', marginTop: 40, gap: 10 },
  textoVacio: { color: '#9a9a9a', fontSize: 14, textAlign: 'center', marginTop: 10 },
});
