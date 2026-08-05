const express = require('express');
const {
  authenticateToken,
  requirePasswordConfigured,
  requireRoles,
} = require('./models/Auth');
const NewsController = require('./controllers/NewsController');
const NewsletterCmsController = require('./controllers/NewsletterCmsController');
const UserController = require('./controllers/UserController');
const FormController = require('./controllers/FormController');
const StorageController = require('./controllers/StorageController');
const multer = require('multer');

const router = express.Router();
const admins = [
  authenticateToken,
  requirePasswordConfigured,
  requireRoles('owner', 'admin'),
];
const editors = [
  authenticateToken,
  requirePasswordConfigured,
  requireRoles('owner', 'admin', 'editor'),
];
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter(_request, file, callback) {
    callback(null, file.mimetype.startsWith('image/'));
  },
});

router.get('/health', (_request, response) =>
  response.status(200).json({ status: 'ok', service: 'compacting-api' }),
);

// Account creation is invitation-only.
router.post('/auth/login', UserController.login);
router.post('/auth/refresh', UserController.refresh);
router.post('/auth/logout', UserController.logout);
router.get('/auth/me', authenticateToken, UserController.me);
router.post('/auth/first-access', authenticateToken, UserController.firstAccess);
router.post('/auth/invitations/accept', UserController.acceptInvitation);

router.get('/news', NewsController.publicList);
router.get('/news/:locale/:slug', NewsController.publicBySlug);
router.get('/media/*', StorageController.serve);
router.post('/newsletter/subscribe', NewsletterCmsController.subscribe);
router.get('/newsletter/confirm', NewsletterCmsController.confirm);
router.get('/newsletter/unsubscribe', NewsletterCmsController.unsubscribe);

// Temporary read-only aliases for integrations using the previous article name.
router.get('/newsletters', NewsController.publicList);
router.get('/newsletters/slug/:locale/:slug', NewsController.publicBySlug);
router.get('/newsletters/:id', NewsController.publicById);

router.get('/admin/dashboard', ...editors, NewsletterCmsController.dashboard);
router.get('/admin/users', ...admins, UserController.findAll);
router.post('/admin/invitations', ...admins, UserController.invite);
router.patch('/admin/users/:id', ...admins, UserController.update);
router.delete('/admin/users/:id', ...admins, UserController.remove);

router.get('/admin/news', ...editors, NewsController.findAll);
router.get('/admin/news/:id', ...editors, NewsController.findById);
router.post('/admin/news', ...editors, NewsController.create);
router.put('/admin/news/:id', ...editors, NewsController.update);
router.patch('/admin/news/:id', ...editors, NewsController.update);
router.delete('/admin/news/:id', ...editors, NewsController.remove);
router.post('/admin/upload', ...editors, imageUpload.single('file'), StorageController.upload);

router.get('/admin/newsletter/subscribers', ...editors, NewsletterCmsController.subscribers);
router.get('/admin/newsletter/status', ...editors, NewsletterCmsController.status);
router.get('/admin/newsletter/campaigns', ...editors, NewsletterCmsController.campaigns);
router.get('/admin/newsletter/campaigns/:id', ...editors, NewsletterCmsController.campaign);
router.post('/admin/newsletter/campaigns', ...editors, NewsletterCmsController.createCampaign);
router.put('/admin/newsletter/campaigns/:id', ...editors, NewsletterCmsController.updateCampaign);
router.delete('/admin/newsletter/campaigns/:id', ...editors, NewsletterCmsController.removeCampaign);
router.post('/admin/newsletter/campaigns/:id/send', ...editors, NewsletterCmsController.sendCampaign);

router.post('/forms', FormController.create);
router.get('/admin/forms', ...editors, FormController.findAll);
router.get('/admin/forms/:id', ...editors, FormController.findById);
router.delete('/admin/forms/:id', ...editors, FormController.remove);

module.exports = router;
