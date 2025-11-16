-- Create database schema for analytics API

-- Apps/Websites table
CREATE TABLE IF NOT EXISTS apps (
    app_id SERIAL PRIMARY KEY,
    app_name VARCHAR(255) NOT NULL,
    app_url VARCHAR(500) NOT NULL,
    email VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(64) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_key_hash ON apps(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_email ON apps(email);

-- Analytics events table
CREATE TABLE IF NOT EXISTS analytics_events (
    event_id BIGSERIAL PRIMARY KEY,
    app_id INTEGER NOT NULL REFERENCES apps(app_id) ON DELETE CASCADE,
    event_name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    referrer TEXT,
    device VARCHAR(50),
    ip_address INET,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_app_event ON analytics_events(app_id, event_name);
CREATE INDEX IF NOT EXISTS idx_timestamp ON analytics_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_ip_address ON analytics_events(ip_address);
CREATE INDEX IF NOT EXISTS idx_composite ON analytics_events(app_id, event_name, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_app_timestamp ON analytics_events(app_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_metadata ON analytics_events USING gin(metadata);