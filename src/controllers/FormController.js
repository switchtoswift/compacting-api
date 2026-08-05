const { randomUUID } = require('crypto');
const model = require('../models/FormModel');
const mailer = require('../services/mailer');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function notifyEmail() {
  return String(
    process.env.CONTACT_NOTIFY_EMAIL || process.env.SMTP_USER || 'geral@compacting.pt',
  ).trim();
}

async function sendVisitorConfirmation(submission) {
  return mailer.sendMail({
    to: submission.email,
    subject: 'Recebemos a sua mensagem — Compacting',
    text:
      `Olá ${submission.name},\n\n` +
      'Obrigado por contactar a Compacting. Recebemos a sua mensagem e a nossa equipa responderá o mais brevemente possível.\n\n' +
      'Com os melhores cumprimentos,\nEquipa Compacting',
    html:
      `<p>Olá ${escapeHtml(submission.name)},</p>` +
      '<p>Obrigado por contactar a <strong>Compacting</strong>.</p>' +
      '<p>Recebemos a sua mensagem e a nossa equipa responderá o mais brevemente possível.</p>' +
      '<p>Com os melhores cumprimentos,<br>Equipa Compacting</p>',
  });
}

async function sendTeamNotification(submission) {
  const organization = submission.organization
    ? `<p><strong>Instituição:</strong> ${escapeHtml(submission.organization)}</p>`
    : '';
  const phone = submission.phone
    ? `<p><strong>Telefone:</strong> ${escapeHtml(submission.phone)}</p>`
    : '';

  return mailer.sendMail({
    to: notifyEmail(),
    replyTo: submission.email,
    subject: `[Contacto] ${submission.subject}`,
    text:
      `Nova mensagem de contacto\n\n` +
      `Nome: ${submission.name}\n` +
      `Email: ${submission.email}\n` +
      (submission.organization ? `Instituição: ${submission.organization}\n` : '') +
      (submission.phone ? `Telefone: ${submission.phone}\n` : '') +
      `Assunto: ${submission.subject}\n\n` +
      `${submission.message}`,
    html:
      '<p><strong>Nova mensagem de contacto</strong></p>' +
      `<p><strong>Nome:</strong> ${escapeHtml(submission.name)}</p>` +
      `<p><strong>Email:</strong> ${escapeHtml(submission.email)}</p>` +
      organization +
      phone +
      `<p><strong>Assunto:</strong> ${escapeHtml(submission.subject)}</p>` +
      `<p><strong>Mensagem:</strong></p><p>${escapeHtml(submission.message).replaceAll('\n', '<br>')}</p>`,
  });
}

const create = async (request, response) => {
  try {
    const name = String(request.body.name || '').trim();
    const email = String(request.body.email || '').trim().toLowerCase();
    const subject = String(request.body.subject || '').trim();
    const organization = String(request.body.organization || '').trim() || null;
    const message = String(request.body.message || '').trim();
    const phone = request.body.phone ? String(request.body.phone).trim() : null;

    if (!name || !EMAIL.test(email) || !subject || !message) {
      return response.status(400).json({
        error: 'Nome, email, assunto e mensagem válidos são obrigatórios.',
      });
    }

    const submission = await model.create({
      id: randomUUID(),
      name,
      email,
      phone,
      subject,
      organization,
      message,
    });

    let emailSent = false;
    let teamNotified = false;

    if (mailer.isConfigured()) {
      const [visitorResult, teamResult] = await Promise.allSettled([
        sendVisitorConfirmation(submission),
        sendTeamNotification(submission),
      ]);

      if (visitorResult.status === 'fulfilled') {
        emailSent = true;
      } else {
        console.error('Contact confirmation email failed:', visitorResult.reason?.message);
      }

      if (teamResult.status === 'fulfilled') {
        teamNotified = true;
      } else {
        console.error('Contact team notification failed:', teamResult.reason?.message);
      }
    }

    return response.status(201).json({
      id: submission.id,
      email_sent: emailSent,
      team_notified: teamNotified,
    });
  } catch (err) {
    return response.status(500).json({ error: err.message });
  }
};

const findAll = async (_request, response) => {
  try {
    return response.status(200).json(await model.findAll());
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
    return response.status(204).end();
  } catch (err) {
    return response.status(500).json({ error: err.message });
  }
};

module.exports = { create, findAll, findById, remove };
