import express from "express";
import pg from "pg";
import { z } from "zod";
import { auth } from "../auth/auth.js";

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

router.post("/login-pin/request", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Email and DNI are required" });
  }

  const { email, dni } = parsed.data;

  try {
    const { rows } = await pool.query(
      'SELECT dni FROM "user" WHERE email = $1 LIMIT 1',
      [email],
    );
    const storedDni = rows[0]?.dni;
    const dniMatches =
      storedDni != null && String(storedDni).replace(/\s+/g, "") === dni;

    if (!dniMatches) {
      return res.json(GENERIC_RESPONSE);
    }

    await auth.api.sendVerificationOTP({
      body: { email, type: "sign-in" },
    });

    return res.json(GENERIC_RESPONSE);
  } catch (error) {
    console.error("Login PIN request error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;