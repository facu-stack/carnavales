import { describe, it } from "node:test";
import assert from "node:assert";
import pg from "pg";
import {
  register,
  login,
  logout,
  getSession,
  getMe,
  generateEmail,
  request,
} from "./helpers.js";

const TEST_PASSWORD = "Test1234!";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function completeOtpEnrollment(cookies) {
  let deliveredOtp = "";
  const originalConsoleLog = console.log;
  console.log = (...args) => {
    const message = args.map(String).join(" ");
    const match = message.match(/Código OTP[^:]*:\s*(\d{6})/);
    if (match) deliveredOtp = match[1];
    originalConsoleLog(...args);
  };

  try {
    const sendResponse = await request(
      "POST",
      "/api/auth/two-factor/send-otp",
      null,
      cookies,
    );
    assert.strictEqual(sendResponse.status, 200);
  } finally {
    console.log = originalConsoleLog;
  }

  assert.match(deliveredOtp, /^\d{6}$/);
  const verifyResponse = await request(
    "POST",
    "/api/auth/two-factor/verify-otp",
    { code: deliveredOtp, trustDevice: false },
    cookies,
  );
  assert.strictEqual(verifyResponse.status, 200);
  return verifyResponse.cookies;
}

async function createTwoFactorSession(email, firstName = "Test", lastName = "User") {
  const registered = await register(email, TEST_PASSWORD, firstName, lastName);
  const enableResponse = await request(
    "POST",
    "/api/enable-2fa",
    { password: TEST_PASSWORD },
    registered.cookies,
  );
  assert.strictEqual(enableResponse.status, 200);
  return completeOtpEnrollment(enableResponse.cookies);
}

describe("Authentication", () => {
  describe("POST /api/auth/sign-up/email", () => {
    it("should register a new user", async () => {
      const email = generateEmail();
      const res = await register(email, TEST_PASSWORD);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.email, email);
    });

    it("should register with firstName and lastName", async () => {
      const email = generateEmail();
      const res = await register(email, TEST_PASSWORD, "Juan", "Pérez");

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.user.name, "Juan Pérez");
    });

    it("should not register with weak password", async () => {
      const email = generateEmail();
      const res = await register(email, "123");

      assert.ok(res.status >= 400);
    });

    it("should not register with invalid email", async () => {
      const res = await register("not-an-email", TEST_PASSWORD);

      assert.ok(res.status >= 400);
    });
  });

  describe("POST /api/auth/sign-in/email", () => {
    it("should login with correct credentials", async () => {
      const email = generateEmail();
      await register(email, TEST_PASSWORD);
      const res = await login(email, TEST_PASSWORD);

      assert.strictEqual(res.status, 200);
      assert.ok(res.cookies);
    });

    it("should fail with wrong password", async () => {
      const email = generateEmail();
      await register(email, TEST_PASSWORD);
      const res = await login(email, "wrongpassword");

      assert.strictEqual(res.status, 401);
    });

    it("should fail with non-existent email", async () => {
      const res = await login("nonexistent@example.com", TEST_PASSWORD);

      assert.strictEqual(res.status, 401);
    });

    it("should return same error for wrong password and non-existent email", async () => {
      const email = generateEmail();
      await register(email, TEST_PASSWORD);

      const res1 = await login(email, "wrongpassword");
      const res2 = await login("nonexistent@example.com", TEST_PASSWORD);

      assert.strictEqual(res1.body.error, res2.body.error);
    });
  });

  describe("GET /api/auth/get-session", () => {
    it("should return session with valid cookies", async () => {
      const email = generateEmail();
      await register(email, TEST_PASSWORD);
      const loginRes = await login(email, TEST_PASSWORD);
      const sessionRes = await getSession(loginRes.cookies);

      assert.strictEqual(sessionRes.status, 200);
      assert.strictEqual(sessionRes.body.user.email, email);
    });

    it("should return name in session", async () => {
      const email = generateEmail();
      await register(email, TEST_PASSWORD, "María", "García");
      const loginRes = await login(email, TEST_PASSWORD);
      const sessionRes = await getSession(loginRes.cookies);

      assert.strictEqual(sessionRes.status, 200);
      assert.strictEqual(sessionRes.body.user.name, "María García");
    });

    it("should return null without cookies", async () => {
      const res = await getSession("");

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body, null);
    });
  });

  describe("POST /api/auth/two-factor/verify-otp", () => {
    it("should create a session after successful OTP verification", async () => {
      const email = generateEmail();
      const registered = await register(email, TEST_PASSWORD);
      const startedAt = new Date();

      const enableResponse = await request(
        "POST",
        "/api/enable-2fa",
        { password: TEST_PASSWORD },
        registered.cookies,
      );
      assert.strictEqual(enableResponse.status, 200);

      let deliveredOtp = "";
      const originalConsoleLog = console.log;
      console.log = (...args) => {
        const message = args.map(String).join(" ");
        const match = message.match(/(?:CÓDIGO|Código OTP[^:]*):\s*(\d{6})/);
        if (match) deliveredOtp = match[1];
        originalConsoleLog(...args);
      };

      let sendOtpResponse;
      try {
        sendOtpResponse = await request(
          "POST",
          "/api/auth/two-factor/send-otp",
          null,
          enableResponse.cookies,
        );
      } finally {
        console.log = originalConsoleLog;
      }

      assert.strictEqual(sendOtpResponse.status, 200);
      assert.match(deliveredOtp, /^\d{6}$/);

      const { rows } = await pool.query(
        `SELECT value FROM verification
         WHERE identifier LIKE '2fa-otp-%' AND "createdAt" >= $1
         ORDER BY "createdAt" DESC LIMIT 1`,
        [startedAt],
      );
      assert.ok(rows[0]?.value, "An OTP should be stored for the test login");
      assert.ok(
        !rows[0].value.includes(deliveredOtp),
        "The stored OTP must not contain the plaintext code",
      );

      const verifyResponse = await request(
        "POST",
        "/api/auth/two-factor/verify-otp",
        { code: deliveredOtp, trustDevice: false },
        enableResponse.cookies,
      );
      assert.strictEqual(verifyResponse.status, 200);

      const sessionResponse = await getSession(verifyResponse.cookies);
      assert.strictEqual(sessionResponse.status, 200);
      assert.strictEqual(sessionResponse.body.user.email, email);
    });
  });

  describe("POST /api/auth/sign-out", () => {
    it("should logout successfully", async () => {
      const email = generateEmail();
      await register(email, TEST_PASSWORD);
      const loginRes = await login(email, TEST_PASSWORD);
      const logoutRes = await logout(loginRes.cookies);

      assert.strictEqual(logoutRes.status, 200);
    });

    it("session should be invalid after logout", async () => {
      const email = generateEmail();
      await register(email, TEST_PASSWORD);
      const loginRes = await login(email, TEST_PASSWORD);
      await logout(loginRes.cookies);
      const sessionRes = await getSession(loginRes.cookies);

      assert.strictEqual(sessionRes.body, null);
    });
  });

  describe("GET /api/me", () => {
    it("should allow an authenticated sign-up session without 2FA enrollment", async () => {
      const email = generateEmail();
      const registered = await register(email, TEST_PASSWORD);

      const res = await getMe(registered.cookies);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.authenticated, true);
    });

    it("should allow the enrollment session until its OTP is verified", async () => {
      const email = generateEmail();
      const registered = await register(email, TEST_PASSWORD);
      const enableResponse = await request(
        "POST",
        "/api/enable-2fa",
        { password: TEST_PASSWORD },
        registered.cookies,
      );
      assert.strictEqual(enableResponse.status, 200);

      const res = await getMe(enableResponse.cookies);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.authenticated, true);
    });

    it("should revoke other pre-enrollment sessions after OTP verification", async () => {
      const email = generateEmail();
      const registered = await register(email, TEST_PASSWORD);
      const secondSession = await login(email, TEST_PASSWORD);
      assert.strictEqual(secondSession.status, 200);

      const enableResponse = await request(
        "POST",
        "/api/enable-2fa",
        { password: TEST_PASSWORD },
        registered.cookies,
      );
      assert.strictEqual(enableResponse.status, 200);

      const verifiedCookies = await completeOtpEnrollment(enableResponse.cookies);
      const staleSessionResponse = await getMe(secondSession.cookies);
      const verifiedSessionResponse = await getMe(verifiedCookies);

      assert.strictEqual(staleSessionResponse.status, 401);
      assert.strictEqual(verifiedSessionResponse.status, 200);
    });

    it("should return user info with valid session", async () => {
      const email = generateEmail();
      const cookies = await createTwoFactorSession(email);
      const meRes = await getMe(cookies);

      assert.strictEqual(meRes.status, 200);
      assert.strictEqual(meRes.body.authenticated, true);
      assert.ok(meRes.body.user);
      assert.ok(meRes.body.user.id);
      assert.ok(meRes.body.user.email);
    });

    it("should return name in /api/me", async () => {
      const email = generateEmail();
      const cookies = await createTwoFactorSession(email, "Carlos", "López");
      const meRes = await getMe(cookies);

      assert.strictEqual(meRes.status, 200);
      assert.strictEqual(meRes.body.user.name, "Carlos López");
    });

    it("should return 401 without session", async () => {
      const res = await getMe("");

      assert.strictEqual(res.status, 401);
    });

    it("should return 401 after logout", async () => {
      const email = generateEmail();
      await register(email, TEST_PASSWORD);
      const loginRes = await login(email, TEST_PASSWORD);
      await logout(loginRes.cookies);
      const meRes = await getMe(loginRes.cookies);

      assert.strictEqual(meRes.status, 401);
    });
  });
});
