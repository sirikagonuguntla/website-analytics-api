const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../config/database');
const { authenticateUser } = require('../middleware/auth');

// Register a new app/website and generate API key
router.post('/register', async (req, res, next) => {
  try {
    const { appName, appUrl, email } = req.body;

    if (!appName || !appUrl || !email) {
      return res.status(400).json({
        error: 'appName, appUrl, and email are required',
      });
    }

    // Generate unique API key
    const apiKey = crypto.randomBytes(32).toString('hex');
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Insert into database
    const result = await db.query(
      `INSERT INTO apps (app_name, app_url, email, api_key_hash, created_at, expires_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '1 year')
       RETURNING app_id, app_name, app_url, email, created_at, expires_at`,
      [appName, appUrl, email, hashedKey]
    );

    res.status(201).json({
      message: 'App registered successfully',
      app: result.rows[0],
      apiKey: apiKey,
      warning: 'Store this API key securely. It will not be shown again.',
    });
  } catch (err) {
    next(err);
  }
});

// Retrieve API key (requires authentication)
router.get('/api-key', authenticateUser, async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await db.query(
      `SELECT app_id, app_name, app_url, email, created_at, expires_at, is_active
       FROM apps WHERE email = $1 AND is_active = true`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No active apps found for this email' });
    }

    res.json({
      apps: result.rows,
      note: 'API keys are not retrievable. Use regenerate endpoint to create a new key.',
    });
  } catch (err) {
    next(err);
  }
});

// Revoke API key
router.post('/revoke', authenticateUser, async (req, res, next) => {
  try {
    const { appId } = req.body;

    if (!appId) {
      return res.status(400).json({ error: 'appId is required' });
    }

    await db.query(
      `UPDATE apps SET is_active = false, updated_at = NOW() WHERE app_id = $1`,
      [appId]
    );

    res.json({ message: 'API key revoked successfully' });
  } catch (err) {
    next(err);
  }
});

// Regenerate API key
router.post('/regenerate', authenticateUser, async (req, res, next) => {
  try {
    const { appId } = req.body;

    if (!appId) {
      return res.status(400).json({ error: 'appId is required' });
    }

    const newApiKey = crypto.randomBytes(32).toString('hex');
    const hashedKey = crypto.createHash('sha256').update(newApiKey).digest('hex');

    const result = await db.query(
      `UPDATE apps 
       SET api_key_hash = $1, is_active = true, updated_at = NOW(), expires_at = NOW() + INTERVAL '1 year'
       WHERE app_id = $2
       RETURNING app_id, app_name, app_url`,
      [hashedKey, appId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'App not found' });
    }

    res.json({
      message: 'API key regenerated successfully',
      app: result.rows[0],
      apiKey: newApiKey,
      warning: 'Store this API key securely. It will not be shown again.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;