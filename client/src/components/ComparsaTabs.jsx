import { COMPARSAS, PALETAS, RUBROS } from "../lib/voting-data";

function luminance(hex) {
  const value = hex.replace("#", "");
  const channel = (start) => {
    const c = parseInt(value.slice(start, start + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a, b) {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

function solidColors(colors) {
  const bg = colors[0];
  const secondary = colors.slice(1);
  let text;
  if (secondary.length) {
    text = secondary[0];
    let bestScore = contrast(bg, text);
    for (const c of secondary.slice(1)) {
      const score = contrast(bg, c);
      if (score > bestScore) {
        text = c;
        bestScore = score;
      }
    }
  } else {
    text = luminance(bg) > 0.5 ? "#1a1a1a" : "#ffffff";
  }
  return { bg, text };
}

export default function ComparsaTabs({ activeIndex, scores, confirmed, onSelect }) {
  return (
    <div className="comparsa-tabs" role="tablist" aria-label="Planillas por comparsa">
      {COMPARSAS.map((name, i) => {
        const colors = PALETAS[name] || ["#ffffff"];
        const { bg, text: textColor } = solidColors(colors);
        const isActive = activeIndex === i;
        const done = confirmed.includes(i);
        const filled = RUBROS.reduce((count, _, r) => count + (scores[i]?.[r] != null ? 1 : 0), 0);

        return (
          <button
            key={i}
            role="tab"
            aria-selected={isActive}
            className={`comparsa-tab ${isActive ? "active" : ""}`}
            onClick={() => onSelect(i)}
            style={
              isActive
                ? { backgroundColor: bg, borderColor: "transparent", color: textColor }
                : undefined
            }
          >
            <span className="comparsa-tab-num">{i + 1}</span>
            {isActive ? (
              <span className="comparsa-tab-name">{name}</span>
            ) : (
              <span
                className="comparsa-tab-name boxed"
                style={{ backgroundColor: bg, color: textColor }}
              >
                {name}
              </span>
            )}
            {done ? (
              <span className="comparsa-tab-badge done">✓</span>
            ) : filled > 0 ? (
              <span className="comparsa-tab-badge">{filled}/{RUBROS.length}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}