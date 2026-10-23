import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput, Alert, Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Accelerometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { obtenerSesion } from './sesion';

// Usuario que inició sesión: cada uno guarda sus récords con su propio id.
function usuarioDeLaSesion() {
  const sesion = obtenerSesion();
  return {
    id: sesion?.idUsuario ? String(sesion.idUsuario) : null,   // llave de los récords
    nombre: sesion?.nombre || '',                              // lo que se muestra
  };
}

export default function DeportesPodometro() {
  const [vista, setVista] = useState<'menu' | 'configIntervalo' | 'entreno' | 'registros'>('menu');
  const [tipoDeporte, setTipoDeporte] = useState<'caminar' | 'correr' | 'montar' | 'saltar'>('caminar');

  // Métricas del entreno
  const [pasos, setPasos] = useState<number>(0);
  const [segundos, setSegundos] = useState<number>(0);
  const [enPausa, setEnPausa] = useState<boolean>(false);

  // Configuración de Intervalos y Marcas Personales
  const [metaIntervaloKm, setMetaIntervaloKm] = useState<string>('1');
  const [marcasPersonales, setMarcasPersonales] = useState<any>({});

  const { id: usuarioActual, nombre: nombreUsuario } = usuarioDeLaSesion();

  // Cargar marcas personales exclusivas del usuario actual al iniciar
  useEffect(() => {
    cargarMarcasPersonales();
  }, [usuarioActual]);

  const cargarMarcasPersonales = async () => {
    if (!usuarioActual) {        // sin sesión no hay récords que mostrar
      setMarcasPersonales({});
      return;
    }
    try {
      const llaveUsuario = `@marcas_personales_${usuarioActual}`;
      const datos = await AsyncStorage.getItem(llaveUsuario);
      if (datos) {
        setMarcasPersonales(JSON.parse(datos));
      } else {
        setMarcasPersonales({});
      }
    } catch (error) {
      console.log('Error al cargar marcas', error);
    }
  };

  // Cronómetro
  useEffect(() => {
    let intervalo: ReturnType<typeof setInterval>;
    if (vista === 'entreno' && !enPausa) {
      intervalo = setInterval(() => {
        setSegundos((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(intervalo);
  }, [vista, enPausa]);

  // Cálculo aproximado de Km y Kcal
  const kilometros = parseFloat((pasos * 0.00075).toFixed(2));
  const kilocalorias = Math.floor(pasos * 0.04);

  // Control de Pausa Automática para Intervalos
  useEffect(() => {
    if (tipoDeporte === 'correr' && vista === 'entreno' && !enPausa) {
      const metaNum = parseFloat(metaIntervaloKm) || 1;
      if (kilometros >= metaNum) {
        setEnPausa(true);
        Alert.alert('¡Meta de Intervalo Alcanzada!', `Has completado los ${metaNum} km establecidos.`);
      }
    }
  }, [kilometros, tipoDeporte, vista, metaIntervaloKm]);

  // Acelerómetro para los pasos
  useEffect(() => {
    if (vista !== 'entreno' || enPausa) return;

    Accelerometer.setUpdateInterval(100);
    let ultimoPaso = 0;

    const subscription = Accelerometer.addListener((data) => {
      const { x, y, z } = data;
      const fuerza = Math.sqrt(x * x + y * y + z * z);
      const ahora = Date.now();

      const umbral = tipoDeporte === 'correr' ? 1.5 : 1.3;

      if (fuerza > umbral && ahora - ultimoPaso > 400) {
        setPasos((prev) => prev + 1);
        ultimoPaso = ahora;
      }
    });

    return () => {
      subscription.remove();
    };
  }, [vista, enPausa, tipoDeporte]);

  const formatearTiempo = (totalSegs: number) => {
    const hrs = Math.floor(totalSegs / 3600);
    const mins = Math.floor((totalSegs % 3600) / 60);
    const segs = totalSegs % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(segs).padStart(2, '0')}`;
  };

  const iniciarActividad = (deporte: 'Caminar' | 'Correr' | 'Montar' | 'Intervalo' | 'Saltar') => {
    if (deporte === 'Intervalo') {
      setVista('configIntervalo');
      return;
    }

    let mapeo: 'caminar' | 'correr' | 'montar' | 'saltar' = 'caminar';
    if (deporte === 'Correr') mapeo = 'correr';
    if (deporte === 'Montar') mapeo = 'montar';
    if (deporte === 'Saltar') mapeo = 'saltar';

    setTipoDeporte(mapeo);
    setPasos(0);
    setSegundos(0);
    setEnPausa(false);
    setVista('entreno');
  };

  const confirmarIntervalo = () => {
    setTipoDeporte('correr');
    setPasos(0);
    setSegundos(0);
    setEnPausa(false);
    setVista('entreno');
  };

  const finalizarEntrenamiento = async () => {
    if (!usuarioActual) {
      Alert.alert('Sesión cerrada', 'Inicia sesión otra vez para guardar tus récords.');
      setVista('menu');
      return;
    }
    try {
      const llaveUsuario = `@marcas_personales_${usuarioActual}`;
      const deporteActual = tipoDeporte;
      const marcaAnterior = marcasPersonales[deporteActual] || { maxKm: 0, maxPasos: 0, maxSegundos: 0 };

      const nuevaMarca = {
        maxKm: Math.max(marcaAnterior.maxKm, kilometros),
        maxPasos: Math.max(marcaAnterior.maxPasos, pasos),
        maxSegundos: Math.max(marcaAnterior.maxSegundos, segundos),
      };

      const actualizadas = { ...marcasPersonales, [deporteActual]: nuevaMarca };
      setMarcasPersonales(actualizadas);

      await AsyncStorage.setItem(llaveUsuario, JSON.stringify(actualizadas));

      Alert.alert('Entrenamiento Guardado', 'Tus datos y marcas personales han sido actualizados con éxito.');
    } catch (e) {
      console.log('Error al guardar marca', e);
    }

    setVista('menu');
  };

  // 1. VISTA DEL MENÚ PRINCIPAL
  if (vista === 'menu') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Image source={require('../../assets/images/Banner.jpeg')} style={styles.logo} />

        {[
          { nombre: 'Caminar', icono: 'walk' },
          { nombre: 'Correr', icono: 'run' },
          { nombre: 'Montar', icono: 'bicycle' },
          { nombre: 'Intervalo', icono: 'flag-checkered' },
          { nombre: 'Saltar', icono: 'jump-rope' }
        ].map((item) => (
          <TouchableOpacity
            key={item.nombre}
            style={styles.tarjetaDeporte}
            onPress={() => iniciarActividad(item.nombre as any)}
          >
            <View style={styles.infoDeporte}>
              <MaterialCommunityIcons name={item.icono as any} size={36} color="#00E676" />
              <Text style={styles.textoDeporte}>{item.nombre}</Text>
            </View>
            {marcasPersonales[item.nombre.toLowerCase()] && (
              <Text style={styles.textoRecord}>🏆 Máx: {marcasPersonales[item.nombre.toLowerCase()].maxKm} Km</Text>
            )}
          </TouchableOpacity>
        ))}

        {/* Botón para ver los registros guardados */}
        <TouchableOpacity
          style={styles.botonRegistros}
          onPress={() => {
            cargarMarcasPersonales();
            setVista('registros');
          }}
        >
          <Ionicons name="stats-chart" size={24} color="#020700" />
          <Text style={styles.textoBotonRegistros}>Ver Registros Guardados</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // 2. VISTA DE REGISTROS GUARDADOS
  if (vista === 'registros') {
    const deportesLista = ['caminar', 'correr', 'montar', 'saltar'];

    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.headerTitulo}>Registros y Récords</Text>
        <Text style={styles.subtituloUsuario}>{nombreUsuario ? `Usuario: ${nombreUsuario}` : 'Inicia sesión para ver tus récords'}</Text>

        {deportesLista.map((dep) => {
          const record = marcasPersonales[dep];
          return (
            <View key={dep} style={styles.tarjetaRegistro}>
              <Text style={styles.tituloDeporteRegistro}>
                {dep.toUpperCase()}
              </Text>
              {record ? (
                <View style={styles.detallesRegistro}>
                  <Text style={styles.textoDatoRegistro}>🏆 Distancia Máx: <Text style={styles.valorDato}>{record.maxKm} Km</Text></Text>
                  <Text style={styles.textoDatoRegistro}>👟 Pasos Máx: <Text style={styles.valorDato}>{record.maxPasos}</Text></Text>
                  <Text style={styles.textoDatoRegistro}>⏱ Tiempo Récord: <Text style={styles.valorDato}>{formatearTiempo(record.maxSegundos)}</Text></Text>
                </View>
              ) : (
                <Text style={styles.sinRegistros}>Sin registros guardados aún.</Text>
              )}
            </View>
          );
        })}

        <TouchableOpacity style={styles.botonConfirmar} onPress={() => setVista('menu')}>
          <Text style={styles.textoBotonConfirmar}>Volver al Menú</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // 3. VISTA DE CONFIGURACIÓN DE INTERVALO
  if (vista === 'configIntervalo') {
    return (
      <View style={styles.container}>
        <Text style={styles.headerTitulo}>Configurar Intervalo</Text>
        <Text style={styles.labelConfig}>Distancia objetivo (Km):</Text>
        <TextInput
          style={styles.inputConfig}
          keyboardType="numeric"
          value={metaIntervaloKm}
          onChangeText={setMetaIntervaloKm}
          placeholder="1"
          placeholderTextColor="#888"
        />
        <TouchableOpacity style={styles.botonConfirmar} onPress={confirmarIntervalo}>
          <Text style={styles.textoBotonConfirmar}>Comenzar Intervalo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRegresar} onPress={() => setVista('menu')}>
          <Text style={styles.textoRegresar}>Regresar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 4. VISTA DE ENTRENAMIENTO EN VIVO
  return (
    <ScrollView contentContainerStyle={styles.containerEntreno}>
      <View style={styles.filaMetrica}>
        <MaterialCommunityIcons
          name={tipoDeporte === 'caminar' ? 'walk' : tipoDeporte === 'correr' ? 'run' : tipoDeporte === 'montar' ? 'bicycle' : 'jump-rope'}
          size={28}
          color="#00E676"
        />
        <Text style={styles.textoKm}>{kilometros} <Text style={styles.unidadKm}>Km</Text></Text>
      </View>

      <Text style={styles.textoCronometro}>{formatearTiempo(segundos)}</Text>

      <View style={styles.bloqueSecundario}>
        <Text style={styles.textoSecundario}>{String(kilocalorias).padStart(3, '0')} <Text style={styles.unidadPequena}>Kcal</Text></Text>
        <Text style={styles.textoSecundario}>{String(pasos).padStart(5, '0')} <Text style={styles.unidadPequena}>Pasos</Text></Text>
      </View>

      <View style={styles.contenedorControles}>
        <TouchableOpacity
          style={[styles.botonControl, { backgroundColor: '#00B0FF' }]}
          onPress={() => setEnPausa(!enPausa)}
        >
          <Ionicons name={enPausa ? "play" : "pause"} size={30} color="#f6f8f5" />
          <Text style={styles.textoBotonControl}>{enPausa ? "Reanudar" : "Pausa"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.botonControl, { backgroundColor: '#FF3D00' }]}
          onPress={finalizarEntrenamiento}
        >
          <View style={styles.circuloDetener} />
          <Text style={styles.textoBotonControl}>Detener</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#020700',
    padding: 20,
    justifyContent: 'center',
  },
  logo: { width: 150, height: 100, alignSelf: 'auto', marginBottom: 5, resizeMode: 'contain' },
  headerTitulo: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 5,
  },
  subtituloUsuario: {
    color: '#00E676',
    fontSize: 14,
    marginBottom: 20,
  },
  tarjetaDeporte: {
    backgroundColor: '#162216',
    borderRadius: 16,
    padding: 18,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#223822',
  },
  infoDeporte: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textoDeporte: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
    marginLeft: 15,
    textTransform: 'lowercase',
  },
  textoRecord: {
    color: '#00E676',
    fontSize: 12,
    fontWeight: 'bold',
  },
  botonRegistros: {
    backgroundColor: '#00E676',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  textoBotonRegistros: {
    color: '#020700',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  tarjetaRegistro: {
    backgroundColor: '#111A11',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1C2E1C',
  },
  tituloDeporteRegistro: {
    color: '#00E676',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  detallesRegistro: {
    gap: 4,
  },
  textoDatoRegistro: {
    color: '#aaaaaa',
    fontSize: 14,
  },
  valorDato: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  sinRegistros: {
    color: '#777777',
    fontSize: 13,
    fontStyle: 'italic',
  },
  labelConfig: {
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 10,
  },
  inputConfig: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    marginBottom: 20,
    color: '#000000',
  },
  botonConfirmar: {
    backgroundColor: '#00E676',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  textoBotonConfirmar: {
    color: '#020700',
    fontWeight: 'bold',
    fontSize: 16,
  },
  linkRegresar: {
    alignItems: 'center',
  },
  textoRegresar: {
    color: '#5eb4ff',
    fontSize: 14,
  },
  containerEntreno: {
    flexGrow: 1,
    backgroundColor: '#020700',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filaMetrica: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  textoKm: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#ffffff',
    marginLeft: 10,
  },
  unidadKm: {
    fontSize: 18,
    color: '#00E676',
  },
  textoCronometro: {
    fontSize: 38,
    fontWeight: 'bold',
    color: '#00E676',
    marginBottom: 15,
    letterSpacing: 1,
  },
  bloqueSecundario: {
    width: '100%',
    marginBottom: 20,
  },
  textoSecundario: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  unidadPequena: {
    fontSize: 16,
    color: '#888888',
  },
  contenedorControles: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 10,
  },
  botonControl: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  circuloDetener: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#fefffd',
    marginBottom: 4,
  },
  textoBotonControl: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 2,
  },
});