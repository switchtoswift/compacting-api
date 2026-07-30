const crypto = require('crypto');
const connection = require('../models/connection');
const auth = require('../models/Auth');
const model = require('../models/UserModel');
const mailer = require('../services/mailer');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(['owner', 'admin', 'editor']);

function publicUser(user) {
  if (!user) return user;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    profile_image: user.profile_image,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

async function login(request, response) {
  try {
    const email = String(request.body.email || '').trim().toLowerCase();
    const password = String(request.body.password || '');
    if (!EMAIL.test(email) || !password) {
      return response.status(400).json({ error: 'Email e palavra-passe são obrigatórios.' });
    }
    const user = await model.findByEmail(email);
    if (!user || user.status !== 'active') {
      return response.status(401).json({ error: 'Credenciais inválidas.' });
    }
    if (!(await model.verifyPassword(password, user.password_hash))) {
      return response.status(401).json({ error: 'Credenciais inválidas.' });
    }
    await model.markLogin(user.id);
    const session = await auth.issueSession(user);
    return response.status(200).json({
      ...session,
      user: publicUser(await model.findById(user.id)),
    });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function refresh(request, response) {
  try {
    const session = await auth.rotateRefreshToken(request.body.refresh_token);
    if (!session) return response.status(401).json({ error: 'Sessão inválida.' });
    return response.status(200).json(session);
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function logout(request, response) {
  try {
    await auth.revokeRefreshToken(request.body.refresh_token);
    return response.status(204).end();
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function me(request, response) {
  return response.status(200).json(publicUser(request.user));
}

async function findAll(_request, response) {
  try {
    return response.status(200).json(await model.findAll());
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function invite(request, response) {
  try {
    const name = String(request.body.name || '').trim();
    const email = String(request.body.email || '').trim().toLowerCase();
    const role = String(request.body.role || 'editor');
    if (!name || !EMAIL.test(email) || !['admin', 'editor'].includes(role)) {
      return response.status(400).json({ error: 'Nome, email e papel válido são obrigatórios.' });
    }
    if (await model.findByEmail(email)) {
      return response.status(409).json({ error: 'Já existe um utilizador com este email.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const id = crypto.randomUUID();
    await connection.execute(
      `INSERT INTO UserInvitation
        (id, email, name, role, token_hash, invited_by, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 72 HOUR), NOW())`,
      [id, email, name, role, auth.hashToken(token), request.user.id],
    );
    const path = `/admin/aceitar-convite?token=${token}`;
    const url = `${String(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}${path}`;
    const sent = await mailer.sendMail({
      to: email,
      subject: 'Convite para a administração Compacting',
      text: `Olá ${name}, aceite o convite em ${url}`,
      html: `<p>Olá ${name},</p><p>Foi convidado para a administração Compacting.</p><p><a href="${url}">Aceitar convite</a></p>`,
    });
    return response.status(201).json({
      id,
      email,
      name,
      role,
      expires_in: 72 * 60 * 60,
      invitation_path: path,
      email_sent: sent.configured,
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ error: 'Já existe um convite ativo para este email.' });
    }
    return response.status(500).json({ error: error.message });
  }
}

async function acceptInvitation(request, response) {
  try {
    const tokenHash = auth.hashToken(String(request.body.token || ''));
    const password = String(request.body.password || '');
    if (password.length < 10) {
      return response.status(400).json({ error: 'A palavra-passe deve ter pelo menos 10 caracteres.' });
    }
    const [rows] = await connection.execute(
      `SELECT * FROM UserInvitation
        WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > NOW()
        LIMIT 1`,
      [tokenHash],
    );
    const invitation = rows[0];
    if (!invitation) return response.status(404).json({ error: 'Convite inválido ou expirado.' });
    if (await model.findByEmail(invitation.email)) {
      return response.status(409).json({ error: 'Este utilizador já existe.' });
    }
    const user = await model.create({
      id: crypto.randomUUID(),
      role: invitation.role,
      name: invitation.name,
      email: invitation.email,
      password,
      created_by: invitation.invited_by,
    });
    await connection.execute('UPDATE UserInvitation SET accepted_at = NOW() WHERE id = ?', [
      invitation.id,
    ]);
    return response.status(201).json({ user });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function update(request, response) {
  try {
    const target = await model.findById(request.params.id);
    if (!target) return response.status(404).json({ error: 'Utilizador não encontrado.' });
    const role = request.body.role;
    const status = request.body.status;
    if (role !== undefined && !ROLES.has(role)) {
      return response.status(400).json({ error: 'Papel inválido.' });
    }
    if (status !== undefined && !['active', 'disabled'].includes(status)) {
      return response.status(400).json({ error: 'Estado inválido.' });
    }
    if (target.role === 'owner' && request.user.role !== 'owner') {
      return response.status(403).json({ error: 'Apenas o owner pode alterar outro owner.' });
    }
    if (role === 'owner' && request.user.role !== 'owner') {
      return response.status(403).json({ error: 'Apenas o owner pode atribuir esse papel.' });
    }
    if (target.id === request.user.id && status === 'disabled') {
      return response.status(409).json({ error: 'Não pode desativar a própria conta.' });
    }
    if (
      target.role === 'owner' &&
      ((role && role !== 'owner') || status === 'disabled') &&
      (await model.countOwners()) <= 1
    ) {
      return response.status(409).json({ error: 'O sistema deve manter pelo menos um owner ativo.' });
    }
    const patch = {};
    if (request.body.name !== undefined) patch.name = String(request.body.name).trim();
    if (role !== undefined) patch.role = role;
    if (status !== undefined) patch.status = status;
    if (request.body.profile_image !== undefined) patch.profile_image = request.body.profile_image || null;
    return response.status(200).json(await model.update(target.id, patch));
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function remove(request, response) {
  request.body.status = 'disabled';
  return update(request, response);
}

module.exports = {
  acceptInvitation,
  findAll,
  invite,
  login,
  logout,
  me,
  refresh,
  remove,
  update,
};
