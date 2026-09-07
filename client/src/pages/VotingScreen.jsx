import { useCallback } from "react";

const SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function VotingScreen({
  comparsa,
  comparsaCount,
  rubros,
  scores,
  onScoreChange,
  onContinue,
  onBack,
}) {
  const comparsaScores = scores[comparsa.id] || {};
  const colors = Array.isArray(comparsa.colors) && comparsa.colors.length ? comparsa.colors : ["#ffffff"];
  const primaryColor = colors[0];

  const handleSelect = useCallback(
    (rubroId, value) => {
      onScoreChange(comparsa.id, rubroId, value === "" ? null : Number(value));
    },
    [comparsa.id, onScoreChange]
  );

  const completedCount = rubros.filter((r) => comparsaScores[r.id] != null).length;
  const allComplete = rubros.length > 0 && completedCount === rubros.length;

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
        Comparsa {comparsa.position}: {comparsa.name}
      </h1>
      <p className="screen-lede">
        Asigná una nota de 1 a 10 en cada rubro ({completedCount}/{rubros.length} completados).
      </p>

      <div className="rubro-list">
        {rubros.map((rubro) => (
          <div key={rubro.id} className="rubro-card">
            <div className="rubro-name">{rubro.name}</div>
            <select
              className={`score-select ${comparsaScores[rubro.id] != null ? "selected" : ""}`}
              value={comparsaScores[rubro.id] ?? ""}
              onChange={(e) => handleSelect(rubro.id, e.target.value)}
              aria-label={`Nota para ${rubro.name}`}
            >
              <option value="" disabled>
                Seleccionar nota
              </option>
              {SCORE_OPTIONS.map((n) => (
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