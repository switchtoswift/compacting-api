require('dotenv').config();
const app = require('./app');

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
});
