# Phase 8.5: Multi-Tenant Backend Deployment Guide

## Overview

This guide walks through deploying Phase 8.5 (Cloud Functions + Offline OCR) to your Firebase project.

**Architecture:**
- One centralized Firebase Firestore project
- Multiple restaurants access via Cloud Functions
- All authentication via PIN (stored as SHA-256 hash in Firestore)
- Offline OCR using Tesseract.js (no backend API calls)
- Zero ongoing costs (within free tier)

---

## Prerequisites

1. **Firebase Project** (already set up, or create at https://console.firebase.google.com)
2. **Firebase CLI** (install: `npm install -g firebase-tools`)
3. **Node.js 18+** (for Cloud Functions)
4. **Expo CLI** (already have it)

---

## Step 1: Initialize Firebase Functions

```bash
cd D:\POS

# Initialize Firebase (if not already done)
firebase init functions

# When prompted:
# - Select your Firebase project
# - Choose TypeScript
# - Accept ESLint setup
```

**Expected output:**
```
✔ Wrote functions/package.json
✔ Wrote functions/src/index.ts (placeholder)
✔ Wrote functions/tsconfig.json
✔ Wrote .firebaserc
```

---

## Step 2: Review Generated Files

Our Phase 8.5 already created:
- ✅ `functions/src/index.ts` - Cloud Functions entry point
- ✅ `functions/src/sync.ts` - Multi-tenant sync logic
- ✅ `functions/package.json` - Dependencies (firebase-admin, firebase-functions)
- ✅ `firestore.rules` - Security rules

Verify they exist:
```bash
ls functions/src/
# Should show: index.ts, sync.ts
```

---

## Step 3: Install Dependencies

```bash
cd functions
npm install

# Expected packages:
# - firebase-admin@^12.0.0
# - firebase-functions@^5.0.0
# - typescript@^5.0.0
```

---

## Step 4: Deploy Cloud Functions

```bash
cd D:\POS

# Build and deploy
firebase deploy --only functions

# Expected output:
# ✔ Deploy complete!
# Function URL: https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/syncRestaurant
```

**Save your function URL** — you'll need it in the next step.

---

## Step 5: Update App Configuration

Edit `app.json` and replace `YOUR_PROJECT_ID` with your actual Firebase project ID:

```json
{
  "extra": {
    "syncFunctionUrl": "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net",
    "ocrMode": "offline"
  }
}
```

**How to find your Project ID:**
1. Go to https://console.firebase.google.com
2. Click your project
3. Look for "Project ID" in settings (⚙️)

---

## Step 6: Deploy Firestore Security Rules

```bash
cd D:\POS

# Deploy security rules
firebase deploy --only firestore:rules

# Expected output:
# ✔ Firestore Rules have been successfully published.
```

---

## Step 7: Set Up Admin User (for dashboard)

Create an admin user with custom claims:

```bash
firebase auth:import users.json --hash-algo=scrypt

# Or via Firebase Console:
# 1. Go to Authentication → Users
# 2. Create a new user (email/password)
# 3. Go to Custom Claims tab
# 4. Add: { "admin": true }
```

---

## Step 8: Verify Firestore Structure

After the first sync, Firestore should look like:

```
Firestore
├─ restaurants/
│  ├─ restaurant-1/
│  │  ├─ meta/ → { name, phone, enabled, lastSyncedAt, ... }
│  │  ├─ categories/ → { id, name, description, ... }
│  │  ├─ menuItems/ → { id, name, price, categoryId, ... }
│  │  ├─ orders/ → { id, total, status, createdAt, ... }
│  │  ├─ staff/ → { id, pinHash, role, ... }
│  │  └─ ... (other collections)
│  │
│  └─ restaurant-2/
│     ├─ meta/
│     ├─ categories/
│     └─ ... (completely separate data)
```

---

## Step 9: Test the Sync

1. **Start the app:**
   ```bash
   npx expo start --web
   ```

2. **Log in:**
   - restaurantId: `test-restaurant-1`
   - PIN: `1234`

3. **Create a menu item:**
   - Go to Menu → Add Item
   - Fill in details
   - Save

4. **Sync:**
   - Go to Settings → Sync Now
   - Watch the console for:
     ```
     ✅ Synced at 2026-08-16 10:15:23
     restaurantData: 1, menuItems: 1, ...
     ```

5. **Verify in Firestore Console:**
   - Go to https://console.firebase.google.com
   - Click Firestore Database
   - Navigate to: `restaurants/test-restaurant-1/menuItems`
   - Should see your newly created item

---

## Step 10: Test Offline OCR

1. **Take or select a menu photo** (with items and prices)
2. **Go to Menu → Scan**
3. **Wait for Tesseract to download** (~50MB, first time only)
4. **Verify extracted items:**
   - Should see item names and prices
   - Category guesses (Burgers, Beverages, etc.)
5. **Subsequent scans** should be instant (cached)

---

## Testing Checklist

- [ ] Cloud Functions deployed successfully
- [ ] Firestore Rules deployed
- [ ] App sync connects to backend
- [ ] Menu item syncs to Firestore
- [ ] Offline OCR works
- [ ] Multiple restaurants remain isolated in Firestore
- [ ] Restaurant can be disabled via admin API

---

## Troubleshooting

### Sync fails with "Sync backend URL not configured"
**Solution:** Update `app.json` with correct `syncFunctionUrl`

### Sync fails with "Invalid PIN"
**Solution:** 
1. Verify PIN is correct: `console.log(pinHash)` in app
2. Check Firestore has staff record with matching pinHash
3. Make sure PIN is SHA-256 hashed before sending

### Sync fails with "Restaurant is currently disabled"
**Solution:**
1. Go to Firestore Console
2. Check: `restaurants/{restaurantId}/meta.enabled` = true
3. Use admin API to re-enable

### OCR downloads Tesseract every time
**Solution:**
1. Check device storage (should cache ~50MB)
2. On web, check browser cache settings
3. On mobile, check app storage permissions

### Firestore Rules error
**Solution:**
1. Check rules: `firebase deploy --only firestore:rules --dry-run`
2. Verify function has service account permissions
3. Reset to defaults: `firebase functions:config:set`

### Cloud Functions timeout
**Solution:**
1. Increase timeout in `functions/firebase.json`:
   ```json
   {
     "functions": {
       "timeoutSeconds": 60
     }
   }
   ```

---

## Cost Analysis

### Monthly Costs (500 restaurants)
- Cloud Functions: ~6M invocations = **$0.40**
- Firestore: ~25K writes/day = **$0** (within free tier)
- Storage: ~500MB = **$0** (within free tier)

**Total: $0 - $5/month**

### At Scale (5000 restaurants)
- Cloud Functions: ~60M invocations = **$4**
- Firestore: ~250K writes/day = **$0.125** (slightly over free tier)
- Storage: ~5GB = **$0.50**

**Total: ~$5-10/month**

---

## Next Steps

### Phase 9: Load Testing (Deferred)
- Test with 50+ concurrent users
- Measure latency and throughput
- Generate performance report

### Optional: Admin Dashboard
- Enable/disable restaurants
- View sync status
- Monitor storage usage

### Optional: Bidirectional Sync
- Pull menu/staff updates from Firestore to app
- Real-time collaboration between devices

---

## Files Created in Phase 8.5

```
functions/
├─ src/
│  ├─ index.ts (Cloud Functions entry point)
│  └─ sync.ts (Multi-tenant sync logic)
├─ package.json
└─ tsconfig.json

src/features/
├─ menu/
│  ├─ ocrOfflineService.ts (Tesseract.js offline OCR)
│  └─ ocrService.ts (Service factory: backend + offline)
└─ sync/
   └─ syncService.ts (Updated to call backend)

firestore.rules (Security rules)
app.json (Updated with sync URL)
```

---

## Security Notes

1. **PINs stored as SHA-256 hashes** (never plaintext)
2. **No API keys embedded in APK** (only server has keys)
3. **Firestore rules prevent direct access** (Cloud Functions only)
4. **Multi-tenant isolation** (restaurantId in all paths)
5. **Admin-only operations** (custom claims token requirement)

---

## Support

For issues:
1. Check Cloud Functions logs: `firebase functions:log`
2. Check Firestore console: https://console.firebase.google.com
3. Verify app config: `npx expo show`

---

## Summary

You now have:
✅ **Centralized Firebase backend** managing multiple restaurants
✅ **Cloud Functions** handling secure, authenticated sync
✅ **Offline OCR** working completely locally (Tesseract)
✅ **Multi-tenant data isolation** via Firestore structure + rules
✅ **Admin APIs** to enable/disable restaurants
✅ **Near-zero costs** within free tier

Phase 8.5 is complete! 🚀
