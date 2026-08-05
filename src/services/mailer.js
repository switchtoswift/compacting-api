const nodemailer = require('nodemailer');
require('dotenv').config({ path: ['.env.local', '.env'] });

function fromAddress() {
  const explicit = String(process.env.EMAIL_FROM || process.env.SMTP_FROM || '').trim();
  if (explicit) return explicit;

  const user = String(process.env.SMTP_USER || '').trim();
  if (user) return `Compacting <${user}>`;

  return '';
}

function smtpPassword() {
  return String(process.env.SMTP_PASSWORD || '').replace(/\s/g, '');
}

function hasAuth() {
  return Boolean(process.env.SMTP_USER && smtpPassword());
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
      pass: smtpPassword(),
    };
    if (usesServicePreset()) {
      transporter = nodemailer.createTransport({
        service: String(process.env.SMTP_SERVICE).trim(),
        auth,
        connectionTimeout: 20_000,
        greetingTimeout: 20_000,
        socketTimeout: 30_000,
      });
    } else {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
        auth,
        connectionTimeout: 20_000,
        greetingTimeout: 20_000,
        socketTimeout: 30_000,
      });
    }
  }
  return transporter;
}

function maskedEmail(email) {
  const value = String(email || '').trim();
  const at = value.indexOf('@');
  if (at <= 0) return value;

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const maskedLocal =
    local.length <= 2 ? `${local[0] || ''}***` : `${local[0]}***${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
}

function maskedFromAddress() {
  const from = fromAddress();
  if (!from) return null;

  const match = from.match(/<([^>]+)>/);
  const email = match ? match[1] : from;
  const maskedEmailValue = maskedEmail(email);

  return match ? from.replace(email, maskedEmailValue) : maskedEmailValue;
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

const SEND_TIMEOUT_MS = 30_000;

async function sendMail(message) {
  const client = getTransporter();
  if (!client) return { configured: false, messageId: null };

  const sendPromise = client.sendMail({
    from: fromAddress(),
    ...message,
  });
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`SMTP send timed out after ${SEND_TIMEOUT_MS / 1000}s`)), SEND_TIMEOUT_MS);
  });

  const result = await Promise.race([sendPromise, timeoutPromise]);
  return { configured: true, messageId: result.messageId };
}

module.exports = {
  fromAddress,
  isConfigured,
  maskedEmail,
  maskedFromAddress,
  sendMail,
  verifyConnection,
};
