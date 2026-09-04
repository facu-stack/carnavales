import { useCallback } from "react";
import { RUBROS, PALETAS } from "../lib/voting-data";

export default function VotingScreen({
  comparsaName,
  comparsaIndex,
  comparsaCount,
  scores,
  onScoreChange,
  onContinue,
  onBack,
}) {
  const comparsaScores = scores[comparsaIndex] || {};
  const primaryColor = (PALETAS[comparsaName] || ["#ffffff"])[0];

  const handleSelect = useCallback(
    (rubroIndex, value) => {
      onScoreChange(comparsaIndex, rubroIndex, value === "" ? null : Number(value));
    },
    [comparsaIndex, onScoreChange]
  );

  const allComplete = RUBROS.every((_, i) => comparsaScores[i] != null);
  const completedCount = RUBROS.filter((_, i) => comparsaScores[i] != null).length;

  return (
    <div className="wrap" style={{ "--comparsa": primaryColor }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={onBack}
        style={{ width: "auto", marginBottom: 14 }}
      >
        ← Volver
      </button>
      <h1 className="screen-title">
        Comparsa {comparsaIndex + 1}: {comparsaName}
      </h1>
      <p className="screen-lede">
        Asigná una nota de 1 a 10 en cada rubro ({completedCount}/{RUBROS.length} completados).
      </p>

      <div className="rubro-list">
        {RUBROS.map((rubro, i) => (
          <div key={i} className="rubro-card">
            <div className="rubro-name">{rubro}</div>
            <select
              className={`score-select ${comparsaScores[i] != null ? "selected" : ""}`}
              value={comparsaScores[i] ?? ""}
              onChange={(e) => handleSelect(i, e.target.value)}
              aria-label={`Nota para ${rubro}`}
            >
              <option value="" disabled>
                Seleccionar nota
              </option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="sticky-foot">
        <div className="foot-actions">
          <button className="btn btn-danger" onClick={onBack}>
            Cancelar
          </button>
          <button
            className="btn btn-primary btn-comparsa"
            style={
              allComplete
                ? { background: primaryColor, borderColor: primaryColor }
                : undefined
            }
            onClick={onContinue}
            disabled={!allComplete}
            title={allComplete ? "Avanzar" : "Completá todos los rubros para continuar"}
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}
