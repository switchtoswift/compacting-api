# Newsletter API

Node/Express + MySQL REST API for **Newsletter**, **User**, and **Form** resources.

## Stack
- **Express 4** + **mysql2/promise** connection pool
- **JWT** auth (`jsonwebtoken`) + **bcrypt** password hashing
- Layered architecture: `router -> controller -> model -> DB pool`
- CORS whitelist for local frontends

## Project layout
```
src/
  server.js              # entry: listens on 3333
  app.js                 # express instance + CORS + json
  router.js              # routes -> controllers (auth gates in between)
  db-setup.js            # creates tables + seeds admin user
  models/
    connection.js        # mysql2 pool from .env
    Auth.js              # JWT authenticateToken middleware
    NewsletterModel.js
    UserModel.js
    FormModel.js
  controllers/
    NewsletterController.js
    UserController.js
    FormController.js
test/
  verify.js              # in-process integration suite (--uses live DB--)
test.rest                # REST Client request collection
```

## Setup
1. `npm install`
2. `cp .env.example .env` and fill in MySQL + JWT secrets
3. `npm run setup-db` — creates the three tables and seeds an admin
   (`admin@example.com` / `admin123`)
4. `npm start` — serves on `http://localhost:3333`

## Environment variables
```
MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB, MYSQL_PORT
ACESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET
```

## Endpoints
| Method | Path | Auth |
|--------|------|------|
| POST | `/users/register` | public |
| POST | `/users/login` | public |
| GET  | `/users/me` | JWT |
| GET  | `/users` | JWT |
| GET  | `/newsletters` | public |
| GET  | `/newsletters/slug/:locale/:slug` | public |
| GET  | `/newsletters/:id` | public |
| POST | `/newsletters` | JWT |
| PUT  | `/newsletters/:id` | JWT |
| DELETE | `/newsletters/:id` | JWT |
| POST | `/forms` | public |
| GET  | `/forms` | JWT |
| GET  | `/forms/:id` | JWT |
| DELETE | `/forms/:id` | JWT |

## Verify
`npm run verify` boots the app on an ephemeral port and exercises every
endpoint against the configured (Railway) database. Requires a valid `.env`.
