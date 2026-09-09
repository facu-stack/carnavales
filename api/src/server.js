import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth/auth.js";
import protectedRoutes from "./routes/protected.routes.js";
import loginPinRoutes from "./routes/login-pin.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import adminUsersRoutes from "./routes/admin-users.routes.js";
import adminIncidenciasRoutes from "./routes/admin-incidencias.routes.js";
import juradoRoutes from "./routes/jurado.routes.js";
import juradoNocheRoutes from "./routes/jurado-noche.routes.js";
import comisarioRoutes from "./routes/comisario.routes.js";
import escribanoRoutes from "./routes/escribano.routes.js";
import nochesRoutes, { limpiarNochesFinalizadas } from "./routes/noches.routes.js";

const PORT = process.env.PORT || 3000;

export function createApp({ rateLimitEnabled = true, authRateLimitMax = 10 } = {}) {
  const app = express();

  app.use(
    cors({
      origin: process.env.FRONTEND_URL,
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    })
  );

  app.use(helmet());

  if (rateLimitEnabled) {
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: authRateLimitMax,
      message: { error: "Too many attempts. Please try again later." },
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use(
      ["/api/auth/sign-in/email", "/api/auth/sign-up/email"],
      authLimiter
    );

    const passwordResetLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: { error: "Too many attempts. Please try again later." },
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use(
      ["/api/auth/request-password-reset", "/api/auth/reset-password"],
      passwordResetLimiter
    );

    const pinRequestLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: { error: "Too many attempts. Please try again later." },
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use("/api/login-pin/request", pinRequestLimiter);
  }

  const EMAIL_OTP_BLOCKED_PREFIXES = [
    "/api/auth/email-otp/",
    "/api/auth/forget-password/email-otp",
  ];
  app.use("/api/auth", (req, res, next) => {
    if (EMAIL_OTP_BLOCKED_PREFIXES.some((prefix) => req.originalUrl.startsWith(prefix))) {
      return res.status(404).json({ error: "Not found" });
    }
    next();
  });

  app.all("/api/auth/*", toNodeHandler(auth));

  app.use(express.json());

  app.use("/api", protectedRoutes);
  app.use("/api", loginPinRoutes);
  app.use("/api", juradoRoutes);
  app.use("/api", juradoNocheRoutes);
  app.use("/api/comisario", comisarioRoutes);
  app.use("/api/escribano", escribanoRoutes);
  app.use("/api/admin", nochesRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/admin", adminUsersRoutes);
  app.use("/api/admin", adminIncidenciasRoutes);

  app.use((err, req, res, next) => {
    console.error("Unexpected error:", err);
    const statusCode = err.statusCode || 500;
    const message =
      process.env.NODE_ENV === "production" ? "Internal server error" : err.message;
    return res.status(statusCode).json({ error: message });
  });

  return app;
}

const app = createApp();

async function start() {
  try {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });
    await pool.query("SELECT 1");
    await pool.end();
    console.log("Database connected.");

    // Limpieza automática de noches vencidas (fin de disponibilidad + 1 semana).
    // Se ejecuta al iniciar y luego cada hora. El timer no evita el cierre del proceso.
    await limpiarNochesFinalizadas();
    setInterval(() => {
      limpiarNochesFinalizadas().catch((error) => {
        console.error("Cleanup noches falló:", error.message);
      });
    }, 60 * 60 * 1000).unref();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start();
}

export default app;
