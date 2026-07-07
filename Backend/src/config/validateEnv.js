function requireEnv(name) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

function rejectPlaceholder(name) {
  const value = process.env[name] || '';
  if (/generate-|example\.com|change-me|password/i.test(value)) {
    throw new Error(`${name} must be changed from the placeholder value`);
  }
}

function validateEnv() {
  [
    'JWT_SECRET',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'CLIENT_ORIGIN',
  ].forEach(requireEnv);

  if (process.env.NODE_ENV === 'production') {
    if (process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
    ['JWT_SECRET', 'DB_PASSWORD', 'CLIENT_ORIGIN'].forEach(rejectPlaceholder);
    if (!/^https:\/\//i.test(process.env.CLIENT_ORIGIN)) {
      throw new Error('CLIENT_ORIGIN must use HTTPS in production');
    }
  }
}

module.exports = validateEnv;
