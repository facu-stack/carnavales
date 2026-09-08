import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const HORA_ACCESO_ANTES = 60 * 60 * 1000; // 1 hora antes del inicio
export const HORA_ACCESO_DESPUES = 24 * 60 * 60 * 1000; // 24 horas después del inicio
export const DIAS_AUTOELIMINACION = 7; // noches vencidas se eliminan solas tras una semana

// Fin de la ventana de disponibilidad de una noche (inicio + 24h).
export function finDisponibilidad(fechaHoraInicio) {
  const inicio = new Date(fechaHoraInicio);
  return new Date(inicio.getTime() + HORA_ACCESO_DESPUES);
}

export function calcularVentana(fechaHoraInicio) {
  const inicio = new Date(fechaHoraInicio);
  return {
    accesoInicio: new Date(inicio.getTime() - HORA_ACCESO_ANTES),
    accesoFin: new Date(inicio.getTime() + HORA_ACCESO_DESPUES),
  };
}

// Determina el estado efectivo de una noche según su estado almacenado y el tiempo.
// Si el estado es 'publicada' y la fecha/hora actual cae dentro de la ventana,
// se considera 'abierta'.
export function estadoEfectivo(noche, now = new Date()) {
  if (noche.estado === "borrador" || noche.estado === "finalizada") {
    return noche.estado;
  }
  if (noche.estado === "publicada" || noche.estado === "abierta") {
    const { accesoInicio, accesoFin } = calcularVentana(noche.fecha_hora_inicio);
    if (now >= accesoInicio && now <= accesoFin) {
      return "abierta";
    }
    if (now > accesoFin) {
      return "finalizada";
    }
    return "publicada";
  }
  return noche.estado;
}

// Obtiene la noche por id y valida su estado.
export async function getNocheById(nocheId) {
  const { rows } = await pool.query("SELECT * FROM noches WHERE id = $1", [nocheId]);
  return rows[0] || null;
}

// Verifica que el usuario esté asignado a la noche.
export async function requerirAsignacion(userId, nocheId) {
  const { rows } = await pool.query(
    "SELECT 1 FROM asignacion_jurado WHERE user_id = $1 AND noche_id = $2",
    [userId, nocheId]
  );
  return rows.length > 0;
}
