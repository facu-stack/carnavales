import { useState, useEffect, useCallback } from "react";
import OrdenComparsas from "./OrdenComparsas";

function formatFecha(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("es-AR", {
    day: "numeric", month: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

const ESTADOS = {
  borrador: { label: "Borrador", className: "status-borrador" },
  publicada: { label: "Publicada", className: "status-publicada" },
  abierta: { label: "Abierta", className: "status-abierta" },
  finalizada: { label: "Finalizada", className: "status-finalizada" },
};

export default function NocheManager({ apiFetch }) {
  const [noches, setNoches] = useState([]);
  const [jurados, setJurados] = useState([]);
  const [comparsas, setComparsas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingNoche, setEditingNoche] = useState(null);
  const [form, setForm] = useState({
    name: "",
    fecha_hora_inicio: "",
  });

  const [selectedNoche, setSelectedNoche] = useState(null);
  const [selectedJurados, setSelectedJurados] = useState([]);
  const [selectedComparsas, setSelectedComparsas] = useState([]);
  const [ordenComparsas, setOrdenComparsas] = useState([]);
  const [showOrdenEditor, setShowOrdenEditor] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [publishing, setPublishing] = useState(false);

  const fetchNoches = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [n, j, c] = await Promise.all([
        apiFetch("/api/admin/noches"),
        apiFetch("/api/admin/jurados"),
        apiFetch("/api/admin/comparsas"),
      ]);
      setNoches(n);
      setJurados(j.filter((u) => u.role === "jurado"));
      setComparsas(c);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchNoches();
  }, [fetchNoches]);

  const resetForm = () => {
    setForm({ name: "", fecha_hora_inicio: "" });
    setEditingNoche(null);
    setActionError(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
    setSelectedNoche(null);
  };

  const openEdit = (noche) => {
    setEditingNoche(noche);
    setForm({
      name: noche.name,
      fecha_hora_inicio: toLocalInputValue(noche.fecha_hora_inicio),
    });
    setShowForm(true);
    setSelectedNoche(noche);
    setActionError(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setActionError("El nombre es obligatorio.");
      return;
    }
    if (!form.fecha_hora_inicio) {
      setActionError("La fecha/hora de inicio es obligatoria.");
      return;
    }

    const inicio = new Date(form.fecha_hora_inicio);

    const payload = {
      name: form.name.trim(),
      fecha_hora_inicio: inicio.toISOString(),
    };

    try {
      if (editingNoche) {
        await apiFetch(`/api/admin/noches/${editingNoche.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        const created = await apiFetch("/api/admin/noches", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSelectedNoche(created);
      }
      setShowForm(false);
      resetForm();
      fetchNoches();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleDelete = async (noche) => {
    if (!window.confirm(`Eliminar la noche "${noche.name}"? Se eliminarán también sus votos.`)) {
      return;
    }
    try {
      await apiFetch(`/api/admin/noches/${noche.id}`, { method: "DELETE" });
      setNoches((prev) => prev.filter((n) => n.id !== noche.id));
      if (selectedNoche?.id === noche.id) setSelectedNoche(null);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handlePublish = async () => {
    if (!selectedNoche) return;
    setPublishing(true);
    setActionError(null);
    try {
      const result = await apiFetch(`/api/admin/noches/${selectedNoche.id}/publicar`, {
        method: "POST",
      });
      setShowReview(false);
      setSelectedNoche(null);
      fetchNoches();
      window.alert(`Noche publicada. Se notificó a ${result.juradosNotificados} jurado(s) por email.`);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  const toggleJurado = (userId) => {
    setSelectedJurados((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleComparsa = (comparsaId) => {
    setSelectedComparsas((prev) =>
      prev.includes(comparsaId)
        ? prev.filter((id) => id !== comparsaId)
        : [...prev, comparsaId]
    );
  };

  const handleOpenConfig = async (noche) => {
    setActionError(null);
    setSelectedNoche(noche);
    setShowOrdenEditor(false);
    // Cargar asignaciones actuales
    try {
      const [asigJurados, orden] = await Promise.all([
        apiFetch(`/api/admin/noches/${noche.id}/jurados`),
        apiFetch(`/api/admin/noches/${noche.id}/orden`),
      ]);
      setSelectedJurados(asigJurados.map((j) => j.user_id));
      setOrdenComparsas(orden.map((o) => ({
        id: o.comparsa_id,
        name: o.name,
        colors: o.colors,
        position: o.position,
      })));
      setSelectedComparsas(orden.map((o) => o.comparsa_id));
      setShowReview(false);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleSaveOrden = async (comparsaIds) => {
    if (!selectedNoche) return;
    try {
      await apiFetch(`/api/admin/noches/${selectedNoche.id}/orden`, {
        method: "PUT",
        body: JSON.stringify({ comparsa_ids: comparsaIds }),
      });
      // Actualizar estado local del orden
      fetchNoches();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleSaveAsignaciones = async (publish = false) => {
    if (!selectedNoche) return;
    setActionError(null);
    try {
      await apiFetch(`/api/admin/noches/${selectedNoche.id}/jurados`, {
        method: "PUT",
        body: JSON.stringify({ user_ids: selectedJurados }),
      });
      await apiFetch(`/api/admin/noches/${selectedNoche.id}/orden`, {
        method: "PUT",
        body: JSON.stringify({ comparsa_ids: selectedComparsas }),
      });
      if (publish) {
        setShowReview(true);
      } else {
        window.alert("Asignaciones guardadas correctamente.");
        fetchNoches();
      }
    } catch (err) {
      setActionError(err.message);
    }
  };

  const estadoInfo = (noche) => ESTADOS[noche.estado_efectivo] || ESTADOS[noche.estado] || ESTADOS.borrador;

  // Fin de la ventana de disponibilidad (inicio + 24h, igual que el backend).
  const vencida = (noche) =>
    new Date() > new Date(new Date(noche.fecha_hora_inicio).getTime() + 24 * 60 * 60 * 1000);

  return (
    <div className="admin-section" style={{ marginTop: 36 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ marginBottom: 0 }}>Noches</h2>
        <button className="btn btn-primary btn-sm" onClick={showForm ? () => setShowForm(false) : openCreate}>
          {showForm ? "Cancelar" : "+ Nueva noche"}
        </button>
      </div>

      {error && <div className="notice" style={{ marginTop: 12 }}>Error: {error}</div>}
      {actionError && <div className="notice" style={{ marginTop: 12 }}>Error: {actionError}</div>}

      {showForm && (
        <div className="admin-form" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <div className="admin-field" style={{ flex: 1, minWidth: 200 }}>
              <label>Nombre de la noche</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej: Noche 1"
              />
            </div>
            <div className="admin-field">
              <label>Inicio del carnaval</label>
              <input
                type="datetime-local"
                value={form.fecha_hora_inicio}
                onChange={(e) => setForm({ ...form, fecha_hora_inicio: e.target.value })}
              />
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            Acceso del jurado: 1 hora antes del inicio — Fin: 24 horas después del inicio (se calculan automáticamente).
            La publicación de resultados se gestiona por separado desde la sección "Resultados".
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              {editingNoche ? "Guardar cambios" : "Crear noche"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="notice" style={{ marginTop: 12 }}>Cargando noches...</div>
      ) : (
        <table className="admin-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Inicio</th>
              <th>Estado</th>
              <th>Jurados</th>
              <th>Comparsas</th>
              <th style={{ width: 190 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {noches.map((n) => {
              const est = estadoInfo(n);
              return (
                <tr key={n.id}>
                  <td style={{ fontWeight: 600 }}>{n.name}</td>
                  <td style={{ fontSize: 13 }}>{formatFecha(n.fecha_hora_inicio)}</td>
                  <td><span className={`status-badge ${est.className}`}>{est.label}</span></td>
                  <td>{n.jurados_count}</td>
                  <td>{n.comparsas_count}</td>
                  <td>
                    <div className="admin-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(n)}>Editar</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleOpenConfig(n)}>Configurar</button>
                      {vencida(n) ? (
                        <span
                          className="btn btn-ghost btn-sm"
                          style={{ opacity: 0.55, cursor: "not-allowed", pointerEvents: "none" }}
                          title="La noche finalizó y no puede eliminarse; se eliminará sola la próxima semana."
                        >
                          Auto-eliminación
                        </span>
                      ) : (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(n)}>Eliminar</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {noches.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>
                  No hay noches cargadas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {selectedNoche && !showReview && (
        <div className="admin-form" style={{ flexDirection: "column", alignItems: "stretch", marginTop: 20 }}>
          <h3 style={{ margin: "0 0 12px" }}>
            Configurar noche: {selectedNoche.name}
          </h3>

          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "8px 0" }}>
            Jurados asignados
          </p>
          {jurados.length === 0 ? (
            <div className="notice">No hay jurados para asignar. Creá jurados primero.</div>
          ) : (
            <div className="jurado-asig-grid">
              {jurados.map((j) => (
                <label key={j.id} className="jurado-asig-item">
                  <input
                    type="checkbox"
                    checked={selectedJurados.includes(j.id)}
                    onChange={() => toggleJurado(j.id)}
                  />
                  <span>{j.name || j.email}</span>
                </label>
              ))}
            </div>
          )}

          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "14px 0 8px" }}>
            Comparsas que participan (el orden se configura por separado)
          </p>
          {comparsas.length === 0 ? (
            <div className="notice">No hay comparsas para asignar. Creá comparsas primero.</div>
          ) : (
            <div className="jurado-asig-grid">
              {comparsas.map((c) => (
                <label key={c.id} className="jurado-asig-item">
                  <input
                    type="checkbox"
                    checked={selectedComparsas.includes(c.id)}
                    onChange={() => toggleComparsa(c.id)}
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowOrdenEditor((v) => !v)}
            >
              {showOrdenEditor ? "Ocultar orden de comparsas" : "Configurar orden de comparsas"}
            </button>
          </div>

          {showOrdenEditor && (
            <div style={{ marginTop: 14 }}>
              <OrdenComparsas
                comparsas={ordenComparsas.length
                  ? ordenComparsas
                  : comparsas.filter((c) => selectedComparsas.includes(c.id))}
                onSave={handleSaveOrden}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-sm" onClick={() => handleSaveAsignaciones(false)}>
              Guardar asignaciones
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleSaveAsignaciones(true)}>
              Guardar y revisar antes de publicar
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedNoche(null)}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {selectedNoche && showReview && (
        <div className="admin-form" style={{ flexDirection: "column", alignItems: "stretch", marginTop: 20 }}>
          <h3 style={{ margin: "0 0 16px" }}>Revisar noche antes de publicar</h3>
          <div className="confirm-card" style={{ marginTop: 0 }}>
            <div className="confirm-row">
              <span className="k">Noche</span>
              <span className="v">{selectedNoche.name}</span>
            </div>
            <div className="confirm-row">
              <span className="k">Inicio</span>
              <span className="v">{formatFecha(selectedNoche.fecha_hora_inicio)}</span>
            </div>
            <div className="confirm-row">
              <span className="k">Jurados</span>
              <span className="v">{selectedJurados.length}</span>
            </div>
            <div className="confirm-row">
              <span className="k">Comparsas</span>
              <span className="v">{selectedComparsas.length}</span>
            </div>
            <div className="notice">
              Al publicar, se enviará una notificación por email a los {selectedJurados.length} jurados asignados.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={handlePublish} disabled={publishing}>
              {publishing ? "Publicando..." : "Publicar noche"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowReview(false)} disabled={publishing}>
              Volver
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
