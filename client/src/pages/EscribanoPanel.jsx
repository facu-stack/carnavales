import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "../lib/auth-client";
import { useNavigate } from "react-router-dom";
import { resetOtpSent } from "./VerifyCode";
import { apiFetch } from "../lib/api";
import Header from "../components/Header";

export default function EscribanoPanel() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  const [view, setView] = useState("home");
  const [noches, setNoches] = useState([]);
  const [selectedNocheId, setSelectedNocheId] = useState("");
  const [estadoNoche, setEstadoNoche] = useState(null);
  const [planillas, setPlanillas] = useState([]);
  const [auditoria, setAuditoria] = useState([]);
  const [actas, setActas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [certifying, setCertifying] = useState(null);

  useEffect(() => {
    if (session?.user?.role === "admin") {
      navigate("/admin", { replace: true });
    }
  }, [session, navigate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nochesData, planillasData, auditoriaData, actasData] = await Promise.all([
        apiFetch("/api/escribano/noches"),
        apiFetch("/api/escribano/planillas/estado"),
        apiFetch("/api/escribano/auditoria?limit=50"),
        apiFetch("/api/escribano/actas"),
      ]);
      setNoches(nochesData);
      setPlanillas(planillasData);
      setAuditoria(auditoriaData);
      setActas(actasData);
      if (nochesData.length > 0 && !selectedNocheId) {
        setSelectedNocheId(String(nochesData[0].id));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedNocheId]);

  useEffect(() => {
    loadData();
  }, []);

  const loadNocheEstado = useCallback(
    async (nocheId) => {
      if (!nocheId) return;
      try {
        const data = await apiFetch(`/api/escribano/noche/${nocheId}/estado`);
        setEstadoNoche(data);
      } catch (err) {
        console.error("Error loading noche estado:", err);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedNocheId) {
      loadNocheEstado(selectedNocheId);
    }
  }, [selectedNocheId, loadNocheEstado]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut();
      resetOtpSent();
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }, []);

  const handleCertificar = useCallback(
    async (actaId) => {
      setCertifying(actaId);
      try {
        await apiFetch(`/api/escribano/actas/${actaId}/certificar`, {
          method: "POST",
        });
        loadData();
      } catch (err) {
        console.error("Error certifying acta:", err);
      } finally {
        setCertifying(null);
      }
    },
    [loadData]
  );

  if (isPending || loading) {
    return (
      <div className="app">
        <Header onLogout={handleLogout} />
        <main className="stage">
          <div className="wrap">
            <h1 className="screen-title">Panel de Escribano / Veedor</h1>
            <p className="screen-lede">Cargando panel del escribano...</p>
          </div>
        </main>
      </div>
    );
  }

  const selectedNoche = noches.find((n) => String(n.id) === selectedNocheId);
  const planillasFiltradas = selectedNocheId
    ? planillas.filter((p) => String(p.noche_id) === selectedNocheId)
    : planillas;
  const actasFiltradas = selectedNocheId
    ? actas.filter((a) => String(a.noche_id) === selectedNocheId)
    : actas;

  const totalPlanillas = planillasFiltradas.length;
  const planillasConfirmadas = planillasFiltradas.filter((p) => p.estado_planilla === "confirmada").length;

  return (
    <div className="app">
      <Header onLogout={handleLogout} />
      <main className="stage">
        <div className="wrap" style={{ maxWidth: 900 }}>
          <h1 className="screen-title">Panel de Escribano / Veedor</h1>
          <p className="screen-lede">Supervisa el proceso de votación y certifica actas.</p>

      {error && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: "4px solid var(--danger)" }}>
          <p style={{ color: "var(--danger)" }}>{error}</p>
          <button className="btn btn-ghost btn-sm" onClick={loadData} style={{ marginTop: 8 }}>
            Reintentar
          </button>
        </div>
      )}

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 6, display: "block" }}>
          Noche de competencia
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {noches.map((n) => (
            <button
              key={n.id}
              className={`btn ${String(n.id) === selectedNocheId ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setSelectedNocheId(String(n.id))}
            >
              {n.name}
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 8,
                  background:
                    n.estado_efectivo === "abierta"
                      ? "var(--success-soft)"
                      : n.estado_efectivo === "finalizada"
                        ? "var(--danger-soft)"
                        : "var(--surface-3)",
                }}
              >
                {n.estado_efectivo}
              </span>
            </button>
          ))}
          {noches.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>No hay noches disponibles</p>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <button
          className={`btn ${view === "home" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setView("home")}
        >
          Resumen
        </button>
        <button
          className={`btn ${view === "planillas" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setView("planillas")}
        >
          Planillas
        </button>
        <button
          className={`btn ${view === "auditoria" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setView("auditoria")}
        >
          Auditoría
        </button>
        <button
          className={`btn ${view === "actas" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setView("actas")}
        >
          Actas
        </button>
      </div>

      {view === "home" && (
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, marginBottom: 16 }}>
            Resumen del Proceso
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            <div style={{ padding: 16, background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--primary)" }}>
                {planillasConfirmadas}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Planillas confirmadas</div>
            </div>
            <div style={{ padding: 16, background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--warning)" }}>
                {totalPlanillas - planillasConfirmadas}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Planillas pendientes</div>
            </div>
            <div style={{ padding: 16, background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-green)" }}>
                {actasFiltradas.filter((a) => a.estado === "certificada").length}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Actas certificadas</div>
            </div>
          </div>

          {selectedNoche && (
            <div style={{ padding: 12, background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
              <strong>Noche:</strong> {selectedNoche.name} ({selectedNoche.estado_efectivo})
            </div>
          )}

          {estadoNoche && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 16, marginBottom: 8 }}>Estado de Jurados</h3>
              <div className="card" style={{ overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Jurado</th>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Estado</th>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Rubros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estadoNoche.jurados.map((j) => (
                      <tr key={j.jurado_id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 16px", fontSize: 14 }}>{j.jurado_name}</td>
                        <td style={{ padding: "10px 16px", fontSize: 14 }}>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 600,
                              background:
                                j.estado === "finalizado" ? "var(--success-soft)" : "var(--warning-soft)",
                            }}
                          >
                            {j.estado}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", fontSize: 14 }}>
                          {j.rubros_votados}/{j.rubros_asignados}
                        </td>
                      </tr>
                    ))}
                    {estadoNoche.jurados.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>
                          No hay jurados asignados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {view === "planillas" && (
        <div className="card" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Jurado</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Noche</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Estado Planilla</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Rubros</th>
              </tr>
            </thead>
            <tbody>
              {planillasFiltradas.map((p, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 16px", fontSize: 14 }}>{p.jurado_name}</td>
                  <td style={{ padding: "10px 16px", fontSize: 14 }}>{p.noche_name}</td>
                  <td style={{ padding: "10px 16px", fontSize: 14 }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        background:
                          p.estado_planilla === "confirmada"
                            ? "var(--success-soft)"
                            : "var(--warning-soft)",
                      }}
                    >
                      {p.estado_planilla}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 14 }}>
                    {p.rubros_asignados}
                  </td>
                </tr>
              ))}
              {planillasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                    No hay planillas registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === "auditoria" && (
        <div className="card" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Fecha</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Usuario</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Acción</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Entidad</th>
              </tr>
            </thead>
            <tbody>
              {auditoria.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--muted)" }}>
                    {new Date(a.created_at).toLocaleString("es-AR")}
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 14 }}>{a.user_name || "-"}</td>
                  <td style={{ padding: "10px 16px", fontSize: 14 }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        background: "var(--surface-3)",
                      }}
                    >
                      {a.accion}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 14 }}>{a.entidad || "-"}</td>
                </tr>
              ))}
              {auditoria.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                    No hay registros de auditoría
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === "actas" && (
        <div className="card" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Noche</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Tipo</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Estado</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Certificada por</th>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {actasFiltradas.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 16px", fontSize: 14 }}>{a.noche_name}</td>
                  <td style={{ padding: "10px 16px", fontSize: 14 }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        background: "var(--surface-3)",
                      }}
                    >
                      {a.tipo}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 14 }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        background:
                          a.estado === "certificada"
                            ? "var(--success-soft)"
                            : a.estado === "generada"
                              ? "var(--warning-soft)"
                              : "var(--surface-3)",
                      }}
                    >
                      {a.estado}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: 14 }}>
                    {a.certificada_por_name || "-"}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    {a.estado === "generada" && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleCertificar(a.id)}
                        disabled={certifying === a.id}
                      >
                        {certifying === a.id ? "Certificando..." : "Certificar"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {actasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                    No hay actas disponibles
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
        </div>
      </main>
    </div>
  );
}
