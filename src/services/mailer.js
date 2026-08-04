const nodemailer = require('nodemailer');
require('dotenv').config({ path: ['.env.local', '.env'] });

function isConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD &&
      process.env.SMTP_FROM,
  );
}

let transporter;

function getTransporter() {
  if (!isConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return transporter;
}

async function sendMail(message) {
  const client = getTransporter();
  if (!client) return { configured: false, messageId: null };

  const result = await client.sendMail({
    from: process.env.SMTP_FROM,
    ...message,
  });
  return { configured: true, messageId: result.messageId };
}

module.exports = { isConfigured, sendMail };
