import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  register,
  login,
  generateEmail,
  request,
} from "./helpers.js";

const TEST_PASSWORD = "Str0ngPass!";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const createdUserIds = [];
const createdNocheIds = [];
const createdActaIds = [];
let testNocheId = null;

async function promoteAdmin(email) {
  await pool.query('UPDATE "user" SET "isAdmin" = true, role = $1::text WHERE email = $2', [
    "admin",
    email,
  ]);
}

async function registerAdmin() {
  const email = generateEmail();
  await register(email, TEST_PASSWORD);
  await promoteAdmin(email);
  const loginRes = await login(email, TEST_PASSWORD);
  assert.equal(loginRes.status, 200);
  return { email, cookies: loginRes.cookies };
}

async function registerUserWithRole(role) {
  const email = generateEmail();
  await register(email, TEST_PASSWORD);
  const loginRes = await login(email, TEST_PASSWORD);
  assert.equal(loginRes.status, 200);
  const { rows } = await pool.query('SELECT id FROM "user" WHERE email = $1', [email]);
  const userId = rows[0].id;
  createdUserIds.push(userId);
  await pool.query('UPDATE "user" SET role = $1::text WHERE id = $2', [role, userId]);
  return { email, userId, cookies: loginRes.cookies };
}

async function cleanupUser(userId) {
  if (!userId) return;
  await pool.query(`DELETE FROM session WHERE "userId" = $1`, [userId]);
  await pool.query(`DELETE FROM account WHERE "userId" = $1`, [userId]);
  await pool.query(`DELETE FROM jurado_rubros WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM "user" WHERE id = $1`, [userId]);
}

before(async () => {
  const { rows: noches } = await pool.query(
    `INSERT INTO noches (name, fecha_hora_inicio, estado)
     VALUES ('Noche Test Escribano', NOW() + INTERVAL '1 hour', 'publicada')
     RETURNING id`
  );
  testNocheId = noches[0].id;
  createdNocheIds.push(testNocheId);
});

after(async () => {
  for (const id of createdActaIds) {
    await pool.query(`DELETE FROM actas WHERE id = $1`, [id]);
  }
  for (const id of createdNocheIds) {
    await pool.query(`DELETE FROM noches WHERE id = $1`, [id]);
  }
  for (const id of createdUserIds) {
    await cleanupUser(id);
  }
  await pool.end();
});

describe("Escribano endpoints", () => {
  it("should require authentication", async () => {
    const noches = await request("GET", "/api/escribano/noches");
    assert.equal(noches.status, 401);

    const estado = await request("GET", `/api/escribano/noche/${testNocheId}/estado`);
    assert.equal(estado.status, 401);
  });

  it("should deny jurado and comisario read endpoints", async () => {
    const comisario = await registerUserWithRole("comisario");
    const jurado = await registerUserWithRole("jurado");

    for (const user of [comisario, jurado]) {
      const noches = await request("GET", "/api/escribano/noches", null, user.cookies);
      assert.equal(noches.status, 403);
    }
  });

  it("should list noches and noche estado for escribano without exposing scores", async () => {
    const escribano = await registerUserWithRole("escribano");

    const noches = await request("GET", "/api/escribano/noches", null, escribano.cookies);
    assert.equal(noches.status, 200);
    assert.ok(noches.body.some((n) => n.id === testNocheId));

    const estado = await request("GET", `/api/escribano/noche/${testNocheId}/estado`, null, escribano.cookies);
    assert.equal(estado.status, 200);
    assert.equal(estado.body.noche.id, testNocheId);
    assert.ok(Array.isArray(estado.body.jurados));

    const invalid = await request("GET", "/api/escribano/noche/abc/estado", null, escribano.cookies);
    assert.equal(invalid.status, 400);

    const missing = await request("GET", "/api/escribano/noche/999999/estado", null, escribano.cookies);
    assert.equal(missing.status, 404);
  });

  it("should list planilla estado without scores for escribano", async () => {
    const escribano = await registerUserWithRole("escribano");

    const all = await request("GET", "/api/escribano/planillas/estado", null, escribano.cookies);
    assert.equal(all.status, 200);
    assert.ok(Array.isArray(all.body));

    const filtered = await request(
      "GET",
      `/api/escribano/planillas/estado?noche_id=${testNocheId}`,
      null,
      escribano.cookies
    );
    assert.equal(filtered.status, 200);
    assert.ok(Array.isArray(filtered.body));
  });

  it("should list auditoria without scores for escribano", async () => {
    const escribano = await registerUserWithRole("escribano");

    const auditoria = await request("GET", "/api/escribano/auditoria?limit=10", null, escribano.cookies);
    assert.equal(auditoria.status, 200);
    assert.ok(Array.isArray(auditoria.body));
  });

  it("should let admin generate an acta in generada state", async () => {
    const admin = await registerAdmin();

    const created = await request("POST", "/api/admin/actas", {
      noche_id: testNocheId,
      tipo: "votacion",
      contenido: { detalle: "test" },
    }, admin.cookies);
    assert.equal(created.status, 201);
    createdActaIds.push(created.body.id);
    assert.equal(created.body.estado, "generada");

    const badTipo = await request("POST", "/api/admin/actas", {
      noche_id: testNocheId,
      tipo: "falsa",
    }, admin.cookies);
    assert.equal(badTipo.status, 400);

    const badNoche = await request("POST", "/api/admin/actas", {
      noche_id: 999999,
      tipo: "votacion",
    }, admin.cookies);
    assert.equal(badNoche.status, 404);
  });

  it("should list actas to escribano and certify a generada acta", async () => {
    const admin = await registerAdmin();
    const escribano = await registerUserWithRole("escribano");

    const created = await request("POST", "/api/admin/actas", {
      noche_id: testNocheId,
      tipo: "incidencia",
      contenido: {},
    }, admin.cookies);
    assert.equal(created.status, 201);
    createdActaIds.push(created.body.id);

    const actas = await request("GET", "/api/escribano/actas", null, escribano.cookies);
    assert.equal(actas.status, 200);
    assert.ok(actas.body.some((a) => a.id === created.body.id));

    const certified = await request(
      "POST",
      `/api/escribano/actas/${created.body.id}/certificar`,
      null,
      escribano.cookies
    );
    assert.equal(certified.status, 200);
    assert.equal(certified.body.estado, "certificada");

    const reCertify = await request(
      "POST",
      `/api/escribano/actas/${created.body.id}/certificar`,
      null,
      escribano.cookies
    );
    assert.equal(reCertify.status, 409);

    const adminView = await request("GET", "/api/admin/actas", null, admin.cookies);
    assert.equal(adminView.status, 200);
    const certifiedActa = adminView.body.find((a) => a.id === created.body.id);
    assert.equal(certifiedActa.estado, "certificada");
    assert.equal(certifiedActa.certificada_por, escribano.userId);
  });

  it("should deny escribano from certifying a missing acta", async () => {
    const escribano = await registerUserWithRole("escribano");

    const missing = await request("POST", "/api/escribano/actas/999999/certificar", null, escribano.cookies);
    assert.equal(missing.status, 404);
  });

  it("should deny admin from certifying (only escribano)", async () => {
    const admin = await registerAdmin();
    const escribano = await registerUserWithRole("escribano");

    const created = await request("POST", "/api/admin/actas", {
      noche_id: testNocheId,
      tipo: "general",
      contenido: {},
    }, admin.cookies);
    assert.equal(created.status, 201);
    createdActaIds.push(created.body.id);

    const denied = await request(
      "POST",
      `/api/escribano/actas/${created.body.id}/certificar`,
      null,
      admin.cookies
    );
    assert.equal(denied.status, 403);
  });
});