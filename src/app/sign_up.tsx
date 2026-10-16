import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, ScrollView, Image, TouchableOpacity, StyleSheet, Text, TextInput, View, Pressable, Platform, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { RadioButton } from 'react-native-paper';
import { Dropdown } from 'react-native-element-dropdown';
import { construirSignupReq, nuevoIdMensaje } from './trama';
import type { Catalogos } from './trama';
import { catalogosPorTrama, signupPorTrama } from './conexion';

export default function sign_up() {
  const router = useRouter();
  const [paso, setPaso] = useState<number>(1);
  const [mostrarDatePicker, setMostrarDatePicker] = useState<boolean>(false);
  const [mostrarDatePickerTarjeta, setMostrarDatePickerTarjeta] = useState<boolean>(false);
  const [cargandoRegistro, setCargandoRegistro] = useState<boolean>(false);

  // --- 0. CATÁLOGOS DESDE EL SERVIDOR ---
  const [catalogos, setCatalogos] = useState<Catalogos>({
    generos: [], departamentos: [], municipios: [], sucursales: [],
    metodosPago: [], membresias: [], preguntas: [],
  });

  useEffect(() => {
    catalogosPorTrama()
      .then((res) => {
        if (res.codigo === '00') {
          setCatalogos(res.catalogos);
          if (res.catalogos.membresias && res.catalogos.membresias.length > 0) {
            setMembresiaUsuario(res.catalogos.membresias[0].value);
          }
        } else {
          Alert.alert('Error', res.detalle);
        }
      })
      .catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'No se pudieron cargar las listas'));
  }, []);

  // --- 1. CAMPOS DE TEXTO ---
  const [aliasUsuario, setAliasUsuario] = useState<string>('');
  const [correoUsuario, setCorreoUsuario] = useState<string>('');
  const [contrasena1, setContrasena1] = useState<string>('');
  const [nombreUsuario, setNombreUsuario] = useState<string>('');
  const [apellidosUsuario, setApellidosUsuario] = useState<string>('');
  const [fechaNacimiento, setFechaNacimiento] = useState<string>('');
  
  // CAMPO ÚNICO DE DPI
  const [dpiUsuario, setDpiUsuario] = useState<string>('');

  const [telefonoUsuario, setTelefonoUsuario] = useState<string>('');
  const [preguntaUsuario, setPreguntaUsuario] = useState<string>(''); 

  // Campos de tarjeta
  const [fechaExpiracion, setFechaExpiracion] = useState<string>('');
  const [cvv, setCvv] = useState<string>('');
  const [numeroTarjeta, setNumeroTarjeta] = useState<string>('');

  // --- 2. CAMPOS DE DESPLEGABLE ---
  const [generoUsuario, setGeneroUsuario] = useState<string>('');
  const [departamentoUsuario, setDepartamentoUsuario] = useState<string>('');
  const [municipioUsuario, setMunicipioUsuario] = useState<string>('');
  const [sucursalUsuario, setSucursalUsuario] = useState<string>('');
  const [membresiaUsuario, setMembresiaUsuario] = useState<string>(''); 
  const [mesPagado, setMesPagado] = useState<string>('1'); 
  const [metodoPago, setMetodoPago] = useState<string>('SUCURSAL');
  const [seleccionPregunta, setSeleccionPregunta] = useState<string>(''); 
  
  const esTarjeta = metodoPago === 'TARJETA';

  const mesesInt = parseInt(mesPagado || '1');
  const membresiaElegida = catalogos.membresias.find((m) => m.value === membresiaUsuario);
  const totalPagar = membresiaElegida ? membresiaElegida.precio * mesesInt : 0;

  // --- MÁSCARAS DE ENTRADA ---
  const manejarCambioTelefono = (texto: string) => {
    const soloNumeros = texto.replace(/\D/g, '');
    const numerosLocales = soloNumeros.startsWith('502') 
      ? soloNumeros.slice(3, 11) 
      : soloNumeros.slice(0, 8);

    if (numerosLocales.length === 0) {
      setTelefonoUsuario('');
      return;
    }

    let formato = `+502 ${numerosLocales.slice(0, 4)}`;
    if (numerosLocales.length > 4) {
      formato += `-${numerosLocales.slice(4, 8)}`;
    }
    setTelefonoUsuario(formato);
  };

  // Máscara para el DPI (13 dígitos: #### ##### ####)
  const manejarCambioDpi = (texto: string) => {
    const limpio = texto.replace(/\D/g, '').slice(0, 13);
    let dpiFormateado = limpio.slice(0, 4);
    if (limpio.length > 4) dpiFormateado += ` ${limpio.slice(4, 9)}`;
    if (limpio.length > 9) dpiFormateado += ` ${limpio.slice(9, 13)}`;
    setDpiUsuario(dpiFormateado);
  };

  const manejarCambioTarjeta = (texto: string) => {
    const soloNumeros = texto.replace(/\D/g, '');
    const tarjetaFormateada = soloNumeros.slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
    setNumeroTarjeta(tarjetaFormateada);
  };

  // --- VALIDACIONES POR PASO ---
  const avanzarPaso1 = () => {
    if (!aliasUsuario.trim() || !correoUsuario.trim() || !contrasena1) {
      Alert.alert('Campos incompletos', 'Por favor completa todos los campos.');
      return;
    }
    if (contrasena1.length < 7) {
      Alert.alert('Contraseña débil', 'La contraseña debe tener al menos 7 caracteres.');
      return;
    }
    if (contrasena1.includes('|')) {
      Alert.alert('Contraseña inválida', 'La contraseña no puede contener el carácter |.');
      return;
    }
    if (!/[A-Z]/.test(contrasena1)) {
      Alert.alert('Contraseña débil', 'La contraseña debe contener al menos una letra mayúscula.');
      return;
    }
    const cantidadNumeros = (contrasena1.match(/\d/g) || []).length;
    if (cantidadNumeros < 2) {
      Alert.alert('Contraseña débil', 'La contraseña debe contener al menos 2 números.');
      return;
    }
    setPaso(2);
  };

  const avanzarPaso2 = () => {
    if (
      !nombreUsuario.trim() ||
      !apellidosUsuario.trim() ||
      !fechaNacimiento ||
      !generoUsuario ||
      !dpiUsuario.trim() ||
      !telefonoUsuario.trim() ||
      !departamentoUsuario ||
      !municipioUsuario ||
      !sucursalUsuario
    ) {
      Alert.alert('Campos incompletos', 'Por favor completa todos los campos.');
      return;
    }
    setPaso(3);
  };

  const avanzarPaso3 = () => {
    if (!metodoPago) {
      Alert.alert('Campos incompletos', 'Por favor selecciona un método de pago.');
      return;
    }
    if (metodoPago === 'SUCURSAL') {
      setPaso(4);
      return;
    }
    if (esTarjeta) {
      if (!membresiaUsuario || !mesPagado || !fechaExpiracion || !cvv.trim() || !numeroTarjeta.trim()) {
        Alert.alert('Campos incompletos', 'Por favor completa todos los datos de pago con tarjeta.');
        return;
      }
    }
    setPaso(4);
  };

  const finalizarRegistro = async () => {
    if (!seleccionPregunta || !preguntaUsuario.trim()) {
      Alert.alert('Campos incompletos', 'Por favor selecciona una pregunta de seguridad y escribe tu respuesta.');
      return;
    }

    setCargandoRegistro(true);

    try {
      const partesNombre = nombreUsuario.trim().split(/\s+/);
      const primerNombre = partesNombre[0] || '';
      const segundoNombre = partesNombre.slice(1).join(' ') || '';

      const partesApellido = apellidosUsuario.trim().split(/\s+/);
      const primerApellido = partesApellido[0] || '';
      const segundoApellido = partesApellido.slice(1).join(' ') || '';

      const idTarjeta = catalogos.metodosPago.find((m) => m.label.toLowerCase().includes('tarjeta'))?.value ?? '';
      const metodoFinal = esTarjeta ? idTarjeta : '';
      const membresiaFinal = esTarjeta ? membresiaUsuario : '';
      const mesesFinal = esTarjeta ? mesPagado : '';

      const idMensaje = nuevoIdMensaje();
      const nombreCompletoParaTrama = `${primerNombre}${segundoNombre ? ' ' + segundoNombre : ''}`;
      const apellidosCompletosParaTrama = `${primerApellido}${segundoApellido ? ' ' + segundoApellido : ''}`;

      const telefonoLimpio = telefonoUsuario.replace(/\D/g, '').replace(/^502/, '');
      const dpiLimpio = dpiUsuario.replace(/\s+/g, '');

      const tramaFinal = construirSignupReq(
        idMensaje,
        aliasUsuario.trim(),
        correoUsuario.trim(),
        contrasena1,
        nombreCompletoParaTrama,
        apellidosCompletosParaTrama,
        fechaNacimiento,
        generoUsuario,
        dpiLimpio,
        telefonoLimpio,
        departamentoUsuario,
        municipioUsuario,
        sucursalUsuario,
        metodoFinal,
        membresiaFinal,
        mesesFinal,
        '', 
        '', 
        seleccionPregunta,
        preguntaUsuario.trim()
      );

      const res = await signupPorTrama(idMensaje, tramaFinal);

      if (res.codigo === '00') {
        Alert.alert('¡Cuenta creada!', res.detalle, [
          { text: 'OK', onPress: () => router.push('/') },
        ]);
      } else {
        Alert.alert('No se pudo registrar', res.detalle);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Ocurrió un error al procesar el registro.');
    } finally {
      setCargandoRegistro(false);
    }
  };

  const opcionesGenero = catalogos.generos;
  const opcionesDepartamentos = catalogos.departamentos;
  const opcionesMunicipios = catalogos.municipios.filter(
    (m) => m.idDepartamento === departamentoUsuario
  );
  const opcionesSucursales = catalogos.sucursales;
  const opcionesPreguntas = catalogos.preguntas;

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
        <Text style={styles.textoAyudaPassword}>
          Mínimo 7 caracteres, al menos 1 mayúscula y 2 números.
        </Text>

        <View style={styles.botones}>
            <View style={styles.contenedorBoton}>
              <Button title="Siguiente" onPress={avanzarPaso1} />
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
          autoCapitalize="words"
        />
        <TextInput
          style={styles.input}
          placeholder="Apellido/s"
          value={apellidosUsuario}
          onChangeText={setApellidosUsuario}
          autoCapitalize="words"
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

        {/* INPUT DE DPI CON MÁSCARA */}
        <TextInput
          style={styles.input}
          placeholder="DPI (Ej. 3073 22076 0401)"
          keyboardType="numeric"
          maxLength={15}
          value={dpiUsuario}
          onChangeText={manejarCambioDpi}
          autoCapitalize="none"
        />

        {/* INPUT DE TELÉFONO CON MÁSCARA */}
        <TextInput
          style={styles.input}
          placeholder="Teléfono (+502 ####-####)"
          keyboardType="phone-pad"
          maxLength={15}
          value={telefonoUsuario}
          onChangeText={manejarCambioTelefono}
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
            setMunicipioUsuario('');
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
            <Button title="Siguiente" onPress={avanzarPaso2} />
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

        <Text style={[styles.label, !esTarjeta && styles.deshabilitadoTexto]}>Tipo de Membresía:</Text>
        <RadioButton.Group 
          onValueChange={newValue => esTarjeta && setMembresiaUsuario(newValue)} 
          value={membresiaUsuario}
        >
          <View style={styles.contenedorHorizontal}>
            {catalogos.membresias.map((m) => (
              <TouchableOpacity 
                key={m.value}
                style={styles.filaOpcionHorizontal} 
                onPress={() => esTarjeta && setMembresiaUsuario(m.value)}
                activeOpacity={esTarjeta ? 0.7 : 1}
                disabled={!esTarjeta}
              >
                <RadioButton.Android 
                  value={m.value} 
                  color={esTarjeta ? "#00E676" : "#555"} 
                  uncheckedColor={esTarjeta ? "#888" : "#444"} 
                  disabled={!esTarjeta}
                />
                <Text style={[styles.textoOpcion, !esTarjeta && styles.deshabilitadoTexto]}>
                  {`${m.label} (Q${m.precio})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </RadioButton.Group>

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

        <View style={styles.filaInputs}>
          <Pressable 
            style={[styles.input, styles.inputMitad, !esTarjeta && styles.inputDeshabilitado]} 
            onPress={() => esTarjeta && setMostrarDatePickerTarjeta(true)}
            disabled={!esTarjeta}
          >
            {mostrarDatePickerTarjeta && esTarjeta && (
              <DateTimePicker
                value={fechaExpiracion ? new Date(fechaExpiracion + '-01') : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedDate) => {
                  setMostrarDatePickerTarjeta(false);
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

        <View style={[styles.inputConImagenContainer, !esTarjeta && styles.inputDeshabilitado]}>
          <TextInput
            style={[styles.inputConImagenText, !esTarjeta && styles.deshabilitadoTextoInput]}
            placeholder="0000 0000 0000 0000"
            keyboardType="numeric"
            value={numeroTarjeta}
            onChangeText={manejarCambioTarjeta}
            editable={esTarjeta}
            placeholderTextColor="#888888"
            maxLength={19}
          />
          
          <View style={styles.contenedorImagenesDerecha}>
            <Image source={require('../../assets/images/visa.png')} style={[styles.imagenDerecha, !esTarjeta && { opacity: 0.3 }]} />
          </View>
          <View style={styles.contenedorImagenesDerecha}>
            <Image source={require('../../assets/images/mastercard.png')} style={[styles.imagenDerecha, !esTarjeta && { opacity: 0.3 }]} />
          </View>
        </View>

        <View style={styles.botones}>
          <View style={styles.contenedorBoton}>
            <Button title="Atrás" onPress={() => setPaso(2)} />
          </View>
          <View style={styles.contenedorBoton}>
            <Button title="Siguiente" onPress={avanzarPaso3} />
          </View>
        </View>
    
        <Text style={styles.link} onPress={iniciarSesion1}>
          {'¿Ya tienes cuenta? Inicia sesión'}
        </Text>
      </ScrollView>

      {/* PASO 4 */}
      <ScrollView
        horizontal={false}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.scrollContent}
        style={[styles.scrollBase, paso !== 4 && styles.oculto]}
      >
        <Dropdown
          style={styles.dropdown}
          data={opcionesPreguntas}
          labelField="label"
          valueField="value"
          placeholder="Pregunta de Seguridad"
          value={seleccionPregunta}
          onChange={(item) => {
            setSeleccionPregunta(item.value);
          }}
        />
        <TextInput
          style={styles.input}
          placeholder="Respuesta de seguridad"
          value={preguntaUsuario}
          onChangeText={setPreguntaUsuario}
          autoCapitalize="none"
        />

        <View style={styles.botones}>
          <View style={styles.contenedorBoton}>
            <Button title="Atrás" onPress={() => setPaso(3)} />
          </View>
          <View style={styles.contenedorBoton}>
            <Button title={cargandoRegistro ? "Registrando..." : "Registrar"} onPress={finalizarRegistro} disabled={cargandoRegistro} />
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
  textoAyudaPassword: { color: '#cccccc', fontSize: 12, marginTop: -8, marginBottom: 12, marginLeft: 4 },
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