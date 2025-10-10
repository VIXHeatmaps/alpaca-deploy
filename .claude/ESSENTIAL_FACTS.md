# ESSENTIAL FACTS - NEVER FORGET

## Deployment Infrastructure

### Railway (Backend Infrastructure)
- **Backend API**: `alpaca-deploy` service
- **Indicator Service**: `happy-achievement` service (Python, port 8001)
- **Database**: PostgreSQL (Postgres service)
- **Cache**: Redis service

### Vercel (Frontend)
- **Frontend**: React application

---

## Critical Notes
- When user says something is ESSENTIAL, add it to this file
- Railway services are NOT the same as local development
- Local uses Docker for Redis/Postgres, Railway uses Railway-hosted services
- Environment variables must be set separately in Railway dashboard
