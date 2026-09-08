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

const TEST_PASSWORD = "Str0ngPass!";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const trackedIds = [];
const trackedNights = [];

async function promoteAdmin(email) {
  await pool.query('UPDATE "user" SET "isAdmin" = true WHERE email = $1', [email]);
}

// Crea una noche "activa": inicio hace 2 horas, publicada (=> estado efectivo abierta),
// con el jurado asignado y sus comparsas en orden. Los resultados se publican por separado.
async function createActiveNoche(adminCookies, { userId, comparsasIds }) {
  const inicio = new Date(Date.now() - 2 * 60 * 60 * 1000); // hace 2 horas
  const name = "Noche test " + Math.floor(Math.random() * 100000);

  const res = await request("POST", "/api/admin/noches", {
    name,
    fecha_hora_inicio: inicio.toISOString(),
  }, adminCookies);
  assert.equal(res.status, 201);
  const nocheId = res.body.id;
  trackedNights.push(nocheId);

  await request("PUT", `/api/admin/noches/${nocheId}/jurados`, {
    user_ids: [userId],
  }, adminCookies);

  await request("PUT", `/api/admin/noches/${nocheId}/orden`, {
    comparsa_ids: comparsasIds,
  }, adminCookies);

  const publ = await request("POST", `/api/admin/noches/${nocheId}/publicar`, null, adminCookies);
  assert.equal(publ.status, 200);

  return nocheId;
}

async function registerAdmin() {
  const email = generateEmail();
  await register(email, TEST_PASSWORD);
  await promoteAdmin(email);
  const loginRes = await login(email, TEST_PASSWORD);
  assert.equal(loginRes.status, 200);
  const me = await getMe(loginRes.cookies);
  trackedIds.push(me.body.user.id);
  return { email, cookies: loginRes.cookies };
}

async function getRubroIds(limit = 2) {
  const { rows } = await pool.query(`SELECT id FROM rubros ORDER BY id LIMIT $1`, [limit]);
  return rows.map((r) => r.id);
}

async function getAllRubroIds() {
  const { rows } = await pool.query(`SELECT id FROM rubros ORDER BY id`);
  return rows.map((r) => r.id);
}

async function getFirstComparsaId() {
  const { rows } = await pool.query(`SELECT id FROM comparsas ORDER BY "position" LIMIT 1`);
  assert.ok(rows.length > 0, "Se requiere al menos una comparsa");
  return rows[0].id;
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

async function createJurado() {
  const admin = await registerAdmin();
  const rubrosIds = await getRubroIds();
  const comparsaId = await getFirstComparsaId();
  const dni = String(30000000 + Math.floor(Math.random() * 900000));
  const email = generateEmail();

  const res = await request("POST", "/api/admin/jurados", {
    name: "Votante Test",
    email,
    dni,
    rubros_ids: rubrosIds,
  }, admin.cookies);
  assert.equal(res.status, 201);
  const juradoId = res.body.id;
  trackedIds.push(juradoId);

  const otp = await captureOtpDuring(async () => {
    const pin = await request("POST", "/api/login-pin/request", { email, dni });
    assert.equal(pin.status, 200);
  });
  assert.match(otp, /^\d{6}$/);

  const signIn = await request("POST", "/api/auth/sign-in/email-otp", { email, otp });
  assert.equal(signIn.status, 200);

  return {
    admin: { cookies: admin.cookies },
    juror: { id: juradoId, email, dni, cookies: signIn.cookies },
    rubrosIds,
    comparsaId,
    nocheId: null,
  };
}

// Crear jurado con una noche activa lista para votar
async function createJuradoConNoche() {
  const admin = await registerAdmin();
  const rubrosIds = await getRubroIds();
  const comparsasIds = [await getFirstComparsaId()];
  const dni = String(30000000 + Math.floor(Math.random() * 900000));
  const email = generateEmail();

  const res = await request("POST", "/api/admin/jurados", {
    name: "Votante Test",
    email,
    dni,
    rubros_ids: rubrosIds,
  }, admin.cookies);
  assert.equal(res.status, 201);
  const juradoId = res.body.id;
  trackedIds.push(juradoId);

  const otp = await captureOtpDuring(async () => {
    const pin = await request("POST", "/api/login-pin/request", { email, dni });
    assert.equal(pin.status, 200);
  });
  assert.match(otp, /^\d{6}$/);

  const signIn = await request("POST", "/api/auth/sign-in/email-otp", { email, otp });
  assert.equal(signIn.status, 200);

  const nocheId = await createActiveNoche(admin.cookies, {
    userId: juradoId,
    comparsasIds,
  });

  return {
    admin: { cookies: admin.cookies },
    juror: { id: juradoId, email, dni, cookies: signIn.cookies },
    rubrosIds,
    comparsaId: comparsasIds[0],
    nocheId,
  };
}

after(async () => {
  await pool.query("DELETE FROM calificacion WHERE noche_id = ANY($1::int[])", [trackedNights.length ? trackedNights : [0]]);
  await pool.query("DELETE FROM orden_comparsa WHERE noche_id = ANY($1::int[])", [trackedNights.length ? trackedNights : [0]]);
  await pool.query("DELETE FROM asignacion_jurado WHERE noche_id = ANY($1::int[])", [trackedNights.length ? trackedNights : [0]]);
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

describe("Planilla de votación del jurado", () => {
  it("rejects an unauthenticated planilla submit", async () => {
    const res = await request("POST", "/api/jurado/planilla", {
      comparsa_id: 1,
      puntajes: [{ rubro_id: 1, puntaje: 8 }],
    });
    assert.equal(res.status, 401);
  });

  it("rejects unauthenticated and non-admin /api/admin/votos", async () => {
    const unauth = await request("GET", "/api/admin/votos");
    assert.equal(unauth.status, 401);

    const email = generateEmail();
    await register(email, TEST_PASSWORD);
    const loginRes = await login(email, TEST_PASSWORD);
    const nonAdmin = await request("GET", "/api/admin/votos", null, loginRes.cookies);
    assert.equal(nonAdmin.status, 403);
  });

  it("rejects a planilla from a user without assigned rubros", async () => {
    const admin = await registerAdmin();
    const res = await request("POST", "/api/jurado/planilla", {
      comparsa_id: 1,
      puntajes: [{ rubro_id: 1, puntaje: 8 }],
    }, admin.cookies);
    assert.equal(res.status, 400);
  });

  it("registers a complete planilla and surfaces compliance without scores", async () => {
    const ctx = await createJuradoConNoche();
    const puntajes = ctx.rubrosIds.map((id, i) => ({
      rubro_id: id,
      puntaje: 6 + i,
    }));

    const res = await request("POST", "/api/jurado/planilla", {
      comparsa_id: ctx.comparsaId,
      noche_id: ctx.nocheId,
      puntajes,
    }, ctx.juror.cookies);
    assert.equal(res.status, 201);

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM calificacion
       WHERE account_id = $1 AND comparsa_id = $2 AND noche_id = $3`,
      [ctx.juror.id, ctx.comparsaId, ctx.nocheId]
    );
    assert.equal(rows[0].n, ctx.rubrosIds.length);

    const misVotos = await request("GET", `/api/jurado/mis-votos?noche_id=${ctx.nocheId}`, null, ctx.juror.cookies);
    assert.equal(misVotos.status, 200);
    assert.ok(misVotos.body.some((c) => c.id === ctx.comparsaId));

    const votos = await request("GET", `/api/admin/votos?noche_id=${ctx.nocheId}`, null, ctx.admin.cookies);
    assert.equal(votos.status, 200);
    const row = votos.body.find(
      (v) => v.jurado_id === ctx.juror.id && v.comparsa_id === ctx.comparsaId
    );
    assert.ok(row);
    assert.equal(row.assigned, ctx.rubrosIds.length);
    assert.equal(row.voted, ctx.rubrosIds.length);
    assert.ok(row.voted >= row.assigned);
    assert.ok(!JSON.stringify(votos.body).includes("puntaje"), "no debe exponer puntajes");
  });

  it("rejects a duplicate planilla with 409", async () => {
    const ctx = await createJuradoConNoche();
    const puntajes = ctx.rubrosIds.map((id) => ({ rubro_id: id, puntaje: 8 }));

    const first = await request("POST", "/api/jurado/planilla", {
      comparsa_id: ctx.comparsaId,
      noche_id: ctx.nocheId,
      puntajes,
    }, ctx.juror.cookies);
    assert.equal(first.status, 201);

    const second = await request("POST", "/api/jurado/planilla", {
      comparsa_id: ctx.comparsaId,
      noche_id: ctx.nocheId,
      puntajes,
    }, ctx.juror.cookies);
    assert.equal(second.status, 409);
  });

  it("rejects non-assigned rubros and out-of-range scores", async () => {
    const ctx = await createJuradoConNoche();
    const allRubros = await getAllRubroIds();
    const notAssigned = allRubros.find((id) => !ctx.rubrosIds.includes(id));
    assert.ok(notAssigned, "Se necesita al menos un rubro no asignado");

    const badRubro = await request("POST", "/api/jurado/planilla", {
      comparsa_id: ctx.comparsaId,
      noche_id: ctx.nocheId,
      puntajes: [{ rubro_id: notAssigned, puntaje: 8 }],
    }, ctx.juror.cookies);
    assert.equal(badRubro.status, 400);

    const outOfRange = await request("POST", "/api/jurado/planilla", {
      comparsa_id: ctx.comparsaId,
      noche_id: ctx.nocheId,
      puntajes: ctx.rubrosIds.map((id) => ({ rubro_id: id, puntaje: 1 })),
    }, ctx.juror.cookies);
    assert.equal(outOfRange.status, 400);
  });

  it("rejects an incomplete planilla (missing assigned rubros)", async () => {
    const ctx = await createJuradoConNoche();
    const partial = await request("POST", "/api/jurado/planilla", {
      comparsa_id: ctx.comparsaId,
      noche_id: ctx.nocheId,
      puntajes: [{ rubro_id: ctx.rubrosIds[0], puntaje: 8 }],
    }, ctx.juror.cookies);
    assert.equal(partial.status, 400);
  });

  it("rejects a planilla for a missing comparsa", async () => {
    const ctx = await createJuradoConNoche();
    const missing = await request("POST", "/api/jurado/planilla", {
      comparsa_id: 999999,
      noche_id: ctx.nocheId,
      puntajes: ctx.rubrosIds.map((id) => ({ rubro_id: id, puntaje: 8 })),
    }, ctx.juror.cookies);
    assert.equal(missing.status, 404);
  });

  it("mis-votos is empty before a planilla is confirmed", async () => {
    const ctx = await createJuradoConNoche();
    const misVotos = await request("GET", `/api/jurado/mis-votos?noche_id=${ctx.nocheId}`, null, ctx.juror.cookies);
    assert.equal(misVotos.status, 200);
    assert.ok(!misVotos.body.some((c) => c.id === ctx.comparsaId));
  });
});