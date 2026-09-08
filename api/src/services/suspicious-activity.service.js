import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Umbrales configurables via env
const UMBRAL_INTENTOS = Number(process.env.SOS_PIN_UMBRAL) || 5;
const VENTANA_MS = Number(process.env.SOS_PIN_VENTANA_MS) || 5 * 60 * 1000; // 5 min
const COOLDOWN_MS = Number(process.env.SOS_PIN_COOLDOWN_MS) || 30 * 60 * 1000; // 30 min

/**
 * Registra un intento de acceso (fallido) y detecta actividad sospechosa.
 * Devuelve true si se debe enviar una alerta por email.
 *
 * Para evitar spam de emails:
 *  - Guardamos la última vez que alertamos por email (cooldown).
 *  - Solo alertamos cuando se supera el umbral de intentos en la ventana.
 */
export async function registrarIntentoAcceso({ email, ip, resultado }) {
  const client = await pool.connect();
  try {
    const accion = `intento_acceso:${resultado}`;

    const { rows: userRows } = await client.query(
      "SELECT id FROM \"user\" WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );
    const userId = userRows[0]?.id || null;

    // Registrar intento en auditoría
    await client.query(
      `INSERT INTO auditoria (user_id, accion, entidad, entidad_id, detalles, ip)
       VALUES ($1, $2, 'user', $3, $4, $5)`,
      [userId, accion, userId, JSON.stringify({ email, resultado }), ip || null]
    );

    if (!email || !userId) return false;

    // Contar intentos fallidos recientes en la ventana
    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS total,
              MAX(CASE WHEN detalles->>'email_alertado' = 'true' THEN created_at END) AS last_alert
       FROM auditoria
       WHERE user_id = $1
         AND accion IN ('intento_acceso:fallido')
         AND created_at >= NOW() - ($2 || ' milliseconds')::interval`,
      [userId, VENTANA_MS]
    );
    const total = countRows[0]?.total || 0;
    const lastAlert = countRows[0]?.last_alert;

    if (total >= UMBRAL_INTENTOS) {
      // Verificar cooldown para evitar spam
      if (!lastAlert || new Date() - new Date(lastAlert) >= COOLDOWN_MS) {
        // Marcar que alertamos
        try {
          await client.query(
            `INSERT INTO auditoria (user_id, accion, entidad, entidad_id, detalles)
             VALUES ($1, 'alerta_actividad_sospechosa', 'user', $2, $3)`,
            [userId, userId, JSON.stringify({ email, email_alertado: true })]
          );
        } catch {
          // no-op
        }
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("registrarIntentoAcceso error:", error.message);
    return false;
  } finally {
    client.release();
  }
}
