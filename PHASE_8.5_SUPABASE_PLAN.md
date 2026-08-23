# Phase 8.5 Supabase Edition: Complete Rewrite

## Architecture Change

```
FIREBASE (Original)
├─ Cloud Functions (serverless)
└─ Firestore (NoSQL document DB)

SUPABASE (New)
├─ PostgreSQL (relational DB)
└─ Node.js API (simple backend)
```

## Why Supabase is Better for POS

| Aspect | Firebase | Supabase |
|--------|----------|----------|
| **Database** | NoSQL (Firestore) | SQL (PostgreSQL) |
| **Queries** | Limited filtering | Full SQL power |
| **Reports** | Hard to aggregate | Easy SQL queries |
| **Cost at scale** | Expensive ($100+) | Moderate ($25-50) |
| **Control** | Vendor lock-in | Open source, portable |
| **Free tier** | Better uptime | Storage limits |

---

## Implementation Plan

### Part 1: PostgreSQL Schema
**File:** `supabase/schema.sql`
- Restaurants table (multi-tenant)
- Menu items, categories, modifiers
- Orders, order items, payments
- Staff (with PIN hashes)
- Audit logs
- Row Level Security (RLS) rules

### Part 2: API Backend
**Files:** `api/` (simple Node.js Express)
- `/sync` endpoint - Multi-tenant sync with PIN auth
- `/admin/enable` - Enable restaurant
- `/admin/disable` - Disable restaurant
- `/admin/status` - Get restaurant status
- Authentication middleware

### Part 3: App Updates
**File:** `src/features/sync/syncService.ts`
- Call Supabase API instead of Firebase
- Same data collection logic
- Handle Supabase responses
- PIN authentication flow

### Part 4: Security
**Supabase RLS (Row Level Security)**
- Each restaurant can only access their data
- PIN verification at database level
- Admin-only operations

### Part 5: Testing & Docs
- Tests for API endpoints
- Supabase deployment guide
- Migration guide (Firebase → Supabase)

---

## Cost Timeline

```
Now (Free tier):
├─ Storage: 500MB (testing)
├─ Database: PostgreSQL (unlimited)
└─ Cost: $0

At 50 restaurants (Starter plan):
├─ Storage: 8GB
├─ Concurrent connections: 100+
└─ Cost: $25/month

At 500+ restaurants (Pro plan):
├─ Storage: 100GB
├─ Dedicated resources
└─ Cost: $50-100/month
```

---

## Timeline

- **Hour 1:** Create PostgreSQL schema
- **Hour 2-3:** Build API endpoints
- **Hour 3-4:** Update app sync logic
- **Hour 4-5:** Security & testing
- **Hour 5-6:** Documentation & deployment

**Total: 6 hours of work**

---

## Current Status

- Phase 8: ✅ Complete (Firebase version)
- Phase 8.5: 🔄 Rewriting for Supabase
- Phase 9: ⏸️ Deferred

---

## Files to Create/Modify

```
NEW:
├─ supabase/schema.sql (PostgreSQL schema)
├─ api/src/
│  ├─ index.ts (Express app)
│  ├─ sync.ts (Sync endpoint)
│  ├─ admin.ts (Admin endpoints)
│  └─ auth.ts (PIN verification)
├─ api/package.json
├─ api/tsconfig.json
└─ PHASE_8.5_SUPABASE_DEPLOYMENT.md

MODIFIED:
├─ src/features/sync/syncService.ts (Call Supabase API)
└─ app.json (Supabase config)

DEPRECATED:
├─ functions/ (Firebase Cloud Functions - no longer needed)
└─ firestore.rules (Firebase rules - no longer needed)
```

---

## Next Steps

1. ✅ Create PostgreSQL schema
2. ✅ Build API endpoints
3. ✅ Update app sync
4. ✅ Add security layer
5. ✅ Create tests
6. ✅ Write deployment guide

Let's start! 🚀
