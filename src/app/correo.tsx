// =============================================================
// correo.tsx — RECUPERAR CONTRASEÑA CON UN CÓDIGO POR CORREO
// Se llega desde r_contra.tsx ("Probar otro método").
//   Paso 1: alias → el servidor manda un código de 6 dígitos al correo
//           FM|1|CODIGO_ENVIAR_REQ|id|alias
//   Paso 2: código + contraseña nueva
//           FM|1|CODIGO_VERIFICAR_REQ|id|alias|código|contraseñaNueva
// =============================================================

import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View, Button, Alert, Image, ScrollView } from 'react-native';
import { enviarCodigoPorCorreo, recuperarConCodigoPorTrama } from './conexion';

export default function RecuperarPorCorreo() {
  const router = useRouter();
  // Si viene de r_contra.tsx, el alias ya llega escrito
  const { alias: aliasRecibido } = useLocalSearchParams<{ alias?: string }>();

  const [paso, setPaso] = useState<number>(1);
  const [cargando, setCargando] = useState<boolean>(false);

  const [alias, setAlias] = useState<string>(typeof aliasRecibido === 'string' ? aliasRecibido : '');
  const [codigo, setCodigo] = useState<string>('');
  const [nuevaContrasena, setNuevaContrasena] = useState<string>('');
  const [verificarContrasena, setVerificarContrasena] = useState<string>('');

  const mostrarError = (e: unknown, porDefecto: string) =>
    Alert.alert('Error', e instanceof Error ? e.message : porDefecto);

  // Paso 1: pedir el código (también sirve para "Reenviar código")
  const pedirCodigo = async () => {
    if (!alias.trim()) {
      Alert.alert('Campo incompleto', 'Por favor ingresa tu alias.');
      return;
    }

    setCargando(true);
    try {
      const res = await enviarCodigoPorCorreo(alias.trim());
      if (res.codigo === '00') {
        // El servidor responde lo mismo exista o no el alias (por seguridad)
        Alert.alert('Revisa tu correo', res.detalle);
        setCodigo('');
        setPaso(2);
      } else {
        // 03 = pidió demasiados códigos seguidos
        Alert.alert('Error', res.detalle || 'No se pudo enviar el código.');
      }
    } catch (e) {
      mostrarError(e, 'No se pudo conectar con el servidor.');
    } finally {
      setCargando(false);
    }
  };

  // Paso 2: código + contraseña nueva
  const cambiarContrasena = async () => {
    if (!/^\d{6}$/.test(codigo.trim())) {
      Alert.alert('Código inválido', 'El código tiene 6 números. Revisa tu correo.');
      return;
    }
    if (!nuevaContrasena || !verificarContrasena) {
      Alert.alert('Campos incompletos', 'Por favor completa ambos campos de contraseña.');
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
      const res = await recuperarConCodigoPorTrama(alias.trim(), codigo.trim(), nuevaContrasena);
      if (res.codigo === '00') {
        Alert.alert('¡Éxito!', res.detalle || 'Contraseña actualizada correctamente.', [
          { text: 'OK', onPress: () => router.replace('/') },
        ]);
      } else {
        // 01 = código incorrecto o vencido (el detalle dice cuántos intentos quedan)
        // 03 = demasiados intentos | 05 = contraseña muy corta
        Alert.alert('No se pudo cambiar', res.detalle || 'Revisa el código e intenta de nuevo.');
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

      {/* PASO 1: Alias */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={[styles.scrollBase, paso !== 1 && styles.oculto]}
      >
        <Text style={styles.titulo}>Recuperar con tu correo</Text>
        <Text style={styles.labelInstruccion}>
          Te enviaremos un código de 6 números al correo que registraste.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Alias"
          value={alias}
          onChangeText={setAlias}
          autoCapitalize="none"
          placeholderTextColor="#888"
        />
        <View style={styles.contenedorBoton}>
          <Button title={cargando ? 'Enviando...' : 'Enviar código'} onPress={pedirCodigo} disabled={cargando} />
        </View>
        <Text style={styles.link} onPress={() => router.back()}>
          Usar mi pregunta de seguridad
        </Text>
        <Text style={styles.link} onPress={() => router.replace('/')}>
          Volver al inicio de sesión
        </Text>
      </ScrollView>

      {/* PASO 2: Código + contraseña nueva */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={[styles.scrollBase, paso !== 2 && styles.oculto]}
      >
        <Text style={styles.titulo}>Revisa tu correo</Text>
        <Text style={styles.labelInstruccion}>
          Escribe el código que te enviamos. Vence en 10 minutos y sirve una sola vez.
        </Text>
        <TextInput
          style={[styles.input, styles.inputCodigo]}
          placeholder="000000"
          value={codigo}
          onChangeText={(t) => setCodigo(t.replace(/\D/g, ''))} // solo números
          keyboardType="number-pad"
          maxLength={6}
          placeholderTextColor="#888"
        />
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
          <Button title={cargando ? 'Guardando...' : 'Cambiar contraseña'} onPress={cambiarContrasena} disabled={cargando} />
        </View>
        <Text style={styles.link} onPress={cargando ? undefined : pedirCodigo}>
          ¿No te llegó? Reenviar código
        </Text>
        <Text style={styles.link} onPress={() => setPaso(1)}>
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
    alignItems: 'center',
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
    resizeMode: 'contain',
  },
  titulo: {
    color: '#00E676',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  labelInstruccion: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    color: '#000000',
  },
  inputCodigo: {
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  contenedorBoton: {
    width: '100%',
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  link: {
    marginTop: 8,
    textAlign: 'center',
    color: '#5eb4ff',
    textDecorationLine: 'underline',
    fontSize: 14,
  },
});
