import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';

export default function FormularioRegistro() {
  // --- 1. CAMPOS DE TEXTO (Entrada manual) ---
  const [aliasUsuario, setAliasUsuario] = useState<string>('');
  const [contrasena1, setContrasena1] = useState<string>('');
  const [nombreUsuario, setNombreUsuario] = useState<string>('');
  const [apellidosUsuario, setApellidosUsuario] = useState<string>('');
  const [fechaNacimiento, setFechaNacimiento] = useState<string>(''); // Formato YYYY-MM-DD
  const [dpi_nitUsuario, setDpi_nitUsuario] = useState<string>('');
  const [telefonoUsuario, setTelefonoUsuario] = useState<string>('');
  const [respuestaPrUsuario, setRespuestaPrUsuario] = useState<string>('');

  // --- 2. CAMPOS DE DESPLEGABLE (Guardan la opción seleccionada) ---
  const [generoUsuario, setGeneroUsuario] = useState<string>('');
  const [departamentoUsuario, setDepartamentoUsuario] = useState<string>('');
  const [municipioUsuario, setMunicipioUsuario] = useState<string>('');
  const [sucursalUsuario, setSucursalUsuario] = useState<string>('');
  const [membresiaUsuario, setMembresiaUsuario] = useState<string>('');
  const [mesPagado, setMesPagado] = useState<string>('');
  const [metodoPago, setMetodoPago] = useState<string>('');
  const [preguntaUsuario, setPreguntaUsuario] = useState<string>('');

  // --- 3. CATÁLOGOS / LISTAS DE OPCIONES PARA DROPDOWNS ---
  const opcionesGenero = [
    { label: 'Masculino', value: 'M' },
    { label: 'Femenino', value: 'F' },
  ];

  const opcionesDepartamentos = [
    { label: 'Guatemala', value: '01' },
    { label: 'Sacatepéquez', value: '03' },
    { label: 'Chimaltenango', value: '04' },
  ];

  const opcionesMembresias = [
    { label: 'Básica', value: 'MEM_BASICA' },
    { label: 'VIP', value: 'MEM_VIP' },
  ];

  const opcionesMetodosPago = [
    { label: 'Efectivo', value: 'EFE' },
    { label: 'Tarjeta de Crédito/Débito', value: 'TAR' },
    { label: 'Transferencia', value: 'TRA' },
  ];

  const opcionesPreguntas = [
    { label: '¿Nombre de tu primera mascota?', value: 'PREG_1' },
    { label: '¿Ciudad donde naciste?', value: 'PREG_2' },
  ];

  // --- 4. FUNCIÓN PARA ARMAR Y ENVIAR LA TRAMA ---
  const armarYEnviarTrama = () => {
    // Ejemplo de trama delimitada por pipe (|)
    const trama = [
      aliasUsuario,
      contrasena1,
      nombreUsuario,
      apellidosUsuario,
      fechaNacimiento,
      generoUsuario,
      dpi_nitUsuario,
      telefonoUsuario,
      departamentoUsuario,
      municipioUsuario,
      sucursalUsuario,
      membresiaUsuario,
      mesPagado,
      metodoPago,
      preguntaUsuario,
      respuestaPrUsuario,
    ].join('|');

    console.log('Trama final a enviar:', trama);
  };

  return (
    <ScrollView
        horizontal={false}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.scrollContent}
        style={[styles.scrollBase, paso !== 4 && styles.oculto]}
      >
        <Dropdown
                  style={styles.dropdown}
                  data={opcionesGenero}
                  labelField="label"
                  valueField="value"
                  placeholder="Pregunta de Seguridad"
                  value={opcionesPreguntas}
                  onChange={(item) => {
                    setSeleccionPregunta(item.value);
                  }}
                />
        <TextInput
                  style={styles.input}
                  placeholder=""
                  value={preguntaUsuario}
                  onChangeText={setPreguntaUsuario}
                  autoCapitalize="none"
                />

        <View style={styles.botones}>
          <View style={styles.contenedorBoton}>
            <Button title="Atrás" onPress={() => setPaso(3)} />
          </View>
          <View style={styles.contenedorBoton}>
            <Button title="Registrar" onPress={() => setPaso(4)} />
          </View>
        </View>
    
        <Text style={styles.link} onPress={iniciarSesion1}>
          {'¿Ya tienes cuenta? Inicia sesión'}
        </Text>
      </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  label: { fontSize: 14, fontWeight: 'bold', marginTop: 10 },
  dropdown: {
    height: 50,
    borderColor: 'gray',
    borderWidth: 0.5,
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
  },
});