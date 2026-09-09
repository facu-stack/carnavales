import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "../lib/auth-client";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import JuradoManager from "../components/JuradoManager";
import NocheManager from "../components/NocheManager";
import Resultados from "../components/Resultados";
import { resetOtpSent } from "./VerifyCode";
import { apiFetch } from "../lib/api";

const ROLE_LABELS = {
  jurado: "Jurado",
  comisario: "Comisario",
  escribano: "Escribano",
  admin: "Admin",
};

export default function Admin() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  const [comparsas, setComparsas] = useState([]);
  const [rubros, setRubros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [usuarios, setUsuarios] = useState([]);

  const [votos, setVotos] = useState([]);
  const [votosStatus, setVotosStatus] = useState({ loading: false, error: null });
  const [votosNocheId, setVotosNocheId] = useState("");

  const loadVotos = useCallback(async (nocheId) => {
    if (!nocheId) return;
    setVotosStatus({ loading: true, error: null });
    try {
      const data = await apiFetch(`/api/admin/votos?noche_id=${nocheId}`);
      setVotos(data);
    } catch (err) {
      setVotosStatus((s) => ({ ...s, error: err.message }));
    } finally {
      setVotosStatus((s) => ({ ...s, loading: false }));
    }
  }, [apiFetch]);

  const [editingComparsa, setEditingComparsa] = useState(null);
  const [editingRubro, setEditingRubro] = useState(null);

  const [noches, setNoches] = useState([]);
  const [newComparsa, setNewComparsa] = useState({ name: "", position: 0, colors: ["#ffffff"] });
  const [newRubro, setNewRubro] = useState({ name: "", min_score: 5, max_score: 10 });
  const [showAddComparsa, setShowAddComparsa] = useState(false);
  const [showAddRubro, setShowAddRubro] = useState(false);

  const [colorInput, setColorInput] = useState("#ffffff");

  const [infracciones, setInfracciones] = useState([]);
  const [incidencias, setIncidencias] = useState([]);
  const [actas, setActas] = useState([]);
  const [newInfraccion, setNewInfraccion] = useState({
    codigo: "",
    nombre: "",
    descripcion: "",
    sancion_default: "",
    puntos_descuento: 0,
  });
  const [showAddInfraccion, setShowAddInfraccion] = useState(false);
  const [editingInfraccion, setEditingInfraccion] = useState(null);
  const [actaNocheId, setActaNocheId] = useState("");
  const [actaTipo, setActaTipo] = useState("votacion");
  const [actaError, setActaError] = useState(null);
  const [infraccionError, setInfraccionError] = useState(null);
  const [incidenciaError, setIncidenciaError] = useState(null);

  const loadInfracciones = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/infracciones");
      setInfracciones(data);
    } catch (err) {
      console.error("Cargar infracciones:", err.message);
    }
  }, [apiFetch]);

  const loadIncidencias = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/incidencias");
      setIncidencias(data);
    } catch (err) {
      console.error("Cargar incidencias:", err.message);
    }
  }, [apiFetch]);

  const loadActas = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/actas");
      setActas(data);
    } catch (err) {
      console.error("Cargar actas:", err.message);
    }
  }, [apiFetch]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut();
      resetOtpSent();
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [c, r] = await Promise.all([
        apiFetch("/api/admin/comparsas"),
        apiFetch("/api/admin/rubros"),
      ]);
      setComparsas(c);
      setRubros(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    apiFetch("/api/admin/noches").then(setNoches).catch(() => {});
    apiFetch("/api/admin/usuarios").then(setUsuarios).catch(() => {});
    loadInfracciones();
    loadIncidencias();
    loadActas();
  }, [fetchData, loadInfracciones, loadIncidencias, loadActas]);

  if (isPending || loading) {
    return <div className="container">Cargando...</div>;
  }

  if (!session) {
    navigate("/login");
    return null;
  }

  if (error) {
    return (
      <div className="app">
        <Header onLogout={handleLogout} />
        <main className="stage">
          <div className="wrap">
            <h1 className="screen-title">Panel de Administración</h1>
            <div className="notice" style={{ marginTop: 18 }}>
              Error: {error}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const handleAddColor = (setState, state) => {
    if (colorInput && !state.colors.includes(colorInput)) {
      setState({ ...state, colors: [...state.colors, colorInput] });
      setColorInput("#ffffff");
    }
  };

  const handleRemoveColor = (setState, state, idx) => {
    setState({ ...state, colors: state.colors.filter((_, i) => i !== idx) });
  };

  const handleCreateComparsa = async () => {
    try {
      const created = await apiFetch("/api/admin/comparsas", {
        method: "POST",
        body: JSON.stringify(newComparsa),
      });
      setComparsas((prev) => [...prev, created].sort((a, b) => a.position - b.position));
      setNewComparsa({ name: "", position: 0, colors: ["#ffffff"] });
      setShowAddComparsa(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateComparsa = async (id) => {
    try {
      const updated = await apiFetch(`/api/admin/comparsas/${id}`, {
        method: "PUT",
        body: JSON.stringify(editingComparsa),
      });
      setComparsas((prev) => prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.position - b.position));
      setEditingComparsa(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteComparsa = async (id) => {
    if (!confirm("¿Eliminar esta comparsa?")) return;
    try {
      await apiFetch(`/api/admin/comparsas/${id}`, { method: "DELETE" });
      setComparsas((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateRubro = async () => {
    try {
      const created = await apiFetch("/api/admin/rubros", {
        method: "POST",
        body: JSON.stringify(newRubro),
      });
      setRubros((prev) => [...prev, created]);
      setNewRubro({ name: "", min_score: 5, max_score: 10 });
      setShowAddRubro(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleUpdateRubro = async (id) => {
    try {
      const updated = await apiFetch(`/api/admin/rubros/${id}`, {
        method: "PUT",
        body: JSON.stringify(editingRubro),
      });
      setRubros((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setEditingRubro(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteRubro = async (id) => {
    if (!confirm("¿Eliminar este rubro?")) return;
    try {
      await apiFetch(`/api/admin/rubros/${id}`, { method: "DELETE" });
      setRubros((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateInfraccion = async () => {
    setInfraccionError(null);
    try {
      const created = await apiFetch("/api/admin/infracciones", {
        method: "POST",
        body: JSON.stringify(newInfraccion),
      });
      setInfracciones((prev) => [...prev, created].sort((a, b) => a.codigo.localeCompare(b.codigo)));
      setNewInfraccion({ codigo: "", nombre: "", descripcion: "", sancion_default: "", puntos_descuento: 0 });
      setShowAddInfraccion(false);
    } catch (err) {
      setInfraccionError(err.message);
    }
  };

  const handleUpdateInfraccion = async (id) => {
    setInfraccionError(null);
    try {
      const updated = await apiFetch(`/api/admin/infracciones/${id}`, {
        method: "PUT",
        body: JSON.stringify(editingInfraccion),
      });
      setInfracciones((prev) =>
        prev.map((i) => (i.id === id ? updated : i)).sort((a, b) => a.codigo.localeCompare(b.codigo))
      );
      setEditingInfraccion(null);
    } catch (err) {
      setInfraccionError(err.message);
    }
  };

  const handleDeleteInfraccion = async (id) => {
    if (!confirm("¿Eliminar esta infracción? Esta acción puede afectar incidencias existentes.")) return;
    try {
      await apiFetch(`/api/admin/infracciones/${id}`, { method: "DELETE" });
      setInfracciones((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setInfraccionError(err.message);
    }
  };

  const handleUpdateIncidenciaEstado = async (incidenciaId, estado) => {
    setIncidenciaError(null);
    try {
      await apiFetch(`/api/admin/incidencias/${incidenciaId}`, {
        method: "PUT",
        body: JSON.stringify({ estado }),
      });
      loadIncidencias();
    } catch (err) {
      setIncidenciaError(err.message);
    }
  };

  const handleCreateActa = async () => {
    setActaError(null);
    if (!actaNocheId || !actaTipo) {
      setActaError("Seleccioná noche y tipo de acta");
      return;
    }
    try {
      await apiFetch("/api/admin/actas", {
        method: "POST",
        body: JSON.stringify({ noche_id: Number(actaNocheId), tipo: actaTipo, contenido: {} }),
      });
      setActaNocheId("");
      setActaTipo("votacion");
      loadActas();
    } catch (err) {
      setActaError(err.message);
    }
  };

  const handleChangeRol = async (userId, role) => {
    try {
      await apiFetch(`/api/admin/usuarios/${userId}/rol`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      setUsuarios((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="app">
      <Header onLogout={handleLogout} />
      <main className="stage">
        <div className="wrap" style={{ maxWidth: 720 }}>
          <h1 className="screen-title">Panel de Administración</h1>
          <p className="screen-lede">Gestioná comparsas y rubros del jurado.</p>

          {/* ---- Estado de votación ---- */}
          <div className="admin-section">
            <h2>Estado de votación del jurado</h2>
            <div className="admin-field" style={{ maxWidth: 320, marginBottom: 12 }}>
              <label>Noche</label>
              <select
                value={votosNocheId}
                onChange={(e) => {
                  const value = e.target.value;
                  setVotosNocheId(value);
                  if (value) loadVotos(value);
                }}
              >
                <option value="">Seleccionar noche...</option>
                {noches.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
            {votosStatus.loading && (
              <div className="notice">Cargando estado de votación...</div>
            )}
            {!votosStatus.loading && votosStatus.error && (
              <div className="notice">Error: {votosStatus.error}</div>
            )}
            {!votosStatus.loading && !votosStatus.error && votosNocheId && votos.length === 0 && (
              <div className="notice">Todavía no hay votos para esta noche.</div>
            )}
            {!votosNocheId && (
              <div className="notice">Seleccioná una noche para ver el cumplimiento.</div>
            )}
            {!votosStatus.loading && !votosStatus.error && votosNocheId && votos.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table className="admin-table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Jurado</th>
                      <th>Comparsa</th>
                      <th>Asignados</th>
                      <th>Votados</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {votos.map((v) => {
                      const confirmada = v.assigned > 0 && v.voted >= v.assigned;
                      const enProgreso = v.assigned > 0 && v.voted > 0 && !confirmada;
                      return (
                        <tr key={`${v.jurado_id}-${v.comparsa_id}`}>
                          <td>{v.jurado_name}</td>
                          <td>{v.position} · {v.comparsa_name}</td>
                          <td>{v.assigned}</td>
                          <td>{v.voted}</td>
                          <td>
                            {confirmada
                              ? "✓ Votó"
                              : enProgreso
                                ? `${v.voted}/${v.assigned}`
                                : "Pendiente"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ---- Noches ---- */}
          <NocheManager apiFetch={apiFetch} />

          {/* ---- Resultados ---- */}
          {noches.length >= 3 ? (
            <Resultados apiFetch={apiFetch} />
          ) : (
            <p className="notice" style={{ marginTop: 12 }}>
              La sección Resultados se habilitará cuando haya al menos tres noches cargadas.
            </p>
          )}

          {/* ---- Comparsas ---- */}
          <div className="admin-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Comparsas</h2>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowAddComparsa(!showAddComparsa)}
              >
                {showAddComparsa ? "Cancelar" : "+ Nueva"}
              </button>
            </div>

            {showAddComparsa && (
              <div className="admin-form">
                <div className="admin-field">
                  <label>Nombre</label>
                  <input
                    type="text"
                    value={newComparsa.name}
                    onChange={(e) => setNewComparsa({ ...newComparsa, name: e.target.value })}
                    placeholder="Nombre de la comparsa"
                  />
                </div>
                <div className="admin-field">
                  <label>Orden</label>
                  <input
                    type="number"
                    value={newComparsa.position}
                    onChange={(e) => setNewComparsa({ ...newComparsa, position: Number(e.target.value) })}
                    style={{ width: 70 }}
                  />
                </div>
                <div className="admin-field" style={{ flex: 1 }}>
                  <label>Colores</label>
                  <div className="admin-colors">
                    {newComparsa.colors.map((c, i) => (
                      <div
                        key={i}
                        className="admin-color-chip"
                        style={{ backgroundColor: c }}
                        title={c}
                        onClick={() => handleRemoveColor(setNewComparsa, newComparsa, i)}
                      />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <input
                      type="color"
                      value={colorInput}
                      onChange={(e) => setColorInput(e.target.value)}
                      style={{ width: 38, height: 34, padding: 2, cursor: "pointer" }}
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleAddColor(setNewComparsa, newComparsa)}
                    >
                      Agregar color
                    </button>
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleCreateComparsa}>
                  Crear
                </button>
              </div>
            )}

            <table className="admin-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nombre</th>
                  <th>Colores</th>
                  <th style={{ width: 100 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {comparsas.map((c) => (
                  <tr key={c.id}>
                    <td>{c.position}</td>
                    <td>
                      {editingComparsa?.id === c.id ? (
                        <input
                          type="text"
                          value={editingComparsa.name}
                          onChange={(e) => setEditingComparsa({ ...editingComparsa, name: e.target.value })}
                          style={{ width: "100%", minWidth: 120 }}
                        />
                      ) : (
                        c.name
                      )}
                    </td>
                    <td>
                      <div className="admin-colors">
                        {(Array.isArray(editingComparsa?.id === c.id ? editingComparsa.colors : c.colors)
                          ? editingComparsa?.id === c.id ? editingComparsa.colors : c.colors
                          : []).map((color, i) => (
                          <div
                            key={i}
                            className="admin-color-chip"
                            style={{ backgroundColor: color }}
                            title={editingComparsa?.id === c.id ? "Click para quitar" : color}
                            onClick={
                              editingComparsa?.id === c.id
                                ? () => handleRemoveColor(setEditingComparsa, editingComparsa, i)
                                : undefined
                            }
                          />
                        ))}
                      </div>
                      {editingComparsa?.id === c.id && (
                        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                          <input
                            type="color"
                            value={colorInput}
                            onChange={(e) => setColorInput(e.target.value)}
                            style={{ width: 38, height: 34, padding: 2, cursor: "pointer" }}
                          />
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleAddColor(setEditingComparsa, editingComparsa)}
                          >
                            Agregar color
                          </button>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="admin-actions">
                        {editingComparsa?.id === c.id ? (
                          <>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleUpdateComparsa(c.id)}
                            >
                              Guardar
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setEditingComparsa(null)}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setEditingComparsa({ ...c, id: c.id })}
                            >
                              Editar
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDeleteComparsa(c.id)}
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {comparsas.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>
                      No hay comparsas cargadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ---- Rubros ---- */}
          <div className="admin-section" style={{ marginTop: 36 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Rubros</h2>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowAddRubro(!showAddRubro)}
              >
                {showAddRubro ? "Cancelar" : "+ Nuevo"}
              </button>
            </div>

            {showAddRubro && (
              <div className="admin-form">
                <div className="admin-field" style={{ flex: 1 }}>
                  <label>Nombre</label>
                  <input
                    type="text"
                    value={newRubro.name}
                    onChange={(e) => setNewRubro({ ...newRubro, name: e.target.value })}
                    placeholder="Nombre del rubro"
                  />
                </div>
                <div className="admin-field">
                  <label>Nota mínima</label>
                  <input
                    type="number"
                    value={newRubro.min_score}
                    onChange={(e) => setNewRubro({ ...newRubro, min_score: Number(e.target.value) })}
                    style={{ width: 70 }}
                  />
                </div>
                <div className="admin-field">
                  <label>Nota máxima</label>
                  <input
                    type="number"
                    value={newRubro.max_score}
                    onChange={(e) => setNewRubro({ ...newRubro, max_score: Number(e.target.value) })}
                    style={{ width: 70 }}
                  />
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleCreateRubro}>
                  Crear
                </button>
              </div>
            )}

            <table className="admin-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Rango</th>
                  <th style={{ width: 100 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rubros.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {editingRubro?.id === r.id ? (
                        <input
                          type="text"
                          value={editingRubro.name}
                          onChange={(e) => setEditingRubro({ ...editingRubro, name: e.target.value })}
                          style={{ width: "100%", minWidth: 120 }}
                        />
                      ) : (
                        r.name
                      )}
                    </td>
                    <td>
                      {editingRubro?.id === r.id ? (
                        <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input
                            type="number"
                            value={editingRubro.min_score}
                            onChange={(e) => setEditingRubro({ ...editingRubro, min_score: Number(e.target.value) })}
                            style={{ width: 50 }}
                          />
                          —
                          <input
                            type="number"
                            value={editingRubro.max_score}
                            onChange={(e) => setEditingRubro({ ...editingRubro, max_score: Number(e.target.value) })}
                            style={{ width: 50 }}
                          />
                        </span>
                      ) : (
                        `${r.min_score} — ${r.max_score}`
                      )}
                    </td>
                    <td>
                      <div className="admin-actions">
                        {editingRubro?.id === r.id ? (
                          <>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleUpdateRubro(r.id)}
                            >
                              Guardar
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setEditingRubro(null)}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setEditingRubro({ ...r, id: r.id })}
                            >
                              Editar
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDeleteRubro(r.id)}
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {rubros.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>
                      No hay rubros cargados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ---- Usuarios y Roles ---- */}
          <div className="admin-section" id="usuarios" style={{ marginTop: 36 }}>
            <h2>Usuarios y Roles</h2>
            {usuarios.length === 0 ? (
              <p className="notice">No hay usuarios registrados.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="admin-table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Email</th>
                      <th>Rol</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name || "-"}</td>
                        <td>{u.email}</td>
                        <td>
                          {u.id !== session?.user?.id ? (
                            <select
                              value={u.role}
                              onChange={(e) => handleChangeRol(u.id, e.target.value)}
                              style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)" }}
                            >
                              <option value="jurado">Jurado</option>
                              <option value="comisario">Comisario</option>
                              <option value="escribano">Escribano</option>
                              <option value="admin">Admin</option>
                            </select>
                          ) : (
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: 8,
                                fontSize: 12,
                                fontWeight: 600,
                                background: "var(--surface-3)",
                              }}
                            >
                              {ROLE_LABELS[u.role] || u.role} (vos)
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 13, color: "var(--muted)" }}>
                          DNI: {u.dni || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ---- Infracciones ---- */}
          <div className="admin-section" id="infracciones" style={{ marginTop: 36 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>Infracciones del Reglamento</h2>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowAddInfraccion(!showAddInfraccion)}
              >
                {showAddInfraccion ? "Cancelar" : "+ Nueva"}
              </button>
            </div>
            <p className="screen-lede" style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
              Estas infracciones son las únicas que el comisario puede aplicar como sanciones.
            </p>

            {infraccionError && (
              <div className="notice" style={{ color: "var(--danger)" }}>{infraccionError}</div>
            )}

            {showAddInfraccion && (
              <div className="admin-form">
                <div className="admin-field">
                  <label>Código *</label>
                  <input
                    type="text"
                    value={newInfraccion.codigo}
                    onChange={(e) => setNewInfraccion({ ...newInfraccion, codigo: e.target.value })}
                    placeholder="Ej: REG-001"
                    required
                  />
                </div>
                <div className="admin-field" style={{ flex: 1 }}>
                  <label>Nombre *</label>
                  <input
                    type="text"
                    value={newInfraccion.nombre}
                    onChange={(e) => setNewInfraccion({ ...newInfraccion, nombre: e.target.value })}
                    placeholder="Ej: Salida fuera de horario"
                    required
                  />
                </div>
                <div className="admin-field">
                  <label>Descuento (pts)</label>
                  <input
                    type="number"
                    value={newInfraccion.puntos_descuento}
                    onChange={(e) => setNewInfraccion({ ...newInfraccion, puntos_descuento: Number(e.target.value) })}
                    style={{ width: 70 }}
                  />
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleCreateInfraccion}>
                  Crear
                </button>
              </div>
            )}

            <table className="admin-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Sanción</th>
                  <th>Descuento</th>
                  <th>Activa</th>
                  <th style={{ width: 120 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {infracciones.map((inf) => (
                  <tr key={inf.id}>
                    <td>
                      {editingInfraccion?.id === inf.id ? (
                        <input
                          type="text"
                          value={editingInfraccion.codigo}
                          onChange={(e) => setEditingInfraccion({ ...editingInfraccion, codigo: e.target.value })}
                          style={{ width: 80 }}
                        />
                      ) : (
                        inf.codigo
                      )}
                    </td>
                    <td>
                      {editingInfraccion?.id === inf.id ? (
                        <input
                          type="text"
                          value={editingInfraccion.nombre}
                          onChange={(e) => setEditingInfraccion({ ...editingInfraccion, nombre: e.target.value })}
                          style={{ width: "100%", minWidth: 120 }}
                        />
                      ) : (
                        inf.nombre
                      )}
                    </td>
                    <td>
                      {editingInfraccion?.id === inf.id ? (
                        <input
                          type="text"
                          value={editingInfraccion.sancion_default || ""}
                          onChange={(e) => setEditingInfraccion({ ...editingInfraccion, sancion_default: e.target.value })}
                          placeholder="Solución reglamentaria"
                        />
                      ) : (
                        inf.sancion_default || "-"
                      )}
                    </td>
                    <td>
                      {editingInfraccion?.id === inf.id ? (
                        <input
                          type="number"
                          value={editingInfraccion.puntos_descuento}
                          onChange={(e) => setEditingInfraccion({ ...editingInfraccion, puntos_descuento: Number(e.target.value) })}
                          style={{ width: 60 }}
                        />
                      ) : (
                        inf.puntos_descuento
                      )}
                    </td>
                    <td>
                      {editingInfraccion?.id === inf.id ? (
                        <input
                          type="checkbox"
                          checked={editingInfraccion.activa}
                          onChange={(e) => setEditingInfraccion({ ...editingInfraccion, activa: e.target.checked })}
                        />
                      ) : inf.activa ? (
                        <span style={{ color: "var(--success)" }}>✓</span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>✗</span>
                      )}
                    </td>
                    <td>
                      <div className="admin-actions">
                        {editingInfraccion?.id === inf.id ? (
                          <>
                            <button className="btn btn-primary btn-sm" onClick={() => handleUpdateInfraccion(inf.id)}>
                              Guardar
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingInfraccion(null)}>
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setEditingInfraccion({ ...inf, id: inf.id })}
                            >
                              Editar
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDeleteInfraccion(inf.id)}
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {infracciones.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>
                      No hay infracciones cargadas. Creá el catálogo reglamentario.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ---- Incidencias ---- */}
          <div className="admin-section" id="incidencias" style={{ marginTop: 36 }}>
            <h2>Incidencias de Comisarios</h2>
            {incidenciaError && (
              <div className="notice" style={{ color: "var(--danger)" }}>{incidenciaError}</div>
            )}
            {incidencias.length === 0 ? (
              <p className="notice">No hay incidencias registradas.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="admin-table" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Noche</th>
                      <th>Comparsa</th>
                      <th>Comisario</th>
                      <th>Tipo</th>
                      <th>Infracción</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidencias.map((inc) => (
                      <tr key={inc.id}>
                        <td>{inc.noche_name}</td>
                        <td>{inc.comparsa_name}</td>
                        <td>{inc.comisario_name}</td>
                        <td>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 600,
                              background: inc.tipo === "reglamentaria" ? "var(--warning-soft)" : "var(--surface-3)",
                            }}
                          >
                            {inc.tipo === "reglamentaria" ? "Regl." : "No regl."}
                          </span>
                        </td>
                        <td>{inc.infraccion_codigo ? `${inc.infraccion_codigo} - ${inc.infraccion_nombre}` : "-"}</td>
                        <td>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 600,
                              background:
                                inc.estado === "resuelta"
                                  ? "var(--success-soft)"
                                  : inc.estado === "rechazada"
                                    ? "var(--danger-soft)"
                                    : "var(--warning-soft)",
                            }}
                          >
                            {inc.estado}
                          </span>
                        </td>
                        <td>
                          <div className="admin-actions">
                            <select
                              value={inc.estado}
                              onChange={(e) => handleUpdateIncidenciaEstado(inc.id, e.target.value)}
                              style={{ padding: "4px 6px", borderRadius: 8, border: "1px solid var(--border)" }}
                            >
                              <option value="pendiente">Pendiente</option>
                              <option value="en_revision">En revisión</option>
                              <option value="resuelta">Resuelta</option>
                              <option value="rechazada">Rechazada</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ---- Actas ---- */}
          <div className="admin-section" id="actas" style={{ marginTop: 36 }}>
            <h2>Actas</h2>
            {actaError && (
              <div className="notice" style={{ color: "var(--danger)" }}>{actaError}</div>
            )}
            <div className="admin-form" style={{ marginBottom: 12 }}>
              <div className="admin-field">
                <label>Noche</label>
                <select
                  value={actaNocheId}
                  onChange={(e) => setActaNocheId(e.target.value)}
                  style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)" }}
                >
                  <option value="">Seleccionar noche...</option>
                  {noches.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>
              <div className="admin-field">
                <label>Tipo</label>
                <select
                  value={actaTipo}
                  onChange={(e) => setActaTipo(e.target.value)}
                  style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)" }}
                >
                  <option value="votacion">Votación</option>
                  <option value="incidencia">Incidencias</option>
                  <option value="general">General</option>
                </select>
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleCreateActa} style={{ alignSelf: "flex-end" }}>
                Generar Acta
              </button>
            </div>
            {actas.length > 0 ? (
              <table className="admin-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Noche</th>
                    <th>Tipo</th>
                    <th>Estado</th>
                    <th>Certificada por</th>
                  </tr>
                </thead>
                <tbody>
                  {actas.map((a) => (
                    <tr key={a.id}>
                      <td>{a.noche_name}</td>
                      <td>{a.tipo}</td>
                      <td>
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
                      <td>{a.certificada_por_name || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="notice">No hay actas generadas.</p>
            )}
          </div>

          {/* ---- Jurados ---- */}
          <JuradoManager apiFetch={apiFetch} comparsas={comparsas} rubros={rubros} />

          <div style={{ marginTop: 28 }}>
            <button className="btn btn-ghost" onClick={() => signOut().then(() => (window.location.href = "/login"))}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
