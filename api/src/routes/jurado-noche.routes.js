import express from "express";
import pg from "pg";
import { requireAuth } from "../middleware/auth.middleware.js";
import { estadoEfectivo, calcularVentana } from "../middleware/noche.middleware.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const router = express.Router();

// Noches asignadas al jurado logueado
router.get("/jurado/mis-noches", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const { rows } = await pool.query(
      `SELECT n.id, n.name, n.fecha_hora_inicio, n.fecha_hora_publicacion_resultados, n.estado,
              (SELECT COUNT(*)::int FROM orden_comparsa oc WHERE oc.noche_id = n.id) AS comparsas_total,
              (SELECT COUNT(DISTINCT cv.comparsa_id)::int FROM calificacion cv
               WHERE cv.account_id = $1 AND cv.noche_id = n.id
                 AND cv.rubro_id IN (SELECT rubro_id FROM jurado_rubros jr WHERE jr.user_id = $1)
              ) AS comparsas_completadas
       FROM asignacion_jurado aj
       JOIN noches n ON n.id = aj.noche_id
       WHERE aj.user_id = $1
       ORDER BY n.fecha_hora_inicio`,
      [req.user.id]
    );
    const result = rows.map((n) => {
      const ventana = calcularVentana(n.fecha_hora_inicio);
      return {
        id: n.id,
        name: n.name,
        fecha_hora_inicio: n.fecha_hora_inicio,
        fecha_hora_publicacion_resultados: n.fecha_hora_publicacion_resultados,
        estado: n.estado,
        estado_efectivo: estadoEfectivo(n, now),
        acceso_inicio: ventana.accesoInicio.toISOString(),
        acceso_fin: ventana.accesoFin.toISOString(),
        comparsas_total: n.comparsas_total,
        comparsas_completadas: n.comparsas_completadas,
      };
    });
    res.json(result);
  } catch (error) {
    console.error("Get mis noches error:", error.message);
    res.status(500).json({ error: "Failed to get assigned noches" });
  }
});

// Detalle de una noche asignada: comparsas en orden + rubros + estado + ventana
router.get("/jurado/noche/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const now = new Date();

    const { rows: asignado } = await pool.query(
      "SELECT 1 FROM asignacion_jurado WHERE user_id = $1 AND noche_id = $2",
      [req.user.id, id]
    );
    if (asignado.length === 0) {
      return res.status(403).json({ error: "No estás asignado a esta noche" });
    }

    const { rows: noche } = await pool.query(
      "SELECT * FROM noches WHERE id = $1",
      [id]
    );
    if (noche.length === 0) {
      return res.status(404).json({ error: "Noche not found" });
    }
    const n = noche[0];

    const ventana = calcularVentana(n.fecha_hora_inicio);
    const estado = estadoEfectivo(n, now);

    const { rows: comparsas } = await pool.query(
      `SELECT oc.comparsa_id AS id, c.name, c.colors, oc."position"
       FROM orden_comparsa oc
       JOIN comparsas c ON c.id = oc.comparsa_id
       WHERE oc.noche_id = $1
       ORDER BY oc."position"`,
      [id]
    );

    const { rows: rubros } = await pool.query(
      `SELECT r.id, r.name, r.min_score, r.max_score
       FROM jurado_rubros jr
       JOIN rubros r ON r.id = jr.rubro_id
       WHERE jr.user_id = $1
       ORDER BY r.id`,
      [req.user.id]
    );

    res.json({
      id: n.id,
      name: n.name,
      fecha_hora_inicio: n.fecha_hora_inicio,
      fecha_hora_publicacion_resultados: n.fecha_hora_publicacion_resultados,
      estado: n.estado,
      estado_efectivo: estado,
      acceso_inicio: ventana.accesoInicio.toISOString(),
      acceso_fin: ventana.accesoFin.toISOString(),
      comparsas: comparsas.map((c) => ({
        id: c.id,
        name: c.name,
        colors: Array.isArray(c.colors) ? c.colors : [],
        position: c.position,
      })),
      rubros: rubros,
    });
  } catch (error) {
    console.error("Get noche detail error:", error.message);
    res.status(500).json({ error: "Failed to get noche detail" });
  }
});

// Progreso del jurado en una noche asignada
router.get("/jurado/noche/:id/progreso", requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: asignado } = await pool.query(
      "SELECT 1 FROM asignacion_jurado WHERE user_id = $1 AND noche_id = $2",
      [req.user.id, id]
    );
    if (asignado.length === 0) {
      return res.status(403).json({ error: "No estás asignado a esta noche" });
    }

    const { rows } = await pool.query(
      `SELECT oc.comparsa_id, oc."position", c.name,
              (SELECT COUNT(*)::int FROM jurado_rubros jr WHERE jr.user_id = $1) AS rubros_asignados,
              (SELECT COUNT(DISTINCT cv.rubro_id)::int FROM calificacion cv
               WHERE cv.account_id = $1 AND cv.comparsa_id = oc.comparsa_id AND cv.noche_id = $2
                 AND cv.rubro_id IN (SELECT rubro_id FROM jurado_rubros jr2 WHERE jr2.user_id = $1)
              ) AS rubros_votados
       FROM orden_comparsa oc
       JOIN comparsas c ON c.id = oc.comparsa_id
       WHERE oc.noche_id = $2
       ORDER BY oc."position"`,
      [req.user.id, id]
    );

    const result = rows.map((r) => {
      const completada = r.rubros_asignados > 0 && r.rubros_votados >= r.rubros_asignados;
      return {
        comparsa_id: r.comparsa_id,
        name: r.name,
        position: r.position,
        rubros_asignados: r.rubros_asignados,
        rubros_votados: r.rubros_votados,
        completada,
      };
    });

    res.json({
      noche_id: id,
      comparsas: result,
      completadas: result.filter((r) => r.completada).length,
      total: result.length,
    });
  } catch (error) {
    console.error("Get progreso error:", error.message);
    res.status(500).json({ error: "Failed to get progreso" });
  }
});

export default router;
