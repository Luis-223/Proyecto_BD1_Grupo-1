import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View, Button, Alert, Image, ScrollView } from 'react-native';
// NUEVO: antes los tres pasos estaban simulados con setTimeout y la pregunta era fija
import { preguntaPorAlias, verificarRespuestaPorTrama, recuperarPorTrama } from './conexion';

export default function RecuperarContrasena() {
  const router = useRouter();
  const [paso, setPaso] = useState<number>(1);
  const [cargando, setCargando] = useState<boolean>(false);

  // Estados de los campos
  const [alias, setAlias] = useState<string>('');
  const [idPregunta, setIdPregunta] = useState<string>(''); // NUEVO: el servidor revisa la respuesta de ESTA pregunta
  const [preguntaAsociada, setPreguntaAsociada] = useState<string>('');
  const [respuestaUsuario, setRespuestaUsuario] = useState<string>('');
  const [nuevaContrasena, setNuevaContrasena] = useState<string>('');
  const [verificarContrasena, setVerificarContrasena] = useState<string>('');

  const mostrarError = (e: unknown, porDefecto: string) =>
    Alert.alert('Error', e instanceof Error ? e.message : porDefecto);

  // Paso 1: FM|1|PREGUNTA_ALIAS_REQ|id|alias  →  idPregunta | texto de la pregunta
  const manejarAlias = async () => {
    if (!alias.trim()) {
      Alert.alert('Campo incompleto', 'Por favor ingresa tu alias.');
      return;
    }

    setCargando(true);
    try {
      const res = await preguntaPorAlias(alias.trim());
      if (res.codigo === '00') {
        setIdPregunta(res.idPregunta);
        setPreguntaAsociada(res.pregunta);
        setRespuestaUsuario('');
        setPaso(2);
      } else {
        Alert.alert('Error', res.detalle || 'No se pudo obtener la pregunta de seguridad.');
      }
    } catch (e) {
      mostrarError(e, 'No se pudo conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  };

  // Paso 2: FM|1|VERIFICAR_RESPUESTA_REQ|id|alias|idPregunta|respuesta  (no cambia nada)
  const manejarRespuesta = async () => {
    if (!respuestaUsuario.trim()) {
      Alert.alert('Campo incompleto', 'Por favor ingresa tu respuesta.');
      return;
    }

    setCargando(true);
    try {
      const res = await verificarRespuestaPorTrama(alias.trim(), idPregunta, respuestaUsuario);
      if (res.codigo === '00') {
        setPaso(3);
      } else {
        // 01 = respuesta incorrecta, 03 = demasiados intentos
        Alert.alert('Respuesta incorrecta', res.detalle || 'La respuesta no es correcta.');
      }
    } catch (e) {
      mostrarError(e, 'No se pudo verificar la respuesta.');
    } finally {
      setCargando(false);
    }
  };

  // Paso 3: FM|1|RECUPERAR_REQ|id|alias|respuesta|contraseñaNueva
  // Se manda otra vez la respuesta: el servidor la vuelve a revisar antes de cambiar la contraseña.
  const manejarCambioContra = async () => {
    if (!nuevaContrasena || !verificarContrasena) {
      Alert.alert('Campos incompletos', 'Por favor completa ambos campos.');
      return;
    }

    if (nuevaContrasena !== verificarContrasena) {
      Alert.alert('Error', 'Las contraseñas no coinciden.');
      return;
    }

    if (nuevaContrasena.length < 8) {
      Alert.alert('Seguridad', 'La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setCargando(true);
    try {
      const res = await recuperarPorTrama(alias.trim(), respuestaUsuario, nuevaContrasena);
      if (res.codigo === '00') {
        Alert.alert('¡Éxito!', res.detalle || 'Contraseña actualizada correctamente.', [
          { text: 'OK', onPress: () => router.replace('/') },
        ]);
      } else {
        Alert.alert('Error', res.detalle || 'No se pudo actualizar la contraseña.');
      }
    } catch (e) {
      mostrarError(e, 'No se pudo actualizar la contraseña.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/images/Banner.jpeg')} style={styles.logo} />

      {/* PASO 1: Ingresar Alias */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={[styles.scrollBase, paso !== 1 && styles.oculto]}
      >
        <Text style={styles.labelInstruccion}>Ingresa tu usuario o alias:</Text>
        <TextInput
          style={styles.input}
          placeholder="Alias"
          value={alias}
          onChangeText={setAlias}
          autoCapitalize="none"
          placeholderTextColor="#888"
        />
        <View style={styles.contenedorBoton}>
          <Button title={cargando ? "Verificando..." : "Comprobar Alias"} onPress={manejarAlias} disabled={cargando} />
        </View>
        {/* NUEVO: otro camino, sin pregunta de seguridad */}
        <Text style={styles.link} onPress={() => router.push({ pathname: '/correo', params: { alias: alias.trim() } })}>
          Recibir un código en mi correo
        </Text>
        <Text style={styles.link} onPress={() => router.replace('/')}>
          Volver al inicio de sesión
        </Text>
      </ScrollView>

      {/* PASO 2: Pregunta del alias y Respuesta */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={[styles.scrollBase, paso !== 2 && styles.oculto]}
      >
        <Text style={styles.labelInstruccion}>Pregunta de seguridad:</Text>
        <Text style={styles.textoPregunta}>{preguntaAsociada}</Text>

        <TextInput
          style={styles.input}
          placeholder="Escribe tu respuesta"
          value={respuestaUsuario}
          onChangeText={setRespuestaUsuario}
          autoCapitalize="none"
          placeholderTextColor="#888"
        />
        <View style={styles.contenedorBoton}>
          <Button title={cargando ? "Verificando..." : "Comprobar Respuesta"} onPress={manejarRespuesta} disabled={cargando} />
        </View>
        {/* NUEVO: si no recuerda la respuesta, recibe un código por correo (correo.tsx) */}
        <Text style={styles.link} onPress={() => router.push({ pathname: '/correo', params: { alias: alias.trim() } })}>
          ¿No recuerdas la respuesta? Probar otro método
        </Text>
        <Text style={styles.link} onPress={() => setPaso(1)}>
          Regresar
        </Text>
      </ScrollView>

      {/* PASO 3: Nueva Contraseña */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={[styles.scrollBase, paso !== 3 && styles.oculto]}
      >
        <Text style={styles.labelInstruccion}>Crea tu nueva contraseña:</Text>
        <TextInput
          style={styles.input}
          placeholder="Nueva contraseña"
          secureTextEntry
          value={nuevaContrasena}
          onChangeText={setNuevaContrasena}
          autoCapitalize="none"
          placeholderTextColor="#888"
        />
        <TextInput
          style={styles.input}
          placeholder="Verificar nueva contraseña"
          secureTextEntry
          value={verificarContrasena}
          onChangeText={setVerificarContrasena}
          autoCapitalize="none"
          placeholderTextColor="#888"
        />
        <View style={styles.contenedorBoton}>
          <Button title={cargando ? "Guardando..." : "Cambiar Contraseña"} onPress={manejarCambioContra} disabled={cargando} />
        </View>
        <Text style={styles.link} onPress={() => setPaso(2)}>
          Regresar
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020700',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scrollBase: {
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  oculto: {
    display: 'none',
  },
  logo: {
    width: 180,
    height: 110,
    marginBottom: 20,
    resizeMode: 'contain'
  },
  labelInstruccion: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  textoPregunta: {
    color: '#00E676',
    fontSize: 15,
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    color: '#000000'
  },
  contenedorBoton: {
    width: '100%',
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden'
  },
  link: {
    marginTop: 8,
    textAlign: 'center',
    color: '#5eb4ff',
    textDecorationLine: 'underline',
    fontSize: 14
  },
});
