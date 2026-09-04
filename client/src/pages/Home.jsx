import { useState, useCallback, useEffect } from "react";
import { useSession, signOut } from "../lib/auth-client";
import { useNavigate } from "react-router-dom";
import { resetOtpSent } from "./VerifyCode";
import { COMPARSAS } from "../lib/voting-data";
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
  const [view, setView] = useState("home");
  const [currentComparsa, setCurrentComparsa] = useState(0);
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

  const handleScoreChange = useCallback((comparsaIdx, rubroIdx, value) => {
    setScores((prev) => {
      const comparsa = { ...(prev[comparsaIdx] || {}) };
      if (value === null) {
        delete comparsa[rubroIdx];
      } else {
        comparsa[rubroIdx] = value;
      }
      return { ...prev, [comparsaIdx]: comparsa };
    });
  }, []);

  const handleContinueToConfirm = useCallback(() => {
    setView("confirm");
  }, []);

  const handleConfirm = useCallback(
    (comparsaIdx) => {
      setConfirmed((prev) => {
        if (prev.includes(comparsaIdx)) return prev;
        return [...prev, comparsaIdx];
      });

      const next = comparsaIdx + 1;
      if (next < COMPARSAS.length) {
        setCurrentComparsa(next);
        setView("vote");
      } else {
        setView("home");
      }
    },
    []
  );

  const handleBackToHome = useCallback(() => {
    setView("home");
  }, []);

  const handleBackToVote = useCallback(() => {
    setView("vote");
  }, []);

  if (isPending) {
    return <div className="container">Cargando...</div>;
  }

  const name = session?.user?.name || "";
  const firstName = name.split(" ")[0] || "";

  if (view === "vote") {
    return (
      <div className="app">
        <Header onLogout={handleLogout} />
        <main className="stage">
          <ComparsaTabs
            activeIndex={currentComparsa}
            scores={scores}
            confirmed={confirmed}
            onSelect={(i) => setCurrentComparsa(i)}
          />
          <VotingScreen
            comparsaName={COMPARSAS[currentComparsa]}
            comparsaIndex={currentComparsa}
            comparsaCount={COMPARSAS.length}
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
            comparsaName={COMPARSAS[currentComparsa]}
            comparsaIndex={currentComparsa}
            scores={scores}
            onConfirm={handleConfirm}
            onBack={handleBackToVote}
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
            Puntuá cada comparsa en todos los rubros. Tus notas se guardan
            automáticamente.
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
            activeIndex={null}
            scores={scores}
            confirmed={confirmed}
            onSelect={(i) => {
              setCurrentComparsa(i);
              setView("vote");
            }}
          />
        </div>
      </main>
    </div>
  );
}
