const nodemailer = require('nodemailer');
require('dotenv').config({ path: ['.env.local', '.env'] });

function fromAddress() {
  return String(process.env.EMAIL_FROM || process.env.SMTP_FROM || '').trim();
}

function hasAuth() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function usesServicePreset() {
  return Boolean(String(process.env.SMTP_SERVICE || '').trim());
}

function isConfigured() {
  if (!hasAuth() || !fromAddress()) return false;
  if (usesServicePreset()) return true;
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

let transporter;

function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    const auth = {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    };
    if (usesServicePreset()) {
      transporter = nodemailer.createTransport({
        service: String(process.env.SMTP_SERVICE).trim(),
        auth,
      });
    } else {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
        auth,
      });
    }
  }
  return transporter;
}

function maskedFromAddress() {
  const from = fromAddress();
  if (!from) return null;

  const match = from.match(/<([^>]+)>/);
  const email = match ? match[1] : from;
  const at = email.indexOf('@');
  if (at <= 0) return from;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const maskedLocal =
    local.length <= 2 ? `${local[0] || ''}***` : `${local[0]}***${local.slice(-1)}`;
  const maskedEmail = `${maskedLocal}@${domain}`;

  return match ? from.replace(email, maskedEmail) : maskedEmail;
}

async function verifyConnection() {
  const client = getTransporter();
  if (!client) {
    return { ok: false, error: 'SMTP not configured.' };
  }
  try {
    await client.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function sendMail(message) {
  const client = getTransporter();
  if (!client) return { configured: false, messageId: null };

  const result = await client.sendMail({
    from: fromAddress(),
    ...message,
  });
  return { configured: true, messageId: result.messageId };
}

module.exports = {
  fromAddress,
  isConfigured,
  maskedFromAddress,
  sendMail,
  verifyConnection,
};
