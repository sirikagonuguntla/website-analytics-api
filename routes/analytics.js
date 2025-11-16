const express = require('express');
const router = express.Router();
const db = require('../config/database');
const redis = require('../config/redis');
const { validateApiKey } = require('../middleware/auth');

// Collect analytics event
router.post('/collect', validateApiKey, async (req, res, next) => {
  try {
    const {
      event,
      url,
      referrer,
      device,
      ipAddress,
      timestamp,
      metadata,
    } = req.body;

    if (!event || !url) {
      return res.status(400).json({ error: 'event and url are required' });
    }

    const appId = req.appId;

    // Insert event into database
    const result = await db.query(
      `INSERT INTO analytics_events 
       (app_id, event_name, url, referrer, device, ip_address, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING event_id`,
      [
        appId,
        event,
        url,
        referrer || null,
        device || null,
        ipAddress || null,
        timestamp || new Date().toISOString(),
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    // Invalidate relevant caches
    const cacheKeys = [
      `analytics:event-summary:${appId}:${event}`,
      `analytics:user-stats:${appId}`,
    ];

    cacheKeys.forEach((key) => {
      redis.del(key);
    });

    res.status(201).json({
      message: 'Event recorded successfully',
      eventId: result.rows[0].event_id,
    });
  } catch (err) {
    next(err);
  }
});

// Get event summary with aggregation
router.get('/event-summary', validateApiKey, async (req, res, next) => {
  try {
    const { event, startDate, endDate, app_id } = req.query;
    const appId = app_id || req.appId;

    if (!event) {
      return res.status(400).json({ error: 'event parameter is required' });
    }

    // Check cache first
    const cacheKey = `analytics:event-summary:${appId}:${event}:${startDate || 'all'}:${endDate || 'all'}`;
    
    redis.get(cacheKey, async (err, cachedData) => {
      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }

      try {
        let query = `
          SELECT 
            event_name,
            COUNT(*) as count,
            COUNT(DISTINCT ip_address) as unique_users,
            jsonb_object_agg(
              COALESCE(device::text, 'unknown'),
              device_count
            ) as device_data
          FROM (
            SELECT 
              event_name,
              ip_address,
              device,
              COUNT(*) as device_count
            FROM analytics_events
            WHERE app_id = $1 AND event_name = $2
        `;

        const params = [appId, event];
        let paramCount = 2;

        if (startDate) {
          paramCount++;
          query += ` AND timestamp >= $${paramCount}`;
          params.push(startDate);
        }

        if (endDate) {
          paramCount++;
          query += ` AND timestamp <= $${paramCount}`;
          params.push(endDate);
        }

        query += `
            GROUP BY event_name, ip_address, device
          ) sub
          GROUP BY event_name
        `;

        const result = await db.query(query, params);

        const response = result.rows.length > 0
          ? result.rows[0]
          : { event_name: event, count: 0, unique_users: 0, device_data: {} };

        // Cache for 5 minutes
        redis.setex(cacheKey, 300, JSON.stringify(response));

        res.json(response);
      } catch (err) {
        next(err);
      }
    });
  } catch (err) {
    next(err);
  }
});

// Get user statistics
router.get('/user-stats', validateApiKey, async (req, res, next) => {
  try {
    const { userId } = req.query;
    const appId = req.appId;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Check cache
    const cacheKey = `analytics:user-stats:${appId}:${userId}`;

    redis.get(cacheKey, async (err, cachedData) => {
      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }

      try {
        const result = await db.query(
          `SELECT 
             ip_address as user_id,
             COUNT(*) as total_events,
             jsonb_object_agg(event_name, event_count) as event_breakdown,
             MAX(device) as device,
             MAX(metadata->>'browser') as browser,
             MAX(metadata->>'os') as os,
             MAX(ip_address) as ip_address
           FROM (
             SELECT 
               ip_address,
               event_name,
               COUNT(*) as event_count,
               device,
               metadata
             FROM analytics_events
             WHERE app_id = $1 AND ip_address = $2
             GROUP BY ip_address, event_name, device, metadata
           ) sub
           GROUP BY ip_address`,
          [appId, userId]
        );

        const response = result.rows.length > 0
          ? result.rows[0]
          : { user_id: userId, total_events: 0, event_breakdown: {} };

        // Cache for 10 minutes
        redis.setex(cacheKey, 600, JSON.stringify(response));

        res.json(response);
      } catch (err) {
        next(err);
      }
    });
  } catch (err) {
    next(err);
  }
});

// Get time-based analytics
router.get('/time-series', validateApiKey, async (req, res, next) => {
  try {
    const { event, startDate, endDate, interval } = req.query;
    const appId = req.appId;

    if (!event) {
      return res.status(400).json({ error: 'event parameter is required' });
    }

    const intervalType = interval || 'day';

    const result = await db.query(
      `SELECT 
         date_trunc($1, timestamp) as time_bucket,
         COUNT(*) as count,
         COUNT(DISTINCT ip_address) as unique_users
       FROM analytics_events
       WHERE app_id = $2 AND event_name = $3
         ${startDate ? 'AND timestamp >= $4' : ''}
         ${endDate ? 'AND timestamp <= $5' : ''}
       GROUP BY time_bucket
       ORDER BY time_bucket DESC
       LIMIT 100`,
      [
        intervalType,
        appId,
        event,
        ...(startDate ? [startDate] : []),
        ...(endDate ? [endDate] : []),
      ].filter(Boolean)
    );

    res.json({ timeSeries: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;