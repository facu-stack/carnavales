import express from "express";
import pg from "pg";
import { requireAuth } from "../middleware/auth.middleware.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const router = express.Router();

router.get("/jurado/mis-rubros", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await pool.query(
      `SELECT r.id, r.name, r.min_score, r.max_score,
              r.comparsa_id, c.name AS comparsa_name, c."position"
       FROM jurado_rubros jr
       JOIN rubros r ON r.id = jr.rubro_id
       JOIN comparsas c ON c.id = jr.comparsa_id
       WHERE jr.user_id = $1
       ORDER BY c."position", r.id`,
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
              COUNT(jr.id)::int AS rubros_count
       FROM jurado_rubros jr
       JOIN comparsas c ON c.id = jr.comparsa_id
       WHERE jr.user_id = $1
       GROUP BY c.id
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

export default router;