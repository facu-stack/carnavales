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
  await pool.query('UPDATE "user" SET "isAdmin" = true WHERE email = $1', [email]);
}

async function registerAdmin() {
  const email = generateEmail();
  await register(email, TEST_PASSWORD);
  await promoteAdmin(email);
  const loginRes = await login(email, TEST_PASSWORD);
  assert.equal(loginRes.status, 200);
  return { email, cookies: loginRes.cookies };
}

async function getRubroIdsByComparsa(comparsaId) {
  const { rows } = await pool.query(
    `SELECT id FROM rubros WHERE comparsa_id = $1 ORDER BY id LIMIT 2`,
    [comparsaId]
  );
  return rows.map((r) => r.id);
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

describe("Admin jurados management", () => {
  it("should reject unauthenticated requests", async () => {
    const get = await request("GET", "/api/admin/jurados");
    assert.equal(get.status, 401);

    const create = await request("POST", "/api/admin/jurados", {
      email: generateEmail(),
      dni: "30123456",
    });
    assert.equal(create.status, 401);

    const delAll = await request("DELETE", "/api/admin/jurados");
    assert.equal(delAll.status, 401);
  });

  it("should reject authenticated non-admin users", async () => {
    const email = generateEmail();
    await register(email, TEST_PASSWORD);
    const loginRes = await login(email, TEST_PASSWORD);
    assert.equal(loginRes.status, 200);

    const get = await request("GET", "/api/admin/jurados", null, loginRes.cookies);
    assert.equal(get.status, 403);

    const create = await request("POST", "/api/admin/jurados", {
      name: "Hacker",
      email: generateEmail(),
      dni: "30123456",
    }, loginRes.cookies);
    assert.equal(create.status, 403);

    const delAll = await request("DELETE", "/api/admin/jurados", null, loginRes.cookies);
    assert.equal(delAll.status, 403);
  });

  it("should create, list and sign-in a jurado with the delivered PIN", async () => {
    const admin = await registerAdmin();
    const rubrosIds = await getRubroIdsByComparsa(1);

    const juradoEmail = generateEmail();
    let created = null;
    const otp = await captureOtpDuring(async () => {
      const res = await request("POST", "/api/admin/jurados", {
        name: "Jurado Uno",
        email: juradoEmail,
        dni: "40111111",
        asignaciones: [{ comparsa_id: 1, rubros_ids: rubrosIds }],
      }, admin.cookies);
      assert.equal(res.status, 201);
      created = res.body;
    });
    createdUserIds.push(created.id);

    assert.match(otp, /^\d{6}$/);
    assert.equal(created.emailSent, true);
    assert.equal(created.name, "Jurado Uno");
    assert.equal(created.dni, "40111111");
    assert.equal(created.asignaciones.length, 1);
    assert.equal(created.asignaciones[0].rubros.length, rubrosIds.length);

    const list = await request("GET", "/api/admin/jurados", null, admin.cookies);
    assert.equal(list.status, 200);
    assert.ok(list.body.some((j) => j.id === created.id && j.dni === "40111111"));

    const signIn = await request("POST", "/api/auth/sign-in/email-otp", {
      email: juradoEmail,
      otp,
    });
    assert.equal(signIn.status, 200);

    const me = await getMe(signIn.cookies);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, juradoEmail);
    assert.equal(me.body.user.isAdmin, false);

    const misComparsas = await request("GET", "/api/jurado/mis-comparsas", null, signIn.cookies);
    assert.equal(misComparsas.status, 200);
    assert.equal(misComparsas.body.length, 1);
    assert.equal(misComparsas.body[0].rubros_count, rubrosIds.length);

    const misRubros = await request("GET", "/api/jurado/mis-rubros", null, signIn.cookies);
    assert.equal(misRubros.status, 200);
    assert.deepEqual(misRubros.body.map((r) => r.id).sort(), [...rubrosIds].sort());
  });

  it("should reject a duplicate DNI", async () => {
    const admin = await registerAdmin();

    const first = await request("POST", "/api/admin/jurados", {
      name: "Uno",
      email: generateEmail(),
      dni: "40222222",
    }, admin.cookies);
    assert.equal(first.status, 201);
    createdUserIds.push(first.body.id);

    const second = await request("POST", "/api/admin/jurados", {
      name: "Dos",
      email: generateEmail(),
      dni: "40222222",
    }, admin.cookies);
    assert.equal(second.status, 409);
  });

  it("should reject a duplicate email", async () => {
    const admin = await registerAdmin();
    const email = generateEmail();

    const first = await request("POST", "/api/admin/jurados", {
      name: "Uno",
      email,
      dni: "40333333",
    }, admin.cookies);
    assert.equal(first.status, 201);
    createdUserIds.push(first.body.id);

    const second = await request("POST", "/api/admin/jurados", {
      name: "Dos",
      email,
      dni: "40444444",
    }, admin.cookies);
    assert.equal(second.status, 409);
  });

  it("should reject invalid DNI and payloads", async () => {
    const admin = await registerAdmin();

    const shortDni = await request("POST", "/api/admin/jurados", {
      email: generateEmail(),
      dni: "123",
    }, admin.cookies);
    assert.equal(shortDni.status, 400);

    const missing = await request("POST", "/api/admin/jurados", {
      email: generateEmail(),
    }, admin.cookies);
    assert.equal(missing.status, 400);

    const badAsignacion = await request("POST", "/api/admin/jurados", {
      email: generateEmail(),
      dni: "40555555",
      asignaciones: [{ comparsa_id: 1, rubros_ids: [999999] }],
    }, admin.cookies);
    assert.equal(badAsignacion.status, 400);
  });

  it("should update a jurado and replace assignments", async () => {
    const admin = await registerAdmin();
    const rubrosComp1 = await getRubroIdsByComparsa(1);

    const created = await request("POST", "/api/admin/jurados", {
      name: "Antes",
      email: generateEmail(),
      dni: "40666666",
      asignaciones: [{ comparsa_id: 1, rubros_ids: rubrosComp1 }],
    }, admin.cookies);
    assert.equal(created.status, 201);
    createdUserIds.push(created.body.id);

    const updated = await request("PUT", `/api/admin/jurados/${created.body.id}`, {
      name: "Despues",
      dni: "40777777",
      asignaciones: [],
    }, admin.cookies);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.name, "Despues");
    assert.equal(updated.body.dni, "40777777");
    assert.equal(updated.body.asignaciones.length, 0);
  });

  it("should reject editing a duplicate DNI", async () => {
    const admin = await registerAdmin();

    const a = await request("POST", "/api/admin/jurados", {
      name: "A",
      email: generateEmail(),
      dni: "40888888",
    }, admin.cookies);
    assert.equal(a.status, 201);
    createdUserIds.push(a.body.id);

    const b = await request("POST", "/api/admin/jurados", {
      name: "B",
      email: generateEmail(),
      dni: "40999999",
    }, admin.cookies);
    assert.equal(b.status, 201);
    createdUserIds.push(b.body.id);

    const conflict = await request("PUT", `/api/admin/jurados/${b.body.id}`, {
      dni: "40888888",
    }, admin.cookies);
    assert.equal(conflict.status, 409);
  });

  it("should not allow deleting an administrator", async () => {
    const admin = await registerAdmin();
    const adminIdRes = await pool.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [admin.email]
    );
    const adminId = adminIdRes.rows[0].id;

    const res = await request("DELETE", `/api/admin/jurados/${adminId}`, null, admin.cookies);
    assert.equal(res.status, 400);

    const stillThere = await pool.query(`SELECT 1 FROM "user" WHERE id = $1`, [adminId]);
    assert.equal(stillThere.rows.length, 1);
  });

  it("should not allow editing an administrator", async () => {
    const admin = await registerAdmin();
    const adminIdRes = await pool.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [admin.email]
    );
    const adminId = adminIdRes.rows[0].id;

    const res = await request("PUT", `/api/admin/jurados/${adminId}`, {
      name: "Hack",
    }, admin.cookies);
    assert.equal(res.status, 400);
  });

  it("should delete all non-admin users while keeping admins", async () => {
    const adminA = await registerAdmin();
    const adminB = await registerAdmin();

    const j1 = await request("POST", "/api/admin/jurados", {
      name: "J1",
      email: generateEmail(),
      dni: "40123456",
    }, adminA.cookies);
    const j2 = await request("POST", "/api/admin/jurados", {
      name: "J2",
      email: generateEmail(),
      dni: "40234567",
    }, adminA.cookies);
    assert.equal(j1.status, 201);
    assert.equal(j2.status, 201);

    const res = await request("DELETE", "/api/admin/jurados", null, adminA.cookies);
    assert.equal(res.status, 200);
    assert.ok(res.body.deleted >= 2);

    const remainingAdmins = await pool.query(
      `SELECT COUNT(*)::int AS count FROM "user" WHERE "isAdmin" IS true`
    );
    const remainingNonAdmins = await pool.query(
      `SELECT COUNT(*)::int AS count FROM "user" WHERE "isAdmin" IS NOT true`
    );
    assert.ok(remainingAdmins.rows[0].count >= 2);
    assert.equal(remainingNonAdmins.rows[0].count, 0);
  });

  it("should return 401 without session on jurado voting endpoints", async () => {
    const misRubros = await request("GET", "/api/jurado/mis-rubros");
    assert.equal(misRubros.status, 401);

    const misComparsas = await request("GET", "/api/jurado/mis-comparsas");
    assert.equal(misComparsas.status, 401);
  });
});