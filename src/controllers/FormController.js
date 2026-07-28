const { randomUUID } = require('crypto');
const model = require('../models/FormModel');

const create = async (request, response) => {
  try {
    const { name, email, phone, message } = request.body;
    if (!name || !email || !message) {
      return response.status(400).json({ error: 'name, email and message are required' });
    }
    const id = randomUUID();
    const result = await model.create({ id, name, email, phone, message });
    return response.status(201).json(result);
  } catch (err) {
    return response.status(500).json({ error: err.message });
  }
};

const findAll = async (request, response) => {
  try {
    const rows = await model.findAll();
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

const remove = async (request, response) => {
  try {
    const affected = await model.remove(request.params.id);
    if (!affected) return response.status(404).json({ error: 'Not found' });
    return response.status(200).json({ deleted: affected });
  } catch (err) {
    return response.status(500).json({ error: err.message });
  }
};

module.exports = { create, findAll, findById, remove };
