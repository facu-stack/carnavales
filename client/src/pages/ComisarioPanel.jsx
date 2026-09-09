import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "../lib/auth-client";
import { useNavigate } from "react-router-dom";
import { resetOtpSent } from "./VerifyCode";
import { apiFetch } from "../lib/api";
import Header from "../components/Header";

export default function ComisarioPanel() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  const [view, setView] = useState("home");
  const [noches, setNoches] = useState([]);
  const [selectedNocheId, setSelectedNocheId] = useState("");
  const [incidencias, setIncidencias] = useState([]);
  const [infracciones, setInfracciones] = useState([]);
  const [controles, setControles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showIncidenciaForm, setShowIncidenciaForm] = useState(false);
  const [showControlForm, setShowControlForm] = useState(false);
  const [formIncidencia, setFormIncidencia] = useState({
    comparsa_id: "",
    tipo: "reglamentaria",
    infraccion_id: "",
    evidencia: "",
    observaciones: "",
  });
  const [formControl, setFormControl] = useState({
    comparsa_id: "",
    tipo: "horario",
    valor: "",
    observaciones: "",
  });
  const [comparsas, setComparsas] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  useEffect(() => {
    if (session?.user?.role === "admin") {
      navigate("/admin", { replace: true });
    }
  }, [session, navigate]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nochesData, incidenciasData, infraccionesData, controlesData, comparsasData] =
        await Promise.all([
          apiFetch("/api/comisario/noches"),
          apiFetch("/api/comisario/incidencias"),
          apiFetch("/api/comisario/infracciones"),
          apiFetch("/api/comisario/controles"),
          apiFetch("/api/admin/comparsas"),
        ]);
      setNoches(nochesData);
      setIncidencias(incidenciasData);
      setInfracciones(infraccionesData);
      setControles(controlesData);
      setComparsas(comparsasData);
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

  const handleLogout = useCallback(async () => {
    try {
      await signOut();
      resetOtpSent();
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }, []);

  const handleCreateIncidencia = useCallback(
    async (e) => {
      e.preventDefault();
      if (!formIncidencia.comparsa_id || !selectedNocheId) {
        setActionError("Selecciona noche y comparsa");
        return;
      }
      setSubmitting(true);
      setActionError(null);
      setActionSuccess(null);
      try {
        const body = {
          noche_id: Number(selectedNocheId),
          comparsa_id: Number(formIncidencia.comparsa_id),
          tipo: formIncidencia.tipo,
          evidencia: formIncidencia.evidencia || undefined,
          observaciones: formIncidencia.observaciones || undefined,
        };
        if (formIncidencia.tipo === "reglamentaria" && formIncidencia.infraccion_id) {
          body.infraccion_id = Number(formIncidencia.infraccion_id);
        }
        await apiFetch("/api/comisario/incidencias", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setActionSuccess("Incidencia registrada correctamente");
        setShowIncidenciaForm(false);
        setFormIncidencia({
          comparsa_id: "",
          tipo: "reglamentaria",
          infraccion_id: "",
          evidencia: "",
          observaciones: "",
        });
        loadData();
      } catch (err) {
        setActionError(err.message);
      } finally {
        setSubmitting(false);
      }
    },
    [formIncidencia, selectedNocheId, loadData]
  );

  const handleCreateControl = useCallback(
    async (e) => {
      e.preventDefault();
      if (!formControl.comparsa_id || !selectedNocheId) {
        setActionError("Selecciona noche y comparsa");
        return;
      }
      setSubmitting(true);
      setActionError(null);
      setActionSuccess(null);
      try {
        await apiFetch("/api/comisario/controles", {
          method: "POST",
          body: JSON.stringify({
            noche_id: Number(selectedNocheId),
            comparsa_id: Number(formControl.comparsa_id),
            tipo: formControl.tipo,
            valor: formControl.valor || undefined,
            observaciones: formControl.observaciones || undefined,
          }),
        });
        setActionSuccess("Control registrado correctamente");
        setShowControlForm(false);
        setFormControl({ comparsa_id: "", tipo: "horario", valor: "", observaciones: "" });
        loadData();
      } catch (err) {
        setActionError(err.message);
      } finally {
        setSubmitting(false);
      }
    },
    [formControl, selectedNocheId, loadData]
  );

  if (isPending || loading) {
    return (
      <div className="container" style={{ padding: "40px 20px", textAlign: "center" }}>
        Cargando panel del comisario...
      </div>
    );
  }

  const selectedNoche = noches.find((n) => String(n.id) === selectedNocheId);
  const incidenciasFiltradas = selectedNocheId
    ? incidencias.filter((i) => String(i.noche_id) === selectedNocheId)
    : incidencias;
  const controlesFiltrados = selectedNocheId
    ? controles.filter((c) => String(c.noche_id) === selectedNocheId)
    : controles;

  return (
    <div className="container" style={{ padding: "20px", maxWidth: 900, margin: "0 auto" }}>
      <Header onLogout={handleLogout} />

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, marginBottom: 8 }}>
        Panel del Comisario
      </h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>
        Registra controles e incidencias del corso.
      </p>

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

      {actionSuccess && (
        <div
          className="card"
          style={{ padding: 12, marginBottom: 16, borderLeft: "4px solid var(--success)", background: "var(--success-soft)" }}
        >
          <p style={{ color: "var(--success)", fontSize: 14 }}>{actionSuccess}</p>
        </div>
      )}
      {actionError && (
        <div
          className="card"
          style={{ padding: 12, marginBottom: 16, borderLeft: "4px solid var(--danger)", background: "var(--danger-soft)" }}
        >
          <p style={{ color: "var(--danger)", fontSize: 14 }}>{actionError}</p>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button
          className={`btn ${view === "home" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setView("home")}
        >
          Resumen
        </button>
        <button
          className={`btn ${view === "incidencias" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setView("incidencias")}
        >
          Incidencias ({incidenciasFiltradas.length})
        </button>
        <button
          className={`btn ${view === "controles" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setView("controles")}
        >
          Controles ({controlesFiltrados.length})
        </button>
      </div>

      {view === "home" && (
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, marginBottom: 16 }}>
            Resumen
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div style={{ padding: 16, background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--primary)" }}>
                {incidenciasFiltradas.length}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Incidencias</div>
            </div>
            <div style={{ padding: 16, background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-orange)" }}>
                {controlesFiltrados.length}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Controles</div>
            </div>
            <div style={{ padding: 16, background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--accent-green)" }}>
                {incidenciasFiltradas.filter((i) => i.estado === "pendiente").length}
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Pendientes</div>
            </div>
          </div>
          {selectedNoche && (
            <div style={{ marginTop: 16, padding: 12, background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
              <strong>Noche seleccionada:</strong> {selectedNoche.name} ({selectedNoche.estado_efectivo})
            </div>
          )}
        </div>
      )}

      {view === "incidencias" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={() => setShowIncidenciaForm(!showIncidenciaForm)}>
              {showIncidenciaForm ? "Cancelar" : "+ Nueva Incidencia"}
            </button>
          </div>

          {showIncidenciaForm && (
            <form className="card" style={{ padding: 20, marginBottom: 16 }} onSubmit={handleCreateIncidencia}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 16 }}>
                Registrar Incidencia
              </h3>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Comparsa *
                  </label>
                  <select
                    className="input"
                    value={formIncidencia.comparsa_id}
                    onChange={(e) => setFormIncidencia((s) => ({ ...s, comparsa_id: e.target.value }))}
                    required
                  >
                    <option value="">Seleccionar comparsa</option>
                    {comparsas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Tipo *
                  </label>
                  <select
                    className="input"
                    value={formIncidencia.tipo}
                    onChange={(e) => setFormIncidencia((s) => ({ ...s, tipo: e.target.value }))}
                  >
                    <option value="reglamentaria">Reglamentaria</option>
                    <option value="no_reglamentaria">No reglamentaria</option>
                  </select>
                </div>
                {formIncidencia.tipo === "reglamentaria" && (
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                      Infracción
                    </label>
                    <select
                      className="input"
                      value={formIncidencia.infraccion_id}
                      onChange={(e) => setFormIncidencia((s) => ({ ...s, infraccion_id: e.target.value }))}
                    >
                      <option value="">Sin infracción específica</option>
                      {infracciones.map((inf) => (
                        <option key={inf.id} value={inf.id}>
                          {inf.codigo} - {inf.nombre}
                          {inf.puntos_descuento > 0 ? ` (-${inf.puntos_descuento} pts)` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Evidencia
                  </label>
                  <textarea
                    className="input"
                    rows={2}
                    value={formIncidencia.evidencia}
                    onChange={(e) => setFormIncidencia((s) => ({ ...s, evidencia: e.target.value }))}
                    placeholder="Descripción de la evidencia..."
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Observaciones
                  </label>
                  <textarea
                    className="input"
                    rows={2}
                    value={formIncidencia.observaciones}
                    onChange={(e) => setFormIncidencia((s) => ({ ...s, observaciones: e.target.value }))}
                    placeholder="Observaciones adicionales..."
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? "Registrando..." : "Registrar Incidencia"}
                </button>
              </div>
            </form>
          )}

          <div className="card" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Noche</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Comparsa</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Tipo</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Estado</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {incidenciasFiltradas.map((inc) => (
                  <tr key={inc.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 16px", fontSize: 14 }}>{inc.noche_name}</td>
                    <td style={{ padding: "10px 16px", fontSize: 14 }}>{inc.comparsa_name}</td>
                    <td style={{ padding: "10px 16px", fontSize: 14 }}>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          background: inc.tipo === "reglamentaria" ? "var(--warning-soft)" : "var(--surface-3)",
                        }}
                      >
                        {inc.tipo === "reglamentaria" ? "Reglamentaria" : "No reglamentaria"}
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
                            inc.estado === "pendiente"
                              ? "var(--warning-soft)"
                              : inc.estado === "resuelta"
                                ? "var(--success-soft)"
                                : "var(--surface-3)",
                        }}
                      >
                        {inc.estado}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--muted)" }}>
                      {new Date(inc.created_at).toLocaleDateString("es-AR")}
                    </td>
                  </tr>
                ))}
                {incidenciasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                      No hay incidencias registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "controles" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={() => setShowControlForm(!showControlForm)}>
              {showControlForm ? "Cancelar" : "+ Nuevo Control"}
            </button>
          </div>

          {showControlForm && (
            <form className="card" style={{ padding: 20, marginBottom: 16 }} onSubmit={handleCreateControl}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 16 }}>
                Registrar Control
              </h3>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Comparsa *
                  </label>
                  <select
                    className="input"
                    value={formControl.comparsa_id}
                    onChange={(e) => setFormControl((s) => ({ ...s, comparsa_id: e.target.value }))}
                    required
                  >
                    <option value="">Seleccionar comparsa</option>
                    {comparsas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Tipo *
                  </label>
                  <select
                    className="input"
                    value={formControl.tipo}
                    onChange={(e) => setFormControl((s) => ({ ...s, tipo: e.target.value }))}
                  >
                    <option value="horario">Horario</option>
                    <option value="integrantes">Integrantes</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Valor
                  </label>
                  <input
                    className="input"
                    type="text"
                    value={formControl.valor}
                    onChange={(e) => setFormControl((s) => ({ ...s, valor: e.target.value }))}
                    placeholder="Ej: 15:30, 45 integrantes..."
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Observaciones
                  </label>
                  <textarea
                    className="input"
                    rows={2}
                    value={formControl.observaciones}
                    onChange={(e) => setFormControl((s) => ({ ...s, observaciones: e.target.value }))}
                    placeholder="Observaciones..."
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? "Registrando..." : "Registrar Control"}
                </button>
              </div>
            </form>
          )}

          <div className="card" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Noche</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Comparsa</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Tipo</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Valor</th>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, fontWeight: 600 }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {controlesFiltrados.map((co) => (
                  <tr key={co.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 16px", fontSize: 14 }}>{co.noche_name}</td>
                    <td style={{ padding: "10px 16px", fontSize: 14 }}>{co.comparsa_name}</td>
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
                        {co.tipo}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 14 }}>{co.valor || "-"}</td>
                    <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--muted)" }}>
                      {new Date(co.created_at).toLocaleDateString("es-AR")}
                    </td>
                  </tr>
                ))}
                {controlesFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
                      No hay controles registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
