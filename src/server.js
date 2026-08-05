require('dotenv').config({ path: ['.env.local', '.env'] });
const app = require('./app');
const mailer = require('./services/mailer');

// Never let an async error kill the whole API.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const port = Number(process.env.PORT || 3333);
app.listen(port, () => {
  console.log(`Compacting API listening on port ${port}`);

  if (!mailer.isConfigured()) {
    console.warn('SMTP not configured — email sending is disabled.');
    return;
  }

  mailer.verifyConnection().then((result) => {
    if (result.ok) {
      console.log('SMTP connection verified.');
      return;
    }
    console.warn(`SMTP verification failed: ${result.error}`);
  });
});
