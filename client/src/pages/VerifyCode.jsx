import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth-client";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";
const COOLDOWN = 30;

// Use globalThis to persist across HMR and StrictMode remounts
const OTP_KEY = "__carnavales_otp_sent__";
const COOLDOWN_KEY = "__carnavales_otp_cooldown__";

if (typeof globalThis[OTP_KEY] === "undefined") {
  globalThis[OTP_KEY] = false;
  globalThis[COOLDOWN_KEY] = 0;
}

export function resetOtpSent() {
  globalThis[OTP_KEY] = false;
  globalThis[COOLDOWN_KEY] = 0;
}

export default function VerifyCode() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  const email = location.state?.email;
  const dni = location.state?.dni;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!email) return;

    globalThis[OTP_KEY] = true;
    globalThis[COOLDOWN_KEY] = COOLDOWN;
    setCooldown(COOLDOWN);
  }, [email]);

  const handleSendCode = async () => {
    if (!email || !dni) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/login-pin/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, dni }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          res.status === 429
            ? "Demasiados intentos. Espera un momento antes de volver a intentar."
            : body.error || "No se pudo enviar el PIN."
        );
        return;
      }

      globalThis[COOLDOWN_KEY] = COOLDOWN;
      setCooldown(COOLDOWN);
    } catch (err) {
      setError("Error al enviar el PIN");
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!email) return;
    setError("");
    setLoading(true);

    try {
      const { data, error: verifyError } = await authClient.signIn.emailOtp({
        email,
        otp: code,
      });

      if (verifyError) {
        const msg = verifyError.message || "";
        if (msg.includes("expired") || msg.includes("expirado")) {
          setError("El código ha expirado. Solicita uno nuevo.");
        } else if (msg.includes("attempts") || msg.includes("intentos")) {
          setError("Demasiados intentos fallidos. Solicita un nuevo código.");
        } else {
          setError("Código incorrecto. Verifica e intenta de nuevo.");
        }
        return;
      }

      if (!data?.token) {
        setError("La sesión no pudo confirmarse. Intenta autenticarte nuevamente.");
        return;
      }

      resetOtpSent();

      try {
        const meRes = await fetch(`${API_BASE}/api/me`, {
          credentials: "include",
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          const role = meData?.user?.role || "jurado";
          const rolePaths = {
            admin: "/admin",
            comisario: "/comisario",
            escribano: "/escribano",
            jurado: "/home",
          };
          navigate(rolePaths[role] || "/home");
        } else {
          navigate("/home");
        }
      } catch {
        navigate("/home");
      }
    } catch (err) {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoBack = () => {
    resetOtpSent();
    const state = location.state?.backgroundLocation
      ? { backgroundLocation: location.state.backgroundLocation }
      : undefined;
    navigate("/login", { state });
  };

  if (!email) {
    return (
      <div className="container">
        <h1>Verificar código</h1>
        <p className="error" role="alert">
          Accedé desde el login para recibir tu PIN.
        </p>
        <p style={{ marginTop: "1rem", textAlign: "center" }}>
          <button
            onClick={handleGoBack}
            style={{ background: "none", border: "none", color: "var(--link)", cursor: "pointer", textDecoration: "underline" }}
          >
            Volver al login
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Verificar tu identidad</h1>
      <p>Ingresá el PIN de 6 dígitos que enviamos a tu correo.</p>

      <button onClick={handleSendCode} disabled={sending || cooldown > 0} style={{ marginBottom: "1rem" }}>
        {sending ? "Enviando..." : cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar PIN"}
      </button>

      <form onSubmit={handleVerify}>
        <div>
          <label>PIN de 6 dígitos</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
            required
            placeholder="000000"
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={loading || code.length !== 6}>
          {loading ? "Verificando..." : "Verificar PIN"}
        </button>
      </form>
      <p style={{ marginTop: "1rem", textAlign: "center" }}>
        <button
          onClick={handleGoBack}
          style={{ background: "none", border: "none", color: "var(--link)", cursor: "pointer", textDecoration: "underline" }}
        >
          Volver al login
        </button>
      </p>
    </div>
  );
}