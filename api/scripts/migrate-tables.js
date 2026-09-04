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

    await client.query(`
      CREATE TABLE IF NOT EXISTS rubros (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        min_score INTEGER NOT NULL DEFAULT 5,
        max_score INTEGER NOT NULL DEFAULT 10,
        comparsa_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS calificacion (
        id SERIAL PRIMARY KEY,
        account_id TEXT NOT NULL,
        rubro_id INTEGER NOT NULL,
        noche INTEGER NOT NULL DEFAULT 1,
        puntaje INTEGER NOT NULL CHECK (puntaje >= 1 AND puntaje <= 10),
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT calificacion_account_rubro_noche_key
          UNIQUE (account_id, rubro_id, noche)
      );
    `);

    // Ensure rubros.comparsa_id references comparsas(id)
    await ensureForeignKey(client, "rubros", "rubros_comparsa_id_fkey", {
      column: "comparsa_id",
      references: "comparsas(id)",
    });

    // Ensure calificacion foreign keys
    await ensureForeignKey(client, "calificacion", "calificacion_account_id_fkey", {
      column: "account_id",
      references: "account(id)",
    });
    await ensureForeignKey(client, "calificacion", "calificacion_rubro_id_fkey", {
      column: "rubro_id",
      references: "rubros(id)",
    });

    // Ensure calificacion indexes
    await ensureIndex(client, "idx_calificacion_account_id", "calificacion", "account_id");
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

  const { rows: comparsas } = await client.query("SELECT id FROM comparsas ORDER BY id");

  for (const comparsa of comparsas) {
    for (const name of rubroNames) {
      await client.query(
        "INSERT INTO rubros (name, min_score, max_score, comparsa_id) VALUES ($1, 5, 10, $2)",
        [name, comparsa.id]
      );
    }
  }
  console.log("Seeded rubros per comparsa.");
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
