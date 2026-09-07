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
  const list = colors.length ? colors : ["#ffffff"];
  const bg = list[0];
  const secondary = list.slice(1);
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

export default function ComparsaTabs({ comparsas, rubrosByComparsa, activeId, scores, confirmed, onSelect }) {
  return (
    <div className="comparsa-tabs" role="tablist" aria-label="Planillas por comparsa">
      {comparsas.map((c, i) => {
        const colors = Array.isArray(c.colors) && c.colors.length ? c.colors : ["#ffffff"];
        const { bg, text: textColor } = solidColors(colors);
        const isActive = activeId === c.id;
        const done = confirmed.includes(c.id);
        const rubros = rubrosByComparsa[c.id] || [];
        const filled = rubros.filter((r) => scores[c.id]?.[r.id] != null).length;

        return (
          <button
            key={c.id}
            role="tab"
            aria-selected={isActive}
            className={`comparsa-tab ${isActive ? "active" : ""}`}
            onClick={() => onSelect(c.id)}
            style={
              isActive
                ? { backgroundColor: bg, borderColor: "transparent", color: textColor }
                : undefined
            }
          >
            <span className="comparsa-tab-num">{i + 1}</span>
            {isActive ? (
              <span className="comparsa-tab-name">{c.name}</span>
            ) : (
              <span
                className="comparsa-tab-name boxed"
                style={{ backgroundColor: bg, color: textColor }}
              >
                {c.name}
              </span>
            )}
            {done ? (
              <span className="comparsa-tab-badge done">✓</span>
            ) : filled > 0 ? (
              <span className="comparsa-tab-badge">{filled}/{rubros.length}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}