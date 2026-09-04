import { test } from "node:test";
import assert from "node:assert/strict";
import { request, register, login, generateEmail } from "./helpers.js";

test("Admin routes", async () => {
  test("should require authentication", async () => {
    const res = await request("GET", "/api/admin/comparsas");
    assert.equal(res.status, 401);
  });

  test("should reject non-admin authenticated users", async () => {
    const email = generateEmail();
    const password = "Str0ngPass!";

    await register(email, password);
    const loginRes = await login(email, password);
    assert.equal(loginRes.status, 200);

    const res = await request("GET", "/api/admin/comparsas", null, loginRes.cookies);
    assert.equal(res.status, 403);
  });

  test("should deny CREATE/UPDATE/DELETE for non-admin users", async () => {
    const email = generateEmail();
    const password = "Str0ngPass!";

    await register(email, password);
    const loginRes = await login(email, password);

    const create = await request("POST", "/api/admin/comparsas", {
      name: "Hacker",
      colors: [],
    }, loginRes.cookies);
    assert.equal(create.status, 403);

    const update = await request("PUT", "/api/admin/comparsas/1", {
      name: "Hacker",
    }, loginRes.cookies);
    assert.equal(update.status, 403);

    const del = await request("DELETE", "/api/admin/comparsas/1", null, loginRes.cookies);
    assert.equal(del.status, 403);
  });
});