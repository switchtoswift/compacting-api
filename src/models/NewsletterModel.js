const connection = require('./connection');
require('dotenv').config({ path: ['.env.local', '.env'] });

const create = async (data) => {
  const {
    id,
    locale,
    translation_group_id,
    slug,
    title,
    description,
    body,
    cover_image,
    publication_status = 'draft',
  } = data;

  // MySQL rejects `undefined` bind params — coerce optional fields to NULL.
  const coverImage = cover_image === undefined ? null : cover_image;
  const groupId = translation_group_id === undefined ? id : translation_group_id;
  const bodyJson = JSON.stringify(body);

  const sql = `
    INSERT INTO Newsletter
    (id, locale, translation_group_id, slug, title, description, body, cover_image, publication_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;
  await connection.execute(sql, [
    id, locale, groupId, slug, title, description, bodyJson, coverImage, publication_status,
  ]);
  return { id, locale, translation_group_id: groupId, slug, title, description, body, cover_image: coverImage, publication_status };
};

const findAll = async (locale) => {
  let sql = 'SELECT * FROM Newsletter';
  const params = [];
  if (locale) {
    sql += ' WHERE locale = ?';
    params.push(locale);
  }
  sql += ' ORDER BY created_at DESC';
  const [rows] = await connection.execute(sql, params);
  return rows;
};

const findById = async (id) => {
  const sql = 'SELECT * FROM Newsletter WHERE id = ?';
  const [rows] = await connection.execute(sql, [id]);
  return rows[0];
};

const findBySlug = async (slug, locale) => {
  const sql = 'SELECT * FROM Newsletter WHERE slug = ? AND locale = ?';
  const [rows] = await connection.execute(sql, [slug, locale]);
  return rows[0];
};

const update = async (id, data) => {
  const fields = [];
  const params = [];
  const map = {
    locale: 'locale',
    translation_group_id: 'translation_group_id',
    slug: 'slug',
    title: 'title',
    description: 'description',
    body: 'body',
    cover_image: 'cover_image',
    publication_status: 'publication_status',
    published_at: 'published_at',
  };
  for (const key of Object.keys(map)) {
    if (data[key] !== undefined) {
      fields.push(`${map[key]} = ?`);
      const val = data[key];
      params.push(key === 'body' ? JSON.stringify(val) : val);
    }
  }
  if (fields.length === 0) return null;
  params.push(id);
  const sql = `UPDATE Newsletter SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`;
  const [result] = await connection.execute(sql, params);
  return result.affectedRows;
};

const remove = async (id) => {
  const sql = 'DELETE FROM Newsletter WHERE id = ?';
  const [result] = await connection.execute(sql, [id]);
  return result.affectedRows;
};

module.exports = { create, findAll, findById, findBySlug, update, remove };
