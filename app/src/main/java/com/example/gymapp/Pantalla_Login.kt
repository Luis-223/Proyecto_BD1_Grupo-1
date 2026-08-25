package com.example.gymapp

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

// Simula una "base de datos" de usuarios mientras no está la API real
data class Usuario(val correo: String, val contrasena: String)

@Composable
fun Pantalla_Login() {
    // Lista de usuarios registrados, en memoria (se pierde al cerrar la app)
    val usuariosRegistrados = remember { mutableStateListOf<Usuario>() }

    var correo by remember { mutableStateOf("") }
    var contrasena by remember { mutableStateOf("") }
    var mensaje by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text(text = "GymApp", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(24.dp))

        OutlinedTextField(
            value = correo,
            onValueChange = { correo = it },
            label = { Text("Correo") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = contrasena,
            onValueChange = { contrasena = it },
            label = { Text("Contraseña") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(16.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                if (correo.isBlank() || contrasena.isBlank()) {
                    mensaje = "Completa ambos campos"
                } else if (usuariosRegistrados.any { it.correo == correo }) {
                    mensaje = "Ese correo ya está registrado"
                } else {
                    usuariosRegistrados.add(Usuario(correo, contrasena))
                    mensaje = "Cuenta creada. Ya puedes iniciar sesión"
                }
            }) {
                Text("Crear cuenta")
            }

            Button(onClick = {
                val existe = usuariosRegistrados.any {
                    it.correo == correo && it.contrasena == contrasena
                }
                mensaje = if (existe) "Sesión iniciada correctamente"
                else "Correo o contraseña incorrectos"
            }) {
                Text("Iniciar sesión")
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        Text(text = mensaje)
    }
}