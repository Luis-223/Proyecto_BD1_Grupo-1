// =============================================================
// mis_pagos.tsx — HISTORIAL DE PAGOS DEL CLIENTE
// Todas sus facturas desde la base (GET /cliente/pagos), agrupadas por
// mes, con un resumen arriba y el detalle de cada una al tocarla.
// =============================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { listarPagos } from './conexion';
import type { PagoCliente } from './conexion';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const TODOS = 'Todos';

// Se lee la fecha tal como viene del servidor ("2026-10-20T14:35:00.000Z"),
// sin convertir de zona horaria, para que coincida con la base
const partes = (iso: string) => ({
  anio: iso.slice(0, 4), mes: Number(iso.slice(5, 7)), dia: iso.slice(8, 10), hora: iso.slice(11, 16),
});
const fechaCorta = (iso: string) => { const p = partes(iso); return `${p.dia}/${String(p.mes).padStart(2, '0')}/${p.anio}`; };
const quetzales = (n: number) => `Q${Number(n || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const anulada = (p: PagoCliente) => p.estado?.toLowerCase() === 'anulada';

export default function MisPagos() {
  const router = useRouter();
  const [pagos, setPagos] = useState<PagoCliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [anio, setAnio] = useState<string>(TODOS);
  const [abierto, setAbierto] = useState<number | null>(null);

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true); else setCargando(true);
    setError('');
    try {
      setPagos(await listarPagos());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar tus pagos.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const anios = useMemo(() => [TODOS, ...Array.from(new Set(pagos.map((p) => partes(p.fecha_emision).anio)))], [pagos]);
  const visibles = pagos.filter((p) => anio === TODOS || partes(p.fecha_emision).anio === anio);
  const validos = visibles.filter((p) => !anulada(p));
  const total = validos.reduce((suma, p) => suma + Number(p.total), 0);

  // Agrupar por "Octubre 2026" manteniendo el orden (más reciente primero)
  const grupos = useMemo(() => {
    const lista: { titulo: string; pagos: PagoCliente[] }[] = [];
    for (const p of visibles) {
      const { anio: a, mes } = partes(p.fecha_emision);
      const titulo = `${MESES[mes - 1] ?? ''} ${a}`;
      const ultimo = lista[lista.length - 1];
      if (ultimo?.titulo === titulo) ultimo.pagos.push(p); else lista.push({ titulo, pagos: [p] });
    }
    return lista;
  }, [visibles]);

  if (cargando) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color="#00E676" />
        <Text style={styles.textoCargando}>Cargando tus pagos...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.fondo}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} tintColor="#00E676" colors={['#00E676']} />}
    >
      <TouchableOpacity style={styles.botonRegresar} onPress={() => (router.canGoBack() ? router.back() : router.replace('/perfil'))}>
        <Ionicons name="arrow-back" size={20} color="#00E676" />
        <Text style={styles.textoRegresar}> Volver</Text>
      </TouchableOpacity>
      <Text style={styles.titulo}>Mis pagos</Text>

      {error !== '' && (
        <Pressable style={styles.cajaError} onPress={() => cargar()}>
          <Text style={styles.textoError}>{error}</Text>
          <Text style={styles.textoErrorSub}>Toca aquí para intentar de nuevo.</Text>
        </Pressable>
      )}

      {error === '' && pagos.length === 0 && (
        <View style={styles.cajaVacia}>
          <MaterialCommunityIcons name="receipt" size={40} color="#555" />
          <Text style={styles.textoVacio}>Todavía no tienes pagos registrados.</Text>
        </View>
      )}

      {pagos.length > 0 && (
        <>
          {/* Resumen */}
          <View style={styles.resumen}>
            <Text style={styles.resumenEtiqueta}>{anio === TODOS ? 'Total pagado' : `Total pagado en ${anio}`}</Text>
            <Text style={styles.resumenTotal}>{quetzales(total)}</Text>
            <Text style={styles.resumenSub}>
              {validos.length} {validos.length === 1 ? 'pago' : 'pagos'}
              {validos[0] ? ` · último el ${fechaCorta(validos[0].fecha_emision)}` : ''}
            </Text>
          </View>

          {/* Filtro por año */}
          {anios.length > 2 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filaFiltros} contentContainerStyle={{ gap: 8 }}>
              {anios.map((a) => (
                <Pressable key={a} onPress={() => setAnio(a)} style={[styles.chip, anio === a && styles.chipActivo]}>
                  <Text style={[styles.textoChip, anio === a && styles.textoChipActivo]}>{a}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {grupos.map((g) => (
            <View key={g.titulo}>
              <Text style={styles.mes}>{g.titulo}</Text>
              {g.pagos.map((p) => (
                <TarjetaPago
                  key={p.id_factura}
                  p={p}
                  abierto={abierto === p.id_factura}
                  onPress={() => setAbierto(abierto === p.id_factura ? null : p.id_factura)}
                />
              ))}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function TarjetaPago({ p, abierto, onPress }: { p: PagoCliente; abierto: boolean; onPress: () => void }) {
  const titulo = p.detalle[0]?.descripcion ?? p.tipo;
  const extra = p.detalle.length > 1 ? ` (+${p.detalle.length - 1})` : '';
  const icono = p.tipo === 'Membresía' ? 'card-account-details-outline' : p.tipo === 'Productos' ? 'shopping-outline' : 'receipt';
  const { hora } = partes(p.fecha_emision);

  return (
    <Pressable style={[styles.tarjeta, anulada(p) && styles.tarjetaAnulada]} onPress={onPress}>
      <View style={styles.fila}>
        <View style={styles.icono}>
          <MaterialCommunityIcons name={icono as any} size={22} color="#00E676" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.concepto} numberOfLines={abierto ? undefined : 1}>{titulo}{extra}</Text>
          <Text style={styles.sub}>{fechaCorta(p.fecha_emision)} · {p.metodo || 'Sin método'} · {p.sucursal}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.monto, anulada(p) && styles.montoAnulado]}>{quetzales(p.total)}</Text>
          {p.estado && p.estado.toLowerCase() !== 'pagada' ? <Text style={styles.badgeEstado}>{p.estado}</Text> : null}
        </View>
      </View>

      {abierto && (
        <View style={styles.detalle}>
          {p.detalle.map((d, i) => (
            <View key={i} style={styles.lineaDetalle}>
              <Text style={styles.textoLinea}>{d.cantidad > 1 ? `${d.cantidad} × ` : ''}{d.descripcion}</Text>
              <Text style={styles.textoLineaMonto}>{quetzales(d.subtotal)}</Text>
            </View>
          ))}
          <Text style={styles.datoFactura}>Factura #{p.numero}{hora && hora !== '00:00' ? ` · ${hora}` : ''}</Text>
          {p.referencia ? <Text style={styles.datoFactura}>Referencia: {p.referencia}</Text> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#020700' },
  container: { flexGrow: 1, padding: 20, paddingTop: 48 },
  centro: { flex: 1, backgroundColor: '#020700', justifyContent: 'center', alignItems: 'center' },
  textoCargando: { color: '#ffffff', marginTop: 10 },

  botonRegresar: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  textoRegresar: { color: '#00E676', fontSize: 14, fontWeight: 'bold' },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#ffffff', marginBottom: 14 },

  resumen: { backgroundColor: '#162216', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#223822', marginBottom: 12 },
  resumenEtiqueta: { color: '#9a9a9a', fontSize: 13 },
  resumenTotal: { color: '#00E676', fontSize: 30, fontWeight: 'bold', marginTop: 4 },
  resumenSub: { color: '#d0d0d0', fontSize: 13, marginTop: 4 },

  filaFiltros: { flexGrow: 0, marginBottom: 4 },
  chip: { borderWidth: 1, borderColor: '#223822', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#0E170E' },
  chipActivo: { backgroundColor: '#00E676', borderColor: '#00E676' },
  textoChip: { color: '#d0d0d0', fontSize: 13 },
  textoChipActivo: { color: '#020700', fontWeight: 'bold' },

  mes: { color: '#00B0FF', fontSize: 15, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  tarjeta: { backgroundColor: '#0E170E', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1F331F' },
  tarjetaAnulada: { opacity: 0.6 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icono: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1C2E1C', alignItems: 'center', justifyContent: 'center' },
  concepto: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  sub: { color: '#9a9a9a', fontSize: 12, marginTop: 2 },
  monto: { color: '#ffffff', fontSize: 15, fontWeight: 'bold' },
  montoAnulado: { textDecorationLine: 'line-through', color: '#9a9a9a' },
  badgeEstado: {
    marginTop: 4, backgroundColor: '#3a2a00', color: '#ffd166', fontSize: 11, fontWeight: 'bold',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden',
  },

  detalle: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#1F331F', paddingTop: 10, gap: 6 },
  lineaDetalle: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  textoLinea: { color: '#d0d0d0', fontSize: 13, flex: 1 },
  textoLineaMonto: { color: '#d0d0d0', fontSize: 13 },
  datoFactura: { color: '#9a9a9a', fontSize: 12, marginTop: 2 },

  cajaError: { backgroundColor: '#2a0f0f', borderColor: '#FF5252', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  textoError: { color: '#ffffff', fontSize: 14 },
  textoErrorSub: { color: '#cccccc', fontSize: 12, marginTop: 2 },
  cajaVacia: { alignItems: 'center', marginTop: 40, gap: 10 },
  textoVacio: { color: '#9a9a9a', fontSize: 14, textAlign: 'center' },
});
