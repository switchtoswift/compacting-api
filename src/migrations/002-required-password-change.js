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
  if (!(await columnExists(db, 'User', 'requires_password_change'))) {
    await db.query(
      'ALTER TABLE `User` ADD COLUMN `requires_password_change` TINYINT(1) NOT NULL DEFAULT 0',
    );
  }
  if (!(await columnExists(db, 'User', 'password_changed_at'))) {
    await db.query(
      'ALTER TABLE `User` ADD COLUMN `password_changed_at` DATETIME NULL',
    );
  }
}

module.exports = { id: '002-required-password-change', up };
