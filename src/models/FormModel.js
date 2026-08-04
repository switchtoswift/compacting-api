const connection = require('./connection');
require('dotenv').config({ path: ['.env.local', '.env'] });

const create = async (data) => {
  const { id, name, email, phone, message } = data;
  // MySQL rejects `undefined` bind params — coerce optional fields to NULL.
  const phoneVal = phone === undefined ? null : phone;
  const sql = `
    INSERT INTO Form
    (id, name, email, phone, message, created_at)
    VALUES (?, ?, ?, ?, ?, NOW())
  `;
  await connection.execute(sql, [id, name, email, phoneVal, message]);
  return { id, name, email, phone: phoneVal, message };
};

const findAll = async () => {
  const sql = 'SELECT * FROM Form ORDER BY created_at DESC';
  const [rows] = await connection.execute(sql, []);
  return rows;
};

const findById = async (id) => {
  const sql = 'SELECT * FROM Form WHERE id = ?';
  const [rows] = await connection.execute(sql, [id]);
  return rows[0];
};

const remove = async (id) => {
  const sql = 'DELETE FROM Form WHERE id = ?';
  const [result] = await connection.execute(sql, [id]);
  return result.affectedRows;
};

module.exports = { create, findAll, findById, remove };
