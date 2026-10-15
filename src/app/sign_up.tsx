import { useState } from 'react';
import { loginPorTrama } from '../services/conexion';
import { useRouter } from 'expo-router';
import { Button, ScrollView, Image, StyleSheet, Text, TextInput, View, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { RadioButton } from 'react-native-paper';
import { Dropdown } from 'react-native-element-dropdown';

type Usuario = {
  correo: string;
  contrasena: string;
};
// true = entra directo sin verificar (solo para pruebas, sin base de datos)
const SALTAR_LOGIN = true;
export default function sign_up() {

  const [paso, setPaso] = useState<number>(1);
  const [mostrarDatePicker, setMostrarDatePicker] = useState<boolean>(false);

  // --- 1. CAMPOS DE TEXTO (Entrada manual) ---
  const [aliasUsuario, setAliasUsuario] = useState<string>('');
  const [correoUsuario, setCorreoUsuario] = useState<string>('');
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
  const [mensaje, setMensaje] = useState('');
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
  const opcionesMunicipios = [
    { label: 'Guatemala City13132', value: '0101' },
    { label: 'Sacatepéquez123', value: '0301' },
    { label: 'Chimaltenango1231231', value: '0401' },
  ];
  const opcionesSucursales = [
    { label: 'Guatemalazona1', value: '01' },
    { label: 'Sacatepéquezzona1', value: '03' },
    { label: 'Chimaltenangozona1', value: '04' },
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
  /*const crearCuenta = () => {
    if (!setAliasUsuario || !setContrasena1) {
      setMensaje('Completa ambos campos');
    } else if (setAliasUsuario.some((u) => u.setAliasUsuario === setAliasUsuario)) {
      setMensaje('Este alias ya está registrado');
    } 
  };*/
  /*const siguiente1 = () => {
    if (!setAliasUsuario || !setContrasena1) {
      setMensaje('Completa ambos campos');
    } else if (setAliasUsuario.some((u) => u.setAliasUsuario === setAliasUsuario)) {
      setMensaje('Este alias ya está registrado');
    }else{

    }
  };
  */
  const iniciarSesion1 = () => {}
  return (
    <View style={styles.container}>
      <Image source={require('../../assets/images/Banner.jpeg')} style={styles.logo} />
   <ScrollView horizontal={false} showsVerticalScrollIndicator={true} contentContainerStyle={styles.container} scrollEnabled={true} style={[styles.scrollBase, paso !== 1 && styles.oculto]}>
  {/* Contenido del primer ScrollView */}

      <TextInput
        style={styles.input}
        placeholder="Alias"
        value={aliasUsuario}
        onChangeText={setAliasUsuario}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Correo"
        value={correoUsuario}
        onChangeText={setCorreoUsuario}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        value={contrasena1}
        onChangeText={setContrasena1}
        secureTextEntry
      />
      
      <View style={styles.botones}>
        <Button title="Siguiente" onPress={() => setPaso(2)} />
      </View>
      <Text style={styles.link} onPress={iniciarSesion1}>
              { '¿Ya tienes cuenta? Inicia sesión'}
      </Text>
      
    </ScrollView>
    {/* --------------------------------------------------------------------------------------------------------------------- */}
    {/* --------------------------------------------------------------------------------------------------------------------- */}
    {/* --------------------------------------------------------------------------------------------------------------------- */}
    {/* --------------------------------------------------------------------------------------------------------------------- */}
    {/* --------------------------------------------------------------------------------------------------------------------- */}

    <ScrollView
        horizontal={false}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.container}
        scrollEnabled={true}
       style={[styles.scrollBase, paso !== 2 && styles.oculto]} // Tenía la condición incorrecta // Oculto si paso no es 2
      >
        
        <TextInput
        style={styles.input}
        placeholder="Nombre/s"
        value={nombreUsuario}
        onChangeText={setNombreUsuario}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Apellido/s"
        value={apellidosUsuario}
        onChangeText={setApellidosUsuario}
        autoCapitalize="none"
      />
      <Pressable 
  style={styles.input} 
  onPress={() => setMostrarDatePicker(true)}
>
  {mostrarDatePicker && (
  <DateTimePicker
    value={fechaNacimiento ? new Date(fechaNacimiento) : new Date()}
    mode="date"
    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
    onChange={(event, selectedDate) => {
      setMostrarDatePicker(false); // Cierra el selector al elegir o cancelar
      if (selectedDate) {
        // Formatea la fecha a YYYY-MM-DD para guardarla en tu string
        const fechaFormateada = selectedDate.toISOString().split('T')[0];
        setFechaNacimiento(fechaFormateada);
      }
    }}
  />
  )}
  <Text style={{ color: fechaNacimiento ? '#000000' : '#888888' }}>
    {fechaNacimiento ? fechaNacimiento : 'Seleccionar Fecha de Nacimiento'}
  </Text>
</Pressable>
      
      <Dropdown
        style={styles.dropdown}
        data={opcionesGenero}
        labelField="label"
        valueField="value"
        placeholder="Genero"
        value={generoUsuario}
        onChange={(item) => {
          setGeneroUsuario(item.value); // Al seleccionar, actualiza la variable de estado
        }}
      />
      <TextInput
        style={styles.input}
        placeholder="Nit/DPI"
        value={dpi_nitUsuario}
        onChangeText={setDpi_nitUsuario}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="telefono"
        value={telefonoUsuario}
        onChangeText={setTelefonoUsuario}
        autoCapitalize="none"
      />
      <Dropdown
        style={styles.dropdown}
        data={opcionesDepartamentos}
        labelField="label"
        valueField="value"
        placeholder="Seleccione su departamento"
        value={departamentoUsuario}
        onChange={(item) => {
          setDepartamentoUsuario(item.value); // Al seleccionar, actualiza la variable de estado
        }}
      />
      <Dropdown
        style={styles.dropdown}
        data={opcionesMunicipios}
        labelField="label"
        valueField="value"
        placeholder="Seleccione su municipio"
        value={municipioUsuario}
        onChange={(item) => {
          setMunicipioUsuario(item.value); // Al seleccionar, actualiza la variable de estado
        }}
      />
      <Dropdown
        style={styles.dropdown}
        data={opcionesSucursales}
        labelField="label"
        valueField="value"
        placeholder="Seleccione su sucursal"
        value={sucursalUsuario}
        onChange={(item) => {
          setSucursalUsuario(item.value); // Al seleccionar, actualiza la variable de estado
        }}
      />



      {/*botones */}
        <View style={styles.botones}>
        <Button title="Siguiente1" onPress={() => setPaso(3)} />
      </View>
      <Text style={styles.link} onPress={iniciarSesion1}>
              { '¿Ya tienes cuenta? Inicia sesión'}
      </Text>
      
      </ScrollView>
      {/*-------------------------------------------------------------------------------------------------------------------  */}
      {/*-------------------------------------------------------------------------------------------------------------------  */}
      {/*-------------------------------------------------------------------------------------------------------------------  */}
      {/*-------------------------------------------------------------------------------------------------------------------  */}
      <ScrollView
        horizontal={true}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.container}
        scrollEnabled={true}
       style={[styles.scrollBase, paso !== 3 && styles.oculto]} // Tenía la condición incorrecta // Oculto si paso no es 2
      >
        <RadioButton.Group onValueChange={newValue => setMetodoPago(newValue)} value={metodoPago}>
        <RadioButton.Item label="Pago en sucursal" value="SUCURSAL" labelStyle={{ color: '#fff' }} />
        <RadioButton.Item label="Pago con tarjeta" value="TARJETA" labelStyle={{ color: '#fff' }} />
        </RadioButton.Group>
        <TextInput
        style={styles.input}
        placeholder="Nombre/s"
        value={nombreUsuario}
        onChangeText={setNombreUsuario}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Apellido/s"
        value={apellidosUsuario}
        onChangeText={setApellidosUsuario}
        autoCapitalize="none"
      />
      <Pressable 
  style={styles.input} 
  onPress={() => setMostrarDatePicker(true)}
>
  {mostrarDatePicker && (
  <DateTimePicker
    value={fechaNacimiento ? new Date(fechaNacimiento) : new Date()}
    mode="date"
    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
    onChange={(event, selectedDate) => {
      setMostrarDatePicker(false); // Cierra el selector al elegir o cancelar
      if (selectedDate) {
        // Formatea la fecha a YYYY-MM-DD para guardarla en tu string
        const fechaFormateada = selectedDate.toISOString().split('T')[0];
        setFechaNacimiento(fechaFormateada);
      }
    }}
  />
  )}
  <Text style={{ color: fechaNacimiento ? '#000000' : '#888888' }}>
    {fechaNacimiento ? fechaNacimiento : 'Seleccionar Fecha de Nacimiento'}
  </Text>
</Pressable>
      
      <Dropdown
        style={styles.dropdown}
        data={opcionesGenero}
        labelField="label"
        valueField="value"
        placeholder="Genero"
        value={generoUsuario}
        onChange={(item) => {
          setGeneroUsuario(item.value); // Al seleccionar, actualiza la variable de estado
        }}
      />
      <TextInput
        style={styles.input}
        placeholder="Nit/DPI"
        value={dpi_nitUsuario}
        onChangeText={setDpi_nitUsuario}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="telefono"
        value={telefonoUsuario}
        onChangeText={setTelefonoUsuario}
        autoCapitalize="none"
      />
      <Dropdown
        style={styles.dropdown}
        data={opcionesDepartamentos}
        labelField="label"
        valueField="value"
        placeholder="Seleccione su departamento"
        value={departamentoUsuario}
        onChange={(item) => {
          setDepartamentoUsuario(item.value); // Al seleccionar, actualiza la variable de estado
        }}
      />
      <Dropdown
        style={styles.dropdown}
        data={opcionesMunicipios}
        labelField="label"
        valueField="value"
        placeholder="Seleccione su municipio"
        value={municipioUsuario}
        onChange={(item) => {
          setMunicipioUsuario(item.value); // Al seleccionar, actualiza la variable de estado
        }}
      />
      <Dropdown
        style={styles.dropdown}
        data={opcionesSucursales}
        labelField="label"
        valueField="value"
        placeholder="Seleccione su sucursal"
        value={sucursalUsuario}
        onChange={(item) => {
          setSucursalUsuario(item.value); // Al seleccionar, actualiza la variable de estado
        }}
      />



      {/*botones */}
        <View style={styles.botones}>
        <Button title="Siguiente1" onPress={() => setPaso(3)} />
      </View>
      <Text style={styles.link} onPress={iniciarSesion1}>
              { '¿Ya tienes cuenta? Inicia sesión'}
      </Text>
      
      </ScrollView>
      </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor:'#020700' , padding: 14},
  oculto: {display: 'none',},  
  scrollBase: {flex: 1,},
  titulo: { fontSize: 28, fontWeight: 'bold', marginBottom: 24, textAlign: 'center', color: '#5e5f5f' },
  logo: { width: 150, height: 100, alignSelf: 'auto', marginBottom: 5,resizeMode: 'contain'},
  input: { borderWidth: 1, borderColor: '#ffffff', borderRadius: 8, padding: 12, marginBottom: 12,backgroundColor:'#ffffff' },
  botones: { flexDirection: 'row', justifyContent: 'center', marginTop: 8, borderRadius: 12 },
  link: { marginTop: 12, textAlign: 'center', color: '#5eb4ff', textDecorationLine: 'underline' },
  mensaje: { marginTop: 16, textAlign: 'center', color: '#ffffff' },
  dropdown: {
    height: 50,padding: 12,
    borderColor: 'gray',
    borderWidth: 0.5,
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: '#fff',marginBottom: 12,
  },
});