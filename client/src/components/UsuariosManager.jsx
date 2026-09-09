import { useState, useEffect, useCallback } from "react";

const ROLE_LABELS = {
  jurado: "Jurado",
  comisario: "Comisario",
  escribano: "Escribano",
  admin: "Admin",
};

export default function UsuariosManager({ apiFetch, rubros, currentUserId }) {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", dni: "", role: "jurado" });
  const [formRubros, setFormRubros] = useState([]);

  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [actionError, setActionError] = useState(null);

  const fetchUsuarios = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch("/api/admin/usuarios");
      setUsuarios(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  const resetForm = () => {
    setForm({ name: "", email: "", dni: "", role: "jurado" });
    setFormRubros([]);
    setEditingUser(null);
    setActionError(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (user) => {
    setEditingUser(user);
    setForm({
      name: user.name || "",
      email: user.email,
      dni: user.dni || "",
      role: user.role || "jurado",
    });
    setFormRubros((user.asignaciones || []).map((a) => a.rubro_id));
    setShowForm(true);
    setActionError(null);
  };

  const toggleRubro = (rubroId) => {
    setFormRubros((prev) =>
      prev.includes(rubroId)
        ? prev.filter((id) => id !== rubroId)
        : [...prev, rubroId]
    );
  };

  const handleChangeRol = async (userId, role) => {
    try {
      const updated = await apiFetch(`/api/admin/usuarios/${userId}/rol`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      setUsuarios((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setActionError(err.message);
    }
  };

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
      rubros_ids: formRubros,
      role: form.role,
    };

    try {
      if (editingUser) {
        const updated = await apiFetch(`/api/admin/jurados/${editingUser.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setUsuarios((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      } else {
        const created = await apiFetch("/api/admin/jurados", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setUsuarios((prev) => [created, ...prev]);
        if (created.emailSent) {
          window.alert("Usuario creado. Se envió el correo de bienvenida.");
        } else {
          window.alert(
            `Usuario creado, pero ${created.emailError || "no se pudo enviar el correo de bienvenida"}.` +
            " El usuario puede solicitar su PIN desde la pantalla de inicio de sesión."
          );
        }
      }
      setShowForm(false);
      resetForm();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`¿Eliminar el usuario "${user.name || user.email}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await apiFetch(`/api/admin/jurados/${user.id}`, { method: "DELETE" });
      setUsuarios((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleDeleteAll = async () => {
    try {
      const result = await apiFetch("/api/admin/jurados", { method: "DELETE" });
      setUsuarios((prev) => prev.filter((u) => u.id === currentUserId || u.role === "admin"));
      setShowDeleteAllConfirm(false);
      window.alert(result.deleted !== undefined
        ? `${result.deleted} usuario(s) eliminado(s).`
        : "Usuarios eliminados.");
    } catch (err) {
      setActionError(err.message);
      setShowDeleteAllConfirm(false);
    }
  };

  const asignacionesSummary = (user) => {
    if (!user.asignaciones || user.asignaciones.length === 0) {
      return <span style={{ color: "var(--muted)" }}>Sin asignaciones</span>;
    }
    return user.asignaciones
      .map((a) => a.rubro_name)
      .join(", ");
  };

  const isEditable = (user) => user.role !== "admin" && !user.isAdmin;

  return (
    <div className="admin-section" style={{ marginTop: 36 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ marginBottom: 0 }}>Usuarios y Roles</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm btn-danger" onClick={() => setShowDeleteAllConfirm(true)}>
            Eliminar todos los usuarios
          </button>
          <button className="btn btn-primary btn-sm" onClick={showForm ? () => setShowForm(false) : openCreate}>
            {showForm ? "Cancelar" : "+ Nuevo usuario"}
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
                placeholder="Nombre del usuario"
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
            <div className="admin-field">
              <label>Rol</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)", width: "100%" }}
              >
                <option value="jurado">Jurado</option>
                <option value="comisario">Comisario</option>
                <option value="escribano">Escribano</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", margin: "12px 0 8px" }}>
              Rubros asignados (se aplican a todas las comparsas)
            </p>
            {rubros.length === 0 ? (
              <div className="notice">No hay rubros cargados.</div>
            ) : (
              <div className="jurado-asig-grid">
                {rubros.map((r) => (
                  <label key={r.id} className="jurado-asig-item">
                    <input
                      type="checkbox"
                      checked={formRubros.includes(r.id)}
                      onChange={() => toggleRubro(r.id)}
                    />
                    <span>{r.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              {editingUser ? "Guardar cambios" : "Crear usuario"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="notice" style={{ marginTop: 12 }}>Cargando usuarios...</div>
      ) : error ? (
        <div className="notice" style={{ marginTop: 12 }}>{error}</div>
      ) : (
        <table className="admin-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>DNI</th>
              <th>Rol</th>
              <th>Asignaciones</th>
              <th style={{ width: 130 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.name || "—"}</td>
                <td>{u.email}</td>
                <td>{u.dni || "—"}</td>
                <td>
                  {u.id === currentUserId ? (
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        background: "var(--surface-3)",
                      }}
                    >
                      {ROLE_LABELS[u.role] || u.role || "Jurado"} (vos)
                    </span>
                  ) : (
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
                  )}
                </td>
                <td style={{ fontSize: 13 }}>{asignacionesSummary(u)}</td>
                <td>
                  {isEditable(u) ? (
                    <div className="admin-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>
                        Editar
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u)}>
                        Eliminar
                      </button>
                    </div>
                  ) : (
                    <span style={{ color: "var(--muted)", fontSize: 13 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>
                  No hay usuarios cargados.
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
              <h2 style={{ marginTop: 0 }}>Eliminar todos los usuarios</h2>
              <p>
                Esta acción <strong>eliminará definitivamente</strong> todos los usuarios
                no administradores (jurados, comisarios y escribanos), junto con sus asignaciones,
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