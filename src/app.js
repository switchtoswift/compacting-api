const express = require('express');
const cors = require('cors');
const router = require('./router');

const app = express();
const developmentOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3333',
];
const configuredOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([...developmentOrigins, ...configuredOrigins]);

app.disable('x-powered-by');
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
  }),
);
app.use(express.json({ limit: '1mb' }));

const buckets = new Map();
function rateLimit({ windowMs, limit }) {
  return (request, response, next) => {
    const key = `${request.ip}:${request.path}`;
    const now = Date.now();
    const current = buckets.get(key);
    const bucket =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    response.setHeader('RateLimit-Limit', limit);
    response.setHeader('RateLimit-Remaining', Math.max(0, limit - bucket.count));
    if (bucket.count > limit) {
      return response.status(429).json({ error: 'Demasiados pedidos. Tente novamente mais tarde.' });
    }
    return next();
  };
}

app.use('/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 }));
app.use('/newsletter/subscribe', rateLimit({ windowMs: 60 * 60 * 1000, limit: 10 }));
app.use(router);
app.use((_request, response) => response.status(404).json({ error: 'Not found' }));
app.use((error, _request, response, _next) => {
  if (error.message === 'Origin is not allowed by CORS') {
    return response.status(403).json({ error: error.message });
  }
  console.error(error);
  return response.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
