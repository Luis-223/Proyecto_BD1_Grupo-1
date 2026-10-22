// =============================================================
// mis_metas.tsx — METAS DEL CLIENTE
//   - Crear metas con plantillas: Peso, Fuerza, Distancia, Asistencia, Personalizada
//   - Barra de progreso, días que faltan y "a este ritmo llegas el ..."
//   - Registrar avances (la de Asistencia se cuenta sola con sus entradas)
//   - Gráfica sencilla de los avances e historial de metas cumplidas/canceladas
// Datos desde la base: /cliente/metas (12_metas.sql)
// =============================================================

import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { cancelarMeta, crearMeta, listarMetas, registrarAvance } from './conexion';
import type { Meta, TipoMeta } from './conexion';

// ---------- Plantillas ----------
type Plantilla = { tipo: TipoMeta; titulo: string; icono: string; unidad: string; ayuda: string };
const PLANTILLAS: Plantilla[] = [
  { tipo: 'Peso', titulo: 'Peso', icono: 'scale-bathroom', unidad: 'kg', ayuda: 'Bajar o subir de peso' },
  { tipo: 'Fuerza', titulo: 'Fuerza', icono: 'weight-lifter', unidad: 'kg', ayuda: 'Levantar más en un ejercicio' },
  { tipo: 'Distancia', titulo: 'Distancia', icono: 'run', unidad: 'km', ayuda: 'Acumular kilómetros' },
  { tipo: 'Asistencia', titulo: 'Asistencia', icono: 'calendar-check', unidad: 'visitas', ayuda: 'Venir al gimnasio (se cuenta solo)' },
  { tipo: 'Personalizada', titulo: 'Otra', icono: 'star-outline', unidad: '', ayuda: 'Tú decides qué medir' },
];
const PLAZOS = [{ texto: '1 mes', meses: 1 }, { texto: '2 meses', meses: 2 }, { texto: '3 meses', meses: 3 }, { texto: '6 meses', meses: 6 }];

const iconoDe = (tipo: string) => PLANTILLAS.find((p) => p.tipo === tipo)?.icono ?? 'flag-outline';
const numero = (texto: string) => { const n = Number(texto.replace(',', '.').trim()); return Number.isFinite(n) && n > 0 ? n : null; };
const redondear = (n: number) => Math.round(n * 10) / 10;
const fechaCorta = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

function fechaEnMeses(meses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + meses);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// "A este ritmo llegas el ...": línea recta entre el primer y el último avance
function ritmo(m: Meta): string | null {
  if (m.estado !== 'En progreso' || m.valor_objetivo === null || m.avances.length < 2 || m.tipo_meta === 'Distancia') return null;
  const primero = m.avances[0], ultimo = m.avances[m.avances.length - 1];
  const dias = (Date.parse(ultimo.fecha) - Date.parse(primero.fecha)) / 86400000;
  const cambioPorDia = dias >= 1 ? (ultimo.valor - primero.valor) / dias : 0;
  const falta = m.valor_objetivo - ultimo.valor;
  if (cambioPorDia === 0 || Math.sign(cambioPorDia) !== Math.sign(falta)) return 'Registra más avances para calcular tu ritmo.';
  const diasParaLlegar = Math.ceil(falta / cambioPorDia);
  const llegada = new Date(Date.now() + diasParaLlegar * 86400000);
  const texto = `${String(llegada.getDate()).padStart(2, '0')}/${String(llegada.getMonth() + 1).padStart(2, '0')}/${llegada.getFullYear()}`;
  if (m.dias_restantes !== null && diasParaLlegar > m.dias_restantes) return `A este ritmo llegarías el ${texto}, después de tu fecha.`;
  return `A este ritmo llegas el ${texto}. ¡Vas bien!`;
}

// "72.5 de 70 kg · faltan 2.5 kg"
function textoAvance(m: Meta): string {
  const u = m.unidad_medida ? ` ${m.unidad_medida}` : '';
  if (m.valor_objetivo === null) return '';
  if (m.valor_actual === null) return `Objetivo: ${m.valor_objetivo}${u}`;
  const falta = redondear(Math.abs(m.valor_objetivo - m.valor_actual));
  const baja = m.valor_inicial !== null && m.valor_objetivo < m.valor_inicial;
  const listo = baja ? m.valor_actual <= m.valor_objetivo : m.valor_actual >= m.valor_objetivo;
  return `${redondear(m.valor_actual)} de ${m.valor_objetivo}${u}${listo ? '' : ` · faltan ${falta}${u}`}`;
}

function textoDias(m: Meta): string {
  if (m.estado === 'Cumplida') return '¡Cumplida!';
  if (m.estado === 'Cancelada') return 'Cancelada';
  if (m.dias_restantes === null) return '';
  if (m.dias_restantes > 1) return `Quedan ${m.dias_restantes} días`;
  if (m.dias_restantes === 1) return 'Queda 1 día';
  if (m.dias_restantes === 0) return 'Hoy es el último día';
  return `Venció hace ${-m.dias_restantes} ${m.dias_restantes === -1 ? 'día' : 'días'}`;
}

export default function MisMetas() {
  const router = useRouter();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [abierta, setAbierta] = useState<number | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);
  const [creando, setCreando] = useState(false);
  const [avanceDe, setAvanceDe] = useState<Meta | null>(null);

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true);
    setError('');
    try {
      setMetas(await listarMetas());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar tus metas.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const enProgreso = metas.filter((m) => m.estado === 'En progreso');
  const historial = metas.filter((m) => m.estado !== 'En progreso');
  const cumplidas = metas.filter((m) => m.estado === 'Cumplida').length;

  const cancelar = (m: Meta) => {
    Alert.alert('Cancelar meta', `¿Quieres cancelar "${m.descripcion}"? Quedará en tu historial.`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar', style: 'destructive',
        onPress: async () => {
          try { await cancelarMeta(m.id_meta); await cargar(true); }
          catch (e) { Alert.alert('No se pudo cancelar', e instanceof Error ? e.message : 'Intenta de nuevo.'); }
        },
      },
    ]);
  };

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color="#00E676" />
        <Text style={styles.textoCargando}>Cargando tus metas...</Text>
      </View>
    );
  }

  return (
    <View style={styles.fondo}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} tintColor="#00E676" colors={['#00E676']} />}
      >
        <TouchableOpacity style={styles.botonRegresar} onPress={() => (router.canGoBack() ? router.back() : router.replace('/perfil'))}>
          <Ionicons name="arrow-back" size={20} color="#00E676" />
          <Text style={styles.textoRegresar}> Volver</Text>
        </TouchableOpacity>
        <Text style={styles.titulo}>Mis metas</Text>
        <Text style={styles.subtitulo}>{enProgreso.length} en progreso · {cumplidas} {cumplidas === 1 ? 'cumplida' : 'cumplidas'}</Text>

        {error !== '' && (
          <Pressable style={styles.cajaError} onPress={() => cargar()}>
            <Text style={styles.textoError}>{error}</Text>
            <Text style={styles.textoErrorSub}>Toca aquí para intentar de nuevo.</Text>
          </Pressable>
        )}

        <TouchableOpacity style={styles.botonNueva} onPress={() => setCreando(true)}>
          <Ionicons name="add-circle-outline" size={22} color="#020700" />
          <Text style={styles.textoBotonNueva}>Nueva meta</Text>
        </TouchableOpacity>

        {error === '' && metas.length === 0 && (
          <View style={styles.cajaVacia}>
            <MaterialCommunityIcons name="flag-checkered" size={40} color="#555" />
            <Text style={styles.textoVacio}>Todavía no tienes metas.</Text>
            <Text style={styles.textoVacioSub}>Crea una: bajar de peso, venir 12 veces este mes o levantar más.</Text>
          </View>
        )}

        {enProgreso.map((m) => (
          <TarjetaMeta key={m.id_meta} m={m} abierta={abierta === m.id_meta}
            onPress={() => setAbierta(abierta === m.id_meta ? null : m.id_meta)}
            onAvance={() => setAvanceDe(m)} onCancelar={() => cancelar(m)} />
        ))}

        {historial.length > 0 && (
          <Pressable style={styles.filaHistorial} onPress={() => setVerHistorial(!verHistorial)}>
            <Text style={styles.seccion}>Historial ({historial.length})</Text>
            <Ionicons name={verHistorial ? 'chevron-up' : 'chevron-down'} size={20} color="#00B0FF" />
          </Pressable>
        )}
        {verHistorial && historial.map((m) => (
          <TarjetaMeta key={m.id_meta} m={m} abierta={abierta === m.id_meta}
            onPress={() => setAbierta(abierta === m.id_meta ? null : m.id_meta)} />
        ))}
      </ScrollView>

      <FormularioMeta visible={creando} onCerrar={() => setCreando(false)} onCreada={() => { setCreando(false); cargar(true); }} />
      <FormularioAvance meta={avanceDe} onCerrar={() => setAvanceDe(null)}
        onGuardado={(mensaje) => { setAvanceDe(null); cargar(true); if (mensaje) Alert.alert(mensaje); }} />
    </View>
  );
}

// ---------- Tarjeta de una meta ----------
function TarjetaMeta({ m, abierta, onPress, onAvance, onCancelar }: {
  m: Meta; abierta: boolean; onPress: () => void; onAvance?: () => void; onCancelar?: () => void;
}) {
  const progreso = Math.max(0, Math.min(100, m.progreso));
  const cumplida = m.estado === 'Cumplida';
  const mensajeRitmo = ritmo(m);
  const valores = m.avances.map((a) => a.valor);
  const max = Math.max(...valores, m.valor_objetivo ?? 0, 1);

  return (
    <Pressable style={[styles.tarjeta, cumplida && styles.tarjetaCumplida, m.estado === 'Cancelada' && { opacity: 0.6 }]} onPress={onPress}>
      <View style={styles.filaCabecera}>
        <View style={styles.icono}>
          <MaterialCommunityIcons name={iconoDe(m.tipo_meta) as any} size={22} color="#00E676" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nombre}>{m.descripcion}</Text>
          <Text style={styles.sub}>{m.tipo_meta} · {textoDias(m)}</Text>
        </View>
        <Text style={[styles.porcentaje, cumplida && { color: '#ffd166' }]}>{Math.round(progreso)}%</Text>
      </View>

      <View style={styles.barra}>
        <View style={[styles.relleno, { width: `${progreso}%` }, cumplida && styles.rellenoCumplido]} />
      </View>
      <Text style={styles.textoProgreso}>{textoAvance(m)}</Text>
      {mensajeRitmo && <Text style={styles.ritmo}>{mensajeRitmo}</Text>}

      {abierta && (
        <View style={styles.detalle}>
          {/* Gráfica sencilla: una barra por avance */}
          {m.avances.length > 0 ? (
            <>
              <Text style={styles.etiqueta}>Tus avances</Text>
              <View style={styles.grafica}>
                {m.avances.slice(-12).map((a) => (
                  <View key={a.id_avance} style={styles.columnaGrafica}>
                    <View style={[styles.barraGrafica, { height: Math.max(4, (a.valor / max) * 80) }]} />
                  </View>
                ))}
              </View>
              {m.avances.slice(-4).reverse().map((a) => (
                <View key={a.id_avance} style={styles.filaAvance}>
                  <Text style={styles.textoAvanceFecha}>{fechaCorta(a.fecha)}</Text>
                  <Text style={styles.textoAvanceValor}>{a.valor} {m.unidad_medida ?? ''}</Text>
                  {a.nota ? <Text style={styles.textoAvanceNota} numberOfLines={1}>{a.nota}</Text> : null}
                </View>
              ))}
            </>
          ) : m.tipo_meta === 'Asistencia' ? (
            <Text style={styles.textoVacioSub}>Se cuenta sola cada vez que entras al gimnasio.</Text>
          ) : (
            <Text style={styles.textoVacioSub}>Aún no registras avances.</Text>
          )}
          <Text style={styles.textoFechas}>Desde el {fechaCorta(m.fecha_inicio)}{m.fecha_objetivo ? ` hasta el ${fechaCorta(m.fecha_objetivo)}` : ''}</Text>

          {m.estado === 'En progreso' && (
            <View style={styles.filaBotones}>
              {m.tipo_meta !== 'Asistencia' && onAvance && (
                <TouchableOpacity style={[styles.boton, styles.botonPrincipal]} onPress={onAvance}>
                  <Text style={styles.textoBotonPrincipal}>Registrar avance</Text>
                </TouchableOpacity>
              )}
              {onCancelar && (
                <TouchableOpacity style={[styles.boton, styles.botonCancelar]} onPress={onCancelar}>
                  <Text style={styles.textoBotonCancelar}>Cancelar</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ---------- Formulario: nueva meta ----------
function FormularioMeta({ visible, onCerrar, onCreada }: { visible: boolean; onCerrar: () => void; onCreada: () => void }) {
  const [plantilla, setPlantilla] = useState<Plantilla>(PLANTILLAS[0]);
  const [descripcion, setDescripcion] = useState('');
  const [inicial, setInicial] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [unidad, setUnidad] = useState('');
  const [meses, setMeses] = useState(2);
  const [guardando, setGuardando] = useState(false);

  const limpiar = () => { setDescripcion(''); setInicial(''); setObjetivo(''); setUnidad(''); setMeses(2); };
  const tipo = plantilla.tipo;
  const pideInicial = tipo === 'Peso' || tipo === 'Fuerza' || tipo === 'Personalizada';
  const pideDescripcion = tipo === 'Fuerza' || tipo === 'Personalizada';

  const guardar = async () => {
    const valorObjetivo = numero(objetivo);
    const valorInicial = numero(inicial);
    if (!valorObjetivo) return Alert.alert('Falta el objetivo', 'Escribe un número mayor que cero.');
    if ((tipo === 'Peso' || tipo === 'Fuerza') && !valorInicial) return Alert.alert('Falta tu valor actual', 'Escribe de dónde partes.');
    if (pideDescripcion && !descripcion.trim()) {
      return Alert.alert('Falta la descripción', tipo === 'Fuerza' ? '¿En qué ejercicio? Por ejemplo: Press de banca.' : '¿Qué quieres lograr?');
    }
    const u = tipo === 'Personalizada' ? unidad.trim() : plantilla.unidad;
    const texto =
      tipo === 'Peso' ? `${valorInicial && valorObjetivo < valorInicial ? 'Bajar' : 'Subir'} a ${valorObjetivo} kg`
      : tipo === 'Fuerza' ? `${descripcion.trim()}: ${valorObjetivo} kg`
      : tipo === 'Distancia' ? `Acumular ${valorObjetivo} km`
      : tipo === 'Asistencia' ? `Venir ${valorObjetivo} veces al gimnasio`
      : descripcion.trim();

    setGuardando(true);
    try {
      await crearMeta({
        tipo_meta: tipo, descripcion: texto, valor_inicial: pideInicial ? valorInicial : null,
        valor_objetivo: valorObjetivo, unidad_medida: u, fecha_objetivo: fechaEnMeses(meses),
      });
      limpiar();
      onCreada();
    } catch (e) {
      Alert.alert('No se pudo crear', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fondoModal}>
        <View style={styles.modal}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.filaEntre}>
              <Text style={styles.tituloModal}>Nueva meta</Text>
              <TouchableOpacity onPress={onCerrar} hitSlop={10}><Ionicons name="close" size={24} color="#ffffff" /></TouchableOpacity>
            </View>

            <Text style={styles.etiqueta}>¿Qué quieres lograr?</Text>
            <View style={styles.plantillas}>
              {PLANTILLAS.map((p) => (
                <Pressable key={p.tipo} style={[styles.plantilla, plantilla.tipo === p.tipo && styles.plantillaActiva]} onPress={() => setPlantilla(p)}>
                  <MaterialCommunityIcons name={p.icono as any} size={22} color={plantilla.tipo === p.tipo ? '#020700' : '#00E676'} />
                  <Text style={[styles.textoPlantilla, plantilla.tipo === p.tipo && { color: '#020700' }]}>{p.titulo}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.ayuda}>{plantilla.ayuda}</Text>

            {pideDescripcion && (
              <Campo etiqueta={tipo === 'Fuerza' ? 'Ejercicio' : 'Descripción'} valor={descripcion} onCambio={setDescripcion}
                ejemplo={tipo === 'Fuerza' ? 'Press de banca' : 'Correr 5 km sin parar'} texto />
            )}
            {tipo === 'Personalizada' && <Campo etiqueta="Unidad" valor={unidad} onCambio={setUnidad} ejemplo="minutos, cm, repeticiones" texto />}
            {pideInicial && (
              <Campo etiqueta={tipo === 'Peso' ? 'Tu peso actual (kg)' : tipo === 'Fuerza' ? 'Lo que levantas hoy (kg)' : 'Valor actual (opcional)'}
                valor={inicial} onCambio={setInicial} ejemplo="80" />
            )}
            <Campo
              etiqueta={tipo === 'Peso' ? 'Peso objetivo (kg)' : tipo === 'Fuerza' ? 'Quiero levantar (kg)'
                : tipo === 'Distancia' ? 'Kilómetros a acumular' : tipo === 'Asistencia' ? 'Número de visitas' : 'Objetivo'}
              valor={objetivo} onCambio={setObjetivo} ejemplo={tipo === 'Asistencia' ? '12' : tipo === 'Distancia' ? '50' : '72'} />

            <Text style={styles.etiqueta}>Plazo</Text>
            <View style={styles.plazos}>
              {PLAZOS.map((p) => (
                <Pressable key={p.meses} style={[styles.chip, meses === p.meses && styles.chipActivo]} onPress={() => setMeses(p.meses)}>
                  <Text style={[styles.textoChip, meses === p.meses && styles.textoChipActivo]}>{p.texto}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.ayuda}>Fecha objetivo: {fechaCorta(fechaEnMeses(meses))}</Text>

            <TouchableOpacity style={[styles.boton, styles.botonPrincipal, { marginTop: 18 }, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
              {guardando ? <ActivityIndicator color="#020700" /> : <Text style={styles.textoBotonPrincipal}>Crear meta</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------- Formulario: registrar avance ----------
function FormularioAvance({ meta, onCerrar, onGuardado }: { meta: Meta | null; onCerrar: () => void; onGuardado: (mensaje?: string) => void }) {
  const [valor, setValor] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!meta) return;
    const n = numero(valor);
    if (!n) return Alert.alert('Falta el valor', 'Escribe un número mayor que cero.');
    setGuardando(true);
    try {
      const r = await registrarAvance(meta.id_meta, n, nota.trim() || undefined);
      setValor(''); setNota('');
      onGuardado(r.estado === 'Cumplida' ? '¡Felicidades! Cumpliste tu meta 🎉' : undefined);
    } catch (e) {
      Alert.alert('No se pudo guardar', e instanceof Error ? e.message : 'Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const etiqueta = meta?.tipo_meta === 'Distancia'
    ? `¿Cuántos km hiciste hoy?`
    : `Tu valor de hoy${meta?.unidad_medida ? ` (${meta.unidad_medida})` : ''}`;

  return (
    <Modal visible={!!meta} animationType="fade" transparent onRequestClose={onCerrar}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fondoModal}>
        <View style={styles.modal}>
          <View style={styles.filaEntre}>
            <Text style={styles.tituloModal}>Registrar avance</Text>
            <TouchableOpacity onPress={onCerrar} hitSlop={10}><Ionicons name="close" size={24} color="#ffffff" /></TouchableOpacity>
          </View>
          <Text style={styles.ayuda}>{meta?.descripcion}</Text>
          <Campo etiqueta={etiqueta} valor={valor} onCambio={setValor} ejemplo="75.5" />
          <Campo etiqueta="Nota (opcional)" valor={nota} onCambio={setNota} ejemplo="Después de la rutina de piernas" texto />
          <TouchableOpacity style={[styles.boton, styles.botonPrincipal, { marginTop: 14 }, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#020700" /> : <Text style={styles.textoBotonPrincipal}>Guardar</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Campo({ etiqueta, valor, onCambio, ejemplo, texto }: {
  etiqueta: string; valor: string; onCambio: (t: string) => void; ejemplo: string; texto?: boolean;
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <TextInput
        style={styles.input}
        value={valor}
        onChangeText={onCambio}
        placeholder={ejemplo}
        placeholderTextColor="#888"
        keyboardType={texto ? 'default' : 'decimal-pad'}
        maxLength={texto ? 100 : 8}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#020700' },
  container: { flexGrow: 1, padding: 20, paddingTop: 48, paddingBottom: 40 },
  centro: { flex: 1, backgroundColor: '#020700', justifyContent: 'center', alignItems: 'center' },
  textoCargando: { color: '#ffffff', marginTop: 10 },

  botonRegresar: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  textoRegresar: { color: '#00E676', fontSize: 14, fontWeight: 'bold' },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#ffffff' },
  subtitulo: { color: '#9a9a9a', fontSize: 13, marginTop: 4, marginBottom: 14 },
  seccion: { fontSize: 16, fontWeight: 'bold', color: '#00B0FF' },
  filaHistorial: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 10 },

  botonNueva: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#00E676', borderRadius: 12, paddingVertical: 13, marginBottom: 16 },
  textoBotonNueva: { color: '#020700', fontSize: 16, fontWeight: 'bold' },

  tarjeta: { backgroundColor: '#162216', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#223822' },
  tarjetaCumplida: { borderColor: '#ffd166' },
  filaCabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icono: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1C2E1C', alignItems: 'center', justifyContent: 'center' },
  nombre: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  sub: { color: '#9a9a9a', fontSize: 12, marginTop: 2 },
  porcentaje: { color: '#00E676', fontSize: 20, fontWeight: 'bold' },
  barra: { height: 8, borderRadius: 4, backgroundColor: '#0E170E', marginTop: 14, overflow: 'hidden' },
  relleno: { height: '100%', backgroundColor: '#00E676' },
  rellenoCumplido: { backgroundColor: '#ffd166' },
  textoProgreso: { color: '#d0d0d0', fontSize: 13, marginTop: 6 },
  ritmo: { color: '#00B0FF', fontSize: 12, marginTop: 4 },

  detalle: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#1F331F', paddingTop: 12 },
  etiqueta: { color: '#9a9a9a', fontSize: 13, marginBottom: 6 },
  grafica: { flexDirection: 'row', alignItems: 'flex-end', height: 86, gap: 4, marginBottom: 10 },
  columnaGrafica: { flex: 1, justifyContent: 'flex-end' },
  barraGrafica: { backgroundColor: '#00E676', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  filaAvance: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  textoAvanceFecha: { color: '#9a9a9a', fontSize: 13, width: 82 },
  textoAvanceValor: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  textoAvanceNota: { color: '#9a9a9a', fontSize: 12, flex: 1 },
  textoFechas: { color: '#777', fontSize: 12, marginTop: 8 },

  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 12 },
  boton: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 11, minHeight: 44 },
  botonPrincipal: { backgroundColor: '#00E676' },
  botonCancelar: { borderWidth: 1, borderColor: '#FF5252' },
  textoBotonPrincipal: { color: '#020700', fontWeight: 'bold', fontSize: 15 },
  textoBotonCancelar: { color: '#FF5252', fontWeight: 'bold', fontSize: 15 },

  fondoModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#0E170E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 30, maxHeight: '90%', borderWidth: 1, borderColor: '#1F331F' },
  filaEntre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  tituloModal: { color: '#ffffff', fontSize: 20, fontWeight: 'bold' },
  plantillas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  plantilla: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#223822', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#162216' },
  plantillaActiva: { backgroundColor: '#00E676', borderColor: '#00E676' },
  textoPlantilla: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  ayuda: { color: '#9a9a9a', fontSize: 12, marginTop: 8 },
  input: { backgroundColor: '#ffffff', borderRadius: 8, padding: 12, color: '#000000', fontSize: 16 },
  plazos: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderColor: '#223822', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#162216' },
  chipActivo: { backgroundColor: '#00E676', borderColor: '#00E676' },
  textoChip: { color: '#d0d0d0', fontSize: 13 },
  textoChipActivo: { color: '#020700', fontWeight: 'bold' },

  cajaError: { backgroundColor: '#2a0f0f', borderColor: '#FF5252', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  textoError: { color: '#ffffff', fontSize: 14 },
  textoErrorSub: { color: '#cccccc', fontSize: 12, marginTop: 2 },
  cajaVacia: { alignItems: 'center', marginTop: 20, gap: 6 },
  textoVacio: { color: '#ffffff', fontSize: 15, textAlign: 'center' },
  textoVacioSub: { color: '#9a9a9a', fontSize: 13, textAlign: 'center' },
});
