import { useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Item = { icono: string; titulo: string };

const accesosDirectos: Item[] = [
  { icono: '💳', titulo: 'Mi membresía' },
  { icono: '🏋️', titulo: 'Mi rutina' },
  { icono: '📅', titulo: 'Asistencia' },
  { icono: '📍', titulo: 'Mi sucursal' },
];

const menuPrincipal: Item[] = [
  { icono: '📋', titulo: 'Mis rutinas' },
  { icono: '👥', titulo: 'Clases grupales' },
  { icono: '🧾', titulo: 'Mis pagos' },
  { icono: '🧑‍🏫', titulo: 'Mi entrenador' },
  { icono: '🎯', titulo: 'Mis metas' },
];

const menuExtra: Item[] = [
  { icono: '📚', titulo: 'Catálogo de ejercicios' },
  { icono: '🎉', titulo: 'Eventos del gimnasio' },
  { icono: '🛠️', titulo: 'Equipos y máquinas' },
  { icono: '🗺️', titulo: 'Todas las sucursales' },
];

export default function Perfil() {
  const router = useRouter();
  const { correo } = useLocalSearchParams<{ correo: string }>();
  const [verMas, setVerMas] = useState(false);

  // Datos de prueba: luego vendrán de la API / SQL Server
  const nombre = correo ? correo.split('@')[0] : 'Usuario';
  const datos = { membresia: 'Oro', sucursal: 'Chimaltenango', vence: '30/11/2026' };

  const abrir = (titulo: string) => console.log('Abrir:', titulo);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      {/* Tarjeta de perfil */}
      <View style={styles.tarjetaPerfil}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetra}>{nombre.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nombre} numberOfLines={1}>{nombre}</Text>
          <Text style={styles.subtitulo}>Membresía {datos.membresia}</Text>
        </View>
        <View style={styles.chevronCaja}>
          <Text style={styles.chevron}>⌄</Text>
        </View>
      </View>

      {/* Datos de la persona */}
      <View style={styles.tarjetaDatos}>
        <Fila etiqueta="Correo" valor={correo ?? '-'} />
        <Fila etiqueta="Sucursal" valor={datos.sucursal} />
        <Fila etiqueta="Vence" valor={datos.vence} />
      </View>

      {/* Accesos directos */}
      <Text style={styles.seccion}>Tus accesos directos</Text>
      <View style={styles.filaAccesos}>
        {accesosDirectos.map((a) => (
          <Pressable key={a.titulo} style={styles.accesoWrap} onPress={() => abrir(a.titulo)}>
            <View style={styles.accesoCuadro}>
              <Text style={styles.accesoIcono}>{a.icono}</Text>
            </View>
            <Text style={styles.accesoTitulo} numberOfLines={1}>{a.titulo}</Text>
          </Pressable>
        ))}
      </View>

      {/* Lista principal */}
      <View style={{ marginTop: 8 }}>
        {menuPrincipal.map((m) => (
          <FilaMenu key={m.titulo} item={m} onPress={() => abrir(m.titulo)} />
        ))}
        {verMas &&
          menuExtra.map((m) => (
            <FilaMenu key={m.titulo} item={m} onPress={() => abrir(m.titulo)} />
          ))}
      </View>

      <Pressable style={styles.botonVerMas} onPress={() => setVerMas(!verMas)}>
        <Text style={styles.botonVerMasTexto}>{verMas ? 'Ver menos' : 'Ver más'}</Text>
      </Pressable>

      {/* Secciones desplegables */}
      <Seccion icono="❓" titulo="Ayuda y soporte técnico">
        <FilaMenu item={{ icono: '📞', titulo: 'Contactar recepción' }} onPress={() => abrir('Contactar')} />
        <FilaMenu item={{ icono: '💬', titulo: 'Preguntas frecuentes' }} onPress={() => abrir('FAQ')} />
      </Seccion>

      <Seccion icono="⚙️" titulo="Configuración y privacidad">
        <FilaMenu item={{ icono: '🔑', titulo: 'Cambiar contraseña' }} onPress={() => abrir('Cambiar contraseña')} />
        <FilaMenu item={{ icono: '🚪', titulo: 'Cerrar sesión' }} onPress={() => router.back()} />
      </Seccion>
    </ScrollView>
  );
}

function FilaMenu({ item, onPress }: { item: Item; onPress: () => void }) {
  return (
    <Pressable style={styles.filaMenu} onPress={onPress}>
      <Text style={styles.filaMenuIcono}>{item.icono}</Text>
      <Text style={styles.filaMenuTitulo}>{item.titulo}</Text>
    </Pressable>
  );
}

function Seccion({ icono, titulo, children }: { icono: string; titulo: string; children: ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <View style={styles.seccionDesplegable}>
      <Pressable style={styles.seccionCabecera} onPress={() => setAbierta(!abierta)}>
        <Text style={styles.filaMenuIcono}>{icono}</Text>
        <Text style={[styles.filaMenuTitulo, { flex: 1 }]}>{titulo}</Text>
        <Text style={styles.chevron}>{abierta ? '⌃' : '⌄'}</Text>
      </Pressable>
      {abierta && <View style={{ paddingLeft: 12 }}>{children}</View>}
    </View>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={styles.fila}>
      <Text style={styles.filaEtiqueta}>{etiqueta}</Text>
      <Text style={styles.filaValor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030801' },
  contenido: { padding: 16, paddingTop: 48, paddingBottom: 40 },

  tarjetaPerfil: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1a1a1a', borderRadius: 16, padding: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#5ecb1f', alignItems: 'center', justifyContent: 'center' },
  avatarLetra: { fontSize: 24, fontWeight: 'bold', color: '#030801' },
  nombre: { fontSize: 18, fontWeight: 'bold', color: '#ffffff' },
  subtitulo: { fontSize: 13, color: '#9a9a9a', marginTop: 2 },
  chevronCaja: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  chevron: { color: '#ffffff', fontSize: 20 },

  tarjetaDatos: { backgroundColor: '#1a1a1a', borderRadius: 16, padding: 14, marginTop: 12 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  filaEtiqueta: { color: '#9a9a9a', fontSize: 14 },
  filaValor: { color: '#ffffff', fontSize: 14, fontWeight: '600' },

  seccion: { fontSize: 17, fontWeight: 'bold', color: '#ffffff', marginTop: 20, marginBottom: 10 },
  filaAccesos: { flexDirection: 'row', gap: 8 },
  accesoWrap: { flex: 1 },
  accesoCuadro: { aspectRatio: 1, backgroundColor: '#1a1a1a', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  accesoIcono: { fontSize: 30 },
  accesoTitulo: { color: '#d0d0d0', fontSize: 12, marginTop: 6 },

  filaMenu: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14 },
  filaMenuIcono: { fontSize: 26, width: 34, textAlign: 'center' },
  filaMenuTitulo: { color: '#ffffff', fontSize: 17, fontWeight: '500' },

  botonVerMas: { backgroundColor: '#2a2a2a', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8, marginBottom: 12 },
  botonVerMasTexto: { color: '#ffffff', fontSize: 16, fontWeight: '600' },

  seccionDesplegable: { borderTopWidth: 1, borderTopColor: '#2a2a2a' },
  seccionCabecera: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
});