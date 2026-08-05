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
    requires_password_change: Boolean(user.requires_password_change),
    password_changed_at: user.password_changed_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function temporaryPassword() {
  return `Cc9!${crypto.randomBytes(12).toString('base64url')}`;
}

function validPassword(password) {
  return (
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  );
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

async function firstAccess(request, response) {
  try {
    const currentPassword = String(request.body.current_password || '');
    const newPassword = String(request.body.new_password || '');
    const user = await model.findByEmail(request.user.email);
    if (!user || !user.requires_password_change) {
      return response.status(409).json({ error: 'Esta conta já concluiu o primeiro acesso.' });
    }
    if (!currentPassword || !(await model.verifyPassword(currentPassword, user.password_hash))) {
      return response.status(400).json({ error: 'A palavra-passe temporária está incorreta.' });
    }
    if (!validPassword(newPassword)) {
      return response.status(400).json({
        error: 'Use pelo menos 12 caracteres, incluindo maiúsculas, minúsculas e números.',
      });
    }
    if (await model.verifyPassword(newPassword, user.password_hash)) {
      return response.status(400).json({
        error: 'A nova palavra-passe deve ser diferente da temporária.',
      });
    }
    await model.updatePassword(user.id, newPassword, true);
    await auth.revokeAllRefreshTokens(user.id);
    const updated = await model.findByEmail(user.email);
    const session = await auth.issueSession(updated);
    return response.status(200).json({
      ...session,
      user: publicUser(await model.findById(user.id)),
    });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
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
      return response.status(400).json({
        error: 'Nome, email e papel válido são obrigatórios.',
      });
    }
    if (await model.findByEmail(email)) {
      return response.status(409).json({
        error: 'Já existe um utilizador com este email.',
      });
    }

    const canRevealTemporary =
      String(process.env.ALLOW_TEMPORARY_PASSWORD_RESPONSE).toLowerCase() === 'true';
    if (!mailer.isConfigured() && !canRevealTemporary) {
      return response.status(503).json({
        error: 'Configure o serviço de email antes de criar novos acessos.',
      });
    }

    const password = temporaryPassword();
    const user = await model.create({
      id: crypto.randomUUID(),
      role,
      name,
      email,
      password,
      created_by: request.user.id,
      requires_password_change: true,
    });
    await connection.execute(
      `INSERT INTO UserInvitation
        (id, email, name, role, token_hash, invited_by, expires_at, accepted_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [
        crypto.randomUUID(),
        email,
        name,
        role,
        auth.hashToken(crypto.randomBytes(32).toString('hex')),
        request.user.id,
      ],
    );

    const loginUrl =
      `${String(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}` +
      '/admin/login';
    let sent = { configured: false, messageId: null };
    try {
      sent = await mailer.sendMail({
        to: email,
        subject: 'Acesso à administração Compacting',
        text:
          `Olá ${name}, foi criada uma conta para si.\n\n` +
          `Email: ${email}\nPalavra-passe temporária: ${password}\n` +
          `Entre em ${loginUrl} e defina imediatamente uma nova palavra-passe.`,
        html:
          `<p>Olá ${escapeHtml(name)},</p>` +
          '<p>Foi criada uma conta para si na administração Compacting.</p>' +
          `<p><strong>Email:</strong> ${escapeHtml(email)}<br>` +
          `<strong>Palavra-passe temporária:</strong> <code>${escapeHtml(password)}</code></p>` +
          `<p><a href="${escapeHtml(loginUrl)}">Entrar na administração</a></p>` +
          '<p>No primeiro acesso terá de definir uma nova palavra-passe.</p>',
      });
    } catch (error) {
      await model.update(user.id, { status: 'disabled' });
      throw error;
    }

    return response.status(201).json({
      user,
      email_sent: sent.configured,
      ...(canRevealTemporary && !sent.configured
        ? { temporary_password: password }
        : {}),
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({
        error: 'Já existe um utilizador ou convite para este email.',
      });
    }
    return response.status(500).json({ error: error.message });
  }
}

// Compatibility for invitation links created before the temporary-password flow.
async function acceptInvitation(request, response) {
  try {
    const tokenHash = auth.hashToken(String(request.body.token || ''));
    const password = String(request.body.password || '');
    if (!validPassword(password)) {
      return response.status(400).json({
        error: 'Use pelo menos 12 caracteres, incluindo maiúsculas, minúsculas e números.',
      });
    }
    const [rows] = await connection.execute(
      `SELECT * FROM UserInvitation
        WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > NOW()
        LIMIT 1`,
      [tokenHash],
    );
    const invitation = rows[0];
    if (!invitation) {
      return response.status(404).json({ error: 'Convite inválido ou expirado.' });
    }
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
    await connection.execute(
      'UPDATE UserInvitation SET accepted_at = NOW() WHERE id = ?',
      [invitation.id],
    );
    return response.status(201).json({ user });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function update(request, response) {
  try {
    const target = await model.findById(request.params.id);
    if (!target) {
      return response.status(404).json({ error: 'Utilizador não encontrado.' });
    }
    const role = request.body.role;
    const status = request.body.status;
    if (role !== undefined && !ROLES.has(role)) {
      return response.status(400).json({ error: 'Papel inválido.' });
    }
    if (status !== undefined && !['active', 'disabled'].includes(status)) {
      return response.status(400).json({ error: 'Estado inválido.' });
    }
    if (target.role === 'owner' && request.user.role !== 'owner') {
      return response.status(403).json({
        error: 'Apenas o owner pode alterar outro owner.',
      });
    }
    if (role === 'owner' && request.user.role !== 'owner') {
      return response.status(403).json({
        error: 'Apenas o owner pode atribuir esse papel.',
      });
    }
    if (target.id === request.user.id && status === 'disabled') {
      return response.status(409).json({
        error: 'Não pode desativar a própria conta.',
      });
    }
    if (
      target.role === 'owner' &&
      ((role && role !== 'owner') || status === 'disabled') &&
      (await model.countOwners()) <= 1
    ) {
      return response.status(409).json({
        error: 'O sistema deve manter pelo menos um owner ativo.',
      });
    }
    const patch = {};
    if (request.body.name !== undefined) patch.name = String(request.body.name).trim();
    if (role !== undefined) patch.role = role;
    if (status !== undefined) patch.status = status;
    if (request.body.profile_image !== undefined) {
      patch.profile_image = request.body.profile_image || null;
    }
    return response.status(200).json(await model.update(target.id, patch));
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function remove(request, response) {
  try {
    const target = await model.findById(request.params.id);
    if (!target) {
      return response.status(404).json({ error: 'Utilizador não encontrado.' });
    }
    if (target.role === 'owner' && request.user.role !== 'owner') {
      return response.status(403).json({
        error: 'Apenas o owner pode eliminar outro owner.',
      });
    }
    if (target.id === request.user.id) {
      return response.status(409).json({
        error: 'Não pode eliminar a própria conta.',
      });
    }
    if (target.role === 'owner' && (await model.countOwners()) <= 1) {
      return response.status(409).json({
        error: 'O sistema deve manter pelo menos um owner ativo.',
      });
    }
    await auth.revokeAllRefreshTokens(target.id);
    if (!(await model.remove(target.id))) {
      return response.status(404).json({ error: 'Utilizador não encontrado.' });
    }
    return response.status(204).end();
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

module.exports = {
  acceptInvitation,
  findAll,
  firstAccess,
  invite,
  login,
  logout,
  me,
  refresh,
  remove,
  update,
};
