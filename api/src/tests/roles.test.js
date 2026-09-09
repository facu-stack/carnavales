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

const createdUserIds = [];

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

async function registerWithRole(role) {
  const email = generateEmail();
  await register(email, TEST_PASSWORD);
  const loginRes = await login(email, TEST_PASSWORD);
  assert.equal(loginRes.status, 200);
  const { rows } = await pool.query('SELECT id FROM "user" WHERE email = $1', [email]);
  createdUserIds.push(rows[0].id);
  return { email, userId: rows[0].id, cookies: loginRes.cookies };
}

async function setRole(userId, role) {
  await pool.query('UPDATE "user" SET role = $1::text, "isAdmin" = $2 WHERE id = $3', [
    role,
    role === "admin",
    userId,
  ]);
}

async function cleanupUser(userId) {
  if (!userId) return;
  await pool.query(`DELETE FROM session WHERE "userId" = $1`, [userId]);
  await pool.query(`DELETE FROM account WHERE "userId" = $1`, [userId]);
  await pool.query(`DELETE FROM jurado_rubros WHERE user_id = $1`, [userId]);
  await pool.query(`DELETE FROM "user" WHERE id = $1`, [userId]);
}

after(async () => {
  for (const id of createdUserIds) {
    await cleanupUser(id);
  }
  await pool.end();
});

describe("RBAC roles", () => {
  it("should default new registrations to role jurado", async () => {
    const email = generateEmail();
    await register(email, TEST_PASSWORD);
    const loginRes = await login(email, TEST_PASSWORD);
    assert.equal(loginRes.status, 200);

    const me = await getMe(loginRes.cookies);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.role, "jurado");
    assert.equal(me.body.user.isAdmin, false);

    const { rows: userRows } = await pool.query('SELECT id, role FROM "user" WHERE email = $1', [email]);
    createdUserIds.push(userRows[0].id);
    assert.equal(userRows[0].role, "jurado");
  });

  it("should reject invalid role values when creating a user", async () => {
    const admin = await registerAdmin();

    const badRole = await request("POST", "/api/admin/jurados", {
      email: generateEmail(),
      dni: "41111111",
      role: "presidente",
    }, admin.cookies);
    assert.equal(badRole.status, 400);
  });

  it("should create a user with role comisario via admin endpoint", async () => {
    const admin = await registerAdmin();

    const created = await request("POST", "/api/admin/jurados", {
      name: "Comi",
      email: generateEmail(),
      dni: "41222222",
      role: "comisario",
    }, admin.cookies);
    assert.equal(created.status, 201);
    createdUserIds.push(created.body.id);
    assert.equal(created.body.role, "comisario");
    assert.equal(created.body.isAdmin, false);

    const me = await getMe(admin.cookies);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.role, "admin");
  });

  it("should list all users with their role via /api/admin/usuarios", async () => {
    const admin = await registerAdmin();

    const users = await request("GET", "/api/admin/usuarios", null, admin.cookies);
    assert.equal(users.status, 200);
    assert.ok(users.body.length >= 1);
    const me = users.body.find((u) => u.email === admin.email);
    assert.ok(me);
    assert.equal(me.role, "admin");
  });

  it("should require admin to change another user role", async () => {
    const admin = await registerAdmin();
    const normal = await registerWithRole("jurado");

    const forbidden = await request(
      "PUT",
      `/api/admin/usuarios/${normal.userId}/rol`,
      { role: "comisario" },
      normal.cookies
    );
    assert.equal(forbidden.status, 403);

    const changed = await request(
      "PUT",
      `/api/admin/usuarios/${normal.userId}/rol`,
      { role: "comisario" },
      admin.cookies
    );
    assert.equal(changed.status, 200);
    assert.equal(changed.body.role, "comisario");
    assert.equal(changed.body.isAdmin, false);

    const me = await getMe(normal.cookies);
    assert.equal(me.body.user.role, "comisario");
  });

  it("should reject invalid roles and self role changes", async () => {
    const admin = await registerAdmin();
    const adminId = (
      await pool.query('SELECT id FROM "user" WHERE email = $1', [admin.email])
    ).rows[0].id;

    const invalid = await request(
      "PUT",
      `/api/admin/usuarios/${adminId}/rol`,
      { role: "rei" },
      admin.cookies
    );
    assert.equal(invalid.status, 400);

    const self = await request(
      "PUT",
      `/api/admin/usuarios/${adminId}/rol`,
      { role: "jurado" },
      admin.cookies
    );
    assert.equal(self.status, 400);
  });

  it("should map isAdmin role when role is admin", async () => {
    const admin = await registerAdmin();
    const normal = await registerWithRole("jurado");

    const changed = await request(
      "PUT",
      `/api/admin/usuarios/${normal.userId}/rol`,
      { role: "admin" },
      admin.cookies
    );
    assert.equal(changed.status, 200);
    assert.equal(changed.body.role, "admin");
    assert.equal(changed.body.isAdmin, true);
  });

  it("should deny admin endpoints to comisario, escribano and jurado", async () => {
    const admin = await registerAdmin();

    for (const role of ["comisario", "escribano", "jurado"]) {
      const user = await registerWithRole(role);
      await setRole(user.userId, role);

      const getJurados = await request("GET", "/api/admin/jurados", null, user.cookies);
      assert.equal(getJurados.status, 403, `${role} debe recibir 403 en GET /api/admin/jurados`);

      const getUsuarios = await request("GET", "/api/admin/usuarios", null, user.cookies);
      assert.equal(getUsuarios.status, 403, `${role} debe recibir 403 en GET /api/admin/usuarios`);

      const createInfraccion = await request("POST", "/api/admin/infracciones", {
        codigo: "REG-X",
        nombre: "Prueba",
      }, user.cookies);
      assert.equal(createInfraccion.status, 403, `${role} debe recibir 403 en POST /api/admin/infracciones`);
    }
  });

  it("should deny comisario/escribano mutating endpoints to jurado", async () => {
    const jurado = await registerWithRole("jurado");

    const comisarioIncidencia = await request("POST", "/api/comisario/incidencias", {
      noche_id: 1,
      comparsa_id: 1,
      tipo: "no_reglamentaria",
    }, jurado.cookies);
    assert.equal(comisarioIncidencia.status, 403);

    const comisarioControl = await request("POST", "/api/comisario/controles", {
      noche_id: 1,
      comparsa_id: 1,
      tipo: "horario",
    }, jurado.cookies);
    assert.equal(comisarioControl.status, 403);

    const certificar = await request("POST", "/api/escribano/actas/1/certificar", null, jurado.cookies);
    assert.equal(certificar.status, 403);
  });
});