import express from "express";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "../auth/auth.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { emailService } from "../services/email.service.js";
import { juradoBienvenidaEmail } from "../services/email-templates.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const router = express.Router();

const normalizeDni = (value) => String(value).replace(/\s+/g, "");

const dniSchema = z
  .string()
  .or(z.number())
  .transform(normalizeDni)
  .refine((value) => /^\d{6,8}$/.test(value), "DNI invalido");

const asignacionSchema = z.object({
  comparsa_id: z.number().int().positive(),
  rubros_ids: z.array(z.number().int().positive()).default([]),
});

const createJuradoSchema = z.object({
  name: z.string().trim().min(1).max(255).optional().default(""),
  email: z.string().trim().toLowerCase().email("Email invalido"),
  dni: dniSchema,
  asignaciones: z.array(asignacionSchema).default([]),
});

const updateJuradoSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().toLowerCase().email("Email invalido").optional(),
  dni: dniSchema.optional(),
  asignaciones: z.array(asignacionSchema).optional(),
});

async function userExistsByEmail(client, email, excludeUserId = null) {
  const params = [email];
  let where = `LOWER(email) = LOWER($1)`;
  if (excludeUserId) {
    params.push(excludeUserId);
    where += ` AND id <> $2`;
  }
  const { rows } = await client.query(
    `SELECT 1 FROM "user" WHERE ${where} LIMIT 1`,
    params
  );
  return rows.length > 0;
}

async function dniInUse(client, dni, excludeUserId = null) {
  const params = [dni];
  let where = `dni = $1 AND dni IS NOT NULL`;
  if (excludeUserId) {
    params.push(excludeUserId);
    where += ` AND id <> $2`;
  }
  const { rows } = await client.query(
    `SELECT 1 FROM "user" WHERE ${where} LIMIT 1`,
    params
  );
  return rows.length > 0;
}

async function validateAsignaciones(client, asignaciones) {
  if (asignaciones.length === 0) return true;

  const rubroIds = [...new Set(asignaciones.flatMap((a) => a.rubros_ids))];
  if (rubroIds.length === 0) return true;

  const { rows } = await client.query(
    `SELECT id, comparsa_id FROM rubros WHERE id = ANY($1::int[])`,
    [rubroIds]
  );
  const rubroMap = new Map(rows.map((r) => [r.id, r.comparsa_id]));

  for (const asignacion of asignaciones) {
    for (const rubroId of asignacion.rubros_ids) {
      const comparsa = rubroMap.get(rubroId);
      if (comparsa === undefined) return false;
      if (comparsa !== asignacion.comparsa_id) return false;
    }
  }
  return true;
}

async function replaceAsignaciones(client, userId, asignaciones) {
  await client.query(`DELETE FROM jurado_rubros WHERE user_id = $1`, [userId]);

  for (const asignacion of asignaciones) {
    for (const rubroId of asignacion.rubros_ids) {
      await client.query(
        `INSERT INTO jurado_rubros (user_id, comparsa_id, rubro_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, rubro_id) DO NOTHING`,
        [userId, asignacion.comparsa_id, rubroId]
      );
    }
  }
}

async function getJuradoWithAsignaciones(userId) {
  const { rows: user } = await pool.query(
    `SELECT id, name, email, dni, "createdAt" FROM "user" WHERE id = $1`,
    [userId]
  );
  if (user.length === 0) return null;

  const { rows: asignaciones } = await pool.query(
    `SELECT jr.comparsa_id, jr.rubro_id, c.name AS comparsa_name, r.name AS rubro_name
     FROM jurado_rubros jr
     JOIN comparsas c ON c.id = jr.comparsa_id
     JOIN rubros r ON r.id = jr.rubro_id
     WHERE jr.user_id = $1
     ORDER BY jr.comparsa_id, jr.rubro_id`,
    [userId]
  );

  const grouped = asignaciones.reduce((acc, row) => {
    if (!acc[row.comparsa_id]) {
      acc[row.comparsa_id] = {
        comparsa_id: row.comparsa_id,
        comparsa_name: row.comparsa_name,
        rubros: [],
      };
    }
    acc[row.comparsa_id].rubros.push({
      rubro_id: row.rubro_id,
      rubro_name: row.rubro_name,
    });
    return acc;
  }, {});

  return {
    id: user[0].id,
    name: user[0].name || "",
    email: user[0].email,
    dni: user[0].dni || "",
    createdAt: user[0].createdAt,
    asignaciones: Object.values(grouped),
  };
}

router.get("/jurados", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id FROM "user" WHERE "isAdmin" IS NOT true ORDER BY "createdAt" DESC`
    );
    const jurados = [];
    for (const row of rows) {
      const jurado = await getJuradoWithAsignaciones(row.id);
      if (jurado) jurados.push(jurado);
    }
    res.json(jurados);
  } catch (error) {
    console.error("Get jurados error:", error.message);
    res.status(500).json({ error: "Failed to get jurados" });
  }
});

router.post("/jurados", requireAuth, requireAdmin, async (req, res) => {
  const parsed = createJuradoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Datos invalidos" });
  }
  const { name, email, dni, asignaciones } = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (await userExistsByEmail(client, email)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Email ya registrado" });
    }

    if (await dniInUse(client, dni)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "El DNI ya esta en uso" });
    }

    if (!(await validateAsignaciones(client, asignaciones))) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Asignaciones invalidas" });
    }

    const userId = randomUUID();
    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", dni, "isAdmin")
       VALUES ($1, $2, $3, false, $4, false)`,
      [userId, name || "", email, dni]
    );

    await replaceAsignaciones(client, userId, asignaciones);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Create jurado error:", error.message);
    return res.status(500).json({ error: "Failed to create jurado" });
  } finally {
    client.release();
  }

  let emailSent = false;
  let emailError = null;
  try {
    const otp = await auth.api.createVerificationOTP({
      body: { email, type: "sign-in" },
    });
    await emailService.send({
      to: email,
      subject: "Tu acceso al sistema de votacion - Carnavales",
      otp,
      html: juradoBienvenidaEmail({ name: name || "", dni, otp }),
    });
    emailSent = true;
  } catch (error) {
    emailError = "No se pudo enviar el correo con el PIN";
    console.error("Welcome email delivery failed:", error.message);
  }

  const jurado = await getJuradoWithAsignaciones(
    (
      await pool.query(`SELECT id FROM "user" WHERE email = $1 LIMIT 1`, [email])
    ).rows[0].id
  );
  res.status(201).json({ ...jurado, emailSent, emailError });
});

router.put("/jurados/:userId", requireAuth, requireAdmin, async (req, res) => {
  const parsed = updateJuradoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Datos invalidos" });
  }
  const { userId } = req.params;
  const updates = parsed.data;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existing } = await client.query(
      `SELECT id, "isAdmin" FROM "user" WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (existing.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Jurado not found" });
    }
    if (existing[0].isAdmin === true) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No se puede editar un administrador" });
    }

    if (updates.email && (await userExistsByEmail(client, updates.email, userId))) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Email ya registrado" });
    }
    if (updates.dni && (await dniInUse(client, updates.dni, userId))) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "El DNI ya esta en uso" });
    }

    const sets = [];
    const params = [];
    if (updates.name !== undefined) {
      params.push(updates.name || "");
      sets.push(`name = $${params.length}`);
    }
    if (updates.email !== undefined) {
      params.push(updates.email);
      sets.push(`email = $${params.length}`);
    }
    if (updates.dni !== undefined) {
      params.push(updates.dni);
      sets.push(`dni = $${params.length}`);
    }
    if (sets.length > 0) {
      params.push(userId);
      await client.query(
        `UPDATE "user" SET ${sets.join(", ")} WHERE id = $${params.length}`,
        params
      );
    }

    if (updates.asignaciones !== undefined) {
      if (!(await validateAsignaciones(client, updates.asignaciones))) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Asignaciones invalidas" });
      }
      await replaceAsignaciones(client, userId, updates.asignaciones);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Update jurado error:", error.message);
    return res.status(500).json({ error: "Failed to update jurado" });
  } finally {
    client.release();
  }

  const jurado = await getJuradoWithAsignaciones(userId);
  res.json(jurado);
});

router.delete("/jurados/:userId", requireAuth, requireAdmin, async (req, res) => {
  const { userId } = req.params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existing } = await client.query(
      `SELECT id, "isAdmin" FROM "user" WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (existing.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Jurado not found" });
    }
    if (existing[0].isAdmin === true) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No se puede eliminar un administrador" });
    }

    await client.query(`DELETE FROM session WHERE "userId" = $1`, [userId]);
    await client.query(`DELETE FROM account WHERE "userId" = $1`, [userId]);
    await client.query(`DELETE FROM jurado_rubros WHERE user_id = $1`, [userId]);
    const { rowCount } = await client.query(`DELETE FROM "user" WHERE id = $1`, [userId]);

    await client.query("COMMIT");

    if (rowCount === 0) {
      return res.status(404).json({ error: "Jurado not found" });
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Delete jurado error:", error.message);
    return res.status(500).json({ error: "Failed to delete jurado" });
  } finally {
    client.release();
  }

  res.json({ success: true });
});

router.delete("/jurados", requireAuth, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `DELETE FROM session WHERE "userId" IN (SELECT id FROM "user" WHERE "isAdmin" IS NOT true)`
    );
    await client.query(
      `DELETE FROM account WHERE "userId" IN (SELECT id FROM "user" WHERE "isAdmin" IS NOT true)`
    );
    await client.query(
      `DELETE FROM jurado_rubros WHERE user_id IN (SELECT id FROM "user" WHERE "isAdmin" IS NOT true)`
    );
    const result = await client.query(`DELETE FROM "user" WHERE "isAdmin" IS NOT true`);

    await client.query("COMMIT");

    res.json({ success: true, deleted: result.rowCount });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Delete all jurados error:", error.message);
    return res.status(500).json({ error: "Failed to delete jurados" });
  } finally {
    client.release();
  }
});

export default router;