const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const model = require('../models/UserModel');

const register = async (request, response) => {
  try {
    const { name, email, password, role, profile_image } = request.body;
    if (!name || !email || !password) {
      return response.status(400).json({ error: 'name, email and password are required' });
    }
    const existing = await model.findByEmail(email);
    if (existing) return response.status(409).json({ error: 'Email already registered' });

    const id = randomUUID();
    await model.create({ id, role, name, email, password, profile_image });

    const user = await model.findById(id);
    return response.status(201).json({ user });
  } catch (err) {
    return response.status(500).json({ error: err.message });
  }
};

const login = async (request, response) => {
  try {
    const { email, password } = request.body;
    if (!email || !password) {
      return response.status(400).json({ error: 'email and password are required' });
    }
    const user = await model.findByEmail(email);
    if (!user) return response.status(401).json({ error: 'Invalid credentials' });

    const ok = await model.verifyPassword(password, user.password_hash);
    if (!ok) return response.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.ACESS_TOKEN_SECRET,
      { expiresIn: '8h' }
    );
    return response.status(200).json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    return response.status(500).json({ error: err.message });
  }
};

const me = async (request, response) => {
  try {
    const user = await model.findById(request.user.id);
    if (!user) return response.status(404).json({ error: 'Not found' });
    return response.status(200).json(user);
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

module.exports = { register, login, me, findAll };
