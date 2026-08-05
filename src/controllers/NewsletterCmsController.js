const crypto = require('crypto');
const auth = require('../models/Auth');
const model = require('../models/NewsletterCmsModel');
const mailer = require('../services/mailer');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function unsubscribeToken(id) {
  return crypto
    .createHmac('sha256', process.env.REFRESH_TOKEN_SECRET || 'development-only')
    .update(`unsubscribe:${id}`)
    .digest('hex');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function campaignHtml(campaign, subscriber) {
  const baseUrl = String(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const articleHtml = campaign.articles
    .map(
      (article) => `
        <article style="margin:0 0 32px">
          ${article.cover_image ? `<img src="${escapeHtml(article.cover_image)}" alt="" style="max-width:100%;height:auto">` : ''}
          <p style="color:#ec5b09;font-size:12px;text-transform:uppercase">${escapeHtml(article.category)}</p>
          <h2>${escapeHtml(article.title)}</h2>
          <p>${escapeHtml(article.excerpt)}</p>
          <p><a href="${baseUrl}/${campaign.locale}/noticias/${encodeURIComponent(article.slug)}">Ler notícia</a></p>
        </article>`,
    )
    .join('');
  const token = unsubscribeToken(subscriber.id);
  return `<!doctype html>
    <html lang="${campaign.locale}">
      <body style="font-family:Arial,sans-serif;color:#11110f;background:#f7f6f1;padding:24px">
        <main style="max-width:680px;margin:auto;background:#fffefa;padding:32px">
          <p style="color:#ec5b09;font-size:12px;letter-spacing:.16em;text-transform:uppercase">Compacting</p>
          <h1>${escapeHtml(campaign.subject)}</h1>
          ${campaign.introduction ? `<p>${escapeHtml(campaign.introduction)}</p>` : ''}
          ${articleHtml}
          <hr>
          <p style="font-size:12px;color:#67655f">
            Não pretende receber mais mensagens?
            <a href="${baseUrl}/api/newsletter/unsubscribe?token=${token}">Cancelar subscrição</a>.
          </p>
        </main>
      </body>
    </html>`;
}

async function subscribe(request, response) {
  try {
    const email = String(request.body.email || '').trim().toLowerCase();
    const name = String(request.body.name || '').trim() || null;
    const locale = ['pt', 'en'].includes(request.body.locale) ? request.body.locale : 'pt';
    const consent = request.body.consent === true;
    if (!EMAIL.test(email) || !consent) {
      return response.status(400).json({ error: 'Email válido e consentimento são obrigatórios.' });
    }
    const id = crypto.randomUUID();
    const confirmationToken = crypto.randomBytes(32).toString('hex');
    const unsubscribe = unsubscribeToken(id);
    const status = mailer.isConfigured() ? 'pending' : 'active';
    const subscriber = await model.upsertSubscriber({
      id,
      email,
      name,
      locale,
      status,
      confirmation_token_hash: status === 'pending' ? auth.hashToken(confirmationToken) : null,
      unsubscribe_token_hash: auth.hashToken(unsubscribe),
      source: String(request.body.source || 'website').slice(0, 120),
    });
    if (status === 'pending') {
      const baseUrl = String(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
      const confirmUrl = `${baseUrl}/api/newsletter/confirm?token=${confirmationToken}`;
      await mailer.sendMail({
        to: email,
        subject: 'Confirme a subscrição da newsletter Compacting',
        text: `Confirme a subscrição em ${confirmUrl}`,
        html: `<p>Obrigado pelo interesse na Compacting.</p><p><a href="${confirmUrl}">Confirmar subscrição</a></p>`,
      });
    }
    return response.status(201).json({
      id: subscriber.id,
      status: subscriber.status,
      confirmation_required: status === 'pending',
    });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function confirm(request, response) {
  try {
    const affected = await model.confirmSubscriber(auth.hashToken(String(request.query.token || '')));
    if (!affected) return response.status(404).json({ error: 'Token inválido ou já utilizado.' });
    return response.status(200).json({ confirmed: true });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function unsubscribe(request, response) {
  try {
    const affected = await model.unsubscribe(auth.hashToken(String(request.query.token || '')));
    if (!affected) return response.status(404).json({ error: 'Token inválido.' });
    return response.status(200).json({ unsubscribed: true });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function subscribers(request, response) {
  try {
    return response.status(200).json(await model.findSubscribers(request.query));
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function campaigns(_request, response) {
  try {
    return response.status(200).json(await model.findCampaigns());
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function campaign(request, response) {
  try {
    const row = await model.findCampaignById(request.params.id);
    if (!row) return response.status(404).json({ error: 'Not found' });
    return response.status(200).json(row);
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

function validateCampaign(data, partial = false) {
  const errors = [];
  if (!partial || data.subject !== undefined) {
    if (!String(data.subject || '').trim()) errors.push('subject is required');
  }
  if (data.locale !== undefined && !['pt', 'en'].includes(data.locale)) errors.push('locale is invalid');
  if (data.status !== undefined && !['draft', 'scheduled'].includes(data.status)) {
    errors.push('status is invalid');
  }
  if (data.article_ids !== undefined && !Array.isArray(data.article_ids)) {
    errors.push('article_ids must be an array');
  }
  return errors;
}

async function createCampaign(request, response) {
  try {
    const errors = validateCampaign(request.body);
    if (errors.length) return response.status(400).json({ error: errors.join(', ') });
    const row = await model.createCampaign({
      ...request.body,
      id: crypto.randomUUID(),
      locale: request.body.locale || 'pt',
      created_by: request.user.id,
    });
    return response.status(201).json(row);
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function updateCampaign(request, response) {
  try {
    const errors = validateCampaign(request.body, true);
    if (errors.length) return response.status(400).json({ error: errors.join(', ') });
    const current = await model.findCampaignById(request.params.id);
    if (!current) return response.status(404).json({ error: 'Not found' });
    if (!['draft', 'scheduled'].includes(current.status)) {
      return response.status(409).json({ error: 'Uma campanha enviada já não pode ser alterada.' });
    }
    return response.status(200).json(await model.updateCampaign(request.params.id, request.body));
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function removeCampaign(request, response) {
  try {
    if (!(await model.removeCampaign(request.params.id))) {
      return response.status(409).json({ error: 'A campanha não existe ou já foi enviada.' });
    }
    return response.status(204).end();
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function sendCampaign(request, response) {
  try {
    if (!mailer.isConfigured()) {
      return response.status(409).json({ error: 'SMTP não está configurado.' });
    }
    const campaignRow = await model.findCampaignById(request.params.id);
    if (!campaignRow) return response.status(404).json({ error: 'Not found' });
    if (!campaignRow.articles.length) {
      return response.status(409).json({ error: 'A campanha deve incluir pelo menos uma notícia.' });
    }
    if (campaignRow.articles.some((item) => item.publication_status !== 'published')) {
      return response.status(409).json({ error: 'Todas as notícias devem estar publicadas.' });
    }
    if (!(await model.markCampaignSending(campaignRow.id))) {
      return response.status(409).json({ error: 'A campanha já está a ser processada ou foi enviada.' });
    }
    const recipients = await model.findActiveSubscribers(campaignRow.locale);
    let sent = 0;
    let failed = 0;
    for (let index = 0; index < recipients.length; index += 25) {
      const batch = recipients.slice(index, index + 25);
      const results = await Promise.allSettled(
        batch.map(async (subscriber) => {
          const result = await mailer.sendMail({
            to: subscriber.email,
            subject: campaignRow.subject,
            text: `${campaignRow.introduction || ''}\n\n${campaignRow.articles.map((item) => item.title).join('\n')}`,
            html: campaignHtml(campaignRow, subscriber),
          });
          await model.createDelivery({
            id: crypto.randomUUID(),
            campaign_id: campaignRow.id,
            subscriber_id: subscriber.id,
            status: 'sent',
            provider_message_id: result.messageId,
          });
        }),
      );
      for (const [position, result] of results.entries()) {
        if (result.status === 'fulfilled') {
          sent += 1;
        } else {
          failed += 1;
          await model.createDelivery({
            id: crypto.randomUUID(),
            campaign_id: campaignRow.id,
            subscriber_id: batch[position].id,
            status: 'failed',
            error_message: result.reason?.message || 'Unknown delivery error',
          });
        }
      }
    }
    await model.completeCampaign(campaignRow.id);
    return response.status(200).json({ sent, failed, total: recipients.length });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function dashboard(_request, response) {
  try {
    return response.status(200).json(await model.dashboard());
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}

async function status(_request, response) {
  return response.status(200).json({
    smtp_configured: mailer.isConfigured(),
    from_address: mailer.maskedFromAddress(),
  });
}

module.exports = {
  campaign,
  campaigns,
  confirm,
  createCampaign,
  dashboard,
  removeCampaign,
  sendCampaign,
  status,
  subscribe,
  subscribers,
  unsubscribe,
  updateCampaign,
};
