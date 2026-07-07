require('dotenv').config();
const validateEnv = require('./config/validateEnv');

validateEnv();

const app = require('./app');
const activity = require('./services/activityLog.service');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✦ Lasev Resort API running on port ${PORT}`);
  console.log(`Health: /api/health`);
  console.log(`Ready:  /api/ready`);
  activity.logSystem({
    level: 'info',
    event: 'server_start',
    message: `Lasev Resort API started on port ${PORT}`,
    details: { port: PORT, nodeEnv: process.env.NODE_ENV || 'development' },
  });
});

process.on('unhandledRejection', reason => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error('Unhandled rejection:', err);
  activity.logSystem({
    level: 'error',
    event: 'unhandled_rejection',
    message: err.message,
    details: { stack: err.stack },
  });
});

process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err);
  activity.logSystem({
    level: 'error',
    event: 'uncaught_exception',
    message: err.message,
    details: { stack: err.stack },
  });
});
