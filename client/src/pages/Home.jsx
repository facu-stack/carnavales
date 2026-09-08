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

function parseIso(iso) {
  return iso ? new Date(iso) : null;
}

function formatFecha(iso) {
  const d = parseIso(iso);
  if (!d) return "";
  return d.toLocaleString("es-AR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mensajeEstado(noche, now) {
  const inicio = parseIso(noche.fecha_hora_inicio);
  const accesoInicio = parseIso(noche.acceso_inicio);
  const accesoFin = parseIso(noche.acceso_fin);
  const ahora = now || new Date();

  switch (noche.estado_efectivo) {
    case "finalizada":
      return { titulo: "Noche finalizada", detalle: "Ya no se pueden registrar votos." };
    case "abierta":
      return {
        titulo: "Votación abierta",
        detalle: `Podés votar hasta ${formatFecha(noche.acceso_fin)}.`,
        abierta: true,
      };
    case "publicada":
      if (inicio && ahora < inicio) {
        return {
          titulo: "La votación todavía no comienza",
          detalle: `El acceso se habilitará el ${formatFecha(noche.acceso_inicio)}.`,
        };
      }
      return {
        titulo: "Próximamente",
        detalle: `La votación se habilita el ${formatFecha(noche.acceso_inicio)}.`,
      };
    default:
      return {
        titulo: "En preparación",
        detalle: "La noche todavía está en borrador. Volvé más tarde.",
      };
  }
}

export default function Home() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  const [misNoches, setMisNoches] = useState([]);
  const [nocheSeleccionadaId, setNocheSeleccionadaId] = useState(null);
  const [noche, setNoche] = useState(null);

  const [comparsas, setComparsas] = useState([]);
  const [rubros, setRubros] = useState([]);
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
    async function loadNoches() {
      try {
        const list = await apiFetch("/api/jurado/mis-noches");
        if (cancelled) return;
        setMisNoches(list);
        setNocheSeleccionadaId((prev) => {
          if (list.some((n) => n.id === prev)) return prev;
          const abierta = list.find((n) => n.estado_efectivo === "abierta");
          return abierta ? abierta.id : (list[0]?.id ?? null);
        });
      } catch (err) {
        if (!cancelled) setDataError(err.message);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }
    if (session && !session.user.isAdmin) {
      loadNoches();
    } else {
      setDataLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!nocheSeleccionadaId) return;
    let cancelled = false;
    async function loadNoche() {
      try {
        const detalle = await apiFetch(`/api/jurado/noche/${nocheSeleccionadaId}`);
        const misVotos = await apiFetch(
          `/api/jurado/mis-votos?noche_id=${nocheSeleccionadaId}`
        );
        if (cancelled) return;
        setNoche(detalle);
        setComparsas(detalle.comparsas || []);
        setRubros(detalle.rubros || []);
        setConfirmed((prev) => {
          const ids = new Set([...prev, ...misVotos.map((v) => v.id)]);
          return [...ids];
        });
        if (detalle.comparsas?.length > 0) {
          setCurrentComparsaId((prev) => prev || detalle.comparsas[0].id);
        }
      } catch (err) {
        if (!cancelled) setDataError(err.message);
      }
    }
    loadNoche();
    return () => {
      cancelled = true;
    };
  }, [nocheSeleccionadaId]);

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
    async (comparsaId) => {
      const puntajes = rubros
        .map((r) => ({ rubro_id: r.id, puntaje: scores[comparsaId]?.[r.id] }))
        .filter((p) => p.puntaje != null);

      try {
        await apiFetch("/api/jurado/planilla", {
          method: "POST",
          body: JSON.stringify({
            comparsa_id: comparsaId,
            noche_id: nocheSeleccionadaId,
            puntajes,
          }),
        });
      } catch (err) {
        // 409: la planilla ya fue confirmada en otra sesión o dispositivo.
        if (err.status !== 409) throw err;
      }

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
    [comparsas, rubros, scores, nocheSeleccionadaId]
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

  if (misNoches.length === 0) {
    return (
      <div className="app">
        <Header onLogout={handleLogout} />
        <main className="stage">
          <div className="wrap">
            <h1 className="screen-title">
              {firstName ? `Bienvenido, ${firstName}` : "Bienvenido"}
            </h1>
            <div className="notice" style={{ marginTop: 18 }}>
              Aún no te asignaron a ninguna noche. Contactá al administrador.
            </div>
          </div>
        </main>
      </div>
    );
  }

  const estadoMsg = noche ? mensajeEstado(noche) : null;
  const antesDeVotar =
    !noche || noche.estado_efectivo !== "abierta" || comparsas.length === 0;

  if (view !== "home" && view !== "confirm" && view !== "thanks" && noche?.estado_efectivo !== "abierta") {
    // Si la ventana cambió mientras se votaba, volvemos al selector.
    setView("home");
  }

  if (view === "vote" && noche?.estado_efectivo === "abierta") {
    const currentComparsa =
      comparsas.find((c) => c.id === currentComparsaId) || comparsas[0];
    return (
      <div className="app">
        <Header onLogout={handleLogout} noche={noche} />
        <main className="stage">
          <ComparsaTabs
            comparsas={comparsas}
            rubrosByComparsa={rubros.length ? Object.fromEntries(comparsas.map((c) => [c.id, rubros])) : {}}
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
            rubros={rubros}
            scores={scores}
            onScoreChange={handleScoreChange}
            onContinue={handleContinueToConfirm}
            onBack={handleBackToHome}
          />
        </main>
      </div>
    );
  }

  if (view === "confirm" && noche?.estado_efectivo === "abierta") {
    const currentComparsa =
      comparsas.find((c) => c.id === currentComparsaId) || comparsas[0];
    return (
      <div className="app">
        <Header onLogout={handleLogout} noche={noche} />
        <main className="stage">
          <ConfirmScreen
            comparsa={currentComparsa}
            rubros={rubros}
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
        <Header onLogout={handleLogout} noche={noche} />
        <main className="stage">
          <ThanksScreen onBackToHome={handleBackToHome} />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Header onLogout={handleLogout} noche={noche} />
      <main className="stage">
        <div className="wrap">
          <h1 className="screen-title">
            {firstName ? `Bienvenido, ${firstName}` : "Bienvenido"}
          </h1>

          <div className="noche-selector">
            <p className="tabs-hint">Elegí una noche de votación:</p>
            <div className="noche-selector-options">
              {misNoches.map((n) => (
                <button
                  key={n.id}
                  className={`noche-pill ${n.id === nocheSeleccionadaId ? "active" : ""}`}
                  onClick={() => {
                    setNocheSeleccionadaId(n.id);
                    setView("home");
                  }}
                >
                  {n.name}
                  <span className="noche-pill-meta">
                    {formatFecha(n.fecha_hora_inicio)}
                  </span>
                  <span className="noche-pill-progress">
                    {n.comparsas_completadas}/{n.comparsas_total} comparsas
                  </span>
                </button>
              ))}
            </div>
          </div>

          {noche && (
            <>
              <div className="event-banner">
                <span className="bar"></span>
                <span>
                  <div className="noche">{noche.name}</div>
                  <div className="fecha">
                    {formatFecha(noche.fecha_hora_inicio)}
                    {" · "}
                    {mensajeEstado(noche).detalle}
                  </div>
                </span>
              </div>

              {estadoMsg && !estadoMsg.abierta && (
                <div className="notice" style={{ marginTop: 18 }}>
                  <strong>{estadoMsg.titulo}:</strong> {estadoMsg.detalle}
                </div>
              )}

              {estadoMsg?.abierta && (
                <p className="screen-lede">
                  Puntuá cada comparsa en tus rubros. Tus notas se guardan automáticamente.
                </p>
              )}
            </>
          )}

          {noche?.estado_efectivo === "abierta" && comparsas.length > 0 && (
            <>
              <p className="tabs-hint">Elegí una comparsa para cargar su planilla:</p>
              <ComparsaTabs
                comparsas={comparsas}
                rubrosByComparsa={Object.fromEntries(comparsas.map((c) => [c.id, rubros]))}
                activeId={null}
                scores={scores}
                confirmed={confirmed}
                onSelect={(id) => {
                  setCurrentComparsaId(id);
                  setView("vote");
                }}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
