import { useState, useCallback } from "react";
import { RUBROS, PALETAS } from "../lib/voting-data";

export default function ConfirmScreen({ comparsaName, comparsaIndex, scores, onConfirm, onBack }) {
  const [syncing, setSyncing] = useState(false);
  const comparsaScores = scores[comparsaIndex] || {};
  const primaryColor = (PALETAS[comparsaName] || ["#ffffff"])[0];

  const handleConfirm = useCallback(() => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      onConfirm(comparsaIndex);
    }, 1600);
  }, [comparsaIndex, onConfirm]);

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
              {comparsaIndex + 1} · {comparsaName}
            </span>
          </div>
          {RUBROS.map((rubro, r) => (
            <div key={r} className="confirm-row">
              <span className="k">{rubro}</span>
              <span className="v">{comparsaScores[r]}/10</span>
            </div>
          ))}
        </div>
        <div className="notice">Una vez confirmada, no podrás modificarla.</div>
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
