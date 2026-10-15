import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { loginPorTrama } from './conexion';
import { guardarSesion } from './sesion';


const SALTAR_LOGIN = false; 

export default function Index() {
  const router = useRouter();
  const [alias, setAlias] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);

  // Redirecciona a tu formulario multi-pasos
  const crearCuenta = () => {
    router.push({ pathname: '/sign_up' });
  };

  const iniciarSesion = async () => {
    // Modo de pruebas directo
    if (SALTAR_LOGIN) {
      router.push({ 
        pathname: '/perfil', 
        params: { nombre: alias || 'Invitado', rol: 'TEST', acceso: 'FULL' } 
      });
      return;
    }

    if (!alias.trim() || !contrasena) {
      setMensaje('Escribe tu usuario y tu contraseña');
      return;
    }

    setCargando(true);
    setMensaje('');

    try {
      const res = await loginPorTrama(alias.trim(), contrasena);
      
      if (res.codigo !== '00') {
        setMensaje(res.detalle); // Muestra el mensaje de error retornado por el servidor
        return;
      }

      guardarSesion({
        token: res.token,
        idUsuario: res.idUsuario,
        nombre: res.nombre,
        rol: res.rol,
        acceso: res.acceso,
      });

      setContrasena(''); // Limpia la contraseña por seguridad

      router.push({
        pathname: '/perfil',
        params: { nombre: res.nombre, rol: res.rol, acceso: res.acceso },
      });
    } catch (e) {
      console.log(e);
    setMensaje('Error: ' + (e instanceof Error ? e.message : 'desconocido'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image 
        source={require('../../assets/images/Banner.jpeg')} 
        style={styles.logo} 
      />

      <TextInput
        style={styles.input}
        placeholder="Usuario / Alias"
        value={alias}
        onChangeText={setAlias}
        autoCapitalize="none"
        autoCorrect={false}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        value={contrasena}
        onChangeText={setContrasena}
        secureTextEntry
      />

      <View style={styles.botones}>
        <Button
          title={cargando ? 'Entrando...' : 'Iniciar sesión'}
          onPress={iniciarSesion}
          disabled={cargando}
        />
      </View>

      <Text style={styles.link} onPress={crearCuenta}>
        ¿No tienes cuenta? Regístrate
      </Text>

      {mensaje ? <Text style={styles.mensaje}>{mensaje}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    padding: 24, 
    backgroundColor: '#020700' 
  },
  titulo: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    marginBottom: 24, 
    textAlign: 'center', 
    color: '#5e5f5f' 
  },
  logo: { 
    width: 300, 
    height: 100, 
    alignSelf: 'center', 
    marginBottom: 15, 
    resizeMode: 'contain' 
  },
  input: { 
    borderWidth: 1, 
    borderColor: '#ffffff', 
    borderRadius: 8, 
    padding: 12, 
    marginBottom: 12, 
    backgroundColor: '#ffffff' 
  },
  botones: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    marginTop: 8, 
    borderRadius: 12 
  },
  link: { 
    marginTop: 16, 
    textAlign: 'center', 
    color: '#5eb4ff', 
    textDecorationLine: 'underline' 
  },
  mensaje: { 
    marginTop: 16, 
    textAlign: 'center', 
    color: '#ff4d4d' 
  },
});