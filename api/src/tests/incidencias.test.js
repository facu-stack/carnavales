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
const createdInfraccionIds = [];
const createdNocheIds = [];
let createdIncidenciaIds = [];
let createdControlIds = [];
let testNocheId = null;
let testComparsaId = null;

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
     VALUES ('Noche Test Incidencias', NOW() + INTERVAL '1 hour', 'publicada')
     RETURNING id`
  );
  testNocheId = noches[0].id;
  createdNocheIds.push(testNocheId);

  const { rows: comparsas } = await pool.query(
    `SELECT id FROM comparsas ORDER BY id LIMIT 1`
  );
  if (comparsas.length === 0) {
    const { rows: created } = await pool.query(
      `INSERT INTO comparsas (name, position)
       VALUES ('Comparsa Test', 999) RETURNING id`
    );
    testComparsaId = created[0].id;
  } else {
    testComparsaId = comparsas[0].id;
  }
});

after(async () => {
  for (const id of createdIncidenciaIds) {
    await pool.query(`DELETE FROM incidencias WHERE id = $1`, [id]);
  }
  for (const id of createdControlIds) {
    await pool.query(`DELETE FROM controles WHERE id = $1`, [id]);
  }
  for (const id of createdInfraccionIds) {
    await pool.query(`DELETE FROM infracciones WHERE id = $1`, [id]);
  }
  for (const id of createdNocheIds) {
    await pool.query(`DELETE FROM noches WHERE id = $1`, [id]);
  }
  for (const id of createdUserIds) {
    await cleanupUser(id);
  }
  await pool.end();
});

describe("Comisario incidencias y controles", () => {
  it("should require authentication and role", async () => {
    const noAuth = await request("POST", "/api/comisario/incidencias", {
      noche_id: testNocheId,
      comparsa_id: testComparsaId,
      tipo: "no_reglamentaria",
    });
    assert.equal(noAuth.status, 401);

    const jurado = await registerUserWithRole("jurado");
    const denied = await request("POST", "/api/comisario/incidencias", {
      noche_id: testNocheId,
      comparsa_id: testComparsaId,
      tipo: "no_reglamentaria",
    }, jurado.cookies);
    assert.equal(denied.status, 403);

    const escribano = await registerUserWithRole("escribano");
    const deniedEscribano = await request("POST", "/api/comisario/incidencias", {
      noche_id: testNocheId,
      comparsa_id: testComparsaId,
      tipo: "no_reglamentaria",
    }, escribano.cookies);
    assert.equal(deniedEscribano.status, 403);
  });

  it("should create a no-reglamentaria incidencia without sancion", async () => {
    const comisario = await registerUserWithRole("comisario");

    const res = await request("POST", "/api/comisario/incidencias", {
      noche_id: testNocheId,
      comparsa_id: testComparsaId,
      tipo: "no_reglamentaria",
      observaciones: "Sin sanción reglamentaria",
    }, comisario.cookies);
    assert.equal(res.status, 201);
    createdIncidenciaIds.push(res.body.id);
    assert.equal(res.body.estado, "pendiente");
    assert.equal(res.body.sancion_aplicada, null);
    assert.equal(res.body.comisario_id, comisario.userId);
  });

  it("should create a reglamentaria incidencia applying the catalog sancion", async () => {
    const admin = await registerAdmin();

    const created = await request("POST", "/api/admin/infracciones", {
      codigo: "REG-001",
      nombre: "Salida fuera de horario",
      descripcion: "La comparsa salió fuera del horario establecido",
      sancion_default: "Descuento de 5 puntos",
      puntos_descuento: 5,
    }, admin.cookies);
    assert.equal(created.status, 201);
    createdInfraccionIds.push(created.body.id);

    const comisario = await registerUserWithRole("comisario");
    const res = await request("POST", "/api/comisario/incidencias", {
      noche_id: testNocheId,
      comparsa_id: testComparsaId,
      tipo: "reglamentaria",
      infraccion_id: created.body.id,
      observaciones: "Se aplica la sanción del reglamento",
    }, comisario.cookies);
    assert.equal(res.status, 201);
    createdIncidenciaIds.push(res.body.id);

    assert.equal(res.body.infraccion_id, created.body.id);
    assert.ok(res.body.sancion_aplicada);
    assert.equal(res.body.sancion_aplicada.infraccion_codigo, "REG-001");
    assert.equal(res.body.sancion_aplicada.puntos_descuento, 5);
  });

  it("should reject a reglamentaria incidencia with an inactive/missing infraccion", async () => {
    const comisario = await registerUserWithRole("comisario");

    const missing = await request("POST", "/api/comisario/incidencias", {
      noche_id: testNocheId,
      comparsa_id: testComparsaId,
      tipo: "reglamentaria",
      infraccion_id: 999999,
    }, comisario.cookies);
    assert.equal(missing.status, 400);
  });

  it("should reject reglamentaria incidencia with a comisario-set sancion", async () => {
    const comisario = await registerUserWithRole("comisario");

    const res = await request("POST", "/api/comisario/incidencias", {
      noche_id: testNocheId,
      comparsa_id: testComparsaId,
      tipo: "reglamentaria",
      infraccion_id: 999999,
      sancion_aplicada: { puntos: 50 },
    }, comisario.cookies);
    assert.equal(res.status, 400);
  });

  it("should reject unknown noche or comparsa", async () => {
    const comisario = await registerUserWithRole("comisario");

    const badNoche = await request("POST", "/api/comisario/incidencias", {
      noche_id: 999999,
      comparsa_id: testComparsaId,
      tipo: "no_reglamentaria",
    }, comisario.cookies);
    assert.equal(badNoche.status, 404);

    const badComparsa = await request("POST", "/api/comisario/incidencias", {
      noche_id: testNocheId,
      comparsa_id: 999999,
      tipo: "no_reglamentaria",
    }, comisario.cookies);
    assert.equal(badComparsa.status, 404);
  });

  it("should list only own incidencias", async () => {
    const comisarioA = await registerUserWithRole("comisario");
    const comisarioB = await registerUserWithRole("comisario");

    const created = await request("POST", "/api/comisario/incidencias", {
      noche_id: testNocheId,
      comparsa_id: testComparsaId,
      tipo: "no_reglamentaria",
      observaciones: "Solo de A",
    }, comisarioA.cookies);
    assert.equal(created.status, 201);
    createdIncidenciaIds.push(created.body.id);

    const listA = await request("GET", "/api/comisario/incidencias", null, comisarioA.cookies);
    assert.equal(listA.status, 200);

    const listB = await request("GET", "/api/comisario/incidencias", null, comisarioB.cookies);
    assert.equal(listB.status, 200);
    assert.equal(listB.body.length, 0);
  });

  it("should create a control (horario)", async () => {
    const comisario = await registerUserWithRole("comisario");

    const res = await request("POST", "/api/comisario/controles", {
      noche_id: testNocheId,
      comparsa_id: testComparsaId,
      tipo: "horario",
      valor: "22:15",
      observaciones: "Salida puntual",
    }, comisario.cookies);
    assert.equal(res.status, 201);
    createdControlIds.push(res.body.id);
    assert.equal(res.body.comisario_id, comisario.userId);

    const admin = await registerAdmin();
    const adminView = await request("GET", "/api/admin/controles", null, admin.cookies);
    assert.equal(adminView.status, 200);
    assert.ok(adminView.body.length >= 1);
  });

  it("should let admin list and update incidencia estado but not change comisario data", async () => {
    const comisario = await registerUserWithRole("comisario");
    const created = await request("POST", "/api/comisario/incidencias", {
      noche_id: testNocheId,
      comparsa_id: testComparsaId,
      tipo: "no_reglamentaria",
    }, comisario.cookies);
    assert.equal(created.status, 201);
    createdIncidenciaIds.push(created.body.id);

    const admin = await registerAdmin();
    const list = await request("GET", "/api/admin/incidencias", null, admin.cookies);
    assert.equal(list.status, 200);
    assert.ok(list.body.some((i) => i.id === created.body.id));

    const updated = await request("PUT", `/api/admin/incidencias/${created.body.id}`, {
      estado: "en_revision",
    }, admin.cookies);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.estado, "en_revision");

    const invalid = await request("PUT", `/api/admin/incidencias/${created.body.id}`, {
      estado: "nada_que_ver",
    }, admin.cookies);
    assert.equal(invalid.status, 400);
  });

  it("should deny comisario updating admin incidencia endpoints", async () => {
    const comisario = await registerUserWithRole("comisario");

    const update = await request(
      "PUT",
      `/api/admin/incidencias/1`,
      { estado: "resuelta" },
      comisario.cookies
    );
    assert.equal(update.status, 403);

    const createInfraccion = await request("POST", "/api/admin/infracciones", {
      codigo: "REG-X2",
      nombre: "No permitida",
    }, comisario.cookies);
    assert.equal(createInfraccion.status, 403);
  });
});