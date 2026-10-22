import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function recueperar() {
  return (
    <View style={styles.container}>
      <Text style={styles.texto}>hola</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020700',
    justifyContent: 'center',
    alignItems: 'center',
  },
  texto: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
  },
});