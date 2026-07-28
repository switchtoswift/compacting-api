require('dotenv').config();
const app = require('./app');

// Never let an async error kill the whole API.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const fs = require('fs');
app.listen(3333, () => {
  console.log('Server Runing');
  try { fs.writeFileSync('/tmp/api-ready', `${process.pid}`); } catch (e) { console.error('ready-file write failed:', e.message); }
});
