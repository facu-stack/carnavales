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

export default router;