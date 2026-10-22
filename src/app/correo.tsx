import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View, Button, Alert, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { loginPorTrama } from './conexion';
import { guardarSesion } from './sesion'; // NUEVO

export default function Index() {
  const router = useRouter();
  const [alias, setAlias] = useState<string>('');
  const [contrasena, setContrasena] = useState<string>('');
  const [mostrarContrasena, setMostrarContrasena] = useState<boolean>(false);
  const [intentosFallidos, setIntentosFallidos] = useState<number>(0);
  const [cargando, setCargando] = useState<boolean>(false);

  const manejarLogin = async () => {
    if (!alias.trim() || !contrasena) {
      Alert.alert('Campos incompletos', 'Por favor ingresa tu alias y contraseña.');
      return;
    }

    setCargando(true);
    try {
      const res = await loginPorTrama(alias.trim(), contrasena);

      if (res.codigo === '00') {
        setIntentosFallidos(0);

        // NUEVO: guardar el token. Sin esto, obtenerSesion() devolvía null
        // en todas las pantallas y mi_membresia nunca hacía la consulta.
        guardarSesion({
          token: res.token,
          idUsuario: res.idUsuario,
          nombre: res.nombre,
          rol: res.rol,
          acceso: res.acceso,
        });

        // CAMBIO: replace en vez de push, para que el botón atrás del teléfono
        // en perfil no regrese al login con la sesión todavía abierta
        router.replace({
          pathname: '/perfil',
          params: {
            nombre: res.nombre,
            rol: res.rol,
            acceso: res.acceso
          }
        });
      } else {
        setIntentosFallidos((prev) => prev + 1);
        Alert.alert('Error de acceso', res.detalle || 'Usuario o contraseña incorrectos.');
      }
    } catch (e) {
      setIntentosFallidos((prev) => prev + 1);
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/images/Banner.jpeg')} style={styles.logo} />
    <ScrollView horizontal={false} showsVerticalScrollIndicator={true} contentContainerStyle={styles.scrollContent} style={[styles.scrollBase, paso !== 1 && styles.oculto]}>   
      <Text>Revisa tu correo electrónico para recuperar tu contraseña.</Text>
        <TextInput
          style={styles.input}
          placeholder="Respuesta de seguridad"
          value={preguntaUsuario}
          onChangeText={setPreguntaUsuario}
          autoCapitalize="none"
        />
        </ScrollView>
    <ScrollView horizontal={false} showsVerticalScrollIndicator={true} contentContainerStyle={styles.scrollContent} style={[styles.scrollBase, paso !== 1 && styles.oculto]}>   
      <Text>Revisa tu correo electrónico para recuperar tu contraseña.</Text>
        <TextInput
          style={styles.input}
          placeholder="Respuesta de seguridad"
          value={preguntaUsuario}
          onChangeText={setPreguntaUsuario}
          autoCapitalize="none"
        />
        </ScrollView>
        <ScrollView horizontal={false} showsVerticalScrollIndicator={true} contentContainerStyle={styles.scrollContent} style={[styles.scrollBase, paso !== 1 && styles.oculto]}>   
        
                    <TextInput
                            style={styles.input}
                            placeholder="Nueva contraseña"
                            value={alias}
                            onChangeText={setncontrasena}
                            autoCapitalize="none"
                            placeholderTextColor="#888"
                          />
                           <TextInput
                            style={styles.input}
                            placeholder=" Verificar nueva contraseña"
                            value={alias}
                            onChangeText={setncontrasena2}
                            autoCapitalize="none"
                            placeholderTextColor="#888"
                          />
                <View style={styles.contenedorBoton}>
                <Button title={cargando ? "Guardando..." : "Cambiar"} onPress={manejarContra} disabled={cargando} />
              </View>
        
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
  logo: {
    width: 180,
    height: 110,
    marginBottom: 20,
    resizeMode: 'contain'
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
  inputConIconoContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    height: 48,
  },
  inputConIconoText: {
    flex: 1,
    height: '100%',
    color: '#000000',
  },
  botonIcono: {
    padding: 4,
  },
  textoAlertaIntentos: {
    color: '#FF5252',
    fontSize: 13,
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: 'bold',
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
  linkRegistro: {
    marginTop: 14,
    textAlign: 'center',
    color: '#00E676',
    textDecorationLine: 'underline',
    fontSize: 14,
    fontWeight: 'bold'
  },
});
