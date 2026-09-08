import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Registra un evento de auditoría. Fail-secure: si el insert falla,
 * se registra en consola pero no se interrumpe la operación principal.
 *
 * @param {object} params
 * @param {string} [params.userId]
 * @param {string} params.accion
 * @param {string} [params.entidad]
 * @param {string} [params.entidadId]
 * @param {object} [params.detalles]
 * @param {string} [params.ip]
 */
export async function auditar({ userId, accion, entidad, entidadId, detalles, ip }) {
  try {
    await pool.query(
      `INSERT INTO auditoria (user_id, accion, entidad, entidad_id, detalles, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId || null,
        accion,
        entidad || null,
        entidadId != null ? String(entidadId) : null,
        detalles ? JSON.stringify(detalles) : null,
        ip || null,
      ]
    );
  } catch (error) {
    console.error("Auditoría falló (no interrumpe):", error.message);
  }
}
