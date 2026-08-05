require('dotenv').config({ path: ['.env.local', '.env'] });
const db = require('./models/connection');

const migrations = [
  require('./migrations/001-admin-cms'),
  require('./migrations/002-required-password-change'),
  require('./migrations/003-bootstrap-owner'),
  require('./migrations/004-contact-form-fields'),
];

async function run() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS SchemaMigration (
      id VARCHAR(120) PRIMARY KEY,
      applied_at DATETIME NOT NULL
    )
  `);

  for (const migration of migrations) {
    const [rows] = await db.execute('SELECT id FROM SchemaMigration WHERE id = ?', [migration.id]);
    if (rows.length) continue;

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await migration.up(connection);
      await connection.execute('INSERT INTO SchemaMigration (id, applied_at) VALUES (?, NOW())', [
        migration.id,
      ]);
      await connection.commit();
      console.log(`Applied migration ${migration.id}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

run()
  .then(async () => {
    await db.end();
    console.log('Migrations complete.');
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Migration failed:', error.message);
    await db.end();
    process.exitCode = 1;
  });
