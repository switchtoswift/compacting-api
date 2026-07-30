const { randomUUID } = require('crypto');
const model = require('../models/NewsModel');

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUSES = new Set(['draft', 'published', 'archived']);

function validate(data, partial = false) {
  const errors = [];
  if (!partial || data.title !== undefined) {
    if (!String(data.title || '').trim()) errors.push('title is required');
  }
  if (!partial || data.slug !== undefined) {
    if (!SLUG.test(String(data.slug || ''))) errors.push('slug is invalid');
  }
  if (!partial || data.excerpt !== undefined) {
    if (!String(data.excerpt || '').trim()) errors.push('excerpt is required');
  }
  if (data.locale !== undefined && !['pt', 'en'].includes(data.locale)) errors.push('locale is invalid');
  if (data.publication_status !== undefined && !STATUSES.has(data.publication_status)) {
    errors.push('publication_status is invalid');
  }
  if (data.body !== undefined && !Array.isArray(data.body)) errors.push('body must be an array');
  return errors;
}

async function publicList(request, response) {
  try {
    return response.status(200).json(
      await model.findPublic({ locale: request.query.locale, limit: request.query.limit }),
    );
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function publicBySlug(request, response) {
  try {
    const article = await model.findBySlug(request.params.locale, request.params.slug);
    if (!article) return response.status(404).json({ error: 'Not found' });
    return response.status(200).json(article);
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function publicById(request, response) {
  try {
    const article = await model.findPublicById(request.params.id);
    if (!article) return response.status(404).json({ error: 'Not found' });
    return response.status(200).json(article);
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function findAll(request, response) {
  try {
    return response.status(200).json(await model.findAll(request.query));
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function findById(request, response) {
  try {
    const article = await model.findById(request.params.id);
    if (!article) return response.status(404).json({ error: 'Not found' });
    return response.status(200).json(article);
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function create(request, response) {
  try {
    const errors = validate(request.body);
    if (errors.length) return response.status(400).json({ error: errors.join(', ') });
    const article = await model.create({
      ...request.body,
      id: request.body.id || randomUUID(),
      locale: request.body.locale || 'pt',
      author_id: request.user.id,
    });
    return response.status(201).json(article);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'Já existe uma notícia com este slug e idioma.' });
    }
    return response.status(500).json({ error: error.message });
  }
}

async function update(request, response) {
  try {
    const errors = validate(request.body, true);
    if (errors.length) return response.status(400).json({ error: errors.join(', ') });
    const article = await model.update(request.params.id, request.body);
    if (!article) return response.status(404).json({ error: 'Not found' });
    return response.status(200).json(article);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'Já existe uma notícia com este slug e idioma.' });
    }
    return response.status(500).json({ error: error.message });
  }
}

async function remove(request, response) {
  try {
    if (!(await model.remove(request.params.id))) {
      return response.status(404).json({ error: 'Not found' });
    }
    return response.status(204).end();
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

module.exports = {
  create,
  findAll,
  findById,
  publicBySlug,
  publicById,
  publicList,
  remove,
  update,
};
