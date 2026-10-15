// =============================================================
// sesion.ts — DATOS DE LA SESIÓN MIENTRAS LA APP ESTÁ ABIERTA
// Después del login se guarda aquí el token y los datos del usuario,
// para que cualquier pantalla los pueda usar. Viven en la memoria:
// al cerrar la app se pierden y hay que iniciar sesión otra vez.
// (Más adelante se puede guardar el token con expo-secure-store
// para que la sesión dure aunque se cierre la app.)
// =============================================================

export type Sesion = {
  token: string;
  idUsuario: string;
  nombre: string;
  rol: string;
  acceso: string; // COMPLETO o LIMITADO
};

let actual: Sesion | null = null;

export function guardarSesion(datos: Sesion) {
  actual = datos;
}

export function obtenerSesion(): Sesion | null {
  return actual;
}

export function cerrarSesion() {
  actual = null;
}
