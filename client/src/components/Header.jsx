import { useState, useCallback } from "react";
import { useSession, signOut } from "../lib/auth-client";
import { useTheme } from "../lib/use-theme";
import { Link } from "react-router-dom";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

const ROLE_LABELS = {
  admin: "Administración",
  comisario: "Comisario",
  escribano: "Escribano / Veedor",
  jurado: "Jurado oficial",
};

const ROLE_NAV = {
  admin: [
    { path: "/admin", label: "Inicio" },
    { path: "/admin#usuarios", label: "Usuarios" },
    { path: "/admin#comparsas", label: "Comparsas" },
    { path: "/admin#rubros", label: "Rubros" },
    { path: "/admin#noches", label: "Noches" },
    { path: "/admin#infracciones", label: "Infracciones" },
    { path: "/admin#incidencias", label: "Incidencias" },
    { path: "/admin#actas", label: "Actas" },
  ],
  comisario: [
    { path: "/comisario", label: "Inicio" },
  ],
  escribano: [
    { path: "/escribano", label: "Inicio" },
  ],
  jurado: [
    { path: "/home", label: "Inicio" },
  ],
};

export default function Header({ onLogout }) {
  const { data: session } = useSession();
  const [theme, toggleTheme] = useTheme();
  const [online, setOnline] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const role = session?.user?.role || "jurado";
  const brandSub = ROLE_LABELS[role] || "Jurado oficial";
  const navItems = ROLE_NAV[role] || ROLE_NAV.jurado;

  const handleToggleConnection = useCallback(() => {
    setOnline((prev) => !prev);
  }, []);

  const handleUserChipClick = useCallback(() => {
    setShowLogoutModal(true);
  }, []);

  const handleConfirmLogout = useCallback(async () => {
    setShowLogoutModal(false);
    try {
      await signOut();
      onLogout?.();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }, [onLogout]);

  const name = session?.user?.name || "";
  const firstName = name.split(" ")[0] || "Usuario";
  const avatarLetter = (firstName[0] || "U").toUpperCase();
  const isDark = theme === "dark";

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">C</span>
          <span>
            <div className="brand-name">Carnaval</div>
            <div className="brand-sub">{brandSub}</div>
          </span>
        </div>
        <nav style={{ display: "flex", gap: 4, marginLeft: 16 }}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              className="btn btn-ghost btn-sm"
              to={item.path}
              style={{ textDecoration: "none", fontSize: 13 }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-spacer"></div>
        <div className="top-status">
          <button
            className={`status-pill ${online ? "online" : "offline"}`}
            onClick={handleToggleConnection}
            title="Tocar para alternar conexión"
          >
            <span className="dot"></span>
            <span>{online ? "ONLINE" : "SIN CONEXIÓN"}</span>
          </button>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={isDark ? "Activar tema claro" : "Activar tema oscuro"}
            title={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <div className="user-chip" onClick={handleUserChipClick} style={{ cursor: "pointer" }}>
            <span>{firstName}</span>
            <span className="user-avatar">{avatarLetter}</span>
          </div>
        </div>
      </header>

      {showLogoutModal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowLogoutModal(false);
          }}
        >
          <section className="modal-panel" role="dialog" aria-modal="true" aria-label="Cerrar sesión">
            <div className="modal-content" style={{ padding: "22px 20px 26px" }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "20px", color: "var(--fg)" }}>
                Cerrar sesión
              </h2>
              <p style={{ color: "var(--muted)", fontSize: 14, margin: "10px 0 20px" }}>
                Está a punto de cerrar sesión. ¿Está seguro?
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-ghost" onClick={() => setShowLogoutModal(false)}>
                  No
                </button>
                <button className="btn btn-danger" onClick={handleConfirmLogout}>
                  Sí, cerrar sesión
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
