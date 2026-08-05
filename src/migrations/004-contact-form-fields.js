async function columnExists(db, table, column) {
  const [rows] = await db.execute(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function up(db) {
  if (!(await columnExists(db, 'Form', 'subject'))) {
    await db.query(
      "ALTER TABLE `Form` ADD COLUMN `subject` VARCHAR(255) NOT NULL DEFAULT ''",
    );
  }
  if (!(await columnExists(db, 'Form', 'organization'))) {
    await db.query('ALTER TABLE `Form` ADD COLUMN `organization` VARCHAR(255) NULL');
  }
}

module.exports = { id: '004-contact-form-fields', up };
