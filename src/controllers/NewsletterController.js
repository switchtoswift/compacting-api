const { randomUUID } = require('crypto');
const model = require('../models/NewsletterModel');

const create = async (request, response) => {
  try {
    const data = request.body;
    data.id = data.id || randomUUID();
    if (!data.slug || !data.title || !data.description) {
      return response.status(400).json({ error: 'slug, title and description are required' });
    }
    if (!data.translation_group_id) {
      data.translation_group_id = data.id; // first translation links to itself
    }
    const result = await model.create(data);
    return response.status(201).json(result);
  } catch (err) {
    return response.status(500).json({ error: err.message });
  }
};

const findAll = async (request, response) => {
  try {
    const locale = request.query.locale;
    const rows = await model.findAll(locale);
    return response.status(200).json(rows);
  } catch (err) {
    return response.status(500).json({ error: err.message });
  }
};

const findById = async (request, response) => {
  try {
    const row = await model.findById(request.params.id);
    if (!row) return response.status(404).json({ error: 'Not found' });
    return response.status(200).json(row);
  } catch (err) {
    return response.status(500).json({ error: err.message });
  }
};

const findBySlug = async (request, response) => {
  try {
    const { slug, locale } = request.params;
    const row = await model.findBySlug(slug, locale);
    if (!row) return response.status(404).json({ error: 'Not found' });
    return response.status(200).json(row);
  } catch (err) {
    return response.status(500).json({ error: err.message });
  }
};

const update = async (request, response) => {
  try {
    const affected = await model.update(request.params.id, request.body);
    if (!affected) return response.status(404).json({ error: 'Not found or nothing to update' });
    return response.status(200).json({ updated: affected });
  } catch (err) {
    return response.status(500).json({ error: err.message });
  }
};

const remove = async (request, response) => {
  try {
    const affected = await model.remove(request.params.id);
    if (!affected) return response.status(404).json({ error: 'Not found' });
    return response.status(200).json({ deleted: affected });
  } catch (err) {
    return response.status(500).json({ error: err.message });
  }
};

module.exports = { create, findAll, findById, findBySlug, update, remove };
