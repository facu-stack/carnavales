import { useState, useEffect, useCallback } from "react";

function groupAsignacionesByComparsa(asignaciones = []) {
  const grouped = {};
  for (const item of asignaciones) {
    grouped[item.comparsa_id] = item.rubros.map((r) => r.rubro_id);
  }
  return grouped;
}

export default function JuradoManager({ apiFetch, comparsas, rubros }) {
  const [jurados, setJurados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingJurado, setEditingJurado] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", dni: "" });
  const [formAsignaciones, setFormAsignaciones] = useState({});

  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [actionError, setActionError] = useState(null);

  const fetchJurados = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch("/api/admin/jurados");
      setJurados(data);
    } catch (err) {
      if (err.message && err.message.includes("Admin access required")) {
        setError("Solo los administradores pueden gestionar jurados.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchJurados();
  }, [fetchJurados]);

  const resetForm = () => {
    setForm({ name: "", email: "", dni: "" });
    setFormAsignaciones({});
    setEditingJurado(null);
    setActionError(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (jurado) => {
    setEditingJurado(jurado);
    setForm({
      name: jurado.name || "",
      email: jurado.email,
      dni: jurado.dni || "",
    });
    setFormAsignaciones(groupAsignacionesByComparsa(jurado.asignaciones));
    setShowForm(true);
    setActionError(null);
  };

  const toggleRubro = (comparsaId, rubroId) => {
    setFormAsignaciones((prev) => {
      const current = prev[comparsaId] || [];
      const next = current.includes(rubroId)
        ? current.filter((id) => id !== rubroId)
        : [...current, rubroId];
      return { ...prev, [comparsaId]: next };
    });
  };

  const asignacionesToPayload = () =>
    Object.entries(formAsignaciones)
      .map(([comparsaId, rubroIds]) => ({
        comparsa_id: Number(comparsaId),
        rubros_ids: rubroIds,
      }))
      .filter((a) => a.rubros_ids.length > 0);

  const handleSave = async () => {
    if (!form.dni.trim()) {
      setActionError("El DNI es obligatorio.");
      return;
    }
    if (!form.email.trim()) {
      setActionError("El email es obligatorio.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      dni: form.dni.trim(),
      asignaciones: asignacionesToPayload(),
    };

    try {
      if (editingJurado) {
        const updated = await apiFetch(`/api/admin/jurados/${editingJurado.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setJurados((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
      } else {
        const created = await apiFetch("/api/admin/jurados", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setJurados((prev) => [created, ...prev]);
        if (created.emailSent) {
          window.alert("Jurado creado. Se envió el correo con el PIN de acceso.");
        } else {
          window.alert(
            `Jurado creado, pero ${created.emailError || "no se pudo enviar el correo con el PIN"}.` +
            " El jurado puede solicitar un PIN nuevo desde la pantalla de inicio de sesión."
          );
        }
      }
      setShowForm(false);
      resetForm();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleDeleteJurado = async (jurado) => {
    if (!window.confirm(`¿Eliminar el jurado "${jurado.name || jurado.email}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await apiFetch(`/api/admin/jurados/${jurado.id}`, { method: "DELETE" });
      setJurados((prev) => prev.filter((j) => j.id !== jurado.id));
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleDeleteAll = async () => {
    try {
      const result = await apiFetch("/api/admin/jurados", { method: "DELETE" });
      setJurados([]);
      setShowDeleteAllConfirm(false);
      window.alert(result.deleted !== undefined
        ? `${result.deleted} jurado(s) eliminado(s).`
        : "Jurados eliminados.");
    } catch (err) {
      setActionError(err.message);
      setShowDeleteAllConfirm(false);
    }
  };

  const asignacionesSummary = (jurado) => {
    if (!jurado.asignaciones || jurado.asignaciones.length === 0) {
      return <span style={{ color: "var(--muted)" }}>Sin asignaciones</span>;
    }
    return jurado.asignaciones
      .map((a) => `${a.comparsa_name} (${a.rubros.length})`)
      .join(", ");
  };

  return (
    <div className="admin-section" style={{ marginTop: 36 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ marginBottom: 0 }}>Jurados</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm btn-danger" onClick={() => setShowDeleteAllConfirm(true)}>
            Eliminar todos los jurados
          </button>
          <button className="btn btn-primary btn-sm" onClick={showForm ? () => setShowForm(false) : openCreate}>
            {showForm ? "Cancelar" : "+ Nuevo jurado"}
          </button>
        </div>
      </div>

      {actionError && (
        <div className="notice" style={{ marginTop: 12 }}>
          Error: {actionError}
        </div>
      )}

      {showForm && (
        <div className="admin-form" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <div className="admin-field" style={{ flex: 1, minWidth: 160 }}>
              <label>Nombre</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nombre del jurado"
              />
            </div>
            <div className="admin-field" style={{ flex: 1, minWidth: 200 }}>
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="correo@ejemplo.com"
              />
            </div>
            <div className="admin-field">
              <label>DNI (obligatorio)</label>
              <input
                type="text"
                value={form.dni}
                onChange={(e) => setForm({ ...form, dni: e.target.value })}
                placeholder="Sin puntos ni espacios"
                inputMode="numeric"
              />
            </div>
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "12px 0 8px" }}>
              Rubros asignados por comparsa
            </p>
            {comparsas.length === 0 ? (
              <div className="notice">No hay comparsas cargadas.</div>
            ) : (
              <div className="jurado-asig-grid">
                {comparsas.map((c) => {
                  const comparsaRubros = rubros.filter((r) => r.comparsa_id === c.id);
                  return (
                    <div key={c.id} className="jurado-asig-card">
                      <div className="jurado-asig-title">{c.name}</div>
                      {comparsaRubros.length === 0 ? (
                        <div style={{ color: "var(--muted)", fontSize: 13 }}>Sin rubros</div>
                      ) : (
                        comparsaRubros.map((r) => (
                          <label key={r.id} className="jurado-asig-item">
                            <input
                              type="checkbox"
                              checked={(formAsignaciones[c.id] || []).includes(r.id)}
                              onChange={() => toggleRubro(c.id, r.id)}
                            />
                            <span>{r.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              {editingJurado ? "Guardar cambios" : "Crear jurado"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="notice" style={{ marginTop: 12 }}>Cargando jurados...</div>
      ) : error ? (
        <div className="notice" style={{ marginTop: 12 }}>{error}</div>
      ) : (
        <table className="admin-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>DNI</th>
              <th>Asignaciones</th>
              <th style={{ width: 130 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {jurados.map((j) => (
              <tr key={j.id}>
                <td>{j.name || "—"}</td>
                <td>{j.email}</td>
                <td>{j.dni || "—"}</td>
                <td style={{ fontSize: 13 }}>{asignacionesSummary(j)}</td>
                <td>
                  <div className="admin-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(j)}>
                      Editar
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteJurado(j)}>
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {jurados.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>
                  No hay jurados cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {showDeleteAllConfirm && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowDeleteAllConfirm(false)}>
          <section className="modal-panel" role="dialog" aria-modal="true" aria-label="Confirmar eliminación">
            <div className="modal-content" style={{ maxWidth: 420 }}>
              <h2 style={{ marginTop: 0 }}>Eliminar todos los jurados</h2>
              <p>
                Esta acción <strong>eliminará definitivamente</strong> todos los jurados
                (todos los usuarios que no son administradores), junto con sus asignaciones,
                sesiones y votos registrados. <strong>No se puede deshacer.</strong>
              </p>
              <p style={{ color: "var(--muted)", fontSize: 14 }}>
                Las cuentas de administrador nunca se eliminan.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowDeleteAllConfirm(false)}>
                  Cancelar
                </button>
                <button className="btn btn-danger btn-sm" onClick={handleDeleteAll}>
                  Sí, eliminar todos
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}