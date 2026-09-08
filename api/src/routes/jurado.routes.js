import express from "express";
import pg from "pg";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import { estadoEfectivo, calcularVentana } from "../middleware/noche.middleware.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const router = express.Router();

const planillaSchema = z.object({
  comparsa_id: z.number().int().positive(),
  noche_id: z.number().int().positive(),
  puntajes: z
    .array(
      z.object({
        rubro_id: z.number().int().positive(),
        puntaje: z.number().int().min(1).max(10),
      })
    )
    .min(1),
});

router.get("/jurado/mis-rubros", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT r.id, r.name, r.min_score, r.max_score
       FROM jurado_rubros jr
       JOIN rubros r ON r.id = jr.rubro_id
       WHERE jr.user_id = $1
       ORDER BY r.id`,
      [userId]
    );
    res.json(rows);
  } catch (error) {
    console.error("Get mis rubros error:", error.message);
    res.status(500).json({ error: "Failed to get assigned rubros" });
  }
});

router.get("/jurado/mis-comparsas", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.colors, c."position",
              (SELECT COUNT(*)::int FROM jurado_rubros jr WHERE jr.user_id = $1) AS rubros_count
       FROM comparsas c
       WHERE EXISTS (SELECT 1 FROM jurado_rubros jr WHERE jr.user_id = $1)
       ORDER BY c."position"`,
      [userId]
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        colors: Array.isArray(r.colors) ? r.colors : [],
        position: r.position,
        rubros_count: r.rubros_count,
      }))
    );
  } catch (error) {
    console.error("Get mis comparsas error:", error.message);
    res.status(500).json({ error: "Failed to get assigned comparsas" });
  }
});

// Envía la planilla confirmada de un jurado para una comparsa y noche.
router.post("/jurado/planilla", requireAuth, async (req, res) => {
  const parsed = planillaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Datos invalidos" });
  }

  const { comparsa_id, noche_id, puntajes } = parsed.data;

  if (new Set(puntajes.map((p) => p.rubro_id)).size !== puntajes.length) {
    return res.status(400).json({ error: "Rubros duplicados" });
  }

  const client = await pool.connect();
  try {
    const { rows: comparsa } = await client.query(
      "SELECT id FROM comparsas WHERE id = $1",
      [comparsa_id]
    );
    if (comparsa.length === 0) {
      return res.status(404).json({ error: "Comparsa no encontrada" });
    }

    const { rows: nocheRow } = await client.query(
      "SELECT id, estado, fecha_hora_inicio, fecha_hora_publicacion_resultados FROM noches WHERE id = $1",
      [noche_id]
    );
    if (nocheRow.length === 0) {
      return res.status(404).json({ error: "Noche no encontrada" });
    }
    const noche = nocheRow[0];

    const estado = estadoEfectivo(noche);
    if (estado !== "abierta") {
      return res.status(400).json({ error: "La noche no está abierta para votar" });
    }

    const now = new Date();
    const { accesoInicio, accesoFin } = calcularVentana(noche.fecha_hora_inicio);
    if (now < accesoInicio || now > accesoFin) {
      return res.status(400).json({ error: "Fuera de la ventana de votación" });
    }

    const { rows: asignado } = await client.query(
      "SELECT 1 FROM asignacion_jurado WHERE user_id = $1 AND noche_id = $2",
      [req.user.id, noche_id]
    );
    if (asignado.length === 0) {
      return res.status(403).json({ error: "No estás asignado a esta noche" });
    }

    const { rows: asignados } = await client.query(
      `SELECT jr.rubro_id, r.min_score, r.max_score
       FROM jurado_rubros jr
       JOIN rubros r ON r.id = jr.rubro_id
       WHERE jr.user_id = $1`,
      [req.user.id]
    );
    if (asignados.length === 0) {
      return res.status(400).json({ error: "No tenés rubros asignados" });
    }

    const asignadosMap = new Map(
      asignados.map((r) => [r.rubro_id, { min: r.min_score, max: r.max_score }])
    );

    for (const item of puntajes) {
      const rango = asignadosMap.get(item.rubro_id);
      if (!rango) {
        return res.status(400).json({ error: "Rubro no asignado" });
      }
      if (item.puntaje < rango.min || item.puntaje > rango.max) {
        return res.status(400).json({
          error: `El puntaje debe estar entre ${rango.min} y ${rango.max}`,
        });
      }
    }

    if (new Set(puntajes.map((p) => p.rubro_id)).size !== asignados.length) {
      return res.status(400).json({
        error: "La planilla debe incluir todos tus rubros asignados",
      });
    }

    await client.query("BEGIN");
    let guard = 0;
    for (const item of puntajes) {
      const { rowCount } = await client.query(
        `INSERT INTO calificacion (account_id, comparsa_id, rubro_id, noche_id, puntaje)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_id, comparsa_id, rubro_id, noche_id) DO NOTHING`,
        [req.user.id, comparsa_id, item.rubro_id, noche_id, item.puntaje]
      );
      guard += rowCount;
    }
    if (guard < asignados.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Ya confirmaste esta planilla." });
    }
    await client.query("COMMIT");

    res.status(201).json({ success: true, comparsa_id, noche_id });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Submit planilla error:", error.message);
    res.status(500).json({ error: "Failed to submit planilla" });
  } finally {
    client.release();
  }
});

// Comparsas cuya planilla el jurado ya completó (todas sus planillas para esa noche).
router.get("/jurado/mis-votos", requireAuth, async (req, res) => {
  try {
    const nocheId = Number(req.query.noche_id);
    if (!Number.isInteger(nocheId) || nocheId <= 0) {
      return res.status(400).json({ error: "noche_id es requerido" });
    }
    const { rows } = await pool.query(
      `SELECT co.id, co.name, co."position",
              (SELECT COUNT(*)::int FROM jurado_rubros jr WHERE jr.user_id = $1) AS assigned,
              (SELECT COUNT(DISTINCT c.rubro_id)::int FROM calificacion c
               WHERE c.account_id = $1 AND c.comparsa_id = co.id AND c.noche_id = $2) AS voted
       FROM comparsas co
       ORDER BY co."position"`,
      [req.user.id, nocheId]
    );
    const confirmadas = rows
      .filter((r) => r.assigned > 0 && r.voted >= r.assigned)
      .map((r) => ({ id: r.id, name: r.name, position: r.position }));
    res.json(confirmadas);
  } catch (error) {
    console.error("Get mis votos error:", error.message);
    res.status(500).json({ error: "Failed to get submitted planillas" });
  }
});

export default router;