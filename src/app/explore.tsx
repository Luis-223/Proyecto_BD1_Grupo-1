import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View, Button, Alert, Image, ScrollView } from 'react-native';

export default function CorreoRecuperacion() {
  const router = useRouter();
  const [paso, setPaso] = useState<number>(1);
  const [cargando, setCargando] = useState<boolean>(false);

  // Estados de los campos
  const [alias, setAlias] = useState<string>('');
  const [preguntaAsociada, setPreguntaAsociada] = useState<string>('¿Cuál es tu pregunta de seguridad?');
  const [respuestaUsuario, setRespuestaUsuario] = useState<string>('');
  const [nuevaContrasena, setNuevaContrasena] = useState<string>('');
  const [verificarContrasena, setVerificarContrasena] = useState<string>('');

  // Paso 1: Enviar FM|1|ReQCon_REQ|alias
  const manejarAlias = async () => {
    if (!alias.trim()) {
      Alert.alert('Campo incompleto', 'Por favor ingresa tu alias.');
      return;
    }

    setCargando(true);
    try {
      const tramaEnvio = `FM|1|ReQCon_REQ|${alias.trim()}`;
      console.log('Enviando trama:', tramaEnvio);

      setTimeout(() => {
        setPreguntaAsociada('¿Cuál es tu color favorito?'); // Pregunta devuelta para este alias
        setCargando(false);
        setPaso(2);
      }, 800);
    } catch (e) {
      setCargando(false);
      Alert.alert('Error', 'No se pudo conectar con el servidor.');
    }
  };

  // Paso 2: Enviar FM|1|ReQCon_REQ|alias|respuesta_contrasena
  const manejarRespuesta = async () => {
    if (!respuestaUsuario.trim()) {
      Alert.alert('Campo incompleto', 'Por favor ingresa tu respuesta.');
      return;
    }

    setCargando(true);
    try {
      const tramaEnvio = `FM|1|ReQCon_REQ|${alias.trim()}|${respuestaUsuario.trim()}`;
      console.log('Enviando trama:', tramaEnvio);

      setTimeout(() => {
        setCargando(false);
        setPaso(3);
      }, 800);
    } catch (e) {
      setCargando(false);
      Alert.alert('Error', 'Respuesta incorrecta.');
    }
  };

  // Paso 3: Enviar FM|1|ReQCon_REQ|alias|contrasena_nueva
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
      const tramaEnvio = `FM|1|ReQCon_REQ|${alias.trim()}|${nuevaContrasena}`;
      console.log('Enviando trama:', tramaEnvio);

      setTimeout(() => {
        setCargando(false);
        Alert.alert('¡Éxito!', 'Contraseña actualizada correctamente.', [
          { text: 'OK', onPress: () => router.replace('/') }
        ]);
      }, 800);
    } catch (e) {
      setCargando(false);
      Alert.alert('Error', 'No se pudo actualizar la contraseña.');
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
        <Text style={styles.labelInstruccion}>Revisa tu correo o ingresa tu alias:</Text>
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
        <Text style={styles.link} onPress={() => router.replace('/')}>
          Volver al inicio de sesión
        </Text>
      </ScrollView>

      {/* PASO 2: Pregunta asociada y Respuesta */}
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent} 
        style={[styles.scrollBase, paso !== 2 && styles.oculto]}
      >
        <Text style={styles.labelInstruccion}>Pregunta asociada a tu cuenta:</Text>
        <Text style={styles.textoPregunta}>{preguntaAsociada}</Text>

        <TextInput
          style={styles.input}
          placeholder="Respuesta de seguridad"
          value={respuestaUsuario}
          onChangeText={setRespuestaUsuario}
          autoCapitalize="none"
          placeholderTextColor="#888"
        />
        <View style={styles.contenedorBoton}>
          <Button title={cargando ? "Verificando..." : "Comprobar Respuesta"} onPress={manejarRespuesta} disabled={cargando} />
        </View>
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
        <Text style={styles.labelInstruccion}>Ingresa tu nueva contraseña:</Text>
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