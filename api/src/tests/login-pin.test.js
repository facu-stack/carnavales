import { describe, it } from "node:test";
import assert from "node:assert";
import pg from "pg";
import {
  register,
  getMe,
  generateEmail,
  request,
} from "./helpers.js";

const TEST_PASSWORD = "Test1234!";
const TEST_DNI = "30123456";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function setDni(email, dni) {
  await pool.query('UPDATE "user" SET dni = $1 WHERE email = $2', [dni, email]);
}

async function requestPin(email, dni) {
  return request("POST", "/api/login-pin/request", { email, dni });
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

describe("Login with DNI and PIN", () => {
  it("should send a PIN and sign in when email and DNI match", async () => {
    const email = generateEmail();
    await register(email, TEST_PASSWORD);
    await setDni(email, TEST_DNI);

    const otp = await captureOtpDuring(async () => {
      const res = await requestPin(email, TEST_DNI);
      assert.strictEqual(res.status, 200);
    });

    assert.match(otp, /^\d{6}$/);

    const signInRes = await request("POST", "/api/auth/sign-in/email-otp", {
      email,
      otp,
    });
    assert.strictEqual(signInRes.status, 200);
    assert.ok(signInRes.cookies);

    const meRes = await getMe(signInRes.cookies);
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.user.email, email);
  });

  it("should not send a PIN when the DNI does not match", async () => {
    const email = generateEmail();
    await register(email, TEST_PASSWORD);
    await setDni(email, TEST_DNI);

    const otp = await captureOtpDuring(async () => {
      const res = await requestPin(email, "99999999");
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, "El email o el DNI no están registrados.");
    });

    assert.strictEqual(otp, "");
  });

  it("should not send a PIN for an unknown email", async () => {
    const otp = await captureOtpDuring(async () => {
      const res = await requestPin("unknown@example.com", TEST_DNI);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, "El email o el DNI no están registrados.");
    });

    assert.strictEqual(otp, "");
  });

  it("should return the same response for unknown email and wrong DNI", async () => {
    const email = generateEmail();
    await register(email, TEST_PASSWORD);
    await setDni(email, TEST_DNI);

    const existingWrongDni = await requestPin(email, "99999999");
    const unknownEmail = await requestPin("unknown@example.com", TEST_DNI);

    assert.deepStrictEqual(existingWrongDni.body, unknownEmail.body);
  });

  it("should reject OTP sign-in with a wrong code", async () => {
    const email = generateEmail();
    await register(email, TEST_PASSWORD);
    await setDni(email, TEST_DNI);

    const otp = await captureOtpDuring(() => requestPin(email, TEST_DNI));
    assert.match(otp, /^\d{6}$/);

    const wrong = otp === "000000" ? "000001" : "000000";
    const res = await request("POST", "/api/auth/sign-in/email-otp", {
      email,
      otp: wrong,
    });

    assert.ok(res.status >= 400);
  });

  it("should reject OTP sign-in for a non-existent email", async () => {
    const res = await request("POST", "/api/auth/sign-in/email-otp", {
      email: "unknown@example.com",
      otp: "123456",
    });

    assert.ok(res.status >= 400);
  });

  it("should require email and DNI on the request endpoint", async () => {
    const res = await request("POST", "/api/login-pin/request", { dni: TEST_DNI });

    assert.strictEqual(res.status, 400);
  });

  it("should not expose OTP sending over HTTP (bypass defense)", async () => {
    const email = generateEmail();
    await register(email, TEST_PASSWORD);
    await setDni(email, TEST_DNI);

    const res = await request(
      "POST",
      "/api/auth/email-otp/send-verification-otp",
      { email, type: "sign-in" },
    );

    assert.strictEqual(res.status, 404);
  });

  it("should not expose OTP password reset endpoints over HTTP", async () => {
    const res = await request(
      "POST",
      "/api/auth/email-otp/request-password-reset",
      { email: "unknown@example.com" },
    );

    assert.strictEqual(res.status, 404);
  });
});