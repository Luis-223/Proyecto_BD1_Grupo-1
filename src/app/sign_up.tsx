import { useState } from 'react';
import { loginPorTrama } from '../services/conexion';
import { useRouter } from 'expo-router';
import { Button, ScrollView, Image, TouchableOpacity, StyleSheet, Text, TextInput, View, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { RadioButton } from 'react-native-paper';
import { Dropdown } from 'react-native-element-dropdown';

type Usuario = {
  correo: string;
  contrasena: string;
};

const SALTAR_LOGIN = true;

export default function sign_up() {
  const router = useRouter();
  const [paso, setPaso] = useState<number>(1);
  const [paso2, setPaso2] = useState<number>(1);
  const [mostrarDatePicker, setMostrarDatePicker] = useState<boolean>(false);

  // --- 1. CAMPOS DE TEXTO ---
  const [aliasUsuario, setAliasUsuario] = useState<string>('');
  const [correoUsuario, setCorreoUsuario] = useState<string>('');
  const [contrasena1, setContrasena1] = useState<string>('');
  const [nombreUsuario, setNombreUsuario] = useState<string>('');
  const [apellidosUsuario, setApellidosUsuario] = useState<string>('');
  const [fechaNacimiento, setFechaNacimiento] = useState<string>('');
  const [dpi_nitUsuario, setDpi_nitUsuario] = useState<string>('');
  const [telefonoUsuario, setTelefonoUsuario] = useState<string>('');
  const [respuestaPrUsuario, setRespuestaPrUsuario] = useState<string>('');

  // Campos de tarjeta de crédito/débito
  const [fechaExpiracion, setFechaExpiracion] = useState<string>('');
  const [cvv, setCvv] = useState<string>('');
  const [numeroTarjeta, setNumeroTarjeta] = useState<string>('');

  // --- 2. CAMPOS DE DESPLEGABLE ---
  const [generoUsuario, setGeneroUsuario] = useState<string>('');
  const [departamentoUsuario, setDepartamentoUsuario] = useState<string>('');
  const [municipioUsuario, setMunicipioUsuario] = useState<string>('');
  const [sucursalUsuario, setSucursalUsuario] = useState<string>('');
  const [membresiaUsuario, setMembresiaUsuario] = useState<string>('PLATINO'); 
  const [mesPagado, setMesPagado] = useState<string>('1'); 
  const [metodoPago, setMetodoPago] = useState<string>('SUCURSAL');
  const [preguntaUsuario, setPreguntaUsuario] = useState<string>('');
  const [mensaje, setMensaje] = useState('');
  
  // Variable para verificar si el método seleccionado es TARJETA
  const esTarjeta = metodoPago === 'TARJETA';

  // Variable de tipo int/number derivada del estado mesPagado
  const mesesInt = parseInt(mesPagado || '1');
  let totalPagar = 0;
  switch (membresiaUsuario) {
    case 'PLATINO':
      totalPagar = mesesInt * 145;
      break;
    case 'GOLD':
      totalPagar = mesesInt * 160;
      break;
  }  

  // --- 3. CATÁLOGOS / LISTAS ---
  const opcionesGenero = [
    { label: 'Masculino', value: 'M' },
    { label: 'Femenino', value: 'F' },
  ];
  const opcionesMeses = [
    { label: '1 Mes', value: '1' },
    { label: '2 Meses', value: '2' },
    { label: '3 Meses', value: '3' },
    { label: '4 Meses', value: '4' },
    { label: '5 Meses', value: '5' },
    { label: '6 Meses', value: '6' },
    { label: '7 Meses', value: '7' },
    { label: '8 Meses', value: '8' },
    { label: '9 Meses', value: '9' },
    { label: '10 Meses', value: '10' },
    { label: '11 Meses', value: '11' },
    { label: '1 año', value: '12' },
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

  const opcionesPreguntas = [
    { label: '¿Nombre de tu primera mascota?', value: 'PREG_1' },
    { label: '¿Ciudad donde naciste?', value: 'PREG_2' },
  ];

  const iniciarSesion1 = () => {
    router.push('/');
    return;
  };

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/images/Banner.jpeg')} style={styles.logo} />
      
      {/* PASO 1 */}
      <ScrollView horizontal={false} showsVerticalScrollIndicator={true} contentContainerStyle={styles.scrollContent} style={[styles.scrollBase, paso !== 1 && styles.oculto]}>
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
            <View style={styles.contenedorBoton}>
              <Button title="Siguiente" onPress={() => setPaso(2)} />
            </View>
        </View>
        
        <Text style={styles.link} onPress={iniciarSesion1}>
          {'¿Ya tienes cuenta? Inicia sesión'}
        </Text>
      </ScrollView>

      {/* PASO 2 */}
      <ScrollView
        horizontal={false}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.scrollContent}
        style={[styles.scrollBase, paso !== 2 && styles.oculto]}
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
                setMostrarDatePicker(false);
                if (selectedDate) {
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
            setGeneroUsuario(item.value);
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
            setDepartamentoUsuario(item.value);
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
            setMunicipioUsuario(item.value);
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
            setSucursalUsuario(item.value);
          }}
        />
        <View style={styles.botones}>
          <View style={styles.contenedorBoton}>
            <Button title="Atrás" onPress={() => setPaso(1)} />
          </View>
          <View style={styles.contenedorBoton}>
            <Button title="Siguiente" onPress={() => setPaso(3)} />
          </View>
        </View>
        
        <Text style={styles.link} onPress={iniciarSesion1}>
          {'¿Ya tienes cuenta? Inicia sesión'}
        </Text>
      </ScrollView>

      {/* PASO 3 */}
      <ScrollView
        horizontal={false}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.scrollContent}
        style={[styles.scrollBase, paso !== 3 && styles.oculto]}
      >
        {/* 1. GRUPO: Método de Pago */}
        <Text style={styles.label}>Método de Pago:</Text>
        <RadioButton.Group onValueChange={newValue => setMetodoPago(newValue)} value={metodoPago}>
          <View style={styles.contenedorHorizontal}>
            <TouchableOpacity 
              style={styles.filaOpcionHorizontal} 
              onPress={() => setMetodoPago('SUCURSAL')}
              activeOpacity={0.7}
            >
              <RadioButton.Android value="SUCURSAL" color="#00E676" uncheckedColor="#888" />
              <Text style={styles.textoOpcion}>Pago en sucursal   </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.filaOpcionHorizontal} 
              onPress={() => setMetodoPago('TARJETA')}
              activeOpacity={0.7}
            >
              <RadioButton.Android value="TARJETA" color="#00E676" uncheckedColor="#888" />
              <Text style={styles.textoOpcion}>Pago con tarjeta</Text>
            </TouchableOpacity>
          </View>
        </RadioButton.Group>

        {/* 2. GRUPO: Tipo de Membresía (Deshabilitado si es pago en sucursal) */}
        <Text style={[styles.label, !esTarjeta && styles.deshabilitadoTexto]}>Tipo de Membresía:</Text>
        <RadioButton.Group 
          onValueChange={newValue => esTarjeta && setMembresiaUsuario(newValue)} 
          value={membresiaUsuario}
        >
          <View style={styles.contenedorHorizontal}>
            <TouchableOpacity 
              style={styles.filaOpcionHorizontal} 
              onPress={() => esTarjeta && setMembresiaUsuario('PLATINO')}
              activeOpacity={esTarjeta ? 0.7 : 1}
              disabled={!esTarjeta}
            >
              <RadioButton.Android 
                value="PLATINO" 
                color={esTarjeta ? "#00E676" : "#555"} 
                uncheckedColor={esTarjeta ? "#888" : "#444"} 
                disabled={!esTarjeta}
              />
              <Text style={[styles.textoOpcion, !esTarjeta && styles.deshabilitadoTexto]}>Membresia Platino</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.filaOpcionHorizontal} 
              onPress={() => esTarjeta && setMembresiaUsuario('GOLD')}
              activeOpacity={esTarjeta ? 0.7 : 1}
              disabled={!esTarjeta}
            >
              <RadioButton.Android 
                value="GOLD" 
                color={esTarjeta ? "#00E676" : "#555"} 
                uncheckedColor={esTarjeta ? "#888" : "#444"} 
                disabled={!esTarjeta}
              />
              <Text style={[styles.textoOpcion, !esTarjeta && styles.deshabilitadoTexto]}>Membresia Gold</Text>
            </TouchableOpacity>
          </View>
        </RadioButton.Group>

        {/* DROPDOWN DE MESES Y TOTAL A PAGAR */}
        <View style={styles.contenedorMesesRow}>
          <Dropdown
            style={[styles.dropdownCompacto, !esTarjeta && styles.inputDeshabilitado]}
            data={opcionesMeses}
            labelField="label"
            valueField="value"
            placeholder="Meses"
            value={mesPagado}
            disable={!esTarjeta}
            onChange={(item) => {
              setMesPagado(item.value); 
            }}
          />
          <Text style={[styles.labelMeses, !esTarjeta && styles.deshabilitadoTexto]}>   Total a pagar Q.{totalPagar}</Text>
        </View>

        {/* FILA DE CAMPOS DE FECHA Y CVV */}
        <View style={styles.filaInputs}>
          {/* Selector de Mes/Año */}
          <Pressable 
            style={[styles.input, styles.inputMitad, !esTarjeta && styles.inputDeshabilitado]} 
            onPress={() => esTarjeta && setMostrarDatePicker(true)}
            disabled={!esTarjeta}
          >
            {mostrarDatePicker && esTarjeta && (
              <DateTimePicker
                value={fechaExpiracion ? new Date(fechaExpiracion + '-01') : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedDate) => {
                  setMostrarDatePicker(false);
                  if (selectedDate) {
                    const anio = selectedDate.getFullYear();
                    const mes = String(selectedDate.getMonth() + 1).padStart(2, '0');
                    setFechaExpiracion(`${anio}-${mes}`);
                  }
                }}
              />
            )}
            <Text style={{ color: esTarjeta ? (fechaExpiracion ? '#000000' : '#888888') : '#888888', fontSize: 13 }}>
              {fechaExpiracion ? fechaExpiracion : 'MM/YYYY'}
            </Text>
          </Pressable>

          {/* CVV / CVC */}
          <TextInput
            style={[styles.input, styles.inputMitad, !esTarjeta && styles.inputDeshabilitado]}
            placeholder="CVV / CVC"
            keyboardType="numeric"
            maxLength={4}
            value={cvv}
            onChangeText={setCvv}
            editable={esTarjeta}
            placeholderTextColor="#888888"
          />
        </View>

        {/* TEXTINPUT NÚMERO DE TARJETA CON IMÁGENES */}
        <View style={[styles.inputConImagenContainer, !esTarjeta && styles.inputDeshabilitado]}>
          <TextInput
            style={[styles.inputConImagenText, !esTarjeta && styles.deshabilitadoTextoInput]}
            placeholder="Número de tarjeta"
            keyboardType="numeric"
            value={numeroTarjeta}
            onChangeText={setNumeroTarjeta}
            editable={esTarjeta}
            placeholderTextColor="#888888"
          />
          
          <View style={styles.contenedorImagenesDerecha}>
            <Image 
              source={require('../../assets/images/visa.png')} 
              style={[styles.imagenDerecha, !esTarjeta && { opacity: 0.3 }]} 
            />
          </View>
          <View style={styles.contenedorImagenesDerecha}>
            <Image 
              source={require('../../assets/images/mastercard.png')} 
              style={[styles.imagenDerecha, !esTarjeta && { opacity: 0.3 }]} 
            />
          </View>
        </View>

        <View style={styles.botones}>
          <View style={styles.contenedorBoton}>
            <Button title="Atrás" onPress={() => setPaso(2)} />
          </View>
          <View style={styles.contenedorBoton}>
            <Button title="Siguiente" onPress={() => setPaso(3)} />
          </View>
        </View>
    
        <Text style={styles.link} onPress={iniciarSesion1}>
          {'¿Ya tienes cuenta? Inicia sesión'}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020700', padding: 14 },
  oculto: { display: 'none' },  
  scrollBase: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 60 },
  titulo: { fontSize: 28, fontWeight: 'bold', marginBottom: 24, textAlign: 'center', color: '#5e5f5f' },
  logo: { width: 150, height: 100, alignSelf: 'auto', marginBottom: 5, resizeMode: 'contain' },
  input: { borderWidth: 1, borderColor: '#ffffff', borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: '#ffffff' },
  botones: { flexDirection: 'row', justifyContent: 'center', gap: 12, alignItems: 'center', marginTop: 5, marginBottom: 8 },
  contenedorBoton: { flex: 0.45, marginHorizontal: 6 },
  link: { marginTop: 12, textAlign: 'center', color: '#5eb4ff', textDecorationLine: 'underline' },
  mensaje: { marginTop: 16, textAlign: 'center', color: '#ffffff' },
  dropdown: { height: 50, padding: 12, borderColor: 'gray', borderWidth: 0.5, borderRadius: 8, paddingHorizontal: 8, backgroundColor: '#fff', marginBottom: 12 },
  filaOpcion: { flexDirection: 'row', alignItems: 'center', marginVertical: -2 },
  label: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  contenedorHorizontal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginBottom: 6 },
  filaOpcionHorizontal: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  textoOpcion: { color: '#FFFFFF', fontSize: 14, marginLeft: 1 },
  
  // ESTILOS DE DESHABILITADO
  inputDeshabilitado: {
    backgroundColor: '#e0e0e0',
    borderColor: '#a0a0a0',
    opacity: 0.5,
  },
  deshabilitadoTexto: {
    color: '#777777',
  },
  deshabilitadoTextoInput: {
    color: '#888888',
  },

  contenedorMesesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  labelMeses: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginRight: 10,
  },
  dropdownCompacto: {
    flex: 1,
    height: 45,
    paddingHorizontal: 8,
    borderColor: 'gray',
    borderWidth: 0.5,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  filaInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  inputMitad: {
    flex: 0.48,
    marginBottom: 0,
    justifyContent: 'center',
  },

  inputConImagenContainer: {
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
  inputConImagenText: {
    flex: 1,
    height: '100%',
    color: '#000000',
  },
  contenedorImagenesDerecha: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  imagenDerecha: {
    width: 52,
    height: 42,
    resizeMode: 'contain',
    marginLeft: 4,
  },
});