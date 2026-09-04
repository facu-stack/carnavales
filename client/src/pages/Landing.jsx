import { Link, useLocation } from "react-router-dom";

export default function Landing() {
  const location = useLocation();
  const modalState = { backgroundLocation: location };

  return (
    <main className="landing-page">
      <section className="landing-shell" aria-labelledby="landing-title">
        <div className="landing-copy">
          <p className="landing-eyebrow">CARNAVALES</p>
          <h1 id="landing-title">Jurado oficial de Carnavales</h1>
          <p>
            Evaluá las comparsas, asigná notas en cada rubro y confirmá tu
            planilla de votación de forma segura.
          </p>
        </div>

        <div className="landing-card">
          <p className="landing-card-label">Área de jurado</p>
          <h2>Comenzá aquí</h2>
          <p>Iniciá sesión para acceder al sistema de votación.</p>
          <div className="landing-actions">
            <Link className="button-link" to="/login" state={modalState}>
              Iniciar sesión
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
