# Phase 8.5 Supabase: Quick Reference

## What You Have Now

✅ **Complete Multi-Tenant POS Backend**
- PostgreSQL database (18 tables, relational)
- Node.js Express API (4 endpoints)
- Offline OCR (Tesseract.js, unchanged)
- Complete documentation & tests

## How to Deploy (7 Simple Steps)

### 1. Create Supabase Project
```
Go to supabase.com → Create Account → New Project (FREE)
```

### 2. Deploy PostgreSQL Schema
```
Supabase Console → SQL Editor → New Query
Copy entire: supabase/schema.sql → Run
```

### 3. Get Your Credentials
```
Supabase Settings → API Keys
Copy: Project URL and Service Role Key
```

### 4. Deploy API to Railway
```
Go to railway.app → New Project → Deploy from GitHub
Select: api/ folder
Set Environment:
  SUPABASE_URL=your-project-url
  SUPABASE_SERVICE_ROLE_KEY=your-key
  ADMIN_PIN=your-secure-pin
  PORT=3000
```

### 5. Get Your API URL
```
Railway shows: https://your-app.railway.app
(Save this for step 6)
```

### 6. Update app.json
```json
"extra": {
  "supabaseApiUrl": "https://your-app.railway.app",
  "ocrMode": "offline"
}
```

### 7. Test
```
1. npx expo start --web
2. Log in: restaurantId=test-restaurant-1, PIN=1234
3. Create menu item
4. Sync → Verify in Supabase Console
```

## Key Files

| File | Purpose |
|------|---------|
| `supabase/schema.sql` | PostgreSQL database (18 tables) |
| `api/src/index.ts` | Node.js Express backend |
| `src/features/sync/syncService.ts` | App sync (calls API) |
| `PHASE_8.5_SUPABASE_DEPLOYMENT.md` | Detailed guide (follow this!) |
| `__tests__/phase8-5-supabase.test.ts` | 53 passing tests |

## Cost Summary

| Phase | Cost | Notes |
|-------|------|-------|
| Validation (1-3 months) | $7/month | Railway API only |
| At 50 restaurants | $32/month | Supabase $25 + Railway $7 |
| At 500+ restaurants | $60-120/month | Better than Firebase |

## Environment Variables

### Server (.env in api/)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PIN=secure-admin-password
PORT=3000
```

### App (app.json)
```json
"supabaseApiUrl": "https://your-api-url.railway.app"
```

## Test Restaurant Setup

Run in Supabase SQL Editor:
```sql
-- Create test restaurant
INSERT INTO restaurants (id, name, enabled)
VALUES ('test-restaurant-1', 'Test Restaurant', true);

-- Create test staff (PIN: 1234)
INSERT INTO staff (id, restaurant_id, name, pin_hash, role)
VALUES (
  'staff-1',
  'test-restaurant-1',
  'Test Staff',
  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
  'cashier'
);
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Sync fails | Check: API URL in app.json, PIN is "1234" |
| Restaurant not found | Create test restaurant (SQL above) |
| API 500 error | Check server logs on Railway |
| Data not syncing | Run sync again, check last_synced_at in Supabase |

## Testing API Locally

```bash
# Install dependencies
cd api
npm install

# Create .env file
cp .env.example .env
# Edit .env with your Supabase credentials

# Run API
npm run dev
# API at http://localhost:3000

# Test sync
curl -X POST http://localhost:3000/sync \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"test-restaurant-1","pin":"1234","syncData":{}}'
```

## Admin Operations

### Enable Restaurant
```bash
curl -X POST https://your-api.railway.app/admin/enable \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"restaurant-1","adminPin":"your-admin-pin"}'
```

### Disable Restaurant
```bash
curl -X POST https://your-api.railway.app/admin/disable \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"restaurant-1","adminPin":"your-admin-pin"}'
```

### Get Status
```bash
curl -X POST https://your-api.railway.app/admin/status \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"restaurant-1","adminPin":"your-admin-pin"}'
```

## Architecture

```
POS App (Local SQLite)
        ↓
   (Call API)
        ↓
  Node.js API (Railway)
        ↓
PostgreSQL (Supabase)
```

## What's Different from Firebase

| Aspect | Firebase | Supabase |
|--------|----------|----------|
| Backend | Cloud Functions | Node.js API |
| Database | Firestore (NoSQL) | PostgreSQL (SQL) |
| Scaling | Expensive | Affordable |
| Portability | Vendor lock-in | Standard SQL |
| Complexity | Medium | Low |

## Next Steps

1. ✅ Follow PHASE_8.5_SUPABASE_DEPLOYMENT.md (7 steps)
2. Create real restaurants once validated
3. At 50 restaurants: Upgrade Supabase to Starter ($25/month)
4. Monitor usage and costs

## Status

```
Phase 8:   ✅ Complete (Bug fixes)
Phase 8.5: ✅ Complete (Supabase backend)
Phase 9:   ⏸️ Deferred (Load testing)
```

---

**Ready to deploy?** Follow PHASE_8.5_SUPABASE_DEPLOYMENT.md 🚀
