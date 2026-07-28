const connection = require('./connection');
const bcrypt = require('bcrypt');
require('dotenv').config();

const SALT_ROUNDS = 10;

const create = async (data) => {
  const { id, role = 'user', name, email, password, profile_image } = data;
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  // MySQL rejects `undefined` bind params — coerce optional fields to NULL.
  const profileImage = profile_image === undefined ? null : profile_image;
  const sql = `
    INSERT INTO User
    (id, role, name, email, password_hash, profile_image, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;
  await connection.execute(sql, [id, role, name, email, password_hash, profileImage]);
  return { id, role, name, email, profile_image: profileImage };
};

const findByEmail = async (email) => {
  const sql = 'SELECT * FROM User WHERE email = ?';
  const [rows] = await connection.execute(sql, [email]);
  return rows[0];
};

const findById = async (id) => {
  const sql = 'SELECT id, role, name, email, profile_image, created_at, updated_at FROM User WHERE id = ?';
  const [rows] = await connection.execute(sql, [id]);
  return rows[0];
};

const findAll = async () => {
  const sql = 'SELECT id, role, name, email, profile_image, created_at, updated_at FROM User ORDER BY created_at DESC';
  const [rows] = await connection.execute(sql, []);
  return rows;
};

const verifyPassword = async (plain, hash) => bcrypt.compare(plain, hash);

module.exports = { create, findByEmail, findById, findAll, verifyPassword };
