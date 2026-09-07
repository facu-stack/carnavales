import { useState, useCallback, useEffect } from "react";
import { useSession, signOut } from "../lib/auth-client";
import { useNavigate } from "react-router-dom";
import { resetOtpSent } from "./VerifyCode";
import { apiFetch } from "../lib/api";
import {
  loadVotingState,
  saveVotingState,
  clearVotingState,
} from "../lib/voting-storage";
import Header from "../components/Header";
import ComparsaTabs from "../components/ComparsaTabs";
import VotingScreen from "./VotingScreen";
import ConfirmScreen from "./ConfirmScreen";
import ThanksScreen from "./ThanksScreen";

export default function Home() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  const [comparsas, setComparsas] = useState([]);
  const [rubrosByComparsa, setRubrosByComparsa] = useState({});
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);

  const [view, setView] = useState("home");
  const [currentComparsaId, setCurrentComparsaId] = useState(null);
  const [scores, setScores] = useState(() => loadVotingState().scores);
  const [confirmed, setConfirmed] = useState(() => loadVotingState().confirmed);

  useEffect(() => {
    saveVotingState(scores, confirmed);
  }, [scores, confirmed]);

  useEffect(() => {
    if (session?.user?.isAdmin) {
      navigate("/admin", { replace: true });
    }
  }, [session, navigate]);

  useEffect(() => {
    let cancelled = false;
    async function loadAssigned() {
      try {
        const [assignedComparsas, assignedRubros] = await Promise.all([
          apiFetch("/api/jurado/mis-comparsas"),
          apiFetch("/api/jurado/mis-rubros"),
        ]);
        if (cancelled) return;
        const grouped = assignedRubros.reduce((acc, rubro) => {
          if (!acc[rubro.comparsa_id]) acc[rubro.comparsa_id] = [];
          acc[rubro.comparsa_id].push(rubro);
          return acc;
        }, {});
        setComparsas(assignedComparsas);
        setRubrosByComparsa(grouped);
        if (assignedComparsas.length > 0) {
          setCurrentComparsaId(assignedComparsas[0].id);
        }
      } catch (err) {
        if (!cancelled) setDataError(err.message);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }

    if (session && !session.user.isAdmin) {
      loadAssigned();
    } else {
      setDataLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut();
      resetOtpSent();
      clearVotingState();
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }, []);

  const handleScoreChange = useCallback((comparsaId, rubroId, value) => {
    setScores((prev) => {
      const comparsa = { ...(prev[comparsaId] || {}) };
      if (value === null) {
        delete comparsa[rubroId];
      } else {
        comparsa[rubroId] = value;
      }
      return { ...prev, [comparsaId]: comparsa };
    });
  }, []);

  const handleContinueToConfirm = useCallback(() => {
    setView("confirm");
  }, []);

  const handleConfirm = useCallback(
    (comparsaId) => {
      setConfirmed((prev) => {
        if (prev.includes(comparsaId)) return prev;
        return [...prev, comparsaId];
      });

      const nextIndex = comparsas.findIndex((c) => c.id === comparsaId) + 1;
      if (nextIndex < comparsas.length) {
        setCurrentComparsaId(comparsas[nextIndex].id);
        setView("vote");
      } else {
        setView("thanks");
      }
    },
    [comparsas]
  );

  const handleBackToHome = useCallback(() => {
    setView("home");
  }, []);

  if (isPending || dataLoading) {
    return <div className="container">Cargando...</div>;
  }

  const name = session?.user?.name || "";
  const firstName = name.split(" ")[0] || "";

  if (dataError) {
    return (
      <div className="app">
        <Header onLogout={handleLogout} />
        <main className="stage">
          <div className="wrap">
            <h1 className="screen-title">Bienvenido</h1>
            <div className="notice" style={{ marginTop: 18 }}>
              No se pudieron cargar tus asignaciones: {dataError}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (comparsas.length === 0) {
    return (
      <div className="app">
        <Header onLogout={handleLogout} />
        <main className="stage">
          <div className="wrap">
            <h1 className="screen-title">
              {firstName ? `Bienvenido, ${firstName}` : "Bienvenido"}
            </h1>
            <div className="notice" style={{ marginTop: 18 }}>
              Aún no tenés rubros asignados para votar. Contactá al administrador.
            </div>
          </div>
        </main>
      </div>
    );
  }

  const currentComparsa =
    comparsas.find((c) => c.id === currentComparsaId) || comparsas[0];
  const currentRubros = rubrosByComparsa[currentComparsa.id] || [];

  if (view === "vote") {
    return (
      <div className="app">
        <Header onLogout={handleLogout} />
        <main className="stage">
          <ComparsaTabs
            comparsas={comparsas}
            rubrosByComparsa={rubrosByComparsa}
            activeId={currentComparsa.id}
            scores={scores}
            confirmed={confirmed}
            onSelect={(id) => {
              setCurrentComparsaId(id);
              setView("vote");
            }}
          />
          <VotingScreen
            comparsa={currentComparsa}
            comparsaCount={comparsas.length}
            rubros={currentRubros}
            scores={scores}
            onScoreChange={handleScoreChange}
            onContinue={handleContinueToConfirm}
            onBack={handleBackToHome}
          />
        </main>
      </div>
    );
  }

  if (view === "confirm") {
    return (
      <div className="app">
        <Header onLogout={handleLogout} />
        <main className="stage">
          <ConfirmScreen
            comparsa={currentComparsa}
            rubros={currentRubros}
            scores={scores}
            onConfirm={handleConfirm}
            onBack={() => setView("vote")}
          />
        </main>
      </div>
    );
  }

  if (view === "thanks") {
    return (
      <div className="app">
        <Header onLogout={handleLogout} />
        <main className="stage">
          <ThanksScreen onBackToHome={handleBackToHome} />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Header onLogout={handleLogout} />
      <main className="stage">
        <div className="wrap">
          <h1 className="screen-title">
            {firstName ? `Bienvenido, ${firstName}` : "Bienvenido"}
          </h1>
          <p className="screen-lede">
            Puntuá cada comparsa asignada en todos tus rubros. Tus notas se
            guardan automáticamente.
          </p>

          <div className="event-banner">
            <span className="bar"></span>
            <span>
              <div className="noche">Noche 1</div>
              <div className="fecha">Enero 15</div>
            </span>
          </div>

          <p className="tabs-hint">Elegí una comparsa para cargar su planilla:</p>
          <ComparsaTabs
            comparsas={comparsas}
            rubrosByComparsa={rubrosByComparsa}
            activeId={null}
            scores={scores}
            confirmed={confirmed}
            onSelect={(id) => {
              setCurrentComparsaId(id);
              setView("vote");
            }}
          />
        </div>
      </main>
    </div>
  );
}