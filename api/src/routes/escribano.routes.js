import express from "express";
import pg from "pg";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { auditar } from "../services/audit.service.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const router = express.Router();

router.get(
  "/noches",
  requireAuth,
  requireRole("escribano", "admin"),
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
         ORDER BY n.fecha_hora_inicio DESC`
      );
      res.json(rows);
    } catch (error) {
      console.error("Get noches escribano error:", error.message);
      res.status(500).json({ error: "Failed to get noches" });
    }
  }
);

router.get(
  "/noche/:id/estado",
  requireAuth,
  requireRole("escribano", "admin"),
  async (req, res) => {
    const nocheId = Number(req.params.id);
    if (!Number.isInteger(nocheId) || nocheId <= 0) {
      return res.status(400).json({ error: "Invalid noche id" });
    }

    try {
      const { rows: noche } = await pool.query(
        `SELECT id, name, fecha_hora_inicio, estado FROM noches WHERE id = $1`,
        [nocheId]
      );
      if (noche.length === 0) {
        return res.status(404).json({ error: "Noche not found" });
      }

      const { rows: jurados } = await pool.query(
        `SELECT u.id AS jurado_id, u.name AS jurado_name,
                (SELECT COUNT(*)::int FROM jurado_rubros jr WHERE jr.user_id = u.id) AS rubros_asignados,
                (SELECT COUNT(DISTINCT c.rubro_id)::int
                 FROM calificacion c
                 WHERE c.account_id = u.id AND c.noche_id = $1) AS rubros_votados,
                (SELECT COUNT(DISTINCT c.comparsa_id)::int
                 FROM calificacion c
                 WHERE c.account_id = u.id AND c.noche_id = $1) AS comparsas_total,
                CASE
                  WHEN (SELECT COUNT(DISTINCT c.rubro_id)::int
                        FROM calificacion c
                        WHERE c.account_id = u.id AND c.noche_id = $1) >=
                       (SELECT COUNT(*)::int FROM jurado_rubros jr WHERE jr.user_id = u.id)
                       AND (SELECT COUNT(*)::int FROM jurado_rubros jr WHERE jr.user_id = u.id) > 0
                  THEN 'finalizado'
                  ELSE 'pendiente'
                END AS estado
         FROM asignacion_jurado aj
         JOIN "user" u ON u.id = aj.user_id
         WHERE aj.noche_id = $1
         ORDER BY u.name`,
        [nocheId]
      );

      res.json({
        noche: noche[0],
        jurados,
      });
    } catch (error) {
      console.error("Get noche estado error:", error.message);
      res.status(500).json({ error: "Failed to get noche estado" });
    }
  }
);

router.get(
  "/planillas/estado",
  requireAuth,
  requireRole("escribano", "admin"),
  async (req, res) => {
    const nocheId = req.query.noche_id ? Number(req.query.noche_id) : null;

    try {
      let query = `
        SELECT u.id AS jurado_id, u.name AS jurado_name,
               n.id AS noche_id, n.name AS noche_name,
               (SELECT COUNT(*)::int FROM jurado_rubros jr WHERE jr.user_id = u.id) AS rubros_asignados,
               CASE
                 WHEN (SELECT COUNT(DISTINCT c.rubro_id)::int
                       FROM calificacion c
                       WHERE c.account_id = u.id AND c.noche_id = n.id) >=
                      (SELECT COUNT(*)::int FROM jurado_rubros jr WHERE jr.user_id = u.id)
                      AND (SELECT COUNT(*)::int FROM jurado_rubros jr WHERE jr.user_id = u.id) > 0
                 THEN 'confirmada'
                 ELSE 'pendiente'
               END AS estado_planilla
        FROM asignacion_jurado aj
        JOIN "user" u ON u.id = aj.user_id
        JOIN noches n ON n.id = aj.noche_id
      `;
      const params = [];

      if (nocheId) {
        params.push(nocheId);
        query += ` WHERE aj.noche_id = $1`;
      }

      query += ` ORDER BY n.fecha_hora_inicio DESC, u.name`;

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (error) {
      console.error("Get planillas estado error:", error.message);
      res.status(500).json({ error: "Failed to get planillas estado" });
    }
  }
);

router.get(
  "/auditoria",
  requireAuth,
  requireRole("escribano", "admin"),
  async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    try {
      const { rows } = await pool.query(
        `SELECT a.id, a.user_id, u.name AS user_name, a.accion, a.entidad,
                a.entidad_id, a.detalles, a.created_at
         FROM auditoria a
         LEFT JOIN "user" u ON u.id = a.user_id
         WHERE a.accion IN (
           'auth.login', 'auth.logout',
           'voto.crear', 'voto.confirmar',
           'incidencia.crear', 'sancion.aplicar',
           'user.crear', 'user.cambiar_rol',
           'asignacion.crear', 'noche.publicar',
           'acta.generar', 'acta.certificar'
         )
         ORDER BY a.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      res.json(rows);
    } catch (error) {
      console.error("Get auditoria escribano error:", error.message);
      res.status(500).json({ error: "Failed to get auditoria" });
    }
  }
);

router.get(
  "/actas",
  requireAuth,
  requireRole("escribano", "admin"),
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
      console.error("Get actas escribano error:", error.message);
      res.status(500).json({ error: "Failed to get actas" });
    }
  }
);

router.post(
  "/actas/:id/certificar",
  requireAuth,
  requireRole("escribano"),
  async (req, res) => {
    const actaId = Number(req.params.id);
    if (!Number.isInteger(actaId) || actaId <= 0) {
      return res.status(400).json({ error: "Invalid acta id" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: acta } = await client.query(
        `SELECT id, estado FROM actas WHERE id = $1`,
        [actaId]
      );
      if (acta.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Acta not found" });
      }

      if (acta[0].estado === "certificada") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Acta ya certificada" });
      }

      if (acta[0].estado !== "generada") {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "El acta debe estar en estado generada para certificar" });
      }

      await client.query(
        `UPDATE actas
         SET estado = 'certificada', certificada_por = $1, certificada_at = NOW()
         WHERE id = $2`,
        [req.user.id, actaId]
      );

      await client.query("COMMIT");

      await auditar({
        userId: req.user.id,
        accion: "acta.certificar",
        entidad: "actas",
        entidadId: String(actaId),
        detalles: {},
        ip: req.ip,
      });

      res.json({ success: true, id: actaId, estado: "certificada" });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Certificar acta error:", error.message);
      res.status(500).json({ error: "Failed to certificar acta" });
    } finally {
      client.release();
    }
  }
);

export default router;
