const mysql = require('mysql2/promise');
require('dotenv').config({ path: ['.env.local', '.env'] });

const connectionUrl =
  process.env.MYSQL_URL ||
  process.env.DATABASE_URL ||
  process.env.MYSQL_PUBLIC_URL;

const connection = connectionUrl
  ? mysql.createPool(connectionUrl)
  : mysql.createPool({
      host: process.env.MYSQL_HOST || process.env.MYSQLHOST,
      user: process.env.MYSQL_USER || process.env.MYSQLUSER,
      password: process.env.MYSQL_PASSWORD || process.env.MYSQLPASSWORD,
      database:
        process.env.MYSQL_DB ||
        process.env.MYSQLDATABASE ||
        process.env.MYSQL_DATABASE,
      port: Number(process.env.MYSQL_PORT || process.env.MYSQLPORT || 3306),
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
      enableKeepAlive: true,
    });

module.exports = connection;
