import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Accelerometer } from 'expo-sensors';

export default function PodometroConAcelerometro() {
  const [pasos, setPasos] = useState<number>(0);
  const [estado, setEstado] = useState<string>('Calibrando...');

  useEffect(() => {
    // Configurar la velocidad de lectura del acelerómetro (en milisegundos)
    Accelerometer.setUpdateInterval(100);

    let ultimoPaso = 0;

    const subscription = Accelerometer.addListener((accelerometerData) => {
      const { x, y, z } = accelerometerData;
      
      // Fórmula matemática simple para detectar fuerza/movimiento de un paso
      const fuerzaMovimiento = Math.sqrt(x * x + y * y + z * z);

      // Si la fuerza del movimiento supera un umbral y ha pasado un tiempo prudente
      const ahora = Date.now();
      if (fuerzaMovimiento > 1.35 && ahora - ultimoPaso > 400) {
        setPasos((prev) => prev + 1);
        ultimoPaso = ahora;
      }

      setEstado('Sensor de movimiento activo ✅');
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Podómetro (Modo Expo Go)</Text>
      <Text style={styles.estado}>{estado}</Text>

      <View style={styles.tarjetaPasos}>
        <Text style={styles.numeroPasos}>{pasos}</Text>
        <Text style={styles.labelPasos}>Pasos detectados</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#020700',
    padding: 20,
  },
  titulo: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 10,
  },
  estado: {
    color: '#00E676',
    marginBottom: 30,
    fontSize: 14,
  },
  tarjetaPasos: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 4,
    borderColor: '#00E676',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#070E07',
  },
  numeroPasos: {
    fontSize: 52,
    fontWeight: 'bold',
    color: '#00E676',
  },
  labelPasos: {
    fontSize: 14,
    color: '#ffffff',
    marginTop: 4,
  },
});