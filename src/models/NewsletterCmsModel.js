const connection = require('./connection');

function toDatabaseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date value');
  }
  return date;
}

function parseCampaign(row) {
  if (!row) return row;
  let articles = row.articles;
  if (typeof articles === 'string') {
    try {
      articles = JSON.parse(articles);
    } catch {
      articles = [];
    }
  }
  return { ...row, articles: articles || [] };
}

async function upsertSubscriber(data) {
  const [existing] = await connection.execute(
    'SELECT * FROM NewsletterSubscriber WHERE email = ? LIMIT 1',
    [data.email],
  );
  if (existing[0]) {
    await connection.execute(
      `UPDATE NewsletterSubscriber
          SET name = COALESCE(?, name), locale = ?, status = ?,
              confirmation_token_hash = ?,
              consent_at = NOW(), confirmed_at = ?, unsubscribed_at = NULL,
              source = ?, updated_at = NOW()
        WHERE id = ?`,
      [
        data.name || null,
        data.locale,
        data.status,
        data.confirmation_token_hash,
        data.status === 'active' ? new Date() : null,
        data.source,
        existing[0].id,
      ],
    );
    return findSubscriberById(existing[0].id);
  }
  await connection.execute(
    `INSERT INTO NewsletterSubscriber
      (id, email, name, locale, status, confirmation_token_hash,
       unsubscribe_token_hash, consent_at, confirmed_at, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, NOW(), NOW())`,
    [
      data.id,
      data.email,
      data.name || null,
      data.locale,
      data.status,
      data.confirmation_token_hash,
      data.unsubscribe_token_hash,
      data.status === 'active' ? new Date() : null,
      data.source,
    ],
  );
  return findSubscriberById(data.id);
}

async function findSubscriberById(id) {
  const [rows] = await connection.execute(
    `SELECT id, email, name, locale, status, consent_at, confirmed_at,
            unsubscribed_at, source, created_at, updated_at
       FROM NewsletterSubscriber WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0];
}

async function findSubscribers({ status, query } = {}) {
  const where = [];
  const values = [];
  if (status) {
    where.push('status = ?');
    values.push(status);
  }
  if (query) {
    where.push('(email LIKE ? OR name LIKE ?)');
    const value = `%${query}%`;
    values.push(value, value);
  }
  const [rows] = await connection.execute(
    `SELECT id, email, name, locale, status, consent_at, confirmed_at,
            unsubscribed_at, source, created_at, updated_at
       FROM NewsletterSubscriber
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC`,
    values,
  );
  return rows;
}

async function confirmSubscriber(tokenHash) {
  const [result] = await connection.execute(
    `UPDATE NewsletterSubscriber
        SET status = 'active', confirmed_at = NOW(), confirmation_token_hash = NULL,
            updated_at = NOW()
      WHERE confirmation_token_hash = ? AND status = 'pending'`,
    [tokenHash],
  );
  return result.affectedRows;
}

async function unsubscribe(tokenHash) {
  const [result] = await connection.execute(
    `UPDATE NewsletterSubscriber
        SET status = 'unsubscribed', unsubscribed_at = NOW(), updated_at = NOW()
      WHERE unsubscribe_token_hash = ?`,
    [tokenHash],
  );
  return result.affectedRows;
}

async function findSubscriberByConfirmationHash(tokenHash) {
  const [rows] = await connection.execute(
    'SELECT * FROM NewsletterSubscriber WHERE confirmation_token_hash = ? LIMIT 1',
    [tokenHash],
  );
  return rows[0];
}

async function findActiveSubscribers(locale) {
  const [rows] = await connection.execute(
    `SELECT * FROM NewsletterSubscriber
      WHERE status = 'active' AND locale = ? ORDER BY created_at ASC`,
    [locale],
  );
  return rows;
}

async function createCampaign(data) {
  const db = await connection.getConnection();
  try {
    await db.beginTransaction();
    await db.execute(
      `INSERT INTO NewsletterCampaign
        (id, subject, preheader, introduction, locale, status, scheduled_at,
         created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        data.id,
        data.subject,
        data.preheader || null,
        data.introduction || null,
        data.locale,
        data.status || 'draft',
        toDatabaseDate(data.scheduled_at),
        data.created_by,
      ],
    );
    await replaceCampaignArticles(db, data.id, data.article_ids || []);
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
  return findCampaignById(data.id);
}

async function replaceCampaignArticles(db, campaignId, articleIds) {
  await db.execute('DELETE FROM NewsletterCampaignArticle WHERE campaign_id = ?', [
    campaignId,
  ]);
  for (const [position, articleId] of articleIds.entries()) {
    await db.execute(
      `INSERT INTO NewsletterCampaignArticle (campaign_id, article_id, position)
       VALUES (?, ?, ?)`,
      [campaignId, articleId, position],
    );
  }
}

async function findCampaignById(id) {
  const [rows] = await connection.execute(
    `SELECT c.*,
      COALESCE(
        JSON_ARRAYAGG(
          CASE WHEN n.id IS NULL THEN NULL ELSE JSON_OBJECT(
            'id', n.id, 'title', n.title, 'slug', n.slug, 'excerpt', n.excerpt,
            'category', n.category, 'cover_image', n.cover_image,
            'publication_status', n.publication_status, 'position', ca.position
          ) END
        ),
        JSON_ARRAY()
      ) AS articles
     FROM NewsletterCampaign c
     LEFT JOIN NewsletterCampaignArticle ca ON ca.campaign_id = c.id
     LEFT JOIN NewsArticle n ON n.id = ca.article_id
     WHERE c.id = ?
     GROUP BY c.id
     LIMIT 1`,
    [id],
  );
  const campaign = parseCampaign(rows[0]);
  if (campaign) {
    campaign.articles = campaign.articles
      .filter(Boolean)
      .sort((a, b) => a.position - b.position);
  }
  return campaign;
}

async function findCampaigns() {
  const [rows] = await connection.execute(
    `SELECT c.*,
            COUNT(DISTINCT ca.article_id) AS article_count,
            COUNT(DISTINCT CASE WHEN d.status = 'sent' THEN d.id END) AS sent_count,
            COUNT(DISTINCT CASE WHEN d.status = 'failed' THEN d.id END) AS failed_count
       FROM NewsletterCampaign c
       LEFT JOIN NewsletterCampaignArticle ca ON ca.campaign_id = c.id
       LEFT JOIN NewsletterDelivery d ON d.campaign_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC`,
  );
  return rows;
}

async function updateCampaign(id, data) {
  const db = await connection.getConnection();
  try {
    await db.beginTransaction();
    const map = {
      subject: 'subject',
      preheader: 'preheader',
      introduction: 'introduction',
      locale: 'locale',
      status: 'status',
      scheduled_at: 'scheduled_at',
    };
    const fields = [];
    const values = [];
    for (const [key, column] of Object.entries(map)) {
      if (data[key] !== undefined) {
        fields.push(`${column} = ?`);
        values.push(key === 'scheduled_at' ? toDatabaseDate(data[key]) : data[key]);
      }
    }
    if (fields.length) {
      values.push(id);
      await db.execute(
        `UPDATE NewsletterCampaign SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
        values,
      );
    }
    if (data.article_ids) await replaceCampaignArticles(db, id, data.article_ids);
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
  return findCampaignById(id);
}

async function removeCampaign(id) {
  const [result] = await connection.execute(
    "DELETE FROM NewsletterCampaign WHERE id = ? AND status IN ('draft','scheduled')",
    [id],
  );
  return result.affectedRows;
}

async function markCampaignSending(id) {
  const [result] = await connection.execute(
    "UPDATE NewsletterCampaign SET status = 'sending', updated_at = NOW() WHERE id = ? AND status IN ('draft','scheduled')",
    [id],
  );
  return result.affectedRows;
}

async function completeCampaign(id) {
  await connection.execute(
    "UPDATE NewsletterCampaign SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = ?",
    [id],
  );
}

async function createDelivery(data) {
  await connection.execute(
    `INSERT INTO NewsletterDelivery
      (id, campaign_id, subscriber_id, status, provider_message_id, error_message, sent_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE id = id`,
    [
      data.id,
      data.campaign_id,
      data.subscriber_id,
      data.status,
      data.provider_message_id || null,
      data.error_message || null,
      data.status === 'sent' ? new Date() : null,
    ],
  );
}

async function dashboard() {
  const [[users], [news], [subscribers], [campaigns]] = await Promise.all([
    connection.query("SELECT COUNT(*) AS total FROM User WHERE status = 'active'"),
    connection.query(
      "SELECT COUNT(*) AS total FROM NewsArticle WHERE publication_status = 'published'",
    ),
    connection.query(
      "SELECT COUNT(*) AS total FROM NewsletterSubscriber WHERE status = 'active'",
    ),
    connection.query('SELECT COUNT(*) AS total FROM NewsletterCampaign'),
  ]);
  return {
    users: Number(users[0].total),
    published_news: Number(news[0].total),
    active_subscribers: Number(subscribers[0].total),
    campaigns: Number(campaigns[0].total),
  };
}

module.exports = {
  completeCampaign,
  confirmSubscriber,
  createCampaign,
  createDelivery,
  dashboard,
  findActiveSubscribers,
  findCampaignById,
  findCampaigns,
  findSubscriberByConfirmationHash,
  findSubscribers,
  markCampaignSending,
  removeCampaign,
  unsubscribe,
  updateCampaign,
  upsertSubscriber,
};
