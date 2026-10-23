// =============================================================
// mi_rutina.tsx — RUTINAS DEL CLIENTE DESDE LA BASE DE DATOS
//   Lista:   GET /cliente/rutinas      (nombre, entrenador, fecha)
//   Detalle: GET /cliente/rutinas/:id  (días → ejercicios → series)
// =============================================================

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, Pressable, RefreshControl,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { listarRutinas, obtenerRutina } from './conexion';
import type { EjercicioRutina, RutinaDetalle, RutinaResumen } from './conexion';

function formatearFecha(valor?: string | null): string {
  if (!valor) return '';
  const [anio, mes, dia] = String(valor).slice(0, 10).split('-');
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : String(valor);
}

// [10, 12, 10] -> "10-12"   |   [10, 10] -> "10"
function rango(valores: number[], sufijo = ''): string {
  if (valores.length === 0) return '-';
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  return (min === max ? `${min}` : `${min}-${max}`) + sufijo;
}

// Resumen de las series de un ejercicio para las etiquetas
function resumen(ej: EjercicioRutina) {
  const unidad = ej.unidad || 'reps';
  const pesos = ej.series.map((s) => s.peso_objetivo).filter((p): p is number => p !== null && p !== undefined && Number(p) > 0).map(Number);
  return {
    series: ej.series.length,
    // unidad_medida: reps = repeticiones; seg/min = el valor es tiempo
    cantidad: unidad === 'reps'
      ? `Reps: ${rango(ej.series.map((s) => s.repeticiones))}`
      : `Tiempo: ${rango(ej.series.map((s) => s.repeticiones), ` ${unidad}`)}`,
    peso: pesos.length > 0 ? `Peso: ${rango(pesos, ' kg')}` : null,
    descanso: `⏱ ${rango(ej.series.map((s) => s.descanso_segundos), 's')}`,
  };
}

export default function PantallaRutinas() {
  const router = useRouter();
  const [cargando, setCargando] = useState<boolean>(true);
  const [refrescando, setRefrescando] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [rutinas, setRutinas] = useState<RutinaResumen[]>([]);

  const [rutinaSeleccionada, setRutinaSeleccionada] = useState<RutinaDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState<number | null>(null); // id de la rutina que se está abriendo
  const [abiertos, setAbiertos] = useState<Record<number, boolean>>({});     // ejercicios con sus series desplegadas

  const cargar = useCallback(async (esRefresco = false) => {
    if (esRefresco) setRefrescando(true); else setCargando(true);
    setError('');
    try {
      setRutinas(await listarRutinas());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar tus rutinas.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirRutina = async (r: RutinaResumen) => {
    setCargandoDetalle(r.id_rutina);
    setError('');
    try {
      setRutinaSeleccionada(await obtenerRutina(r.id_rutina));
      setAbiertos({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la rutina.');
    } finally {
      setCargandoDetalle(null);
    }
  };

  if (cargando) {
    return (
      <View style={styles.containerCargando}>
        <ActivityIndicator size="large" color="#00E676" />
        <Text style={styles.textoCargando}>Cargando tus rutinas...</Text>
      </View>
    );
  }

  const entrenadorDeSeleccionada = rutinas.find((r) => r.id_rutina === rutinaSeleccionada?.id_rutina)?.entrenador;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#020700' }}
      contentContainerStyle={styles.container}
      refreshControl={!rutinaSeleccionada
        ? <RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} tintColor="#00E676" colors={['#00E676']} />
        : undefined}
    >
      {error !== '' && (
        <Pressable style={styles.cajaError} onPress={() => (rutinaSeleccionada ? setError('') : cargar())}>
          <Text style={styles.textoError}>{error}</Text>
          <Text style={styles.textoErrorSub}>Toca aquí para intentar de nuevo.</Text>
        </Pressable>
      )}

      {!rutinaSeleccionada ? (
        <>
          <TouchableOpacity
            style={styles.botonRegresar}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/perfil'))}
          >
            <Ionicons name="arrow-back" size={20} color="#00E676" />
            <Text style={styles.textoRegresar}> Volver</Text>
          </TouchableOpacity>
          <Text style={styles.tituloHeader}>Mis Rutinas</Text>

          {error === '' && rutinas.length === 0 && (
            <View style={styles.cajaVacia}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={40} color="#555" />
              <Text style={styles.textoVacio}>Todavía no tienes rutinas.</Text>
              <Text style={styles.textoVacioSub}>Cuando uno de tus entrenadores te cree una, aparecerá aquí.</Text>
              <TouchableOpacity style={styles.botonSecundario} onPress={() => router.push('/mi_entrenador')}>
                <Text style={styles.textoBotonSecundario}>Ver entrenadores</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Listado de rutinas */}
          {rutinas.map((rutina) => (
            <TouchableOpacity
              key={rutina.id_rutina}
              style={styles.tarjetaRutina}
              onPress={() => abrirRutina(rutina)}
              disabled={cargandoDetalle !== null}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.nombreRutina}>{rutina.nombre_rutina}</Text>
                <Text style={styles.subtituloRutina}>Entrenador: {rutina.entrenador}</Text>
                <Text style={styles.fechaRutina}>Creada el {formatearFecha(rutina.fecha_creacion)}</Text>
              </View>
              {cargandoDetalle === rutina.id_rutina
                ? <ActivityIndicator color="#00E676" />
                : <Ionicons name="chevron-forward" size={24} color="#00E676" />}
            </TouchableOpacity>
          ))}
        </>
      ) : (
        // Detalle de la rutina seleccionada (Días y Ejercicios)
        <View style={styles.detalleContainer}>
          <TouchableOpacity style={styles.botonRegresar} onPress={() => setRutinaSeleccionada(null)}>
            <Ionicons name="arrow-back" size={20} color="#00E676" />
            <Text style={styles.textoRegresar}> Volver a mis rutinas</Text>
          </TouchableOpacity>

          <Text style={styles.tituloDetalle}>{rutinaSeleccionada.nombre_rutina}</Text>
          {entrenadorDeSeleccionada ? <Text style={styles.subtituloRutina}>Entrenador: {entrenadorDeSeleccionada}</Text> : null}

          {rutinaSeleccionada.dias.length === 0 && (
            <Text style={styles.textoVacio}>Esta rutina todavía no tiene días cargados.</Text>
          )}

          {rutinaSeleccionada.dias.map((dia) => (
            <View key={dia.id_dia_rutina} style={styles.seccionDia}>
              <Text style={styles.tituloDia}>
                Día {dia.numero_dia}{dia.nombre_dia ? `: ${dia.nombre_dia}` : ''}
              </Text>

              {dia.ejercicios.length === 0 && <Text style={styles.textoVacioSub}>Sin ejercicios todavía.</Text>}

              {dia.ejercicios.map((ej) => {
                const r = resumen(ej);
                const abierto = !!abiertos[ej.id_bloque_ejercicio];
                return (
                  <Pressable
                    key={ej.id_bloque_ejercicio}
                    style={styles.tarjetaEjercicio}
                    onPress={() => setAbiertos((a) => ({ ...a, [ej.id_bloque_ejercicio]: !a[ej.id_bloque_ejercicio] }))}
                  >
                    <View style={styles.filaNombreEjercicio}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.nombreEjercicio}>{ej.nombre}</Text>
                        {ej.grupo_muscular ? <Text style={styles.grupoMuscular}>{ej.grupo_muscular}</Text> : null}
                      </View>
                      {ej.series.length > 0 && (
                        <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={18} color="#9a9a9a" />
                      )}
                    </View>

                    {ej.series.length === 0 ? (
                      <Text style={styles.textoVacioSub}>Sin series asignadas.</Text>
                    ) : (
                      <View style={styles.detallesEjercicioFila}>
                        <Text style={styles.badgeDetalle}>Series: {r.series}</Text>
                        <Text style={styles.badgeDetalle}>{r.cantidad}</Text>
                        {r.peso ? <Text style={styles.badgeDetalle}>{r.peso}</Text> : null}
                        <Text style={styles.badgeDescanso}>{r.descanso}</Text>
                      </View>
                    )}

                    {/* Cada serie por separado */}
                    {abierto && ej.series.map((s) => (
                      <View key={s.numero} style={styles.filaSerie}>
                        <Text style={styles.textoSerie}>Serie {s.numero}</Text>
                        <Text style={styles.textoSerie}>
                          {s.repeticiones} {ej.unidad === 'reps' || !ej.unidad ? 'reps' : ej.unidad}
                          {s.peso_objetivo ? ` · ${Number(s.peso_objetivo)} kg` : ''}
                        </Text>
                        <Text style={styles.textoSerieDescanso}>{s.descanso_segundos}s</Text>
                      </View>
                    ))}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#020700',
    padding: 20,
    paddingTop: 48,
  },
  containerCargando: {
    flex: 1,
    backgroundColor: '#020700',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textoCargando: {
    color: '#ffffff',
    marginTop: 10,
  },
  tituloHeader: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 20,
  },
  tarjetaRutina: {
    backgroundColor: '#162216',
    borderRadius: 12,
    padding: 18,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#223822',
  },
  nombreRutina: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtituloRutina: {
    color: '#00E676',
    fontSize: 14,
    marginTop: 4,
  },
  fechaRutina: {
    color: '#9a9a9a',
    fontSize: 12,
    marginTop: 2,
  },
  detalleContainer: {
    width: '100%',
  },
  botonRegresar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  textoRegresar: {
    color: '#00E676',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tituloDetalle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  seccionDia: {
    marginTop: 20,
  },
  tituloDia: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#00B0FF',
    marginBottom: 10,
  },
  tarjetaEjercicio: {
    backgroundColor: '#0E170E',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1F331F',
  },
  filaNombreEjercicio: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  nombreEjercicio: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  grupoMuscular: {
    color: '#9a9a9a',
    fontSize: 12,
    marginTop: 2,
  },
  detallesEjercicioFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badgeDetalle: {
    backgroundColor: '#1C2E1C',
    color: '#00E676',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  badgeDescanso: {
    backgroundColor: '#1C242E',
    color: '#00B0FF',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  filaSerie: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#1F331F',
    paddingVertical: 8,
    marginTop: 6,
  },
  textoSerie: {
    color: '#d0d0d0',
    fontSize: 13,
  },
  textoSerieDescanso: {
    color: '#00B0FF',
    fontSize: 13,
  },
  cajaError: {
    backgroundColor: '#2a0f0f',
    borderColor: '#FF5252',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  textoError: {
    color: '#ffffff',
    fontSize: 14,
  },
  textoErrorSub: {
    color: '#cccccc',
    fontSize: 12,
    marginTop: 2,
  },
  cajaVacia: {
    alignItems: 'center',
    marginTop: 30,
    gap: 6,
  },
  textoVacio: {
    color: '#ffffff',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 6,
  },
  textoVacioSub: {
    color: '#9a9a9a',
    fontSize: 13,
    textAlign: 'center',
  },
  botonSecundario: {
    borderWidth: 1,
    borderColor: '#00E676',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 12,
  },
  textoBotonSecundario: {
    color: '#00E676',
    fontWeight: 'bold',
  },
});
