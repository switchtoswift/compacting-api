const crypto = require('crypto');
const path = require('path');
const storage = require('../services/storage');

const extensions = {
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

async function upload(request, response) {
  try {
    if (!storage.isConfigured()) {
      return response.status(503).json({ error: 'O armazenamento Railway não está configurado.' });
    }
    if (!request.file || !extensions[request.file.mimetype]) {
      return response.status(400).json({ error: 'Selecione uma imagem válida.' });
    }
    const now = new Date();
    const key = [
      'news',
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${crypto.randomUUID()}${extensions[request.file.mimetype]}`,
    ].join('/');
    await storage.upload({
      key,
      body: request.file.buffer,
      contentType: request.file.mimetype,
    });
    const publicBase = String(
      process.env.API_PUBLIC_URL ||
        (process.env.RAILWAY_PUBLIC_DOMAIN
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
          : `${request.protocol}://${request.get('host')}`),
    ).replace(/\/$/, '');
    return response.status(201).json({
      path: key,
      url: `${publicBase}/media/${encodeKey(key)}`,
    });
  } catch (error) {
    console.error('Railway storage upload failed:', error);
    return response.status(502).json({ error: 'Não foi possível guardar a imagem no Railway.' });
  }
}

async function serve(request, response) {
  try {
    const key = String(request.params[0] || '');
    if (!key.startsWith('news/') || key.includes('..') || path.isAbsolute(key)) {
      return response.status(400).json({ error: 'Invalid media path' });
    }
    const object = await storage.get(key);
    response.setHeader('Content-Type', object.ContentType || 'application/octet-stream');
    response.setHeader('Cache-Control', object.CacheControl || 'public,max-age=86400');
    response.setHeader('Content-Disposition', 'inline');
    if (object.ETag) response.setHeader('ETag', object.ETag);
    if (object.ContentLength !== undefined) {
      response.setHeader('Content-Length', String(object.ContentLength));
    }
    if (typeof object.Body?.pipe !== 'function') {
      return response.status(502).json({ error: 'Invalid storage response' });
    }
    return object.Body.pipe(response);
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return response.status(404).json({ error: 'Media not found' });
    }
    console.error('Railway storage read failed:', error);
    return response.status(502).json({ error: 'Não foi possível obter a imagem.' });
  }
}

module.exports = { serve, upload };
