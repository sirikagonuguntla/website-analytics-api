-- Website Analytics Database Schema

-- Apps table: Store registered applications
CREATE TABLE IF NOT EXISTS apps (
    id SERIAL PRIMARY KEY,
    app_name VARCHAR(255) NOT NULL,
    app_url VARCHAR(500) NOT NULL,
    email VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events table: Store analytics events
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    app_id INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    event VARCHAR(100) NOT NULL,
    url VARCHAR(500) NOT NULL,
    referrer VARCHAR(500),
    user_agent TEXT,
    device VARCHAR(50),
    browser VARCHAR(50),
    os VARCHAR(50),
    country VARCHAR(100),
    city VARCHAR(100),
    custom_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_apps_api_key ON apps(api_key);
CREATE INDEX IF NOT EXISTS idx_apps_is_active ON apps(is_active);
CREATE INDEX IF NOT EXISTS idx_events_app_id ON events(app_id);
CREATE INDEX IF NOT EXISTS idx_events_event ON events(event);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_url ON events(url);
CREATE INDEX IF NOT EXISTS idx_events_device ON events(device);
CREATE INDEX IF NOT EXISTS idx_events_browser ON events(browser);
CREATE INDEX IF NOT EXISTS idx_events_app_id_created_at ON events(app_id, created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_apps_updated_at 
    BEFORE UPDATE ON apps 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();