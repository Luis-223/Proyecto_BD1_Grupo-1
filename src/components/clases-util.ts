// =============================================================
// clases-util.ts — AYUDANTES PARA LAS PANTALLAS DE CLASES GRUPALES
// (está en components y no en app para que Expo no lo trate como pantalla)
// =============================================================

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

// La fecha llega como "2026-10-23T18:00:00.000Z" con la hora de Guatemala
// (la base guarda hora local): se lee tal cual, sin convertir zona horaria.
function partes(iso: string) {
  const anio = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  const dia = Number(iso.slice(8, 10));
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return { anio, mes, dia, diaSemana, hora: iso.slice(11, 16) };
}

// "Jue 23/10 · 18:00"
export function fechaClaseCorta(iso: string): string {
  const p = partes(iso);
  return `${DIAS_CORTOS[p.diaSemana]} ${String(p.dia).padStart(2, '0')}/${String(p.mes).padStart(2, '0')} · ${p.hora}`;
}

// "Jueves 23 de octubre · 18:00"
export function fechaClaseLarga(iso: string): string {
  const p = partes(iso);
  return `${DIAS[p.diaSemana]} ${p.dia} de ${MESES[p.mes - 1]} · ${p.hora}`;
}

// Ícono de MaterialCommunityIcons según el nombre de la clase
export function iconoClase(nombre: string): string {
  const n = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (n.includes('zumba') || n.includes('baile') || n.includes('danza')) return 'music';
  if (n.includes('yoga')) return 'yoga';
  if (n.includes('pilates')) return 'human-handsup';
  if (n.includes('spinning') || n.includes('ciclismo') || n.includes('bici')) return 'bike';
  if (n.includes('box') || n.includes('kick')) return 'boxing-glove';
  if (n.includes('cross') || n.includes('funcional') || n.includes('hiit')) return 'kettlebell';
  if (n.includes('nata') || n.includes('aqua')) return 'swim';
  if (n.includes('estira') || n.includes('stretch')) return 'meditation';
  return 'dumbbell';
}
