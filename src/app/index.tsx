import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View, Button, Alert, Image } from 'react-native';
import { loginPorTrama } from './conexion';

export default function Index() {
  const router = useRouter();
  const [alias, setAlias] = useState<string>('');
  const [contrasena, setContrasena] = useState<string>('');
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
        // Login exitoso, reiniciamos contador y navegamos al perfil
        setIntentosFallidos(0);
        router.push({
          pathname: '/perfil',
          params: { 
            nombre: res.nombre, 
            rol: res.rol, 
            acceso: res.acceso 
          }
        });
      } else {
        // Incrementamos el contador de fallos cuando el servidor rechaza las credenciales
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

      <TextInput
        style={styles.input}
        placeholder="Alias"
        value={alias}
        onChangeText={setAlias}
        autoCapitalize="none"
        placeholderTextColor="#888"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        value={contrasena}
        onChangeText={setContrasena}
        secureTextEntry
        placeholderTextColor="#888"
      />

      {/* Contador de intentos fallidos */}
      {intentosFallidos > 0 && (
        <Text style={styles.textoAlertaIntentos}>
          Intentos fallidos: {intentosFallidos} / 5
        </Text>
      )}

      <View style={styles.contenedorBoton}>
        <Button title={cargando ? "Entrando..." : "Iniciar Sesión"} onPress={manejarLogin} disabled={cargando} />
      </View>

      {/* Enlace para recuperar contraseña */}
      <Text style={styles.link} onPress={() => router.push('/recuperar')}>
        ¿No recuerdas tu contraseña? Prueba de otra manera
      </Text>

      {/* Enlace de registro existente */}
      <Text style={styles.linkRegistro} onPress={() => router.push('/sign_up')}>
        ¿No tienes cuenta? Regístrate
      </Text>
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