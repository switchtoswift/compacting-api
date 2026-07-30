const { randomUUID } = require('crypto');
const bcrypt = require('bcrypt');

async function columnExists(db, table, column) {
  const [rows] = await db.execute(
    `SELECT 1
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
      LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function addColumn(db, table, column, definition) {
  if (!(await columnExists(db, table, column))) {
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function tableExists(db, table) {
  const [rows] = await db.execute(
    `SELECT 1
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

async function up(db) {
  await db.query(
    "ALTER TABLE `User` MODIFY `role` ENUM('owner','admin','editor','user') NOT NULL DEFAULT 'editor'",
  );
  await db.query("UPDATE `User` SET `role` = 'editor' WHERE `role` = 'user'");
  await db.query(
    "ALTER TABLE `User` MODIFY `role` ENUM('owner','admin','editor') NOT NULL DEFAULT 'editor'",
  );
  await addColumn(db, 'User', 'status', "ENUM('active','disabled') NOT NULL DEFAULT 'active'");
  await addColumn(db, 'User', 'last_login_at', 'DATETIME NULL');
  await addColumn(db, 'User', 'created_by', 'CHAR(36) NULL');

  const ownerEmail = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
  if (ownerEmail) {
    await db.execute("UPDATE `User` SET `role` = 'owner', `status` = 'active' WHERE LOWER(`email`) = ?", [
      ownerEmail,
    ]);
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS UserInvitation (
      id CHAR(36) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role ENUM('admin','editor') NOT NULL,
      token_hash CHAR(64) NOT NULL,
      invited_by CHAR(36) NOT NULL,
      expires_at DATETIME NOT NULL,
      accepted_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      UNIQUE KEY uq_invitation_token (token_hash),
      KEY idx_invitation_email (email),
      CONSTRAINT fk_invitation_inviter FOREIGN KEY (invited_by) REFERENCES User(id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS RefreshToken (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      UNIQUE KEY uq_refresh_token_hash (token_hash),
      KEY idx_refresh_user (user_id),
      CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS NewsArticle (
      id CHAR(36) PRIMARY KEY,
      locale ENUM('pt','en') NOT NULL DEFAULT 'pt',
      translation_group_id CHAR(36) NOT NULL,
      slug VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      excerpt TEXT NOT NULL,
      category VARCHAR(120) NOT NULL DEFAULT 'Atualidade',
      body JSON NULL,
      cover_image VARCHAR(1024) NULL,
      cover_alt VARCHAR(500) NULL,
      seo_title VARCHAR(255) NULL,
      seo_description VARCHAR(500) NULL,
      publication_status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
      published_at DATETIME NULL,
      author_id CHAR(36) NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uq_news_slug_locale (slug, locale),
      KEY idx_news_publication (locale, publication_status, published_at),
      CONSTRAINT fk_news_author FOREIGN KEY (author_id) REFERENCES User(id) ON DELETE SET NULL
    )
  `);

  if (await tableExists(db, 'Newsletter')) {
    await db.query(`
      INSERT IGNORE INTO NewsArticle
        (id, locale, translation_group_id, slug, title, excerpt, body, cover_image,
         publication_status, published_at, created_at, updated_at)
      SELECT id, locale, translation_group_id, slug, title, description, body, cover_image,
             publication_status, published_at, created_at, updated_at
        FROM Newsletter
    `);
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS NewsletterSubscriber (
      id CHAR(36) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255) NULL,
      locale ENUM('pt','en') NOT NULL DEFAULT 'pt',
      status ENUM('pending','active','unsubscribed') NOT NULL DEFAULT 'pending',
      confirmation_token_hash CHAR(64) NULL,
      unsubscribe_token_hash CHAR(64) NOT NULL,
      consent_at DATETIME NOT NULL,
      confirmed_at DATETIME NULL,
      unsubscribed_at DATETIME NULL,
      source VARCHAR(120) NOT NULL DEFAULT 'website',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      UNIQUE KEY uq_subscriber_email (email),
      UNIQUE KEY uq_subscriber_confirmation (confirmation_token_hash),
      UNIQUE KEY uq_subscriber_unsubscribe (unsubscribe_token_hash),
      KEY idx_subscriber_status (status, locale)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS NewsletterCampaign (
      id CHAR(36) PRIMARY KEY,
      subject VARCHAR(255) NOT NULL,
      preheader VARCHAR(255) NULL,
      introduction TEXT NULL,
      locale ENUM('pt','en') NOT NULL DEFAULT 'pt',
      status ENUM('draft','scheduled','sending','sent') NOT NULL DEFAULT 'draft',
      scheduled_at DATETIME NULL,
      sent_at DATETIME NULL,
      created_by CHAR(36) NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      KEY idx_campaign_status (status, scheduled_at),
      CONSTRAINT fk_campaign_creator FOREIGN KEY (created_by) REFERENCES User(id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS NewsletterCampaignArticle (
      campaign_id CHAR(36) NOT NULL,
      article_id CHAR(36) NOT NULL,
      position INT NOT NULL DEFAULT 0,
      PRIMARY KEY (campaign_id, article_id),
      KEY idx_campaign_article_position (campaign_id, position),
      CONSTRAINT fk_campaign_article_campaign FOREIGN KEY (campaign_id)
        REFERENCES NewsletterCampaign(id) ON DELETE CASCADE,
      CONSTRAINT fk_campaign_article_news FOREIGN KEY (article_id)
        REFERENCES NewsArticle(id) ON DELETE CASCADE
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS NewsletterDelivery (
      id CHAR(36) PRIMARY KEY,
      campaign_id CHAR(36) NOT NULL,
      subscriber_id CHAR(36) NOT NULL,
      status ENUM('sent','failed') NOT NULL,
      provider_message_id VARCHAR(255) NULL,
      error_message TEXT NULL,
      sent_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      UNIQUE KEY uq_campaign_delivery (campaign_id, subscriber_id),
      CONSTRAINT fk_delivery_campaign FOREIGN KEY (campaign_id)
        REFERENCES NewsletterCampaign(id) ON DELETE CASCADE,
      CONSTRAINT fk_delivery_subscriber FOREIGN KEY (subscriber_id)
        REFERENCES NewsletterSubscriber(id) ON DELETE CASCADE
    )
  `);

  const [owners] = await db.query("SELECT id FROM `User` WHERE `role` = 'owner' LIMIT 1");
  if (!owners.length) {
    const [admins] = await db.query(
      "SELECT id FROM `User` WHERE `role` = 'admin' ORDER BY created_at ASC LIMIT 1",
    );
    if (admins[0]) {
      await db.execute("UPDATE `User` SET `role` = 'owner' WHERE id = ?", [admins[0].id]);
    } else if (ownerEmail && process.env.OWNER_PASSWORD) {
      const passwordHash = await bcrypt.hash(process.env.OWNER_PASSWORD, 12);
      await db.execute(
        `INSERT INTO User
          (id, role, name, email, password_hash, status, created_at, updated_at)
         VALUES (?, 'owner', 'Owner', ?, ?, 'active', NOW(), NOW())`,
        [randomUUID(), ownerEmail, passwordHash],
      );
    }
  }
}

module.exports = { id: '001-admin-cms', up };
