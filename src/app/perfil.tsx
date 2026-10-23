import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { consultarMembresia, listarSucursales, mensajesSinLeer } from './conexion';
import { cerrarSesion, obtenerSesion } from './sesion'; // NUEVO: cerrarSesion se usaba sin importarlo

type Item = { icono: string; titulo: string };

const accesosDirectos: Item[] = [
  { icono: '💳', titulo: 'Mi membresía' },
  { icono: '🏋️', titulo: 'Mi rutina' },
  { icono: '📍', titulo: 'Mi sucursal' },
];

const menuPrincipal: Item[] = [
  { icono: '👥', titulo: 'Clases grupales' },
  { icono: '🧾', titulo: 'Mis pagos' },
  { icono: '🧑‍🏫', titulo: 'Mi entrenador' },
  { icono: '🎯', titulo: 'Mis metas' },
];

const menuExtra: Item[] = [
  { icono: '⏱️', titulo: 'Entrenamiento' },
  { icono: '🗺️', titulo: 'Todas las sucursales' },
];

// Pantalla de cada opción del menú (las que todavía no existen no hacen nada)
const pantallas: Record<string, string> = {
  'Mi membresía': '/mi_membresia',
  'Mi rutina': '/mi_rutina',
  'Mi entrenador': '/mi_entrenador',
  'Clases grupales': '/clases_grupales',     // NUEVO
  'Mis pagos': '/mis_pagos',
  'Mi sucursal': '/mi_sucursal',             // NUEVO
  'Todas las sucursales': '/sucursales',     // NUEVO
  'Mis metas': '/mis_metas',                 // NUEVO
  'Contactar recepción': '/chat',            // NUEVO: chat directo con la recepción de su sucursal
  'Entrenamiento': '/entrenamiento',
  'Cambiar contraseña': '/cambio_contra', // CAMBIO: antes '/cambiocontra', pero el archivo es cambio_contra.tsx
};

function formatearFecha(valor?: string | null): string {
  if (!valor) return '-';
  const [anio, mes, dia] = String(valor).slice(0, 10).split('-');
  return anio && mes && dia ? `${dia}/${mes}/${anio}` : String(valor);
}

export default function Perfil() {
  const router = useRouter();
  const params = useLocalSearchParams<{ nombre: string; rol: string; acceso: string }>();
  const sesion = obtenerSesion();

  // CAMBIO: al volver desde mi_membresia con router.push('/perfil') no llegan params,
  // así que se usan los datos guardados en la sesión
  const nombre = params.nombre || sesion?.nombre || 'Usuario';
  const rol = params.rol || sesion?.rol || '-';
  const acceso = sesion?.acceso || params.acceso; // la sesión se actualiza al pagar
  const membresiaVencida = acceso === 'LIMITADO';
  const [verMas, setVerMas] = useState(false);

  // CAMBIO: membresía y vencimiento reales desde GET /cliente/membresia
  const [membresia, setMembresia] = useState<{ tipo: string; vence: string }>({ tipo: '...', vence: '...' });
  // CAMBIO: antes era 'Chimaltenango' fijo; ahora es el nombre real de su sucursal
  const [sucursal, setSucursal] = useState<string>('...');
  // NUEVO: mensajes de recepción que el cliente todavía no ha leído
  const [sinLeer, setSinLeer] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!obtenerSesion()?.token) return;
      listarSucursales()
        .then((lista) => setSucursal(lista.find((s) => s.es_mia)?.nombre ?? '-'))
        .catch(() => setSucursal('-'));
      mensajesSinLeer()
        .then((r) => setSinLeer(r.sin_leer))
        .catch(() => setSinLeer(0));
      consultarMembresia()
        .then((m) => {
          if (m.activa) {
            setMembresia({ tipo: m.tipo || '-', vence: formatearFecha(m.pagado_hasta || m.fecha_fin) });
          } else {
            setMembresia({ tipo: 'Sin membresía vigente', vence: formatearFecha(m.ultima?.fecha_fin) });
          }
        })
        .catch(() => setMembresia({ tipo: 'No disponible', vence: '-' }));
    }, [])
  );

  const abrir = (titulo: string) => {
    const ruta = pantallas[titulo];
    if (ruta) router.push(ruta as any);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      {/* Tarjeta de perfil */}
      <View style={styles.tarjetaPerfil}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetra}>{nombre.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nombre} numberOfLines={1}>{nombre}</Text>
          <Text style={styles.subtitulo}>Membresía {membresia.tipo}</Text>
        </View>
        <View style={styles.chevronCaja}>
          <Text style={styles.chevron}>⌄</Text>
        </View>
      </View>

      {/* Aviso de membresía vencida (acceso LIMITADO) */}
      {membresiaVencida && (
        <View style={styles.aviso}>
          <Text style={styles.avisoTexto}>Tu membresía venció. Renuévala para usar todas las secciones.</Text>
        </View>
      )}

      {/* Datos de la persona */}
      <View style={styles.tarjetaDatos}>
        <Fila etiqueta="Sucursal" valor={sucursal} />
        <Fila etiqueta="Vence" valor={membresia.vence} />
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
      {/* El globito también sale en la cabecera, para verlo aunque la sección esté cerrada */}
      <Seccion icono="❓" titulo="Ayuda y soporte técnico" contador={sinLeer}>
        <FilaMenu item={{ icono: '📞', titulo: 'Contactar recepción' }} onPress={() => abrir('Contactar recepción')} contador={sinLeer} />

      </Seccion>

      <Seccion icono="⚙️" titulo="Configuración y privacidad">
        <FilaMenu item={{ icono: '🔑', titulo: 'Cambiar contraseña' }} onPress={() => abrir('Cambiar contraseña')} />
        {/* CAMBIO: replace('/') en vez de back(): después de pasar por mi_membresia, back() no regresa al login */}
        <FilaMenu item={{ icono: '🚪', titulo: 'Cerrar sesión' }} onPress={() => { cerrarSesion(); router.replace('/'); }} />
      </Seccion>
    </ScrollView>
  );
}

function FilaMenu({ item, onPress, contador = 0 }: { item: Item; onPress: () => void; contador?: number }) {
  return (
    <Pressable style={styles.filaMenu} onPress={onPress}>
      <Text style={styles.filaMenuIcono}>{item.icono}</Text>
      <Text style={styles.filaMenuTitulo}>{item.titulo}</Text>
      {/* NUEVO: globito con los mensajes sin leer */}
      {contador > 0 && (
        <View style={styles.globo}>
          <Text style={styles.globoTexto}>{contador > 9 ? '9+' : contador}</Text>
        </View>
      )}
    </Pressable>
  );
}

function Seccion({ icono, titulo, children, contador = 0 }: { icono: string; titulo: string; children: ReactNode; contador?: number }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <View style={styles.seccionDesplegable}>
      <Pressable style={styles.seccionCabecera} onPress={() => setAbierta(!abierta)}>
        <Text style={styles.filaMenuIcono}>{icono}</Text>
        <Text style={[styles.filaMenuTitulo, { flex: 1 }]}>{titulo}</Text>
        {contador > 0 && !abierta && (
          <View style={[styles.globo, { marginRight: 8 }]}>
            <Text style={styles.globoTexto}>{contador > 9 ? '9+' : contador}</Text>
          </View>
        )}
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
  globo: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#FF5252', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  globoTexto: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },

  botonVerMas: { backgroundColor: '#2a2a2a', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8, marginBottom: 12 },
  botonVerMasTexto: { color: '#ffffff', fontSize: 16, fontWeight: '600' },

  seccionDesplegable: { borderTopWidth: 1, borderTopColor: '#2a2a2a' },
  seccionCabecera: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },

  aviso: { backgroundColor: '#3a2a00', borderRadius: 12, padding: 12, marginTop: 12 },
  avisoTexto: { color: '#ffd166', fontSize: 14, fontWeight: '600' },
});