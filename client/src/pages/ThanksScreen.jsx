export default function ThanksScreen({ onBackToHome }) {
  return (
    <div className="wrap center">
      <div className="hero-timer" style={{ borderColor: "var(--primary)" }}>
        <span className="label">Votación registrada</span>
        <span className="time" style={{ fontSize: 40 }}>¡Gracias!</span>
        <span className="sub">Muchas gracias por participar.</span>
      </div>
      <button className="btn btn-primary mt" onClick={onBackToHome}>
        Volver al inicio
      </button>
    </div>
  );
}
