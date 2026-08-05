const connection = require('./connection');
require('dotenv').config({ path: ['.env.local', '.env'] });

const create = async (data) => {
  const { id, name, email, phone, subject, organization, message } = data;
  const phoneVal = phone === undefined || phone === null || phone === '' ? null : phone;
  const organizationVal =
    organization === undefined || organization === null || organization === ''
      ? null
      : organization;
  const sql = `
    INSERT INTO Form
    (id, name, email, phone, subject, organization, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
  `;
  await connection.execute(sql, [
    id,
    name,
    email,
    phoneVal,
    subject,
    organizationVal,
    message,
  ]);
  return findById(id);
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
