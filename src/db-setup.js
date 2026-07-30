require('dotenv').config();
const connection = require('./models/connection');

const TABLES = [
  `CREATE TABLE IF NOT EXISTS Newsletter (
    id CHAR(36) PRIMARY KEY,
    locale ENUM('pt','en') NOT NULL,
    translation_group_id CHAR(36) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    body JSON,
    cover_image VARCHAR(512) NULL,
    publication_status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
    published_at DATETIME NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uq_newsletter_slug_locale (slug, locale)
  )`,
  `CREATE TABLE IF NOT EXISTS User (
    id CHAR(36) PRIMARY KEY,
    role ENUM('admin','user') NOT NULL DEFAULT 'user',
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    profile_image VARCHAR(512) NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uq_user_email (email)
  )`,
  `CREATE TABLE IF NOT EXISTS Form (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NULL,
    message TEXT NOT NULL,
    created_at DATETIME NOT NULL
  )`,
];

(async () => {
  try {
    console.log('Applying schema to database...');
    for (const sql of TABLES) {
      await connection.query(sql);
    }
    console.log('Tables ensured: Newsletter, User, Form');
    console.log('Base schema complete. Run `npm run migrate` to apply the admin CMS schema.');
    process.exit(0);
  } catch (err) {
    console.error('DB setup failed:', err.message);
    process.exit(1);
  }
})();
