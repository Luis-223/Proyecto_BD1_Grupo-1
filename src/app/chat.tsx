// =============================================================
// chat.tsx — CHAT DIRECTO CON LA RECEPCIÓN DE SU SUCURSAL
//   - El cliente escribe aquí; la recepción contesta desde la app de
//     escritorio (PRINCIPAL.py → "Chat con clientes").
//   - Cada 4 segundos pregunta si hay mensajes nuevos (solo mientras la
//     pantalla está abierta).
// Datos: /cliente/chat (13_chat.sql)
// =============================================================

import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { enviarMensaje, leerChat } from './conexion';
import type { MensajeChat } from './conexion';

const CADA_CUANTO_MS = 4000;
const SUGERENCIAS = ['¿Cuál es el horario de hoy?', 'Quiero renovar mi membresía', 'Tengo una duda con un pago'];

// "2026-10-22T18:05:00" → "18:05"
const hora = (f: string) => f.slice(11, 16);

function diaDe(f: string): string {
  const hoy = new Date();
  const clave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ayer = new Date(hoy.getTime() - 86400000);
  const dia = f.slice(0, 10);
  if (dia === clave(hoy)) return 'Hoy';
  if (dia === clave(ayer)) return 'Ayer';
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
}

// Junta mensajes nuevos con los que ya había, sin repetir
// (si uno ya estaba, se reemplaza: así se actualiza la palomita de "leído")
function juntar(antes: MensajeChat[], nuevos: MensajeChat[]): MensajeChat[] {
  if (nuevos.length === 0) return antes;
  const porId = new Map(antes.map((m) => [m.id_mensaje, m]));
  for (const m of nuevos) porId.set(m.id_mensaje, m);
  return [...porId.values()].sort((a, b) => a.id_mensaje - b.id_mensaje);
}

export default function Chat() {
  const router = useRouter();
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [sucursal, setSucursal] = useState('');
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const lista = useRef<FlatList<MensajeChat>>(null);
  const ultimoId = useRef(0);
  const pidiendo = useRef(false);
  // Desde dónde pedir: el último que ya se tiene, o antes si alguno mío
  // sigue sin leer (para saber cuándo recepción lo leyó)
  const desde = useRef(0);

  const traer = useCallback(async () => {
    if (pidiendo.current) return;          // no encimar pedidos si la red está lenta
    pidiendo.current = true;
    try {
      const chat = await leerChat(desde.current);
      setSucursal(chat.sucursal);
      if (chat.mensajes.length > 0) {
        ultimoId.current = Math.max(ultimoId.current, ...chat.mensajes.map((m) => m.id_mensaje));
        setMensajes((antes) => {
          const todos = juntar(antes, chat.mensajes);
          const sinLeer = todos.find((m) => m.de_cliente && !m.leido);
          desde.current = sinLeer ? sinLeer.id_mensaje - 1 : ultimoId.current;
          return todos;
        });
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el chat.');
    } finally {
      pidiendo.current = false;
      setCargando(false);
    }
  }, []);

  // Al abrir la pantalla: cargar y luego revisar cada 4 s. Al salir: parar.
  useFocusEffect(
    useCallback(() => {
      traer();
      const intervalo = setInterval(traer, CADA_CUANTO_MS);
      return () => clearInterval(intervalo);
    }, [traer])
  );

  const enviar = async (contenido = texto) => {
    const limpio = contenido.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    try {
      const nuevo = await enviarMensaje(limpio);
      ultimoId.current = Math.max(ultimoId.current, nuevo.id_mensaje);
      setMensajes((antes) => juntar(antes, [nuevo]));
      setTexto('');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el mensaje.');
    } finally {
      setEnviando(false);
    }
  };

  const volver = () => (router.canGoBack() ? router.back() : router.replace('/perfil'));

  return (
    <KeyboardAvoidingView style={styles.fondo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Cabecera */}
      <View style={styles.cabecera}>
        <TouchableOpacity onPress={volver} hitSlop={10} style={styles.botonVolver}>
          <Ionicons name="arrow-back" size={22} color="#00E676" />
        </TouchableOpacity>
        <View style={styles.avatar}>
          <Ionicons name="business" size={20} color="#020700" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo} numberOfLines={1}>Recepción{sucursal ? ` · ${sucursal}` : ''}</Text>
          <Text style={styles.subtitulo}>Te respondemos en horario de atención</Text>
        </View>
      </View>

      {error !== '' && (
        <Pressable style={styles.cajaError} onPress={traer}>
          <Text style={styles.textoError}>{error}</Text>
        </Pressable>
      )}

      {cargando ? (
        <View style={styles.centro}><ActivityIndicator size="large" color="#00E676" /></View>
      ) : (
        <FlatList
          ref={lista}
          data={mensajes}
          keyExtractor={(m) => String(m.id_mensaje)}
          contentContainerStyle={styles.listaContenido}
          onContentSizeChange={() => lista.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.vacio}>
              <Ionicons name="chatbubbles-outline" size={44} color="#555" />
              <Text style={styles.textoVacio}>Escríbele a tu sucursal</Text>
              <Text style={styles.textoVacioSub}>Horarios, pagos, clases o cualquier duda.</Text>
              <View style={styles.sugerencias}>
                {SUGERENCIAS.map((s) => (
                  <Pressable key={s} style={styles.sugerencia} onPress={() => enviar(s)}>
                    <Text style={styles.textoSugerencia}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          renderItem={({ item, index }) => {
            const anterior = mensajes[index - 1];
            const nuevoDia = !anterior || anterior.fecha.slice(0, 10) !== item.fecha.slice(0, 10);
            const mio = item.de_cliente;
            const mismoAutor = anterior && !nuevoDia && anterior.de_cliente === item.de_cliente && anterior.autor === item.autor;
            return (
              <View>
                {nuevoDia && <Text style={styles.separadorDia}>{diaDe(item.fecha)}</Text>}
                <View style={[styles.burbuja, mio ? styles.burbujaMia : styles.burbujaSuya, mismoAutor && { marginTop: 2 }]}>
                  {!mio && !mismoAutor && <Text style={styles.autor}>{item.autor}</Text>}
                  <Text style={mio ? styles.textoMio : styles.textoSuyo}>{item.texto}</Text>
                  <View style={styles.pie}>
                    <Text style={[styles.hora, mio && { color: '#0b3d1f' }]}>{hora(item.fecha)}</Text>
                    {mio && <Ionicons name={item.leido ? 'checkmark-done' : 'checkmark'} size={14} color="#0b3d1f" />}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Caja para escribir */}
      <View style={styles.barraEscribir}>
        <TextInput
          style={styles.input}
          value={texto}
          onChangeText={setTexto}
          placeholder="Escribe un mensaje..."
          placeholderTextColor="#777"
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.botonEnviar, (!texto.trim() || enviando) && { opacity: 0.4 }]}
          onPress={() => enviar()}
          disabled={!texto.trim() || enviando}
        >
          {enviando ? <ActivityIndicator color="#020700" size="small" /> : <Ionicons name="send" size={20} color="#020700" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#020700' },
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 48, paddingBottom: 12, paddingHorizontal: 14, backgroundColor: '#0E170E', borderBottomWidth: 1, borderBottomColor: '#1F331F' },
  botonVolver: { padding: 4 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#00E676', alignItems: 'center', justifyContent: 'center' },
  titulo: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  subtitulo: { color: '#9a9a9a', fontSize: 12 },

  cajaError: { backgroundColor: '#2a0f0f', borderColor: '#FF5252', borderWidth: 1, borderRadius: 10, padding: 10, margin: 10 },
  textoError: { color: '#ffffff', fontSize: 13 },

  listaContenido: { flexGrow: 1, padding: 12, paddingBottom: 6 },
  separadorDia: { alignSelf: 'center', color: '#9a9a9a', fontSize: 12, backgroundColor: '#162216', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, marginVertical: 10 },
  burbuja: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 },
  burbujaMia: { alignSelf: 'flex-end', backgroundColor: '#00E676', borderBottomRightRadius: 4 },
  burbujaSuya: { alignSelf: 'flex-start', backgroundColor: '#162216', borderWidth: 1, borderColor: '#223822', borderBottomLeftRadius: 4 },
  autor: { color: '#00B0FF', fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  textoMio: { color: '#020700', fontSize: 15 },
  textoSuyo: { color: '#ffffff', fontSize: 15 },
  pie: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 },
  hora: { color: '#9a9a9a', fontSize: 11 },

  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 40 },
  textoVacio: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  textoVacioSub: { color: '#9a9a9a', fontSize: 13 },
  sugerencias: { marginTop: 14, gap: 8, alignItems: 'center' },
  sugerencia: { borderWidth: 1, borderColor: '#00E676', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  textoSugerencia: { color: '#00E676', fontSize: 13 },

  barraEscribir: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, paddingBottom: 24, backgroundColor: '#0E170E', borderTopWidth: 1, borderTopColor: '#1F331F' },
  input: { flex: 1, backgroundColor: '#162216', color: '#ffffff', borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 120, borderWidth: 1, borderColor: '#223822' },
  botonEnviar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#00E676', alignItems: 'center', justifyContent: 'center' },
});
