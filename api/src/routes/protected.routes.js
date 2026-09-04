import express from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/auth.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/me", requireAuth, async (req, res) => {
  return res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name || "",
      isAdmin: req.user.isAdmin === true,
    },
  });
});

router.post("/enable-2fa", requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: "Password required" });
    }

    const result = await auth.api.enableTwoFactor({
      body: { password },
      headers: fromNodeHeaders(req.headers),
    });

    return res.json({ success: true, backupCodes: result.backupCodes });
  } catch (error) {
    console.error("Enable 2FA error:", error);
    return res.status(500).json({ error: "Failed to enable 2FA" });
  }
});

router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default router;
