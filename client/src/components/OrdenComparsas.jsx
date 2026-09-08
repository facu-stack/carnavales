import { useState, useEffect } from "react";

// Reordena la lista moviendo el elemento en dragIndex a la posición de dropIndex.
function reorder(list, dragIndex, dropIndex) {
  const result = [...list];
  const [moved] = result.splice(dragIndex, 1);
  result.splice(dropIndex, 0, moved);
  return result;
}

export default function OrdenComparsas({ comparsas, onSave, onPreview }) {
  const [items, setItems] = useState(comparsas || []);
  const [dragIndex, setDragIndex] = useState(null);
  const [preview, setPreview] = useState(false);

  // Re-sincroniza el estado local cuando cambian las comparsas externas
  // (p. ej. al abrir la configuración de otra noche).
  useEffect(() => {
    setItems(comparsas || []);
  }, [comparsas]);

  const sorted = (list) => list.map((c, i) => ({ ...c, position: i + 1 }));

  const handleDragStart = (e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex === null || dragIndex === index) return;
    setItems((prev) => {
      const next = reorder(prev, dragIndex, index);
      setDragIndex(index);
      return next;
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const handleRemove = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const ordered = sorted(items);
    const ids = ordered.map((c) => c.id);
    await onSave(ids);
    // Persistir posición local
    window.alert("Orden guardado correctamente.");
  };

  return (
    <div className="orden-comparsas">
      <div className="row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          Arrastrá las comparsas para establecer el orden de pasada.
        </p>
        <button className="btn btn-ghost btn-sm" onClick={() => setPreview((p) => !p)}>
          {preview ? "Ocultar vista previa" : "Vista previa"}
        </button>
      </div>

      {preview && (
        <div className="confirm-card" style={{ marginTop: 0, marginBottom: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 8 }}>
            Así verá el jurado el orden de votación
          </p>
          <ol style={{ paddingLeft: 20, color: "var(--fg)" }}>
            {items.map((c, i) => (
              <li key={c.id} style={{ marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
              </li>
            ))}
            {items.length === 0 && <li style={{ color: "var(--muted)" }}>Sin comparsas</li>}
          </ol>
        </div>
      )}

      <ul className="orden-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((c, i) => (
          <li
            key={c.id}
            className={`orden-item ${dragIndex === i ? "dragging" : ""}`}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          >
            <span className="orden-handle" aria-hidden="true">☰</span>
            <span className="orden-num">{i + 1}.</span>
            <span className="orden-name">
              <span className="orden-swatch" style={{ backgroundColor: c.colors?.[0] || "#fff" }} />
              {c.name}
            </span>
            <button
              className="btn btn-danger btn-sm"
              type="button"
              onClick={() => handleRemove(i)}
              aria-label={`Quitar ${c.name}`}
            >
              Quitar
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="notice" style={{ marginTop: 0 }}>No hay comparsas en esta noche.</li>
        )}
      </ul>

      {items.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            Guardar orden
          </button>
        </div>
      )}
    </div>
  );
}
