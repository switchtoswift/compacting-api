const connection = require('./connection');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

async function create(data) {
  const { id, role = 'editor', name, email, password, profile_image, created_by } = data;
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const profileImage = profile_image || null;
  await connection.execute(
    `INSERT INTO User
      (id, role, status, name, email, password_hash, profile_image, created_by, created_at, updated_at)
     VALUES (?, ?, 'active', ?, ?, ?, ?, ?, NOW(), NOW())`,
    [id, role, name, email.toLowerCase(), passwordHash, profileImage, created_by || null],
  );
  return findById(id);
}

async function findByEmail(email) {
  const [rows] = await connection.execute('SELECT * FROM User WHERE LOWER(email) = ? LIMIT 1', [
    String(email).toLowerCase(),
  ]);
  return rows[0];
}

async function findById(id) {
  const [rows] = await connection.execute(
    `SELECT id, role, status, name, email, profile_image, last_login_at, created_at, updated_at
       FROM User WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0];
}

async function findAll() {
  const [rows] = await connection.execute(
    `SELECT id, role, status, name, email, profile_image, last_login_at, created_at, updated_at
       FROM User ORDER BY created_at DESC`,
  );
  return rows;
}

async function update(id, patch) {
  const allowed = {
    name: 'name',
    role: 'role',
    status: 'status',
    profile_image: 'profile_image',
  };
  const fields = [];
  const values = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = ?`);
      values.push(patch[key]);
    }
  }
  if (!fields.length) return findById(id);
  values.push(id);
  await connection.execute(
    `UPDATE User SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
    values,
  );
  return findById(id);
}

async function updatePassword(id, password) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await connection.execute(
    'UPDATE User SET password_hash = ?, updated_at = NOW() WHERE id = ?',
    [passwordHash, id],
  );
}

async function markLogin(id) {
  await connection.execute('UPDATE User SET last_login_at = NOW() WHERE id = ?', [id]);
}

async function countOwners() {
  const [rows] = await connection.execute(
    "SELECT COUNT(*) AS total FROM User WHERE role = 'owner' AND status = 'active'",
  );
  return Number(rows[0].total);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = {
  countOwners,
  create,
  findAll,
  findByEmail,
  findById,
  markLogin,
  update,
  updatePassword,
  verifyPassword,
};
