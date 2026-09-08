// Generación de exportaciones de resultados sin dependencias externas.
// - PDF: usa window.print() (el navegador permite "Guardar como PDF").
// - JPG/PNG: dibuja el ranking sobre un canvas y descarga la imagen.

function colorFondo(nocheColor) {
  return nocheColor || "#7b1418";
}

function calcularTamanio(resultados) {
  const anchoBase = 1400;
  const filaBase = 96;
  const header = 360;
  const alto = header + resultados.length * filaBase + 120;
  return { width: anchoBase, height: Math.max(alto, 700) };
}

function redondearRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const POSICION = ["1°", "2°", "3°", "4°", "5°", "6°", "7°", "8°", "9°", "10°"];
const MEDALLAS = ["🥇", "🥈", "🥉"];

function dibujarRanking(ctx, { noche, fechaPublicacion, resultados, colorPrincipal }) {
  const { width, height } = calcularTamanio(resultados);

  // Fondo
  ctx.fillStyle = colorFondo(colorPrincipal);
  ctx.fillRect(0, 0, width, height);

  // Sobre-fondo decorativo
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 40; i++) {
    const x = (i * 137) % width;
    const y = (i * 97) % height;
    ctx.beginPath();
    ctx.arc(x, y, 6 + (i % 4) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Título
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "700 64px Georgia, 'Times New Roman', serif";
  ctx.fillText("Resultados del Carnaval", width / 2, 110);

  ctx.font = "400 34px Georgia, serif";
  ctx.fillText(noche || "", width / 2, 168);

  if (fechaPublicacion) {
    ctx.font = "400 24px Arial, sans-serif";
    ctx.globalAlpha = 0.85;
    ctx.fillText(`Publicado: ${fechaPublicacion}`, width / 2, 212);
    ctx.globalAlpha = 1;
  }

  // Encabezado de tabla
  const inicioX = 80;
  const finX = width - 80;
  ctx.font = "600 28px Arial, sans-serif";
  ctx.fillText("Puesto", inicioX + 120, 290);
  ctx.fillText("Comparsa", inicioX + 340, 290);
  ctx.fillText("Puntaje total", finX - 60, 290);

  // Línea divisoria
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(inicioX, 312);
  ctx.lineTo(finX, 312);
  ctx.stroke();

  const filaH = 96;
  let y = 360;
  resultados.forEach((r, i) => {
    const filaY = y;

    // Tarjeta de fondo
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    redondearRect(ctx, inicioX, filaY, finX - inicioX, filaH - 16, 16);
    ctx.fill();

    // Puesto (medalla si top 3)
    ctx.font = "700 44px Arial, sans-serif";
    ctx.textAlign = "center";
    const puesto = POSICION[i] || `${i + 1}°`;
    ctx.fillText(MEDALLAS[i] ? `${MEDALLAS[i]} ${puesto}` : puesto, inicioX + 120, filaY + 58);

    // Nombre de comparsa con su color
    const comparsaColor = Array.isArray(r.colors) && r.colors.length ? r.colors[0] : "#ffffff";
    if (r.position !== undefined) {
      ctx.font = "600 26px Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(`#${r.position}`, inicioX + 300, filaY + 40);
    }
    ctx.textAlign = "left";
    ctx.font = "700 40px Georgia, serif";
    ctx.fillStyle = comparsaColor;
    ctx.fillText(r.name, inicioX + 340, filaY + 62);

    // Puntaje
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 44px Arial, sans-serif";
    ctx.fillText(r.total !== undefined ? r.total.toFixed ? r.total.toFixed(2) : r.total : "—", finX - 60, filaY + 60);

    y += filaH;
  });
}

// Exporta los resultados como imagen JPG (o PNG si se pide). Devuelve un Promise.
export function exportarResultadosImagen({ noche, fechaPublicacion, resultados, colorPrincipal, formato = "image/jpeg" }) {
  return new Promise((resolve, reject) => {
    const { width, height } = calcularTamanio(resultados);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("No se pudo acceder al canvas"));
      return;
    }
    dibujarRanking(ctx, { noche, fechaPublicacion, resultados, colorPrincipal });

    const ext = formato === "image/png" ? "png" : "jpg";
    const url = canvas.toDataURL(formato, 0.95);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resultados-${(noche || "carnaval").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    resolve(url);
  });
}

// Abre la vista de impresión (el usuario elige "Guardar como PDF").
export function exportarResultadosPDF() {
  window.print();
}
