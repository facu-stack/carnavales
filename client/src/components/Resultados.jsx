import { useState, useEffect, useCallback, useRef } from "react";
import { exportarResultadosImagen, exportarResultadosPDF } from "../lib/export";

function formatFecha(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-AR", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function posicion(i) {
  return ["1°", "2°", "3°", "4°", "5°", "6°", "7°", "8°", "9°", "10°"][i] || `${i + 1}°`;
}

export default function Resultados({ apiFetch }) {
  const [publicacion, setPublicacion] = useState(null);
  const [data, setData] = useState(null);
  const [scheduled, setScheduled] = useState("");
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const pollRef = useRef(null);

  const loadPublicacion = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/resultados/publicacion");
      setPublicacion(res);
      return res;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [apiFetch]);

  const loadResultados = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/resultados");
      setData(res);
    } catch (err) {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    let active = true;
    (async () => {
      const pub = await loadPublicacion();
      if (!active || !pub) return;
      if (pub.publicado) {
        await loadResultados();
      } else if (pub.configurado) {
        pollRef.current = setInterval(async () => {
          const now = await loadPublicacion();
          if (now && now.publicado) {
            clearInterval(pollRef.current);
            await loadResultados();
          }
        }, 30000);
      }
    })();
    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadPublicacion, loadResultados]);

  const programar = async () => {
    setPublishing(true);
    setMsg(null);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/resultados/publicacion", {
        method: "POST",
        body: JSON.stringify({ fecha_hora: new Date(scheduled).toISOString() }),
      });
      setScheduled("");
      setMsg(
        `Publicación programada para el ${formatFecha(res.fecha_hora)}. Ya no se puede cambiar.`
      );
      setPublicacion(res);
      if (res.publicado) await loadResultados();
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  const minDatetime = toLocalInputValue(new Date().toISOString());

  const renderTabla = (noche, resultados) => (
    <table className="admin-table" key={noche.id}>
      <thead>
        <tr>
          <th>Puesto</th>
          <th>Comparsa</th>
          <th>Puntaje</th>
          <th>Rubros</th>
        </tr>
      </thead>
      <tbody>
        {resultados.map((r, i) => (
          <tr key={r.comparsa_id}>
            <td style={{ fontWeight: 700 }}>{posicion(i)}</td>
            <td>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: r.colors?.[0] || "#fff",
                    border: "1px solid var(--border)",
                    display: "inline-block",
                  }}
                />
                {r.name}
              </span>
            </td>
            <td style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>{r.total?.toFixed ? r.total.toFixed(2) : r.total}</td>
            <td style={{ fontSize: 12, color: "var(--muted)" }}>
              {r.rubros?.map((s) => `${s.rubro}: ${s.promedio}`).join(" · ")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const exportar = (noche, resultados, formato) => {
    exportarResultadosImagen({
      noche: noche.name,
      fechaPublicacion: formatFecha(publicacion?.fecha_hora),
      resultados,
      colorPrincipal: "#7b1418",
      formato,
    });
  };

  return (
    <div className="admin-section resulta export-root">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ marginBottom: 0 }}>Resultados</h2>
      </div>

      <div className="admin-form" style={{ flexDirection: "column", alignItems: "stretch", marginTop: 12 }}>
        {publicacion && publicacion.configurado && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <strong>Publicación de resultados:</strong>
            <span className={publicacion.publicado ? "status-badge status-finalizada" : "status-badge status-borrador"}>
              {publicacion.publicado
                ? `Publicado`
                : `Programado para ${formatFecha(publicacion.fecha_hora)}`}
            </span>
          </div>
        )}

        {publicacion && !publicacion.configurado && (
          <>
            <p className="notice" style={{ marginBottom: 10 }}>
              Elegí cuándo publicar los resultados de todas las noches.
              <br />
              <strong>Una vez establecida la fecha no se puede cambiar.</strong> La fecha debe ser posterior a la
              fecha/hora actual y a la finalización de todas las noches ya establecidas.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div className="admin-field" style={{ marginBottom: 0 }}>
                <input
                  type="datetime-local"
                  value={scheduled}
                  min={minDatetime}
                  onChange={(e) => setScheduled(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary btn-sm"
                disabled={publishing || !scheduled}
                onClick={programar}
              >
                {publishing ? "Procesando..." : "Programar publicación"}
              </button>
            </div>
          </>
        )}

        {publicacion && publicacion.configurado && !publicacion.publicado && (
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "10px 0 0" }}>
            Al llegar la fecha programada aparecerá el cuadro con los resultados de todas las noches.
          </p>
        )}

        {msg && <div className="notice" style={{ marginTop: 10, marginBottom: 0 }}>{msg}</div>}
        {error && <div className="notice" style={{ marginTop: 10, marginBottom: 0 }}>{error}</div>}
      </div>

      {loading && <div className="notice" style={{ marginTop: 12 }}>Cargando resultados...</div>}

      {data && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          {data.resultados.length === 0 && (
            <div className="notice">No hay noches cargadas.</div>
          )}
          {data.resultados.map(({ noche, resultados }) => {
            if (!resultados?.length) {
              return (
                <div className="resultados-card" key={noche.id}>
                  <div className="resultados-header">
                    <h3>{noche.name} — Resultados</h3>
                    <p>{noche.name}: sin resultados cargados</p>
                  </div>
                </div>
              );
            }
            return (
              <div className="resultados-card" key={noche.id}>
                <div className="resultados-header">
                  <h3>{noche.name} — Resultados</h3>
                  <p>
                    {publicacion?.fecha_hora
                      ? `Publicado el ${formatFecha(publicacion.fecha_hora)}`
                      : "Resultados publicados"}
                  </p>
                </div>
                {renderTabla(noche, resultados)}
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => exportar(noche, resultados, "image/jpeg")}>Exportar JPG</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => exportar(noche, resultados, "image/png")}>Exportar PNG</button>
                  <button className="btn btn-primary btn-sm" onClick={exportarResultadosPDF}>Guardar PDF</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}