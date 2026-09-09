import express from "express";
import pg from "pg";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { auditar } from "../services/audit.service.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const router = express.Router();

const crearIncidenciaSchema = z.object({
  noche_id: z.number().int().positive(),
  comparsa_id: z.number().int().positive(),
  tipo: z.enum(["reglamentaria", "no_reglamentaria"]),
  infraccion_id: z.number().int().positive().optional(),
  evidencia: z.string().max(5000).optional(),
  observaciones: z.string().max(2000).optional(),
});

const crearControlSchema = z.object({
  noche_id: z.number().int().positive(),
  comparsa_id: z.number().int().positive(),
  tipo: z.enum(["horario", "integrantes", "otro"]),
  valor: z.string().max(255).optional(),
  observaciones: z.string().max(2000).optional(),
});

router.get(
  "/noches",
  requireAuth,
  requireRole("comisario", "admin"),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT n.id, n.name, n.fecha_hora_inicio, n.estado,
                CASE
                  WHEN n.estado = 'borrador' THEN 'borrador'
                  WHEN n.estado = 'publicada' AND NOW() BETWEEN n.fecha_hora_inicio - INTERVAL '1 hour' AND n.fecha_hora_inicio + INTERVAL '24 hours' THEN 'abierta'
                  WHEN n.estado = 'publicada' AND NOW() > n.fecha_hora_inicio + INTERVAL '24 hours' THEN 'finalizada'
                  ELSE n.estado
                END AS estado_efectivo
         FROM noches n
         WHERE n.estado != 'borrador'
         ORDER BY n.fecha_hora_inicio DESC`
      );
      res.json(rows);
    } catch (error) {
      console.error("Get noches comisario error:", error.message);
      res.status(500).json({ error: "Failed to get noches" });
    }
  }
);

router.get(
  "/infracciones",
  requireAuth,
  requireRole("comisario", "admin"),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, codigo, nombre, descripcion, sancion_default, puntos_descuento
         FROM infracciones
         WHERE activa = true
         ORDER BY codigo`
      );
      res.json(rows);
    } catch (error) {
      console.error("Get infracciones error:", error.message);
      res.status(500).json({ error: "Failed to get infracciones" });
    }
  }
);

router.get(
  "/incidencias",
  requireAuth,
  requireRole("comisario"),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT i.*, n.name AS noche_name, c.name AS comparsa_name,
                inf.codigo AS infraccion_codigo, inf.nombre AS infraccion_nombre
         FROM incidencias i
         JOIN noches n ON n.id = i.noche_id
         JOIN comparsas c ON c.id = i.comparsa_id
         LEFT JOIN infracciones inf ON inf.id = i.infraccion_id
         WHERE i.comisario_id = $1
         ORDER BY i.created_at DESC`,
        [req.user.id]
      );
      res.json(rows);
    } catch (error) {
      console.error("Get incidencias error:", error.message);
      res.status(500).json({ error: "Failed to get incidencias" });
    }
  }
);

router.post(
  "/incidencias",
  requireAuth,
  requireRole("comisario"),
  async (req, res) => {
    const parsed = crearIncidenciaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos invalidos" });
    }

    const { noche_id, comparsa_id, tipo, infraccion_id, evidencia, observaciones } =
      parsed.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: noche } = await client.query(
        `SELECT id FROM noches WHERE id = $1`,
        [noche_id]
      );
      if (noche.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Noche no encontrada" });
      }

      const { rows: comparsa } = await client.query(
        `SELECT id FROM comparsas WHERE id = $1`,
        [comparsa_id]
      );
      if (comparsa.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Comparsa no encontrada" });
      }

      let sancion_aplicada = null;

      if (tipo === "reglamentaria" && infraccion_id) {
        const { rows: infraccion } = await client.query(
          `SELECT id, codigo, nombre, sancion_default, puntos_descuento
           FROM infracciones WHERE id = $1 AND activa = true`,
          [infraccion_id]
        );
        if (infraccion.length === 0) {
          await client.query("ROLLBACK");
          return res
            .status(400)
            .json({ error: "Infraccion no valida o inactiva" });
        }
        sancion_aplicada = {
          infraccion_codigo: infraccion[0].codigo,
          infraccion_nombre: infraccion[0].nombre,
          sancion_default: infraccion[0].sancion_default,
          puntos_descuento: infraccion[0].puntos_descuento,
        };
      }

      const { rows } = await client.query(
        `INSERT INTO incidencias
         (noche_id, comparsa_id, comisario_id, tipo, infraccion_id, evidencia, observaciones, sancion_aplicada)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          noche_id,
          comparsa_id,
          req.user.id,
          tipo,
          infraccion_id || null,
          evidencia || null,
          observaciones || null,
          sancion_aplicada ? JSON.stringify(sancion_aplicada) : null,
        ]
      );

      await client.query("COMMIT");

      await auditar({
        userId: req.user.id,
        accion: "incidencia.crear",
        entidad: "incidencias",
        entidadId: String(rows[0].id),
        detalles: { tipo, noche_id, comparsa_id },
        ip: req.ip,
      });

      res.status(201).json(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Create incidencia error:", error.message);
      res.status(500).json({ error: "Failed to create incidencia" });
    } finally {
      client.release();
    }
  }
);

router.get(
  "/controles",
  requireAuth,
  requireRole("comisario"),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT co.*, n.name AS noche_name, c.name AS comparsa_name
         FROM controles co
         JOIN noches n ON n.id = co.noche_id
         JOIN comparsas c ON c.id = co.comparsa_id
         WHERE co.comisario_id = $1
         ORDER BY co.created_at DESC`,
        [req.user.id]
      );
      res.json(rows);
    } catch (error) {
      console.error("Get controles error:", error.message);
      res.status(500).json({ error: "Failed to get controles" });
    }
  }
);

router.post(
  "/controles",
  requireAuth,
  requireRole("comisario"),
  async (req, res) => {
    const parsed = crearControlSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos invalidos" });
    }

    const { noche_id, comparsa_id, tipo, valor, observaciones } = parsed.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: noche } = await client.query(
        `SELECT id FROM noches WHERE id = $1`,
        [noche_id]
      );
      if (noche.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Noche no encontrada" });
      }

      const { rows: comparsa } = await client.query(
        `SELECT id FROM comparsas WHERE id = $1`,
        [comparsa_id]
      );
      if (comparsa.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Comparsa no encontrada" });
      }

      const { rows } = await client.query(
        `INSERT INTO controles
         (noche_id, comparsa_id, comisario_id, tipo, valor, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [noche_id, comparsa_id, req.user.id, tipo, valor || null, observaciones || null]
      );

      await client.query("COMMIT");

      await auditar({
        userId: req.user.id,
        accion: "control.crear",
        entidad: "controles",
        entidadId: String(rows[0].id),
        detalles: { tipo, noche_id, comparsa_id },
        ip: req.ip,
      });

      res.status(201).json(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Create control error:", error.message);
      res.status(500).json({ error: "Failed to create control" });
    } finally {
      client.release();
    }
  }
);

export default router;
