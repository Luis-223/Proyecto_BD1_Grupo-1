import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, Image, StyleSheet, Text, TextInput, View } from 'react-native';

type Usuario = {
  correo: string;
  contrasena: string;
};
// true = entra directo sin verificar (solo para pruebas, sin base de datos)
const SALTAR_LOGIN = true;
export default function Index() {
  const router = useRouter();
  const [usuariosRegistrados, setUsuariosRegistrados] = useState<Usuario[]>([]);
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [mensaje, setMensaje] = useState('');

  const crearCuenta = () => {
    if (!correo || !contrasena) {
      setMensaje('Completa ambos campos');
    } else if (usuariosRegistrados.some((u) => u.correo === correo)) {
      setMensaje('Ese correo ya está registrado');
    } else {
      setUsuariosRegistrados([...usuariosRegistrados, { correo, contrasena }]);
      setMensaje('Cuenta creada. Ya puedes iniciar sesión');
    }
  };

 const iniciarSesion = async () => {
  if (SALTAR_LOGIN) {
    router.push({ pathname: '/perfil', params: { correo: correo || 'invitado@fitmanager.com' } });
    return;
  }

  // Verificación normal (se usa cuando SALTAR_LOGIN = false)
  const valido = await validarLogin(correo, contrasena);
  if (valido) {
    setMensaje('');
    router.push({ pathname: '/perfil', params: { correo } });
  } else {
    setMensaje('Correo o contraseña incorrectos');
  }
};

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/images/Banner.jpeg')} style={styles.logo} />
      
      <TextInput
        style={styles.input}
        placeholder="Correo"
        value={correo}
        onChangeText={setCorreo}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        value={contrasena}
        onChangeText={setContrasena}
        secureTextEntry
      />

      <View style={styles.botones}>
        <Button title="Crear cuenta" onPress={crearCuenta} />
        <Button title="Iniciar sesión" onPress={iniciarSesion} />
      </View>

      <Text style={styles.mensaje}>{mensaje}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor:'#020700' },
  titulo: { fontSize: 28, fontWeight: 'bold', marginBottom: 24, textAlign: 'center', color: '#5e5f5f' },
  logo: { width: 300, height: 100, alignSelf: 'center', marginBottom: 5,resizeMode: 'contain'},
  input: { borderWidth: 1, borderColor: '#ffffff', borderRadius: 8, padding: 12, marginBottom: 12,backgroundColor:'#ffffff' },
  botones: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8,borderRadius:12 },
  mensaje: { marginTop: 16, textAlign: 'center', color: '#ffffff' },
});