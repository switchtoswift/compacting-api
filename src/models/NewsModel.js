const connection = require('./connection');

function toDatabaseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date value');
  }
  return date;
}

function parseArticle(row) {
  if (!row) return row;
  let body = row.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = [];
    }
  }
  if (!Array.isArray(body)) {
    body =
      body && typeof body.content === 'string'
        ? [{ type: 'paragraph', content: body.content }]
        : [];
  }
  return { ...row, body };
}

async function findPublic({ locale = 'pt', limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const [rows] = await connection.execute(
    `SELECT n.*, u.name AS author_name
       FROM NewsArticle n
       LEFT JOIN User u ON u.id = n.author_id
      WHERE n.locale = ? AND n.publication_status = 'published'
      ORDER BY COALESCE(n.published_at, n.created_at) DESC
      LIMIT ${safeLimit}`,
    [locale],
  );
  return rows.map(parseArticle);
}

async function findAll({ locale, status, query } = {}) {
  const where = [];
  const values = [];
  if (locale) {
    where.push('n.locale = ?');
    values.push(locale);
  }
  if (status) {
    where.push('n.publication_status = ?');
    values.push(status);
  }
  if (query) {
    where.push('(n.title LIKE ? OR n.slug LIKE ? OR n.category LIKE ?)');
    const value = `%${query}%`;
    values.push(value, value, value);
  }
  const [rows] = await connection.execute(
    `SELECT n.*, u.name AS author_name
       FROM NewsArticle n
       LEFT JOIN User u ON u.id = n.author_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY n.updated_at DESC`,
    values,
  );
  return rows.map(parseArticle);
}

async function findById(id) {
  const [rows] = await connection.execute(
    `SELECT n.*, u.name AS author_name
       FROM NewsArticle n
       LEFT JOIN User u ON u.id = n.author_id
      WHERE n.id = ? LIMIT 1`,
    [id],
  );
  return parseArticle(rows[0]);
}

async function findBySlug(locale, slug) {
  const [rows] = await connection.execute(
    `SELECT n.*, u.name AS author_name
       FROM NewsArticle n
       LEFT JOIN User u ON u.id = n.author_id
      WHERE n.locale = ? AND n.slug = ? AND n.publication_status = 'published'
      LIMIT 1`,
    [locale, slug],
  );
  return parseArticle(rows[0]);
}

async function findPublicById(id) {
  const article = await findById(id);
  return article?.publication_status === 'published' ? article : undefined;
}

async function create(data) {
  await connection.execute(
    `INSERT INTO NewsArticle
      (id, locale, translation_group_id, slug, title, excerpt, category, body,
       cover_image, cover_alt, seo_title, seo_description, publication_status,
       published_at, author_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      data.id,
      data.locale,
      data.translation_group_id || data.id,
      data.slug,
      data.title,
      data.excerpt,
      data.category || 'Atualidade',
      JSON.stringify(data.body || []),
      data.cover_image || null,
      data.cover_alt || null,
      data.seo_title || null,
      data.seo_description || null,
      data.publication_status || 'draft',
      data.publication_status === 'published'
        ? toDatabaseDate(data.published_at) || new Date()
        : toDatabaseDate(data.published_at),
      data.author_id,
    ],
  );
  return findById(data.id);
}

async function update(id, data) {
  const map = {
    locale: 'locale',
    translation_group_id: 'translation_group_id',
    slug: 'slug',
    title: 'title',
    excerpt: 'excerpt',
    category: 'category',
    body: 'body',
    cover_image: 'cover_image',
    cover_alt: 'cover_alt',
    seo_title: 'seo_title',
    seo_description: 'seo_description',
    publication_status: 'publication_status',
    published_at: 'published_at',
  };
  const fields = [];
  const values = [];
  for (const [key, column] of Object.entries(map)) {
    if (data[key] !== undefined) {
      fields.push(`${column} = ?`);
      values.push(
        key === 'body'
          ? JSON.stringify(data[key])
          : key === 'published_at'
            ? toDatabaseDate(data[key])
            : data[key],
      );
    }
  }
  if (
    data.publication_status === 'published' &&
    data.published_at === undefined
  ) {
    fields.push('published_at = COALESCE(published_at, NOW())');
  }
  if (!fields.length) return findById(id);
  values.push(id);
  await connection.execute(
    `UPDATE NewsArticle SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
    values,
  );
  return findById(id);
}

async function remove(id) {
  const [result] = await connection.execute('DELETE FROM NewsArticle WHERE id = ?', [id]);
  return result.affectedRows;
}

module.exports = {
  create,
  findAll,
  findById,
  findBySlug,
  findPublicById,
  findPublic,
  remove,
  update,
};
