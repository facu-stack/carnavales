import { useEffect, useState } from "react";

const INITIAL_SECONDS = 23 * 3600 + 38 * 60 + 17;

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Clock() {
  const [seconds, setSeconds] = useState(INITIAL_SECONDS);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="clock-pill" role="timer" aria-label="Tiempo restante de votación">
      <span className="clock-dot" aria-hidden="true"></span>
      <span className="clock-label">Tiempo restante</span>
      <span className="clock-value">{formatTime(seconds)}</span>
    </div>
  );
}