const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const connection = require('./connection');
require('dotenv').config({ path: ['.env.local', '.env'] });

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 30;

function accessSecret() {
  return process.env.ACCESS_TOKEN_SECRET || process.env.ACESS_TOKEN_SECRET;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    accessSecret(),
    { expiresIn: ACCESS_TTL },
  );
}

async function issueSession(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const id = crypto.randomUUID();
  await connection.execute(
    `INSERT INTO RefreshToken (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
    [id, user.id, hashToken(refreshToken), REFRESH_DAYS],
  );
  return {
    access_token: accessToken,
    expires_in: 15 * 60,
    refresh_token: refreshToken,
    refresh_expires_in: REFRESH_DAYS * 24 * 60 * 60,
  };
}

async function rotateRefreshToken(token) {
  const tokenHash = hashToken(token || '');
  const [rows] = await connection.execute(
    `SELECT rt.id AS refresh_id, u.id, u.name, u.email, u.role, u.status,
            u.requires_password_change
       FROM RefreshToken rt
       JOIN User u ON u.id = rt.user_id
      WHERE rt.token_hash = ?
        AND rt.revoked_at IS NULL
        AND rt.expires_at > NOW()
      LIMIT 1`,
    [tokenHash],
  );
  const user = rows[0];
  if (!user || user.status !== 'active') return null;
  await connection.execute('UPDATE RefreshToken SET revoked_at = NOW() WHERE id = ?', [
    user.refresh_id,
  ]);
  return issueSession(user);
}

async function revokeRefreshToken(token) {
  if (!token) return;
  await connection.execute(
    'UPDATE RefreshToken SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL',
    [hashToken(token)],
  );
}

async function revokeAllRefreshTokens(userId) {
  await connection.execute(
    'UPDATE RefreshToken SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [userId],
  );
}

async function authenticateToken(request, response, next) {
  try {
    const authHeader = request.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return response.status(401).json({ error: 'Authentication required' });

    const payload = jwt.verify(token, accessSecret());
    const [rows] = await connection.execute(
      `SELECT id, name, email, role, status, requires_password_change
         FROM User WHERE id = ? LIMIT 1`,
      [payload.id],
    );
    const user = rows[0];
    if (!user || user.status !== 'active') {
      return response.status(403).json({ error: 'Account disabled or unavailable' });
    }
    request.user = user;
    return next();
  } catch {
    return response.status(403).json({ error: 'Invalid or expired token' });
  }
}

function requirePasswordConfigured(request, response, next) {
  if (request.user?.requires_password_change) {
    return response.status(428).json({
      error: 'É obrigatório definir uma nova palavra-passe antes de continuar.',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  return next();
}

function requireRoles(...roles) {
  return (request, response, next) => {
    if (!request.user || !roles.includes(request.user.role)) {
      return response.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
}

module.exports = {
  authenticateToken,
  hashToken,
  issueSession,
  requirePasswordConfigured,
  requireRoles,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  rotateRefreshToken,
};
