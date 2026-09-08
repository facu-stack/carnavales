import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  register,
  login,
  getMe,
  generateEmail,
  request,
} from "./helpers.js";
import { limpiarNochesFinalizadas } from "../routes/noches.routes.js";

const TEST_PASSWORD = "Str0ngPass!";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const trackedIds = [];
const trackedNights = [];

async function promoteAdmin(email) {
  await pool.query('UPDATE "user" SET "isAdmin" = true WHERE email = $1', [email]);
}

async function registerAdmin() {
  const email = generateEmail();
  await register(email, TEST_PASSWORD);
  await promoteAdmin(email);
  const loginRes = await login(email, TEST_PASSWORD);
  assert.equal(loginRes.status, 200);
  const me = await getMe(loginRes.cookies);
  trackedIds.push(me.body.user.id);
  return { id: me.body.user.id, email, cookies: loginRes.cookies };
}

async function getFirstRubroId() {
  const { rows } = await pool.query(`SELECT id FROM rubros ORDER BY id LIMIT 1`);
  assert.ok(rows.length > 0, "Se requiere al menos un rubro");
  return rows[0].id;
}

async function getFirstComparsaId() {
  const { rows } = await pool.query(`SELECT id FROM comparsas ORDER BY "position" LIMIT 1`);
  assert.ok(rows.length > 0, "Se requiere al menos una comparsa");
  return rows[0].id;
}

async function createNoche(adminCookies, overrides = {}) {
  const inicio = overrides.inicio || new Date(Date.now() + 24 * 60 * 60 * 1000);
  const name = overrides.name || "Noche " + Math.floor(Math.random() * 100000);
  const res = await request("POST", "/api/admin/noches", {
    name,
    fecha_hora_inicio: inicio.toISOString(),
  }, adminCookies);
  return { res, id: res.body?.id, name };
}

function isoInHours(horas) {
  return new Date(Date.now() + horas * 60 * 60 * 1000).toISOString();
}

function captureOtpDuring(run) {
  let deliveredOtp = "";
  const originalConsoleLog = console.log;
  console.log = (...args) => {
    const message = args.map(String).join(" ");
    const match = message.match(/Código OTP[^:]*:\s*(\d{6})/);
    if (match) deliveredOtp = match[1];
    originalConsoleLog(...args);
  };

  return (async () => {
    try {
      await run();
    } finally {
      console.log = originalConsoleLog;
    }
    return deliveredOtp;
  })();
}

async function createJurado(adminCookies, overrides = {}) {
  const email = generateEmail();
  const dni = overrides.dni || String(30100000 + Math.floor(Math.random() * 900000));
  const res = await request("POST", "/api/admin/jurados", {
    name: "Jurado Noches",
    email,
    dni,
    rubros_ids: [await getFirstRubroId()],
  }, adminCookies);
  assert.equal(res.status, 201);
  trackedIds.push(res.body.id);

  const otp = await captureOtpDuring(async () => {
    const pin = await request("POST", "/api/login-pin/request", { email, dni });
    assert.equal(pin.status, 200);
  });
  assert.match(otp, /^\d{6}$/);
  const signIn = await request("POST", "/api/auth/sign-in/email-otp", { email, otp });
  assert.equal(signIn.status, 200);

  return { id: res.body.id, email, dni, cookies: signIn.cookies };
}

async function crearNochePublicada(admin, { userId, comparsaId, inicioHoras }) {
  const inicio = new Date(Date.now() + inicioHoras * 60 * 60 * 1000);
  const { id: nocheId } = await createNoche(admin.cookies, { inicio });
  trackedNights.push(nocheId);

  await request("PUT", `/api/admin/noches/${nocheId}/jurados`, { user_ids: [userId] }, admin.cookies);
  await request("PUT", `/api/admin/noches/${nocheId}/orden`, { comparsa_ids: [comparsaId] }, admin.cookies);
  const publ = await request("POST", `/api/admin/noches/${nocheId}/publicar`, null, admin.cookies);
  assert.equal(publ.status, 200);
  return nocheId;
}

// Crea una noche que comienza dentro de `horas` horas (para validar que la
// publicación no puede ser anterior a su finalización).
async function crearNocheFutura(admin, horas) {
  const inicio = new Date(Date.now() + horas * 60 * 60 * 1000);
  const { id: nocheId } = await createNoche(admin.cookies, { inicio });
  trackedNights.push(nocheId);
  return nocheId;
}

after(async () => {
  await pool.query("DELETE FROM calificacion WHERE noche_id = ANY($1::int[])", [trackedNights.length ? trackedNights : [0]]);
  await pool.query("DELETE FROM orden_comparsa WHERE noche_id = ANY($1::int[])", [trackedNights.length ? trackedNights : [0]]);
  await pool.query("DELETE FROM asignacion_jurado WHERE noche_id = ANY($1::int[])", [trackedNights.length ? trackedNights : [0]]);
  await pool.query("DELETE FROM auditoria WHERE entidad = 'noche' AND entidad_id = ANY($1::int[]::text[])", [trackedNights.length ? trackedNights : [0]]);
  await pool.query("DELETE FROM publicacion_resultados");
  for (const id of trackedIds) {
    await pool.query(`DELETE FROM calificacion WHERE account_id = $1`, [id]);
    await pool.query(`DELETE FROM session WHERE "userId" = $1`, [id]);
    await pool.query(`DELETE FROM account WHERE "userId" = $1`, [id]);
    await pool.query(`DELETE FROM jurado_rubros WHERE user_id = $1`, [id]);
    await pool.query(`DELETE FROM "user" WHERE id = $1`, [id]);
  }
  if (trackedNights.length) {
    await pool.query("DELETE FROM noches WHERE id = ANY($1::int[])", [trackedNights]);
  }
  await pool.end();
});

describe("Noches (admin CRUD y estados)", () => {
  it("debería requerir autenticación y admin para crear noches", async () => {
    const { cookies } = await registerAdmin();

    const anon = await request("POST", "/api/admin/noches", {
      name: "X",
      fecha_hora_inicio: isoInHours(24),
    });
    assert.equal(anon.status, 401);

    const { res } = await createNoche(cookies);
    assert.equal(res.status, 201);
    trackedNights.push(res.body.id);
  });

  it("debería crear una noche sin fecha de publicación de resultados", async () => {
    const { cookies } = await registerAdmin();
    const res = await request("POST", "/api/admin/noches", {
      name: "Noche sin publicacion",
      fecha_hora_inicio: isoInHours(24),
    }, cookies);
    assert.equal(res.status, 201);
    assert.equal(res.body.estado, "borrador");
    assert.equal(res.body.fecha_hora_publicacion_resultados, null);
    assert.equal(res.body.resultados_publicado, undefined);
  });

  it("debería listar las noches y exponer el estado efectivo", async () => {
    const admin = await registerAdmin();
    const { id: nocheId } = await createNoche(admin.cookies);
    trackedNights.push(nocheId);

    const list = await request("GET", "/api/admin/noches", null, admin.cookies);
    assert.equal(list.status, 200);
    const found = list.body.find((n) => n.id === nocheId);
    assert.ok(found, "La noche creada debería estar en el listado");
    assert.ok(["borrador", "publicada", "abierta", "finalizada"].includes(found.estado_efectivo));
  });

  it("no debería permitir crear una noche a un usuario no admin", async () => {
    const email = generateEmail();
    await register(email, TEST_PASSWORD);
    const loginRes = await login(email, TEST_PASSWORD);
    assert.equal(loginRes.status, 200);
    const res = await request("POST", "/api/admin/noches", {
      name: "Nope",
      fecha_hora_inicio: isoInHours(24),
    }, loginRes.cookies);
    assert.equal(res.status, 403);
  });
});

describe("Ventana y estado efectivo", () => {
  it("debería estar en borrador por defecto", async () => {
    const admin = await registerAdmin();
    const { res, id } = await createNoche(admin.cookies);
    trackedNights.push(id);
    assert.equal(res.status, 201);
    assert.equal(res.body.estado, "borrador");

    const list = await request("GET", "/api/admin/noches", null, admin.cookies);
    const found = list.body.find((n) => n.id === id);
    assert.equal(found.estado_efectivo, "borrador");
  });

  it("debería requerir jurados y comparsas asignados para publicar", async () => {
    const admin = await registerAdmin();
    const { res, id } = await createNoche(admin.cookies);
    trackedNights.push(id);

    const publ = await request("POST", `/api/admin/noches/${id}/publicar`, null, admin.cookies);
    assert.ok([400, 409].includes(publ.status));
  });

  it("debería impedir votar fuera de la ventana", async () => {
    const admin = await registerAdmin();
    const jurado = await createJurado(admin.cookies);
    const comparsaId = await getFirstComparsaId();

    // Noche aún no iniciada (empieza en 24h -> ventana comienza en 23h, no abierta).
    const nocheId = await crearNochePublicada(admin, {
      userId: jurado.id,
      comparsaId,
      inicioHoras: 24,
    });

    const rubroId = await getFirstRubroId();
    const planilla = await request("POST", "/api/jurado/planilla", {
      comparsa_id: comparsaId,
      noche_id: nocheId,
      puntajes: [{ rubro_id: rubroId, puntaje: 5 }],
    }, jurado.cookies);
    assert.equal(planilla.status, 400);
  });
});

describe("Resultados (publicación global)", () => {
  async function resetPublicacion() {
    await pool.query("DELETE FROM publicacion_resultados");
  }

  it("debería reportar que aún no se configuró la publicación", async () => {
    await resetPublicacion();
    const admin = await registerAdmin();
    const cfg = await request("GET", "/api/admin/resultados/publicacion", null, admin.cookies);
    assert.equal(cfg.status, 200);
    assert.equal(cfg.body.configurado, false);
    assert.equal(cfg.body.publicado, false);
  });

  it("debería rechazar una fecha anterior a la actual", async () => {
    await resetPublicacion();
    const admin = await registerAdmin();
    const pasado = new Date(Date.now() - 60 * 60 * 1000);
    const res = await request("POST", "/api/admin/resultados/publicacion", {
      fecha_hora: pasado.toISOString(),
    }, admin.cookies);
    assert.equal(res.status, 400);
  });

  it("debería rechazar una fecha anterior a la finalización de las noches", async () => {
    await resetPublicacion();
    const admin = await registerAdmin();
    await crearNocheFutura(admin, 10); // fin de votación ~ en 34h

    const antesFin = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const res = await request("POST", "/api/admin/resultados/publicacion", {
      fecha_hora: antesFin.toISOString(),
    }, admin.cookies);
    assert.equal(res.status, 400);
  });

  it("debería configurar la fecha de publicación y mantener los resultados ocultos", async () => {
    await resetPublicacion();
    const admin = await registerAdmin();
    const fechaFutura = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const res = await request("POST", "/api/admin/resultados/publicacion", {
      fecha_hora: fechaFutura.toISOString(),
    }, admin.cookies);
    assert.equal(res.status, 201);
    assert.equal(res.body.configurado, true);
    assert.equal(res.body.publicado, false);

    const oculto = await request("GET", "/api/admin/resultados", null, admin.cookies);
    assert.equal(oculto.status, 403);
  });

  it("no debería permitir cambiar la fecha una vez establecida", async () => {
    await resetPublicacion();
    const admin = await registerAdmin();
    const fechaFutura = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const primero = await request("POST", "/api/admin/resultados/publicacion", {
      fecha_hora: fechaFutura.toISOString(),
    }, admin.cookies);
    assert.equal(primero.status, 201);

    const segundo = await request("POST", "/api/admin/resultados/publicacion", {
      publicar_ahora: true,
    }, admin.cookies);
    assert.equal(segundo.status, 409);
  });

  it("debería exponer los resultados de todas las noches al llegar la fecha", async () => {
    await resetPublicacion();
    const admin = await registerAdmin();
    const fechaFutura = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const config = await request("POST", "/api/admin/resultados/publicacion", {
      fecha_hora: fechaFutura.toISOString(),
    }, admin.cookies);
    assert.equal(config.status, 201);

    // Simula que la fecha de publicación ya llegó (adelantar el reloj en la fila).
    await pool.query("UPDATE publicacion_resultados SET fecha_hora = now() - interval '1 hour' WHERE id = 1");

    const res = await request("GET", "/api/admin/resultados", null, admin.cookies);
    assert.equal(res.status, 200);
    assert.equal(res.body.publicacion.publicado, true);
    assert.ok(Array.isArray(res.body.resultados));
    res.body.resultados.forEach((n) => assert.ok(Array.isArray(n.resultados)));
  });

  it("debería rechazar configurar o consultar resultados a un usuario sin admin", async () => {
    await resetPublicacion();
    const email = generateEmail();
    await register(email, TEST_PASSWORD);
    const loginRes = await login(email, TEST_PASSWORD);
    const admin = await registerAdmin();

    const sinAuth = await request("GET", "/api/admin/resultados");
    assert.equal(sinAuth.status, 401);

    const sinAuthPost = await request("POST", "/api/admin/resultados/publicacion", {
      publicar_ahora: true,
    });
    assert.equal(sinAuthPost.status, 401);

    const nonAdminPost = await request("POST", "/api/admin/resultados/publicacion", {
      publicar_ahora: true,
    }, loginRes.cookies);
    assert.equal(nonAdminPost.status, 403);

    const nonAdminGet = await request("GET", "/api/admin/resultados", null, loginRes.cookies);
    assert.equal(nonAdminGet.status, 403);
  });
});

describe("asignación y orden", () => {
  it("debería asignar jurados y comparsas y guardar el orden", async () => {
    const admin = await registerAdmin();
    const jurado = await createJurado(admin.cookies);
    const comparsaId = await getFirstComparsaId();
    const { id: nocheId } = await createNoche(admin.cookies);
    trackedNights.push(nocheId);

    const asig = await request("PUT", `/api/admin/noches/${nocheId}/jurados`, { user_ids: [jurado.id] }, admin.cookies);
    assert.equal(asig.status, 200);

    const orden = await request("PUT", `/api/admin/noches/${nocheId}/orden`, { comparsa_ids: [comparsaId] }, admin.cookies);
    assert.equal(orden.status, 200);

    const jurados = await request("GET", `/api/admin/noches/${nocheId}/jurados`, null, admin.cookies);
    assert.equal(jurados.status, 200);
    assert.equal(jurados.body.length, 1);
    assert.equal(jurados.body[0].user_id, jurado.id);

    const ordenLeido = await request("GET", `/api/admin/noches/${nocheId}/orden`, null, admin.cookies);
    assert.equal(ordenLeido.status, 200);
    assert.equal(ordenLeido.body[0].comparsa_id, comparsaId);
  });

  it("un jurado no asignado no debería acceder al detalle de una noche", async () => {
    const admin = await registerAdmin();
    const jurado = await createJurado(admin.cookies);
    const { id: nocheId } = await createNoche(admin.cookies);
    trackedNights.push(nocheId);

    const detalle = await request("GET", `/api/jurado/noche/${nocheId}`, null, jurado.cookies);
    assert.equal(detalle.status, 403);
  });
});

describe("Eliminación de noches vencidas", () => {
  it("no debería permitir eliminar manualmente una noche cuya disponibilidad terminó", async () => {
    const admin = await registerAdmin();
    const hace48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const { id: nocheId } = await createNoche(admin.cookies, { inicio: hace48h });
    trackedNights.push(nocheId);

    const del = await request("DELETE", `/api/admin/noches/${nocheId}`, null, admin.cookies);
    assert.equal(del.status, 409);
  });

  it("debería permitir eliminar manualmente una noche activa", async () => {
    const admin = await registerAdmin();
    const { id: nocheId } = await createNoche(admin.cookies);
    trackedNights.push(nocheId);

    const del = await request("DELETE", `/api/admin/noches/${nocheId}`, null, admin.cookies);
    assert.equal(del.status, 200);

    const list = await request("GET", "/api/admin/noches", null, admin.cookies);
    assert.equal(list.body.find((n) => n.id === nocheId), undefined);
  });

  it("debería eliminar automáticamente las noches vencidas hace más de una semana", async () => {
    const admin = await registerAdmin();
    const haceDiezDias = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const { id: nocheId } = await createNoche(admin.cookies, { inicio: haceDiezDias });
    trackedNights.push(nocheId);

    const eliminadas = await limpiarNochesFinalizadas();
    assert.ok(eliminadas >= 1);

    const list = await request("GET", "/api/admin/noches", null, admin.cookies);
    assert.equal(list.body.find((n) => n.id === nocheId), undefined);
  });
});
