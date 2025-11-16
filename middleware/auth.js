const crypto = require('crypto');
const db = require('../config/database');

// Validate API key from request header
const validateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({ error: 'API key is required in x-api-key header' });
    }

    // Hash the provided API key
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Check if API key exists and is active
    const result = await db.query(
      `SELECT app_id, app_name, is_active, expires_at 
       FROM apps 
       WHERE api_key_hash = $1`,
      [hashedKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const app = result.rows[0];

    if (!app.is_active) {
      return res.status(403).json({ error: 'API key has been revoked' });
    }

    if (new Date(app.expires_at) < new Date()) {
      return res.status(403).json({ error: 'API key has expired' });
    }

    // Attach app info to request
    req.appId = app.app_id;
    req.appName = app.app_name;

    next();
  } catch (err) {
    next(err);
  }
};

// Simple authentication middleware
const authenticateUser = async (req, res, next) => {
  const authToken = req.headers['authorization'];

  if (!authToken) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  if (!authToken.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Invalid authorization format' });
  }

  next();
};

module.exports = {
  validateApiKey,
  authenticateUser,
};