const { randomUUID } = require('crypto');
const bcrypt = require('bcrypt');

async function up(db) {
  const email = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.OWNER_PASSWORD || '');

  if (!email || !password) {
    throw new Error(
      'OWNER_EMAIL and OWNER_PASSWORD must be configured before bootstrapping the owner account.',
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.execute(
    `INSERT INTO User
      (id, role, name, email, password_hash, status, requires_password_change,
       password_changed_at, created_at, updated_at)
     VALUES (?, 'owner', 'Owner', ?, ?, 'active', 0, NOW(), NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       role = 'owner',
       status = 'active',
       password_hash = ?,
       requires_password_change = 0,
       password_changed_at = NOW(),
       updated_at = NOW()`,
    [randomUUID(), email, passwordHash, passwordHash],
  );
}

module.exports = { id: '003-bootstrap-owner', up };
