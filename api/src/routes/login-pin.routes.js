import express from "express";
import pg from "pg";
import { z } from "zod";
import { auth } from "../auth/auth.js";
import { auditar } from "../services/audit.service.js";
import { registrarIntentoAcceso } from "../services/suspicious-activity.service.js";
import { emailService } from "../services/email.service.js";
import { actividadSospechosaEmail } from "../services/email-templates.js";

const router = express.Router();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const requestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email"),
  dni: z
    .string()
    .or(z.number())
    .transform((value) => String(value).replace(/\s+/g, ""))
    .refine((value) => value.length > 0, "DNI is required"),
});

const GENERIC_RESPONSE = {
  status: "ok",
  message: "Si el email y el DNI coinciden, recibirás un PIN por correo.",
};

// Mensaje idéntico para email inexistente o DNI incorrecto:
// no permite enumerar emails registrados.
const NOT_REGISTERED_RESPONSE = {
  error: "El email o el DNI no están registrados.",
};

router.post("/login-pin/request", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Email and DNI are required" });
  }

  const { email, dni } = parsed.data;
  const ip = req.ip;

  try {
    const { rows } = await pool.query(
      'SELECT dni FROM "user" WHERE email = $1 LIMIT 1',
      [email],
    );
    const storedDni = rows[0]?.dni;
    const dniMatches =
      storedDni != null && String(storedDni).replace(/\s+/g, "") === dni;

    if (!dniMatches) {
      // Intento fallido: registrar y verificar si corresponde alerta.
      await auditar({
        accion: "intento_acceso:fallido",
        entidad: "user",
        detalles: { email, resultado: "fallido" },
        ip,
      });
      const alertar = await registrarIntentoAcceso({ email, ip, resultado: "fallido" });
      if (alertar) {
        try {
          const { rows: userRows } = await pool.query(
            'SELECT id, name, email FROM "user" WHERE LOWER(email) = LOWER($1) LIMIT 1',
            [email]
          );
          if (userRows.length > 0) {
            const u = userRows[0];
            const fecha = new Date().toLocaleString("es-AR", {
              day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
            });
            await emailService.send({
              to: u.email,
              subject: "Alerta de actividad de acceso - Carnavales",
              html: actividadSospechosaEmail({ name: u.name, fechaHora: fecha }),
            });
          }
        } catch (emailError) {
          console.error("Email de alerta falló:", emailError.message);
        }
      }

      return res.status(400).json(NOT_REGISTERED_RESPONSE);
    }

    // Éxito: registrar intento exitoso.
    await auditar({
      accion: "intento_acceso:exitoso",
      entidad: "user",
      detalles: { email, resultado: "exitoso" },
      ip,
    });

    await auth.api.sendVerificationOTP({
      body: { email, type: "sign-in" },
    });

    await auditar({
      accion: "solicitar_pin",
      entidad: "user",
      detalles: { email },
      ip,
    });

    return res.json(GENERIC_RESPONSE);
  } catch (error) {
    console.error("Login PIN request error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;