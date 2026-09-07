import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS comparsas (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        "position" INTEGER NOT NULL DEFAULT 0,
        colors JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Rubros globales: la lista se aplica a TODAS las comparsas.
    await client.query(`
      CREATE TABLE IF NOT EXISTS rubros (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        min_score INTEGER NOT NULL DEFAULT 5,
        max_score INTEGER NOT NULL DEFAULT 10,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS calificacion (
        id SERIAL PRIMARY KEY,
        account_id TEXT NOT NULL,
        comparsa_id INTEGER NOT NULL,
        rubro_id INTEGER NOT NULL,
        noche INTEGER NOT NULL DEFAULT 1,
        puntaje INTEGER NOT NULL CHECK (puntaje >= 1 AND puntaje <= 10),
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT calificacion_account_comparsa_rubro_noche_key
          UNIQUE (account_id, comparsa_id, rubro_id, noche)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS jurado_rubros (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        rubro_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT jurado_rubros_user_rubro_key
          UNIQUE (user_id, rubro_id)
      );
    `);

    // ---- Migración de calificacion (legacy sin comparsa_id) ----
    await dropConstraintIfExists(client, "calificacion", "calificacion_account_rubro_noche_key");
    await addColumnIfMissing(client, "calificacion", "comparsa_id", "INTEGER");
    if (await columnExists(client, "rubros", "comparsa_id")) {
      await client.query(`
        UPDATE calificacion c
        SET comparsa_id = r.comparsa_id
        FROM rubros r
        WHERE r.id = c.rubro_id AND c.comparsa_id IS NULL
      `);
    }
    await client.query("ALTER TABLE calificacion ALTER COLUMN comparsa_id SET NOT NULL");

    // ---- Migración de jurado_rubros (legacy) ----
    await dropConstraintIfExists(client, "jurado_rubros", "jurado_rubros_user_rubro_key");

    // ---- Migración de rubros (legacy por comparsa -> global) ----
    if (await columnExists(client, "rubros", "comparsa_id")) {
      await dropConstraintIfExists(client, "rubros", "rubros_comparsa_id_fkey");
      await migrateRubrosToGlobal(client);
      await client.query("ALTER TABLE rubros DROP COLUMN IF EXISTS comparsa_id");
    }
    await ensureUnique(client, "rubros", "rubros_name_key", "name");

    // ---- Post-procesamiento jurado_rubros ----
    await client.query("ALTER TABLE jurado_rubros DROP COLUMN IF EXISTS comparsa_id");
    await client.query(`
      DELETE FROM jurado_rubros
      WHERE id NOT IN (SELECT MIN(id) FROM jurado_rubros GROUP BY user_id, rubro_id)
    `);
    await ensureForeignKey(client, "jurado_rubros", "jurado_rubros_user_id_fkey", {
      column: "user_id",
      references: '"user"(id)',
    });
    await ensureForeignKey(client, "jurado_rubros", "jurado_rubros_rubro_id_fkey", {
      column: "rubro_id",
      references: "rubros(id)",
    });
    await ensureUnique(client, "jurado_rubros", "jurado_rubros_user_rubro_key", "user_id, rubro_id");
    await ensureIndex(client, "idx_jurado_rubros_user_id", "jurado_rubros", "user_id");
    await ensureIndex(client, "idx_jurado_rubros_rubro_id", "jurado_rubros", "rubro_id");

    // ---- Post-procesamiento calificacion ----
    await client.query(`
      DELETE FROM calificacion
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM calificacion
        GROUP BY account_id, comparsa_id, rubro_id, noche
      )
    `);
    await ensureForeignKey(client, "calificacion", "calificacion_account_id_fkey", {
      column: "account_id",
      references: "account(id)",
    });
    await ensureForeignKey(client, "calificacion", "calificacion_comparsa_id_fkey", {
      column: "comparsa_id",
      references: "comparsas(id)",
    });
    await ensureForeignKey(client, "calificacion", "calificacion_rubro_id_fkey", {
      column: "rubro_id",
      references: "rubros(id)",
    });
    await ensureUnique(
      client,
      "calificacion",
      "calificacion_account_comparsa_rubro_noche_key",
      "account_id, comparsa_id, rubro_id, noche"
    );
    await ensureIndex(client, "idx_calificacion_account_id", "calificacion", "account_id");
    await ensureIndex(client, "idx_calificacion_comparsa_id", "calificacion", "comparsa_id");
    await ensureIndex(client, "idx_calificacion_rubro_id", "calificacion", "rubro_id");
    await ensureIndex(client, "idx_calificacion_noche", "calificacion", "noche");

    await seedComparsas(client);
    await seedRubros(client);

    console.log("Migration complete.");
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Colapsa los rubros legacy (uno por comparsa) en una lista global única:
// conserva el rubro de menor id por nombre y remapea las referencias.
async function migrateRubrosToGlobal(client) {
  await client.query(`
    WITH map AS (
      SELECT id, MIN(id) OVER (PARTITION BY name) AS keep_id FROM rubros
    )
    UPDATE jurado_rubros jr
    SET rubro_id = map.keep_id
    FROM map
    WHERE jr.rubro_id = map.id AND map.keep_id <> map.id
  `);

  await client.query(`
    WITH map AS (
      SELECT id, MIN(id) OVER (PARTITION BY name) AS keep_id FROM rubros
    )
    UPDATE calificacion c
    SET rubro_id = map.keep_id
    FROM map
    WHERE c.rubro_id = map.id AND map.keep_id <> map.id
  `);

  await client.query(`
    DELETE FROM rubros
    WHERE id NOT IN (SELECT MIN(id) FROM rubros GROUP BY name)
  `);
}

async function seedComparsas(client) {
  const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM comparsas");
  if (rows[0].count > 0) {
    console.log("Comparsas table already has data, skipping seed.");
    return;
  }

  const comparsas = [
    { name: "Aymara", position: 1, colors: ["#315ab9", "#ffffff"] },
    { name: "Tropical", position: 2, colors: ["#0f9e42", "#f7c406", "#ffffff"] },
    { name: "Ita Vera", position: 3, colors: ["#7f5698", "#87547f", "#ffffff", "#fedf2f"] },
    { name: "Arami", position: 4, colors: ["#004aad", "#0dc0e0", "#ffffff", "#fedd58", "#fdb141", "#cd3a93"] },
    { name: "Oh Bahía", position: 5, colors: ["#a2061e", "#f6f6f6", "#042258"] },
    { name: "Poramba", position: 6, colors: ["#f35bba", "#fed2ed", "#f245c3", "#b9019d"] },
  ];

  for (const c of comparsas) {
    await client.query(
      'INSERT INTO comparsas (name, "position", colors) VALUES ($1, $2, $3)',
      [c.name, c.position, JSON.stringify(c.colors)]
    );
  }
  console.log("Seeded comparsas.");
}

async function seedRubros(client) {
  const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM rubros");
  if (rows[0].count > 0) {
    console.log("Rubros table already has data, skipping seed.");
    return;
  }

  const rubroNames = [
    "Reina",
    "Reina de comparsa",
    "Reina del carnaval",
    "Mejor traje femenino",
    "Comisión de frente",
    "Portaestandarte",
    "Bastonera",
    "Carroza",
    "Batucada",
  ];

  for (const name of rubroNames) {
    await client.query(
      "INSERT INTO rubros (name, min_score, max_score) VALUES ($1, 5, 10)",
      [name]
    );
  }
  console.log("Seeded global rubros.");
}

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

async function addColumnIfMissing(client, table, column, definition) {
  if (!(await columnExists(client, table, column))) {
    await client.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`Added column ${table}.${column}.`);
  }
}

async function dropConstraintIfExists(client, table, constraint) {
  await client.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
}

async function ensureUnique(client, table, constraint, columns) {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_constraint WHERE conname = $1 AND conrelid = $2::regclass`,
    [constraint, table]
  );
  if (rows.length === 0) {
    await client.query(
      `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} UNIQUE (${columns})`
    );
    console.log(`Added unique constraint ${constraint}.`);
  }
}

async function ensureForeignKey(client, table, constraint, { column, references }) {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_constraint WHERE conname = $1 AND conrelid = $2::regclass`,
    [constraint, table]
  );
  if (rows.length === 0) {
    await client.query(
      `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} FOREIGN KEY (${column}) REFERENCES ${references} ON DELETE CASCADE`
    );
    console.log(`Added FK ${constraint}.`);
  }
}

async function ensureIndex(client, indexName, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
    [indexName]
  );
  if (rows.length === 0) {
    await client.query(`CREATE INDEX ${indexName} ON ${table} (${column})`);
    console.log(`Added index ${indexName}.`);
  }
}

migrate();