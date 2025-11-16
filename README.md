# Website Analytics API

A scalable backend API for collecting and analyzing website analytics events.

## 🚀 Live Demo

**Deployment URL**: [Will be added after deployment]

## 📋 Features

- ✅ API Key Management
- ✅ Event Data Collection
- ✅ Analytics Aggregation
- ✅ Rate Limiting
- ✅ Redis Caching
- ✅ Docker Containerization

## 🛠️ Tech Stack

- Node.js & Express
- PostgreSQL
- Redis
- Docker

## 🚀 Quick Start

### Using Docker (Recommended)
```bash
# Start all services
docker-compose up -d

# Test health
curl http://localhost:3000/health
```

### Manual Setup
```bash
# Install dependencies
npm install

# Setup database
psql -U postgres -f db/schema.sql

# Start server
npm start
```

## 📚 API Endpoints

### Register App
```bash
POST /api/auth/register
```

### Collect Event
```bash
POST /api/analytics/collect
Headers: x-api-key: YOUR_API_KEY
```

### Get Analytics
```bash
GET /api/analytics/event-summary?event=page_view
Headers: x-api-key: YOUR_API_KEY
```

## 📖 Full Documentation

See deployment instructions in the repository.
```

3. Save

---

## ✅ Verify All Files Are Created

In VS Code left sidebar, you should now see:
```
WEBSITE-ANALYTICS-API
  ├── config
  │   ├── database.js ✅
  │   └── redis.js ✅
  ├── db
  │   └── schema.sql ✅
  ├── middleware
  │   └── auth.js ✅
  ├── routes
  │   ├── analytics.js ✅
  │   └── auth.js ✅
  ├── .env.example ✅
  ├── .gitignore ✅
  ├── docker-compose.yml ✅
  ├── Dockerfile ✅
  ├── index.js ✅
  ├── package.json ✅
  └── README.md ✅