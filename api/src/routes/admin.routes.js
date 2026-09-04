import express from "express";
import pg from "pg";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const router = express.Router();

router.get("/comparsas", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM comparsas ORDER BY "position"');
    res.json(rows);
  } catch (error) {
    console.error("Get comparsas error:", error);
    res.status(500).json({ error: "Failed to get comparsas" });
  }
});

router.post("/comparsas", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, position, colors } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }
    const { rows } = await pool.query(
      'INSERT INTO comparsas (name, "position", colors) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), position || 0, JSON.stringify(colors || [])]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Comparsa name already exists" });
    }
    console.error("Create comparsa error:", error);
    res.status(500).json({ error: "Failed to create comparsa" });
  }
});

router.put("/comparsas/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, position, colors } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }
    const { rows } = await pool.query(
      'UPDATE comparsas SET name = $1, "position" = $2, colors = $3 WHERE id = $4 RETURNING *',
      [name.trim(), position || 0, JSON.stringify(colors || []), id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Comparsa not found" });
    }
    res.json(rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Comparsa name already exists" });
    }
    console.error("Update comparsa error:", error);
    res.status(500).json({ error: "Failed to update comparsa" });
  }
});

router.delete("/comparsas/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query("DELETE FROM comparsas WHERE id = $1", [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: "Comparsa not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Delete comparsa error:", error);
    res.status(500).json({ error: "Failed to delete comparsa" });
  }
});

router.get("/rubros", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM rubros ORDER BY id");
    res.json(rows);
  } catch (error) {
    console.error("Get rubros error:", error);
    res.status(500).json({ error: "Failed to get rubros" });
  }
});

router.post("/rubros", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, min_score, max_score, comparsa_id } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }
    if (!comparsa_id) {
      return res.status(400).json({ error: "Comparsa is required" });
    }
    const { rows } = await pool.query(
      "INSERT INTO rubros (name, min_score, max_score, comparsa_id) VALUES ($1, $2, $3, $4) RETURNING *",
      [name.trim(), min_score || 5, max_score || 10, comparsa_id]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "23503") {
      return res.status(400).json({ error: "Comparsa not found" });
    }
    console.error("Create rubro error:", error);
    res.status(500).json({ error: "Failed to create rubro" });
  }
});

router.put("/rubros/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, min_score, max_score, comparsa_id } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }
    const { rows } = await pool.query(
      "UPDATE rubros SET name = $1, min_score = $2, max_score = $3, comparsa_id = $4 WHERE id = $5 RETURNING *",
      [name.trim(), min_score || 5, max_score || 10, comparsa_id, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Rubro not found" });
    }
    res.json(rows[0]);
  } catch (error) {
    if (error.code === "23503") {
      return res.status(400).json({ error: "Comparsa not found" });
    }
    console.error("Update rubro error:", error);
    res.status(500).json({ error: "Failed to update rubro" });
  }
});

router.delete("/rubros/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query("DELETE FROM rubros WHERE id = $1", [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: "Rubro not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Delete rubro error:", error);
    res.status(500).json({ error: "Failed to delete rubro" });
  }
});

export default router;
