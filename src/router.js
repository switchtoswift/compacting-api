const express = require('express');
const { authenticateToken } = require('./models/Auth');

const NewsletterController = require('./controllers/NewsletterController');
const UserController = require('./controllers/UserController');
const FormController = require('./controllers/FormController');

require('dotenv').config();

const router = express.Router();

// Health
router.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// ----- User / Auth -----
router.post('/users/register', UserController.register);
router.post('/users/login', UserController.login);
router.get('/users/me', authenticateToken, UserController.me);
router.get('/users', authenticateToken, UserController.findAll);

// ----- Newsletter (all protected except list/get by slug) -----
router.get('/newsletters', NewsletterController.findAll);
router.get('/newsletters/slug/:locale/:slug', NewsletterController.findBySlug);
router.get('/newsletters/:id', NewsletterController.findById);
router.post('/newsletters', authenticateToken, NewsletterController.create);
router.put('/newsletters/:id', authenticateToken, NewsletterController.update);
router.delete('/newsletters/:id', authenticateToken, NewsletterController.remove);

// ----- Form (public create, protected list/delete) -----
router.post('/forms', FormController.create);
router.get('/forms', authenticateToken, FormController.findAll);
router.get('/forms/:id', authenticateToken, FormController.findById);
router.delete('/forms/:id', authenticateToken, FormController.remove);

module.exports = router;
