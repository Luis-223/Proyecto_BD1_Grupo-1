import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Button, ScrollView, Image, TouchableOpacity, StyleSheet, Text, TextInput, View, Pressable, Platform, Alert, ActivityIndicator } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { RadioButton } from 'react-native-paper';
import { Dropdown } from 'react-native-element-dropdown';
import type { Catalogos } from './trama';
// CAMBIO: membresiaPorTrama y consultarMembresia ahora SÍ existen en conexion.ts
import { catalogosPorTrama, membresiaPorTrama, consultarMembresia } from './conexion';
import type { InfoMembresia } from './conexion';
import { obtenerSesion } from './sesion';

// "2026-11-30T00:00:00.000Z" o "2026-11-30" -> "30/11/2026"
function formatearFecha(valor?: string | null): string {
  if (!valor) return '';
  const [anio, mes, dia] = String(valor).slice(0, 10).split('-');
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : String(valor);
}

// "Tarjeta de Crédito" -> "tarjeta de credito"
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function MiMembresia() {
  const router = useRouter();

  const [mostrarDatePickerTarjeta, setMostrarDatePickerTarjeta] = useState<boolean>(false);
  const [cargandoRegistro, setCargandoRegistro] = useState<boolean>(false);
  const [cargandoMembresia, setCargandoMembresia] = useState<boolean>(true);
  const [errorMembresia, setErrorMembresia] = useState<string>('');
  const [membresiaActualInfo, setMembresiaActualInfo] = useState<InfoMembresia | null>(null);

  // --- CATÁLOGOS DESDE EL SERVIDOR ---
  const [catalogos, setCatalogos] = useState<Catalogos>({
    generos: [], departamentos: [], municipios: [], sucursales: [],
    metodosPago: [], membresias: [], preguntas: [],
  });

  // --- CAMPOS DE PAGO Y MEMBRESÍA ---
  const [membresiaUsuario, setMembresiaUsuario] = useState<string>('');
  const [mesPagado, setMesPagado] = useState<string>('1');
  const [metodoPago, setMetodoPago] = useState<string>('SUCURSAL');

  // Campos de tarjeta visuales (se quedan en pantalla pero no van en la trama)
  const [fechaExpiracion, setFechaExpiracion] = useState<string>('');
  const [cvv, setCvv] = useState<string>('');
  const [numeroTarjeta, setNumeroTarjeta] = useState<string>('');

  const esTarjeta = metodoPago === 'TARJETA';

  // NUEVO: el servidor espera el id_metodo_pago de la tabla MetodoPago, no la palabra "TARJETA".
  // Se busca en el catálogo el método cuyo nombre contenga "tarjeta".
  const metodoTarjeta = catalogos.metodosPago.find((m) => normalizar(m.label).includes('tarjeta'));

  // CAMBIO: antes hacía fetch a http://192.168.1.9:3000 (la IP de una PC en la red local)
  // y, como el login no guardaba la sesión, salía en el primer "return" sin consultar nada.
  // Los errores se tragaban en silencio; ahora se muestran.
  const consultarMembresiaActual = useCallback(async () => {
    const sesion = obtenerSesion();
    if (!sesion?.token) {
      setCargandoMembresia(false);
      Alert.alert('Sesión no encontrada', 'Inicia sesión otra vez para ver tu membresía.', [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
      return;
    }

    setCargandoMembresia(true);
    setErrorMembresia('');
    try {
      const datos = await consultarMembresia();
      setMembresiaActualInfo(datos);
    } catch (e) {
      setErrorMembresia(e instanceof Error ? e.message : 'No se pudo consultar tu membresía.');
    } finally {
      setCargandoMembresia(false);
    }
  }, [router]);

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

    consultarMembresiaActual();
  }, [consultarMembresiaActual]);

  // NUEVO: regresar a la pantalla de perfil que ya estaba abierta.
  // Antes se hacía router.push('/perfil'): eso abría un perfil NUEVO sin los datos
  // del login (nombre "Usuario", sin rol), y parecía que se había cerrado la sesión.
  const volverAPerfil = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/perfil');
    }
  };

  const mesesInt = parseInt(mesPagado || '1');
  const membresiaElegida = catalogos.membresias.find((m) => m.value === membresiaUsuario);
  const totalPagar = membresiaElegida ? membresiaElegida.precio * mesesInt : 0;

  // NUEVO: ¿cuánto cuesta pasar los meses que ya pagó al plan elegido?
  // Misma cuenta que usp_CambiarPlanApp: (precio nuevo - precio de su plan) x meses restantes.
  const cambioPlan = (() => {
    if (!membresiaActualInfo?.activa || !membresiaElegida) return null;
    if (String(membresiaActualInfo.id_tipo_membresia) === membresiaElegida.value) return null;

    const aCambiar = (membresiaActualInfo.restantes ?? [])
      .filter((r) => String(r.id_tipo_membresia) !== membresiaElegida.value);
    if (aCambiar.length === 0) return null;

    const precioDe = (id: number) =>
      catalogos.membresias.find((m) => m.value === String(id))?.precio ?? 0;
    const meses = aCambiar.reduce((suma, r) => suma + r.meses, 0);
    const diferencia = aCambiar.reduce((suma, r) => suma + (membresiaElegida.precio - precioDe(r.id_tipo_membresia)) * r.meses, 0);
    const esMejora = aCambiar.every((r) => membresiaElegida.precio > precioDe(r.id_tipo_membresia));

    return { meses, diferencia, esMejora };
  })();

  const manejarCambioTarjeta = (texto: string) => {
    const soloNumeros = texto.replace(/\D/g, '');
    const tarjetaFormateada = soloNumeros.slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
    setNumeroTarjeta(tarjetaFormateada);
  };

  const ejecutarEnvioTrama = async (esCambioTipo: string) => {
    // SUCURSAL se manda tal cual: el servidor lo entiende como "pagará en la sucursal"
    const idMetodo = esTarjeta ? metodoTarjeta?.value ?? '' : 'SUCURSAL';

    setCargandoRegistro(true);
    try {
      const res = await membresiaPorTrama(idMetodo, membresiaUsuario, mesPagado, esCambioTipo);

      if (res.codigo === '00') {
        await consultarMembresiaActual(); // refrescar lo que se ve en pantalla
        Alert.alert('¡Proceso Exitoso!', res.detalle || 'Membresía actualizada correctamente.', [
          { text: 'OK', onPress: volverAPerfil },
        ]);
      } else if (res.codigo === '04') {
        Alert.alert('Sesión vencida', res.detalle, [{ text: 'OK', onPress: () => router.replace('/') }]);
      } else {
        Alert.alert('Error', res.detalle || 'No se pudo procesar la membresía.');
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Ocurrió un error al procesar la solicitud.');
    } finally {
      setCargandoRegistro(false);
    }
  };

  const generarPago = async () => {
    if (!metodoPago) {
      Alert.alert('Campos incompletos', 'Por favor selecciona un método de pago.');
      return;
    }
    if (!membresiaUsuario) {
      Alert.alert('Campos incompletos', 'Elige un tipo de membresía.');
      return;
    }

    if (esTarjeta) {
      if (!mesPagado || !fechaExpiracion || !cvv.trim() || !numeroTarjeta.trim()) {
        Alert.alert('Campos incompletos', 'Por favor completa todos los datos de pago con tarjeta.');
        return;
      }
      if (numeroTarjeta.replace(/\D/g, '').length !== 16) {
        Alert.alert('Tarjeta inválida', 'El número de tarjeta debe tener 16 dígitos.');
        return;
      }
      if (!/^\d{3,4}$/.test(cvv.trim())) {
        Alert.alert('CVV inválido', 'El CVV debe tener 3 o 4 dígitos.');
        return;
      }
      const hoy = new Date();
      const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
      if (fechaExpiracion < mesActual) {
        Alert.alert('Tarjeta vencida', 'La fecha de expiración ya pasó.');
        return;
      }
      if (!metodoTarjeta) {
        Alert.alert('Error', 'El servidor no tiene registrado el método de pago con tarjeta.');
        return;
      }
    }

    const hasta = formatearFecha(membresiaActualInfo?.pagado_hasta || membresiaActualInfo?.fecha_fin);
    const agregarAlFinal = `Agregar ${mesesInt} ${mesesInt === 1 ? 'mes' : 'meses'} al final (Q${totalPagar})`;

    if (cambioPlan?.esMejora) {
      // SUBIR de plan: los meses ya pagados pasan al plan nuevo y paga solo la diferencia
      const textoMeses = `${cambioPlan.meses} ${cambioPlan.meses === 1 ? 'mes' : 'meses'}`;
      Alert.alert(
        `Cambiar a ${membresiaElegida?.label}`,
        `Tienes ${textoMeses} pagados de ${membresiaActualInfo?.tipo}` +
          (hasta ? ` (hasta el ${hasta})` : '') +
          `.\n\nPara pasarlos a ${membresiaElegida?.label} pagas solo la diferencia: ` +
          `Q${cambioPlan.diferencia}. La fecha de vencimiento no cambia.` +
          (esTarjeta ? '' : '\n\nComo elegiste pago en sucursal, la diferencia se paga allá.'),
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: agregarAlFinal, onPress: () => ejecutarEnvioTrama('0') },
          { text: `Cambiar plan (Q${cambioPlan.diferencia})`, onPress: () => ejecutarEnvioTrama('1') },
        ]
      );
    } else if (cambioPlan) {
      // BAJAR de plan: no se devuelve dinero; solo puede agregar meses después de los que ya pagó
      Alert.alert(
        `Cambiar a ${membresiaElegida?.label}`,
        `No puedes bajar de ${membresiaActualInfo?.tipo} a ${membresiaElegida?.label} mientras tengas meses pagados` +
          (hasta ? ` (hasta el ${hasta})` : '') +
          `.\n\nPuedes agregar meses de ${membresiaElegida?.label} que empiezan cuando termine tu membresía actual.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: agregarAlFinal, onPress: () => ejecutarEnvioTrama('0') },
        ]
      );
    } else {
      ejecutarEnvioTrama('0');
    }
  };

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

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/images/Banner.jpeg')} style={styles.logo} />

      <ScrollView
        horizontal={false}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollBase}
      >
        {/* NUEVO: estado de la consulta de membresía */}
        {cargandoMembresia && (
          <View style={styles.contenedorInfoActual}>
            <ActivityIndicator color="#00E676" />
            <Text style={styles.textoInfoSub}>Consultando tu membresía...</Text>
          </View>
        )}

        {!cargandoMembresia && errorMembresia !== '' && (
          <Pressable style={[styles.contenedorInfoActual, styles.contenedorError]} onPress={consultarMembresiaActual}>
            <Text style={styles.textoInfoActual}>{errorMembresia}</Text>
            <Text style={styles.textoInfoSub}>Toca aquí para intentar de nuevo.</Text>
          </Pressable>
        )}

        {!cargandoMembresia && membresiaActualInfo?.activa && (
          <View style={styles.contenedorInfoActual}>
            <Text style={styles.textoInfoActual}>
              Membresía actual: <Text style={{ fontWeight: 'bold', color: '#00E676' }}>{membresiaActualInfo.tipo}</Text>
            </Text>
            {membresiaActualInfo.pagado_hasta && (
              <Text style={styles.textoInfoSub}>Pagado hasta: {formatearFecha(membresiaActualInfo.pagado_hasta)}</Text>
            )}
          </View>
        )}

        {!cargandoMembresia && membresiaActualInfo && !membresiaActualInfo.activa && (
          <View style={[styles.contenedorInfoActual, styles.contenedorAviso]}>
            <Text style={styles.textoInfoActual}>{membresiaActualInfo.mensaje || 'No tienes una membresía vigente'}</Text>
            {membresiaActualInfo.ultima && (
              <Text style={styles.textoInfoSub}>
                Última: {membresiaActualInfo.ultima.tipo} (venció el {formatearFecha(membresiaActualInfo.ultima.fecha_fin)})
              </Text>
            )}
          </View>
        )}

        <Text style={styles.label}>Método de Pago:</Text>
        <RadioButton.Group onValueChange={newValue => setMetodoPago(newValue)} value={metodoPago}>
          <View style={styles.contenedorHorizontal}>
            <TouchableOpacity
              style={styles.filaOpcionHorizontal}
              onPress={() => setMetodoPago('SUCURSAL')}
              activeOpacity={0.7}
            >
              <RadioButton.Android value="SUCURSAL" color="#00E676" uncheckedColor="#888" />
              <Text style={styles.textoOpcion}>Pago en sucursal</Text>
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

        <Text style={styles.label}>Tipo de Membresía:</Text>
        <RadioButton.Group
          onValueChange={newValue => setMembresiaUsuario(newValue)}
          value={membresiaUsuario}
        >
          <View style={styles.contenedorHorizontal}>
            {catalogos.membresias.map((m) => (
              <TouchableOpacity
                key={m.value}
                style={styles.filaOpcionHorizontal}
                onPress={() => setMembresiaUsuario(m.value)}
                activeOpacity={0.7}
              >
                <RadioButton.Android
                  value={m.value}
                  color="#00E676"
                  uncheckedColor="#888"
                />
                <Text style={styles.textoOpcion}>
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
            onChange={(item) => setMesPagado(item.value)}
          />
          <Text style={styles.labelMeses}> Total a pagar Q.{totalPagar}</Text>
        </View>

        {/* NUEVO: lo que costaría pasar los meses ya pagados al plan elegido */}
        {cambioPlan?.esMejora && (
          <Text style={styles.textoCambioPlan}>
            Cambio de plan: Q.{cambioPlan.diferencia} de diferencia por {cambioPlan.meses}{' '}
            {cambioPlan.meses === 1 ? 'mes pagado' : 'meses pagados'}
          </Text>
        )}

        {/* CAMPOS VISUALES DE TARJETA (Solo en pantalla) */}
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
                // CAMBIO: en datetimepicker 9 "onChange" está obsoleto;
                // ahora se usan onValueChange (eligió fecha) y onDismiss (canceló)
                onValueChange={(event, selectedDate) => {
                  setMostrarDatePickerTarjeta(false);
                  if (selectedDate) {
                    const anio = selectedDate.getFullYear();
                    const mes = String(selectedDate.getMonth() + 1).padStart(2, '0');
                    setFechaExpiracion(`${anio}-${mes}`);
                  }
                }}
                onDismiss={() => setMostrarDatePickerTarjeta(false)}
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
            <Button title="Atrás" onPress={volverAPerfil} />
          </View>
          <View style={styles.contenedorBoton}>
            <Button title={cargandoRegistro ? "Procesando..." : "Generar Pago"} onPress={generarPago} disabled={cargandoRegistro} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020700', padding: 14 },
  scrollBase: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 60 },
  logo: { width: 150, height: 100, alignSelf: 'auto', marginBottom: 5, resizeMode: 'contain' },
  input: { borderWidth: 1, borderColor: '#ffffff', borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: '#ffffff' },
  botones: { flexDirection: 'row', justifyContent: 'center', gap: 12, alignItems: 'center', marginTop: 15, marginBottom: 8 },
  contenedorBoton: { flex: 0.45, marginHorizontal: 6 },
  label: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold', marginTop: 10, marginBottom: 4 },
  contenedorHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 6,
    flexWrap: 'nowrap'
  },
  filaOpcionHorizontal: { flexDirection: 'row', alignItems: 'center', marginRight: 16, marginBottom: 6 },
  textoOpcion: { color: '#FFFFFF', fontSize: 14, marginLeft: 1 },
  inputDeshabilitado: {
    backgroundColor: '#e0e0e0',
    borderColor: '#a0a0a0',
    opacity: 0.5,
  },
  deshabilitadoTextoInput: {
    color: '#888888',
  },
  contenedorMesesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 10,
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
  contenedorInfoActual: {
    backgroundColor: '#111a10',
    borderColor: '#00E676',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  textoCambioPlan: {
    color: '#00E676',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: -4,
    marginBottom: 12,
  },
  contenedorAviso: {
    backgroundColor: '#3a2a00',
    borderColor: '#ffd166',
  },
  contenedorError: {
    backgroundColor: '#2a0f0f',
    borderColor: '#FF5252',
  },
  textoInfoActual: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  textoInfoSub: {
    color: '#CCCCCC',
    fontSize: 12,
    marginTop: 2,
  },
});
