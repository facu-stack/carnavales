import express from "express";
import pg from "pg";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { auditar } from "../services/audit.service.js";
import { emailService } from "../services/email.service.js";
import { nochePublicadaEmail } from "../services/email-templates.js";
import { estadoEfectivo, finDisponibilidad, DIAS_AUTOELIMINACION, HORA_ACCESO_DESPUES } from "../middleware/noche.middleware.js";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const nocheSchema = z.object({
  name: z.string().trim().min(1).max(255),
  fecha_hora_inicio: z.string().min(1),
});

function parseDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// ---- CRUD de noches ----

router.get("/noches", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT n.*,
        (SELECT COUNT(*)::int FROM asignacion_jurado aj WHERE aj.noche_id = n.id) AS jurados_count,
        (SELECT COUNT(*)::int FROM orden_comparsa oc WHERE oc.noche_id = n.id) AS comparsas_count
      FROM noches n
      ORDER BY n.fecha_hora_inicio DESC
    `);
    const now = new Date();
    res.json(rows.map((n) => ({ ...n, estado_efectivo: estadoEfectivo(n, now) })));
  } catch (error) {
    console.error("Get noches error:", error.message);
    res.status(500).json({ error: "Failed to get noches" });
  }
});

router.post("/noches", requireAuth, requireAdmin, async (req, res) => {
  const parsed = nocheSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Datos invalidos" });
  }
  const { name, fecha_hora_inicio } = parsed.data;

  const inicio = parseDateTime(fecha_hora_inicio);
  if (!inicio) {
    return res.status(400).json({ error: "Fechas invalidas" });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO noches (name, fecha_hora_inicio, estado)
       VALUES ($1, $2, 'borrador') RETURNING *`,
      [name, inicio.toISOString()]
    );
    await auditar({
      userId: req.user.id,
      accion: "crear_noche",
      entidad: "noche",
      entidadId: rows[0].id,
      detalles: { name },
      ip: req.ip,
    });
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Create noche error:", error.message);
    res.status(500).json({ error: "Failed to create noche" });
  }
});

router.put("/noches/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const parsed = nocheSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Datos invalidos" });
  }
  const { name, fecha_hora_inicio } = parsed.data;

  const inicio = parseDateTime(fecha_hora_inicio);
  if (!inicio) {
    return res.status(400).json({ error: "Fechas invalidas" });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE noches SET name = $1, fecha_hora_inicio = $2
       WHERE id = $3 RETURNING *`,
      [name, inicio.toISOString(), id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Noche not found" });
    }
    await auditar({
      userId: req.user.id,
      accion: "editar_noche",
      entidad: "noche",
      entidadId: id,
      detalles: { name },
      ip: req.ip,
    });
    res.json(rows[0]);
  } catch (error) {
    console.error("Update noche error:", error.message);
    res.status(500).json({ error: "Failed to update noche" });
  }
});

// Elimina una noche y sus dependencias dentro de una transacción ya iniciada.
async function eliminarNoche(client, id) {
  await client.query("DELETE FROM calificacion WHERE noche_id = $1", [id]);
  await client.query("DELETE FROM orden_comparsa WHERE noche_id = $1", [id]);
  await client.query("DELETE FROM asignacion_jurado WHERE noche_id = $1", [id]);
  await client.query("DELETE FROM noches WHERE id = $1", [id]);
}

// Elimina automáticamente las noches cuya ventana de disponibilidad terminó hace
// más de una semana (fin = inicio + 24h). Retorna la cantidad eliminada.
export async function limpiarNochesFinalizadas() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id FROM noches
       WHERE (fecha_hora_inicio + ($1::int * interval '1 hour') + ($2::int * interval '1 day')) <= now()`,
      [24, DIAS_AUTOELIMINACION]
    );
    if (rows.length === 0) return 0;

    await client.query("BEGIN");
    for (const { id } of rows) {
      await eliminarNoche(client, id);
    }
    await client.query("COMMIT");
    for (const { id } of rows) {
      await auditar({
        userId: null,
        accion: "eliminar_noche_automatica",
        entidad: "noche",
        entidadId: id,
        detalles: { motivo: "vencida_hace_mas_de_una_semana" },
      });
    }
    return rows.length;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Limpiar noches finalizadas error:", error.message);
    return 0;
  } finally {
    client.release();
  }
}

router.delete("/noches/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    const { rows: exist } = await client.query(
      "SELECT id, fecha_hora_inicio FROM noches WHERE id = $1",
      [id]
    );
    if (exist.length === 0) {
      return res.status(404).json({ error: "Noche not found" });
    }

    // Si la ventana de disponibilidad ya cerró, la noche no puede eliminarse
    // manualmente: se eliminará sola al cumplir una semana desde el cierre.
    const fin = finDisponibilidad(exist[0].fecha_hora_inicio);
    if (new Date() > fin) {
      return res.status(409).json({
        error: "La noche ya finalizó y no puede eliminarse manualmente. Se eliminará automáticamente la próxima semana.",
      });
    }

    await client.query("BEGIN");
    await eliminarNoche(client, id);
    await client.query("COMMIT");
    await auditar({
      userId: req.user.id,
      accion: "eliminar_noche",
      entidad: "noche",
      entidadId: id,
      ip: req.ip,
    });
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Delete noche error:", error.message);
    res.status(500).json({ error: "Failed to delete noche" });
  } finally {
    client.release();
  }
});

// ---- Publicar noche (con notificación por email a jurados asignados) ----

router.post("/noches/:id/publicar", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT * FROM noches WHERE id = $1", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Noche not found" });
    }
    const noche = rows[0];

    if (noche.estado === "publicada" || noche.estado === "abierta" || noche.estado === "finalizada") {
      return res.status(409).json({ error: "La noche ya fue publicada" });
    }

    // Requiere al menos un jurado y una comparsa para publicar
    const { rows: jurados } = await client.query(
      "SELECT COUNT(*)::int AS count FROM asignacion_jurado WHERE noche_id = $1", [id]
    );
    const { rows: comparsas } = await client.query(
      "SELECT COUNT(*)::int AS count FROM orden_comparsa WHERE noche_id = $1", [id]
    );
    if (jurados[0].count === 0) {
      return res.status(400).json({ error: "Debés asignar al menos un jurado" });
    }
    if (comparsas[0].count === 0) {
      return res.status(400).json({ error: "Debés asignar al menos una comparsa" });
    }

    await client.query(
      "UPDATE noches SET estado = 'publicada' WHERE id = $1", [id]
    );

    // Obtener jurados asignados para notificar
    const { rows: juradosAsignados } = await client.query(
      `SELECT u.id, u.name, u.email
       FROM asignacion_jurado aj
       JOIN "user" u ON u.id = aj.user_id
       WHERE aj.noche_id = $1`,
      [id]
    );

    await client.query("COMMIT");

    const inicio = new Date(noche.fecha_hora_inicio);
    const acceso = new Date(inicio.getTime() - 60 * 60 * 1000);
    const fechaTexto = inicio.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
    const horaInicio = inicio.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    const horaAcceso = acceso.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

    // Notificar por email a cada jurado (sin bloquear la respuesta)
    for (const jurado of juradosAsignados) {
      try {
        await emailService.send({
          to: jurado.email,
          subject: `Fuiste asignado a ${noche.name} - Carnavales`,
          html: nochePublicadaEmail({
            name: jurado.name || "",
            nocheNombre: noche.name,
            fecha: fechaTexto,
            horaInicio,
            horaAcceso,
            url: `${FRONTEND_URL}/login`,
          }),
        });
      } catch (error) {
        console.error(`Email a ${jurado.email} falló:`, error.message);
      }
    }

    await auditar({
      userId: req.user.id,
      accion: "publicar_noche",
      entidad: "noche",
      entidadId: id,
      detalles: { juradosNotificados: juradosAsignados.length },
      ip: req.ip,
    });

    res.json({ success: true, nocheId: id, juradosNotificados: juradosAsignados.length });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Publish noche error:", error.message);
    res.status(500).json({ error: "Failed to publish noche" });
  } finally {
    client.release();
  }
});

// ---- Estado de votación por noche (sin puntajes) ----

router.get("/noches/:id/estado", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: noche } = await pool.query("SELECT * FROM noches WHERE id = $1", [id]);
    if (noche.length === 0) {
      return res.status(404).json({ error: "Noche not found" });
    }

    const { rows: jurados } = await pool.query(
      `SELECT u.id AS jurado_id, u.name AS jurado_name, u.email,
              (SELECT COUNT(*)::int FROM jurado_rubros jr WHERE jr.user_id = u.id) AS rubros_asignados,
              (SELECT COUNT(DISTINCT c.comparsa_id)::int FROM calificacion c
               WHERE c.account_id = u.id AND c.noche_id = $1
                 AND c.rubro_id IN (SELECT rubro_id FROM jurado_rubros jr2 WHERE jr2.user_id = u.id)
               ) AS comparsas_completadas,
              (SELECT COUNT(*)::int FROM orden_comparsa oc WHERE oc.noche_id = $1) AS comparsas_total
       FROM asignacion_jurado aj
       JOIN "user" u ON u.id = aj.user_id
       WHERE aj.noche_id = $1
       ORDER BY u.name`,
      [id]
    );

    const payload = jurados.map((j) => ({
      jurado_id: j.jurado_id,
      jurado_name: j.jurado_name,
      rubros_asignados: j.rubros_asignados,
      comparsas_total: j.comparsas_total,
      comparsas_completadas: j.comparsas_completadas,
      estado: j.comparsas_total > 0 && j.comparsas_completadas >= j.comparsas_total ? "completo" : "pendiente",
    }));

    res.json({
      noche: { id: noche[0].id, name: noche[0].name, estado: noche[0].estado },
      jurados: payload,
    });
  } catch (error) {
    console.error("Get noche estado error:", error.message);
    res.status(500).json({ error: "Failed to get noche estado" });
  }
});

// ---- Asignación de jurados a una noche ----

router.get("/noches/:id/jurados", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT u.id AS user_id, u.name, u.email
       FROM asignacion_jurado aj
       JOIN "user" u ON u.id = aj.user_id
       WHERE aj.noche_id = $1
       ORDER BY u.name`,
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error("Get noche jurados error:", error.message);
    res.status(500).json({ error: "Failed to get noche jurados" });
  }
});

router.put("/noches/:id/jurados", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const schema = z.object({ user_ids: z.array(z.string()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Datos invalidos" });
  }
  const { user_ids } = parsed.data;

  const client = await pool.connect();
  try {
    const { rows: noche } = await client.query("SELECT id, estado FROM noches WHERE id = $1", [id]);
    if (noche.length === 0) {
      return res.status(404).json({ error: "Noche not found" });
    }

    await client.query("BEGIN");
    await client.query("DELETE FROM asignacion_jurado WHERE noche_id = $1", [id]);
    for (const userId of new Set(user_ids)) {
      await client.query(
        `INSERT INTO asignacion_jurado (user_id, noche_id)
         VALUES ($1, $2) ON CONFLICT (user_id, noche_id) DO NOTHING`,
        [userId, id]
      );
    }
    await client.query("COMMIT");
    await auditar({
      userId: req.user.id,
      accion: "asignar_jurados",
      entidad: "noche",
      entidadId: id,
      detalles: { juradosAsignados: [...new Set(user_ids)].length },
      ip: req.ip,
    });
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Asignar jurados error:", error.message);
    res.status(500).json({ error: "Failed to assign jurados" });
  } finally {
    client.release();
  }
});

// ---- Orden de comparsas por noche ----

router.get("/noches/:id/orden", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT oc.comparsa_id, c.name, c.colors, oc."position"
       FROM orden_comparsa oc
       JOIN comparsas c ON c.id = oc.comparsa_id
       WHERE oc.noche_id = $1
       ORDER BY oc."position"`,
      [id]
    );
    res.json(rows.map((r) => ({
      comparsa_id: r.comparsa_id,
      name: r.name,
      colors: Array.isArray(r.colors) ? r.colors : [],
      position: r.position,
    })));
  } catch (error) {
    console.error("Get noche orden error:", error.message);
    res.status(500).json({ error: "Failed to get noche orden" });
  }
});

router.put("/noches/:id/orden", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const schema = z.object({ comparsa_ids: z.array(z.number().int().positive()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Datos invalidos" });
  }
  const { comparsa_ids } = parsed.data;

  const client = await pool.connect();
  try {
    const { rows: noche } = await client.query("SELECT id FROM noches WHERE id = $1", [id]);
    if (noche.length === 0) {
      return res.status(404).json({ error: "Noche not found" });
    }

    // Validar que todas las comparsas existan
    const uniqueIds = [...new Set(comparsa_ids)];
    if (uniqueIds.length > 0) {
      const { rows: valid } = await client.query(
        "SELECT id FROM comparsas WHERE id = ANY($1::int[])",
        [uniqueIds]
      );
      if (valid.length !== uniqueIds.length) {
        return res.status(400).json({ error: "Comparsa invalida" });
      }
    }

    await client.query("BEGIN");
    await client.query("DELETE FROM orden_comparsa WHERE noche_id = $1", [id]);
    let position = 0;
    for (const comparsaId of uniqueIds) {
      position += 1;
      await client.query(
        `INSERT INTO orden_comparsa (noche_id, comparsa_id, "position")
         VALUES ($1, $2, $3) ON CONFLICT (noche_id, comparsa_id) DO NOTHING`,
        [id, comparsaId, position]
      );
    }
    await client.query("COMMIT");
    await auditar({
      userId: req.user.id,
      accion: "guardar_orden_comparsas",
      entidad: "noche",
      entidadId: id,
      detalles: { cantidad: uniqueIds.length },
      ip: req.ip,
    });
    res.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Guardar orden error:", error.message);
    res.status(500).json({ error: "Failed to save orden" });
  } finally {
    client.release();
  }
});

// ---- Publicación global de resultados ----
// La publicación es única para todas las noches: se elige una fecha (o publicar
// ahora) y, una vez establecida, no puede cambiarse. Solo admin.

async function getPublicacionRow() {
  const { rows } = await pool.query(
    "SELECT fecha_hora FROM publicacion_resultados WHERE id = 1"
  );
  if (rows.length === 0) return null;
  return rows[0].fecha_hora;
}

function publicacionInfo(fecha) {
  if (fecha === null || fecha === undefined) {
    return { configurado: false, fecha_hora: null, publicado: false };
  }
  const fechaDate = new Date(fecha);
  return {
    configurado: true,
    fecha_hora: fechaDate.toISOString(),
    publicado: new Date() >= fechaDate,
  };
}

router.get("/resultados/publicacion", requireAuth, requireAdmin, async (req, res) => {
  try {
    const fecha = await getPublicacionRow();
    res.json(publicacionInfo(fecha));
  } catch (error) {
    console.error("Get publicacion resultados error:", error.message);
    res.status(500).json({ error: "Failed to get publicacion resultados" });
  }
});

router.post("/resultados/publicacion", requireAuth, requireAdmin, async (req, res) => {
  const schema = z
    .object({
      publicar_ahora: z.boolean().optional(),
      fecha_hora: z.string().optional(),
    })
    .refine((d) => (d.publicar_ahora === true) !== Boolean(d.fecha_hora), {
      message: "Indicá publicar_ahora o fecha_hora, no ambos",
    });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Datos invalidos: indicá publicar_ahora o fecha_hora" });
  }
  const { publicar_ahora, fecha_hora } = parsed.data;

  try {
    const configurado = await getPublicacionRow();
    if (configurado !== null) {
      return res.status(409).json({
        error: "La fecha de publicación ya fue establecida y no puede cambiarse.",
      });
    }

    let fecha;
    if (publicar_ahora === true) {
      fecha = new Date();
    } else {
      fecha = parseDateTime(fecha_hora);
      if (!fecha) {
        return res.status(400).json({ error: "Fecha invalida" });
      }
      if (fecha.getTime() <= Date.now()) {
        return res.status(400).json({
          error: "La fecha de publicación no puede ser anterior a la fecha y hora actuales.",
        });
      }
    }

    // La fecha no puede ser anterior a la finalización de ninguna noche establecida
    const { rows: noches } = await pool.query("SELECT fecha_hora_inicio FROM noches");
    for (const n of noches) {
      const finVotacion = new Date(new Date(n.fecha_hora_inicio).getTime() + HORA_ACCESO_DESPUES);
      if (fecha.getTime() <= finVotacion.getTime()) {
        return res.status(400).json({
          error: "La fecha de publicación no puede ser anterior a la finalización de las noches ya establecidas.",
        });
      }
    }

    await pool.query(
      `INSERT INTO publicacion_resultados (id, fecha_hora)
       VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET fecha_hora = EXCLUDED.fecha_hora`,
      [fecha.toISOString()]
    );

    await auditar({
      userId: req.user.id,
      accion: "configurar_publicacion_resultados",
      entidad: "resultados",
      entidadId: "global",
      detalles: publicar_ahora === true ? { inmediato: true } : { fechaHora: fecha.toISOString() },
      ip: req.ip,
    });

    res.status(201).json(publicacionInfo(fecha));
  } catch (error) {
    console.error("Configurar publicacion resultados error:", error.message);
    res.status(500).json({ error: "Failed to configure publicacion resultados" });
  }
});

// ---- Resultados de todas las noches (visibles al llegar la fecha de publicación) ----

router.get("/resultados", requireAuth, requireAdmin, async (req, res) => {
  try {
    const fecha = await getPublicacionRow();
    if (fecha === null) {
      return res.status(403).json({ error: "Los resultados aún no están disponibles" });
    }
    const fechaDate = new Date(fecha);
    if (new Date() < fechaDate) {
      return res.status(403).json({ error: "Los resultados aún no están disponibles" });
    }

    const { rows: noches } = await pool.query(
      "SELECT id, name FROM noches ORDER BY fecha_hora_inicio"
    );

    const todos = [];
    for (const n of noches) {
      const { rows: comparsas } = await pool.query(
        `SELECT oc.comparsa_id, c.name, c.colors, oc."position"
         FROM orden_comparsa oc
         JOIN comparsas c ON c.id = oc.comparsa_id
         WHERE oc.noche_id = $1
         ORDER BY oc."position"`,
        [n.id]
      );

      const resultados = [];
      for (const c of comparsas) {
        const { rows: scores } = await pool.query(
          `SELECT r.name AS rubro, AVG(c.puntaje)::numeric(10,2) AS promedio
           FROM calificacion c
           JOIN rubros r ON r.id = c.rubro_id
           WHERE c.noche_id = $1 AND c.comparsa_id = $2
           GROUP BY r.name, c.rubro_id
           ORDER BY c.rubro_id`,
          [n.id, c.comparsa_id]
        );
        const total = scores.reduce((acc, s) => acc + Number(s.promedio), 0);
        resultados.push({
          comparsa_id: c.comparsa_id,
          name: c.name,
          colors: Array.isArray(c.colors) ? c.colors : [],
          position: c.position,
          rubros: scores,
          total: Number(total.toFixed(2)),
        });
      }

      resultados.sort((a, b) => b.total - a.total);
      todos.push({ noche: { id: n.id, name: n.name }, resultados });
    }

    await auditar({
      userId: req.user.id,
      accion: "consultar_resultados",
      entidad: "resultados",
      entidadId: "global",
      ip: req.ip,
    });

    res.json({ publicacion: publicacionInfo(fecha), resultados: todos });
  } catch (error) {
    console.error("Get resultados error:", error.message);
    res.status(500).json({ error: "Failed to get resultados" });
  }
});

export default router;
