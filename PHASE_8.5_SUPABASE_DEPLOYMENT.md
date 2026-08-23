# Phase 8.5 Supabase: Complete Deployment Guide

## Overview

Phase 8.5 is now a **PostgreSQL + Node.js API** backend instead of Firebase Cloud Functions. This gives you:

✅ Better for POS (relational data)
✅ Cheaper at scale
✅ Full control
✅ Better SQL for reports

---

## Step 1: Create Supabase Project

1. Go to https://supabase.com
2. Sign up (free)
3. Create a new project
4. Choose **Free Tier**
5. Wait for project to initialize (~2 minutes)

**Save these credentials:**
- Project URL: `https://your-project.supabase.co`
- Service Role Key: (in Project Settings → API Keys)

---

## Step 2: Create PostgreSQL Schema

1. In Supabase console, go to **SQL Editor**
2. Click **New Query**
3. Copy the entire contents of `supabase/schema.sql`
4. Paste into SQL Editor
5. Click **Run**

Wait for the schema to complete.

**What this creates:**
- 18 tables (restaurants, orders, menu_items, etc.)
- Indexes (performance optimization)
- Triggers (updated_at automation)
- Row Level Security (multi-tenant isolation)

---

## Step 3: Deploy API Backend

Choose ONE of these options:

### Option A: Railway (Recommended, $7/month)

1. Go to https://railway.app
2. Sign up with GitHub
3. Click **New Project** → **Deploy from GitHub**
4. Select the `D:\POS\api` folder
5. Set environment variables:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   PORT=3000
   ADMIN_PIN=your-secure-pin
   ```
6. Deploy

**Get your API URL:**
- Railway shows: `https://your-app.railway.app`
- This is your Supabase API URL

### Option B: Render (Free with limitations)

1. Go to https://render.com
2. Sign up
3. Click **New** → **Web Service**
4. Select GitHub repo
5. Build command: `cd api && npm install && npm run build`
6. Start command: `node api/lib/index.js`
7. Set environment variables (same as above)
8. Deploy

### Option C: Heroku (deprecated, but still works)

```bash
heroku login
cd api
heroku create your-app-name
heroku config:set SUPABASE_URL=https://your-project.supabase.co
heroku config:set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
heroku config:set ADMIN_PIN=your-secure-pin
git push heroku main
```

### Option D: Local Development

For testing locally:

```bash
cd api
npm install
cp .env.example .env
# Edit .env with your Supabase credentials
npm run dev
# API will run on http://localhost:3000
```

---

## Step 4: Update app.json

Update your app config with the API URL:

```json
{
  "extra": {
    "supabaseApiUrl": "https://your-app-name.railway.app",
    "ocrMode": "offline"
  }
}
```

Replace `https://your-app-name.railway.app` with your actual API URL from Step 3.

---

## Step 5: Create Test Restaurant

In Supabase SQL Editor, add test data:

```sql
-- Create test restaurant
INSERT INTO restaurants (id, name, enabled)
VALUES ('test-restaurant-1', 'Test Restaurant', true);

-- Create test staff with PIN (1234)
-- PIN hash for "1234" = 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4
INSERT INTO staff (id, restaurant_id, name, pin_hash, role)
VALUES (
  'staff-1',
  'test-restaurant-1',
  'Test Staff',
  '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
  'cashier'
);
```

---

## Step 6: Test the Setup

### Test API Health

```bash
curl http://localhost:3000/health
# Response: {"status":"ok","timestamp":"2026-08-23T..."}
```

### Test Sync Endpoint

```bash
curl -X POST http://localhost:3000/sync \
  -H "Content-Type: application/json" \
  -d '{
    "restaurantId": "test-restaurant-1",
    "pin": "1234",
    "syncData": {
      "restaurants": []
    }
  }'

# Response: 
# {"success":true,"syncedAt":"2026-08-23T...","pushedCounts":{...}}
```

### Test in App

1. Start app: `npx expo start --web`
2. Log in: restaurantId = `test-restaurant-1`, PIN = `1234`
3. Create a menu item
4. Go to Settings → Sync Now
5. Check Supabase: `restaurants > test-restaurant-1 > menu_items` should have your item

---

## Step 7: Verify Database

Go to Supabase console:

1. Click **Table Editor**
2. Select `restaurants` → should see `test-restaurant-1`
3. Select `staff` → should see test staff record
4. Select `menu_items` → should see synced items
5. Select `audit_logs` → should see sync activity

---

## Production Checklist

Before going live with real restaurants:

- [ ] Supabase project created
- [ ] PostgreSQL schema deployed
- [ ] API backend deployed (Railway/Render/Heroku)
- [ ] API URL in app.json
- [ ] Test restaurant created with test PIN
- [ ] Sync tested in app
- [ ] Data verified in Supabase console
- [ ] ADMIN_PIN set to secure value (not default)

---

## Environment Variables

### Supabase (Server-side)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PIN=your-secure-admin-pin
PORT=3000
```

### App (Client-side)
```json
"supabaseApiUrl": "https://your-api.railway.app",
"ocrMode": "offline"
```

---

## Cost Breakdown

### Supabase
```
Free tier (validating):
├─ Storage: 500MB
├─ Database: PostgreSQL (unlimited)
└─ Cost: $0

Starter plan ($25/month, at 50 restaurants):
├─ Storage: 8GB
├─ Database: Unlimited
└─ Cost: $25/month
```

### API Hosting
```
Railway: $7/month (includes 512MB RAM)
Render: FREE (limited) or $7/month
Heroku: Deprecated (was $7/month)

Total at 50 restaurants: $25 + $7 = $32/month
(vs Firebase: would be $0, but you validate market first)
```

---

## Troubleshooting

### Sync fails: "restaurantId and pin required"
- App is not sending PIN
- Check: `app.json` has correct `supabaseApiUrl`
- Check: Staff member exists with correct PIN hash

### Sync fails: "Invalid PIN"
- PIN hash doesn't match
- Re-create staff record with correct hash
- PIN hash for "1234": `03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4`

### Sync fails: "Restaurant not found"
- Restaurant doesn't exist in Supabase
- Create test restaurant in SQL Editor (see Step 5)

### API returns 500 error
- Check server logs
- Verify environment variables set correctly
- Check Supabase connection

### Data not appearing in Supabase
- Check `audit_logs` table for errors
- Run sync again
- Check `last_synced_at` timestamp updated

---

## Scaling Beyond Free Tier

### At 50 restaurants:
```sql
SELECT COUNT(*) FROM orders;     -- Should be ~50,000
SELECT pg_size_pretty(pg_database_size(current_database()));
-- Should be ~50MB
```

### Upgrade to Starter Plan ($25/month)
- 8GB storage (vs 500MB free)
- 100+ concurrent connections
- 99.9% uptime SLA

---

## Admin Operations

### Enable a restaurant
```bash
curl -X POST https://your-api.railway.app/admin/enable \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"restaurant-1","adminPin":"your-admin-pin"}'
```

### Disable a restaurant
```bash
curl -X POST https://your-api.railway.app/admin/disable \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"restaurant-1","adminPin":"your-admin-pin"}'
```

### Get restaurant status
```bash
curl -X POST https://your-api.railway.app/admin/status \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"restaurant-1","adminPin":"your-admin-pin"}'
```

---

## Migration from Firebase (If needed)

If you were using Firebase Phase 8.5:

1. Export Firestore data (JSON)
2. Transform to PostgreSQL format
3. Import into Supabase
4. Test sync
5. Switch app config

**We'll handle this if you decide to migrate.**

---

## Support

For issues:
1. Check Supabase logs: Console → Logs
2. Check API logs: Railway/Render console
3. Check app sync errors: `Settings → Logs`
4. Verify database: Supabase Table Editor

---

## Next Steps

1. **Now:** Create Supabase account and deploy schema
2. **Deploy API:** Use Railway ($7/month)
3. **Update app:** Set supabaseApiUrl in app.json
4. **Test:** Create test restaurant, sync data
5. **At 50 restaurants:** Upgrade Supabase to Starter ($25/month)

---

## Summary

**Before:** Firebase Cloud Functions + Firestore (~$0-5/month at 50 restaurants)
**After:** Supabase PostgreSQL + Railway API ($32/month at 50 restaurants)

**Why the cost?** You're validating market fit. Once you confirm restaurants will pay, you can optimize costs or self-host.

**Better long-term:** PostgreSQL is cheaper at massive scale (1000+ restaurants).

Ready to deploy? 🚀
