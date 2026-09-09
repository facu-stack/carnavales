import express from "express";
import pg from "pg";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { auditar } from "../services/audit.service.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const router = express.Router();

const crearInfraccionSchema = z.object({
  codigo: z.string().trim().min(1).max(50),
  nombre: z.string().trim().min(1).max(255),
  descripcion: z.string().max(2000).optional(),
  sancion_default: z.string().max(255).optional(),
  puntos_descuento: z.number().int().min(0).max(100).default(0),
});

const actualizarInfraccionSchema = z.object({
  codigo: z.string().trim().min(1).max(50).optional(),
  nombre: z.string().trim().min(1).max(255).optional(),
  descripcion: z.string().max(2000).optional(),
  sancion_default: z.string().max(255).optional(),
  puntos_descuento: z.number().int().min(0).max(100).optional(),
  activa: z.boolean().optional(),
});

router.get(
  "/infracciones",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM infracciones ORDER BY codigo`
      );
      res.json(rows);
    } catch (error) {
      console.error("Get infracciones admin error:", error.message);
      res.status(500).json({ error: "Failed to get infracciones" });
    }
  }
);

router.post(
  "/infracciones",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const parsed = crearInfraccionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos invalidos" });
    }

    const { codigo, nombre, descripcion, sancion_default, puntos_descuento } =
      parsed.data;

    try {
      const { rows } = await pool.query(
        `INSERT INTO infracciones (codigo, nombre, descripcion, sancion_default, puntos_descuento)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [codigo, nombre, descripcion || null, sancion_default || null, puntos_descuento]
      );

      await auditar({
        userId: req.user.id,
        accion: "infraccion.crear",
        entidad: "infracciones",
        entidadId: String(rows[0].id),
        detalles: { codigo, nombre },
        ip: req.ip,
      });

      res.status(201).json(rows[0]);
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Codigo de infraccion ya existente" });
      }
      console.error("Create infraccion error:", error.message);
      res.status(500).json({ error: "Failed to create infraccion" });
    }
  }
);

router.put(
  "/infracciones/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const infraccionId = Number(req.params.id);
    if (!Number.isInteger(infraccionId) || infraccionId <= 0) {
      return res.status(400).json({ error: "Invalid infraccion id" });
    }

    const parsed = actualizarInfraccionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos invalidos" });
    }

    const updates = parsed.data;
    const sets = [];
    const params = [];

    if (updates.codigo !== undefined) {
      params.push(updates.codigo);
      sets.push(`codigo = $${params.length}`);
    }
    if (updates.nombre !== undefined) {
      params.push(updates.nombre);
      sets.push(`nombre = $${params.length}`);
    }
    if (updates.descripcion !== undefined) {
      params.push(updates.descripcion);
      sets.push(`descripcion = $${params.length}`);
    }
    if (updates.sancion_default !== undefined) {
      params.push(updates.sancion_default);
      sets.push(`sancion_default = $${params.length}`);
    }
    if (updates.puntos_descuento !== undefined) {
      params.push(updates.puntos_descuento);
      sets.push(`puntos_descuento = $${params.length}`);
    }
    if (updates.activa !== undefined) {
      params.push(updates.activa);
      sets.push(`activa = $${params.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: "No hay cambios para aplicar" });
    }

    params.push(infraccionId);
    try {
      const { rowCount } = await pool.query(
        `UPDATE infracciones SET ${sets.join(", ")} WHERE id = $${params.length}`,
        params
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: "Infraccion not found" });
      }

      await auditar({
        userId: req.user.id,
        accion: "infraccion.actualizar",
        entidad: "infracciones",
        entidadId: String(infraccionId),
        detalles: updates,
        ip: req.ip,
      });

      const { rows } = await pool.query(
        `SELECT * FROM infracciones WHERE id = $1`,
        [infraccionId]
      );
      res.json(rows[0]);
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Codigo de infraccion ya existente" });
      }
      console.error("Update infraccion error:", error.message);
      res.status(500).json({ error: "Failed to update infraccion" });
    }
  }
);

router.delete(
  "/infracciones/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const infraccionId = Number(req.params.id);
    if (!Number.isInteger(infraccionId) || infraccionId <= 0) {
      return res.status(400).json({ error: "Invalid infraccion id" });
    }

    try {
      const { rowCount } = await pool.query(
        `DELETE FROM infracciones WHERE id = $1`,
        [infraccionId]
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: "Infraccion not found" });
      }

      await auditar({
        userId: req.user.id,
        accion: "infraccion.eliminar",
        entidad: "infracciones",
        entidadId: String(infraccionId),
        detalles: {},
        ip: req.ip,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Delete infraccion error:", error.message);
      res.status(500).json({ error: "Failed to delete infraccion" });
    }
  }
);

router.get(
  "/incidencias",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT i.*, n.name AS noche_name, c.name AS comparsa_name,
                u.name AS comisario_name,
                inf.codigo AS infraccion_codigo, inf.nombre AS infraccion_nombre
         FROM incidencias i
         JOIN noches n ON n.id = i.noche_id
         JOIN comparsas c ON c.id = i.comparsa_id
         JOIN "user" u ON u.id = i.comisario_id
         LEFT JOIN infracciones inf ON inf.id = i.infraccion_id
         ORDER BY i.created_at DESC`
      );
      res.json(rows);
    } catch (error) {
      console.error("Get incidencias admin error:", error.message);
      res.status(500).json({ error: "Failed to get incidencias" });
    }
  }
);

router.put(
  "/incidencias/:id",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const incidenciaId = Number(req.params.id);
    if (!Number.isInteger(incidenciaId) || incidenciaId <= 0) {
      return res.status(400).json({ error: "Invalid incidencia id" });
    }

    const { estado, sancion_aplicada } = req.body;
    const validEstados = ["pendiente", "en_revision", "resuelta", "rechazada"];

    if (estado && !validEstados.includes(estado)) {
      return res.status(400).json({ error: "Estado invalido" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: incidencia } = await client.query(
        `SELECT id, estado FROM incidencias WHERE id = $1`,
        [incidenciaId]
      );
      if (incidencia.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Incidencia not found" });
      }

      const sets = [];
      const params = [];

      if (estado) {
        params.push(estado);
        sets.push(`estado = $${params.length}`);
      }
      if (sancion_aplicada !== undefined) {
        params.push(JSON.stringify(sancion_aplicada));
        sets.push(`sancion_aplicada = $${params.length}`);
      }

      if (sets.length > 0) {
        params.push(incidenciaId);
        await client.query(
          `UPDATE incidencias SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${params.length}`,
          params
        );
      }

      await client.query("COMMIT");

      await auditar({
        userId: req.user.id,
        accion: "incidencia.actualizar",
        entidad: "incidencias",
        entidadId: String(incidenciaId),
        detalles: { estado, sancion_aplicada },
        ip: req.ip,
      });

      const { rows } = await pool.query(
        `SELECT * FROM incidencias WHERE id = $1`,
        [incidenciaId]
      );
      res.json(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Update incidencia error:", error.message);
      res.status(500).json({ error: "Failed to update incidencia" });
    } finally {
      client.release();
    }
  }
);

router.get(
  "/controles",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT co.*, n.name AS noche_name, c.name AS comparsa_name,
                u.name AS comisario_name
         FROM controles co
         JOIN noches n ON n.id = co.noche_id
         JOIN comparsas c ON c.id = co.comparsa_id
         JOIN "user" u ON u.id = co.comisario_id
         ORDER BY co.created_at DESC`
      );
      res.json(rows);
    } catch (error) {
      console.error("Get controles admin error:", error.message);
      res.status(500).json({ error: "Failed to get controles" });
    }
  }
);

router.get(
  "/actas",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT a.*, n.name AS noche_name,
                u.name AS certificada_por_name
         FROM actas a
         JOIN noches n ON n.id = a.noche_id
         LEFT JOIN "user" u ON u.id = a.certificada_por
         ORDER BY a.created_at DESC`
      );
      res.json(rows);
    } catch (error) {
      console.error("Get actas admin error:", error.message);
      res.status(500).json({ error: "Failed to get actas" });
    }
  }
);

router.post(
  "/actas",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { noche_id, tipo, contenido } = req.body;

    if (!noche_id || !tipo) {
      return res.status(400).json({ error: "noche_id y tipo son requeridos" });
    }

    const validTipos = ["votacion", "incidencia", "general"];
    if (!validTipos.includes(tipo)) {
      return res.status(400).json({ error: "Tipo de acta invalido" });
    }

    try {
      const { rows: noche } = await pool.query(
        `SELECT id FROM noches WHERE id = $1`,
        [noche_id]
      );
      if (noche.length === 0) {
        return res.status(404).json({ error: "Noche not found" });
      }

      const { rows } = await pool.query(
        `INSERT INTO actas (noche_id, tipo, contenido, estado)
         VALUES ($1, $2, $3, 'generada')
         RETURNING *`,
        [noche_id, tipo, JSON.stringify(contenido || {})]
      );

      await auditar({
        userId: req.user.id,
        accion: "acta.generar",
        entidad: "actas",
        entidadId: String(rows[0].id),
        detalles: { noche_id, tipo },
        ip: req.ip,
      });

      res.status(201).json(rows[0]);
    } catch (error) {
      console.error("Create acta error:", error.message);
      res.status(500).json({ error: "Failed to create acta" });
    }
  }
);

export default router;
