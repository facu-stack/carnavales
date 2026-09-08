import { useState, useCallback } from "react";

export default function ConfirmScreen({ comparsa, rubros, scores, onConfirm, onBack }) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const comparsaScores = scores[comparsa.id] || {};
  const colors = Array.isArray(comparsa.colors) && comparsa.colors.length ? comparsa.colors : ["#ffffff"];
  const primaryColor = colors[0];

  const handleConfirm = useCallback(async () => {
    setSyncing(true);
    setError("");
    try {
      await onConfirm(comparsa.id);
    } catch (err) {
      setSyncing(false);
      setError(err.message || "No se pudo confirmar la planilla.");
    }
  }, [comparsa.id, onConfirm]);

  if (syncing) {
    return (
      <div className="wrap center">
        <div className="confirm-card">
          <div className="sync-wrap">
            <span className="spinner"></span>
            <span className="sync-count">Sincronizando planilla</span>
          </div>
          <p style={{ marginTop: 14, textAlign: "center", color: "var(--muted)" }}>
            No cierres la aplicación.
            <br />
            Enviando votos…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ "--comparsa": primaryColor }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={onBack}
        style={{ width: "auto", marginBottom: 14 }}
      >
        ← Volver
      </button>
      <h1 className="screen-title">Confirmar planilla</h1>
      <div className="confirm-card">
        <p className="screen-lede" style={{ marginTop: 0 }}>
          Revisaste todos los rubros y las notas son correctas.
        </p>
        <div className="confirm-rows">
          <div className="confirm-row">
            <span className="k">Comparsa</span>
            <span className="v">
              {comparsa.position} · {comparsa.name}
            </span>
          </div>
          {rubros.map((rubro) => (
            <div key={rubro.id} className="confirm-row">
              <span className="k">{rubro.name}</span>
              <span className="v">{comparsaScores[rubro.id]}/10</span>
            </div>
          ))}
        </div>
        <div className="notice">Una vez confirmada, no podrás modificarla.</div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="foot-actions mt">
        <button className="btn btn-danger" onClick={onBack}>
          Cancelar
        </button>
        <button
          className="btn btn-primary btn-comparsa"
          style={{ background: primaryColor, borderColor: primaryColor }}
          onClick={handleConfirm}
        >
          Confirmar y bloquear
        </button>
      </div>
    </div>
  );
}