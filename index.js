require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err.stack);
  } else {
    console.log('✅ Database connected successfully');
    release();
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Middleware to verify API key
const verifyApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key is required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, app_name FROM apps WHERE api_key = $1 AND is_active = true',
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    req.app_id = result.rows[0].id;
    req.app_name = result.rows[0].app_name;
    next();
  } catch (error) {
    console.error('API key verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Website Analytics API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      register: 'POST /api/auth/register',
      collect: 'POST /api/analytics/collect',
      events: 'GET /api/analytics/events',
      summary: 'GET /api/analytics/event-summary'
    }
  });
});

// Auth Routes

// Register new app
app.post('/api/auth/register', async (req, res) => {
  const { appName, appUrl, email } = req.body;

  if (!appName || !appUrl || !email) {
    return res.status(400).json({ 
      error: 'Missing required fields: appName, appUrl, email' 
    });
  }

  try {
    // Generate API key
    const apiKey = 'sk_' + Math.random().toString(36).substring(2) + Date.now().toString(36);

    const result = await pool.query(
      `INSERT INTO apps (app_name, app_url, email, api_key) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, app_name, api_key, created_at`,
      [appName, appUrl, email, apiKey]
    );

    res.status(201).json({
      message: 'App registered successfully',
      app: result.rows[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'App already registered' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Analytics Routes

// Collect analytics event
app.post('/api/analytics/collect', verifyApiKey, async (req, res) => {
  const { event, url, referrer, user_agent, device, browser, os, country, city, custom_data } = req.body;

  if (!event || !url) {
    return res.status(400).json({ 
      error: 'Missing required fields: event, url' 
    });
  }

  try {
    await pool.query(
      `INSERT INTO events 
       (app_id, event, url, referrer, user_agent, device, browser, os, country, city, custom_data) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [req.app_id, event, url, referrer, user_agent, device, browser, os, country, city, custom_data]
    );

    res.status(201).json({ 
      message: 'Event recorded successfully',
      event: event,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Event collection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Get all events
app.get('/api/analytics/events', verifyApiKey, async (req, res) => {
  const { limit = 100, offset = 0, event_type, start_date, end_date } = req.query;

  try {
    let query = 'SELECT * FROM events WHERE app_id = $1';
    let params = [req.app_id];
    let paramCount = 1;

    if (event_type) {
      paramCount++;
      query += ` AND event = $${paramCount}`;
      params.push(event_type);
    }

    if (start_date) {
      paramCount++;
      query += ` AND created_at >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND created_at <= $${paramCount}`;
      params.push(end_date);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      events: result.rows,
      count: result.rows.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get event summary
app.get('/api/analytics/event-summary', verifyApiKey, async (req, res) => {
  const { event, start_date, end_date } = req.query;

  try {
    let query = `
      SELECT 
        event,
        COUNT(*) as count,
        COUNT(DISTINCT url) as unique_urls,
        COUNT(DISTINCT device) as unique_devices
      FROM events 
      WHERE app_id = $1
    `;
    let params = [req.app_id];
    let paramCount = 1;

    if (event) {
      paramCount++;
      query += ` AND event = $${paramCount}`;
      params.push(event);
    }

    if (start_date) {
      paramCount++;
      query += ` AND created_at >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND created_at <= $${paramCount}`;
      params.push(end_date);
    }

    query += ' GROUP BY event ORDER BY count DESC';

    const result = await pool.query(query, params);

    res.json({
      summary: result.rows,
      app: req.app_name
    });
  } catch (error) {
    console.error('Event summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get analytics by device
app.get('/api/analytics/by-device', verifyApiKey, async (req, res) => {
  const { start_date, end_date } = req.query;

  try {
    let query = `
      SELECT 
        device,
        COUNT(*) as count
      FROM events 
      WHERE app_id = $1 AND device IS NOT NULL
    `;
    let params = [req.app_id];
    let paramCount = 1;

    if (start_date) {
      paramCount++;
      query += ` AND created_at >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND created_at <= $${paramCount}`;
      params.push(end_date);
    }

    query += ' GROUP BY device ORDER BY count DESC';

    const result = await pool.query(query, params);

    res.json({
      devices: result.rows,
      app: req.app_name
    });
  } catch (error) {
    console.error('Device analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get analytics by browser
app.get('/api/analytics/by-browser', verifyApiKey, async (req, res) => {
  const { start_date, end_date } = req.query;

  try {
    let query = `
      SELECT 
        browser,
        COUNT(*) as count
      FROM events 
      WHERE app_id = $1 AND browser IS NOT NULL
    `;
    let params = [req.app_id];
    let paramCount = 1;

    if (start_date) {
      paramCount++;
      query += ` AND created_at >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND created_at <= $${paramCount}`;
      params.push(end_date);
    }

    query += ' GROUP BY browser ORDER BY count DESC';

    const result = await pool.query(query, params);

    res.json({
      browsers: result.rows,
      app: req.app_name
    });
  } catch (error) {
    console.error('Browser analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get top pages
app.get('/api/analytics/top-pages', verifyApiKey, async (req, res) => {
  const { limit = 10, start_date, end_date } = req.query;

  try {
    let query = `
      SELECT 
        url,
        COUNT(*) as views
      FROM events 
      WHERE app_id = $1
    `;
    let params = [req.app_id];
    let paramCount = 1;

    if (start_date) {
      paramCount++;
      query += ` AND created_at >= $${paramCount}`;
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      query += ` AND created_at <= $${paramCount}`;
      params.push(end_date);
    }

    query += ` GROUP BY url ORDER BY views DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      pages: result.rows,
      app: req.app_name
    });
  } catch (error) {
    console.error('Top pages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});