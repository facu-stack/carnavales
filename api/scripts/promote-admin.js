import "dotenv/config";
import pg from "pg";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const rl = readline.createInterface({ input: stdin, output: stdout });

async function promoteAdmin() {
  const email = (await rl.question("Email del usuario a convertir en admin: ")).trim().toLowerCase();

  if (!email) {
    console.error("Email required.");
    process.exit(1);
  }

  const { rowCount } = await pool.query(
    `UPDATE "user" SET "isAdmin" = true WHERE LOWER(email) = $1`,
    [email]
  );

  if (rowCount === 0) {
    console.error(`No se encontró un usuario con email "${email}".`);
  } else {
    console.log(`Usuario ${email} promovido a admin.`);
  }

  rl.close();
  await pool.end();
}

promoteAdmin();
