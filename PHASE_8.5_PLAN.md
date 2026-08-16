# Phase 8.5: Multi-Tenant Backend Setup + Offline OCR

## Architecture Overview

```
Your Firebase Project (Centralized)
├─ restaurants/{restaurantId}/
│  ├─ meta/ (name, phone, enabled)
│  ├─ menu/ (categories, items)
│  ├─ bills/ (orders, payments)
│  ├─ staff/ (users, PINs)
│  └─ reports/ (aggregated data)
│
└─ Cloud Functions:
   ├─ syncRestaurantData() - Multi-tenant sync handler
   ├─ enableRestaurant() - Admin: enable restaurant
   ├─ disableRestaurant() - Admin: disable restaurant
   └─ getRestaurantStatus() - Check if restaurant is enabled
```

## Phase 8.5 Implementation Plan

### Part 1: Firebase Cloud Functions (Backend Sync)
**File:** `functions/src/sync.ts`
- Receive: `restaurantId`, `pin`, `syncData`
- Verify PIN against Firestore `staff` collection
- Verify restaurant is enabled
- Write data to multi-tenant Firestore structure
- Return sync status

### Part 2: Offline OCR Integration
**File:** `src/features/menu/ocrOfflineService.ts`
- Use Tesseract.js (pure JavaScript, no server needed)
- Extract menu items from image
- Works completely offline
- Fallback to manual entry if OCR fails

### Part 3: Updated App Sync
**File:** `src/features/sync/syncService.ts` (updated)
- Call Cloud Function instead of direct Firestore
- Include restaurantId + PIN for authentication
- Handle multi-tenant responses

### Part 4: Security Rules
**File:** `firestore.rules`
- Only Cloud Functions can write to restaurant data
- Ensures data isolation between restaurants
- Prevents direct client access

### Part 5: Admin Dashboard (Optional)
**File:** `functions/src/admin.ts`
- Enable/disable restaurants
- View all restaurants
- See sync status and storage usage

## Implementation Order

1. ✅ Create Cloud Functions skeleton
2. ✅ Implement offline OCR (Tesseract)
3. ✅ Update app sync service
4. ✅ Create security rules
5. ✅ Add admin APIs
6. ✅ Test end-to-end
7. ✅ Deploy to Firebase

## Estimated Timeline: 6-8 hours

---

## Cost Breakdown

### Firebase (Serverless)
- Cloud Functions: FREE tier (2M invocations/month)
- Firestore: FREE tier (50K writes/day)
- Realtime Database: Not needed

### At Scale (500 restaurants)
- ~15,000 writes/month = still FREE
- Storage: ~500 MB = FREE
- Cloud Functions: ~6M invocations/month = ~$0.40/month

**Total Monthly Cost: $0 - $5**

---

## Current Status
- Phase 8: Bug fixes ✅ COMPLETE
- Phase 8.5: Multi-tenant + OCR → IN PROGRESS
