# Purchase Tracking Follow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix app-wide keyboard-covering-fields, let report screens look back further than the current month, move "Record Purchase" into a new role-dependent "More" navigation surface alongside a new Vendor CRUD screen, and retire the single-item Restock flow and Daily Expense report now that multi-item Purchase Tracking supersedes them.

**Architecture:** Eleven independent-but-ordered tasks. A one-time dev-client setup (Task 1) makes the rest of this plan's manual verification steps runnable against a real emulator instead of code-review-only. Everything else follows patterns already established in this codebase: soft-delete via an `isActive` column, a `Modal`-based picker component matching `UnitPicker.tsx`, and CRUD screens mirroring `app/(app)/inventory/index.tsx` + `[id].tsx`.

**Tech Stack:** Expo/React Native (SDK 57), TypeScript, Drizzle ORM over local SQLite, Supabase Postgres, TanStack Query, Jest.

**Spec:** `docs/superpowers/specs/2026-09-20-purchase-tracking-followup-design.md`

## Global Constraints

- Currency is always rendered as `₹${amount.toFixed(2)}` in these screens, matching every other Purchase Tracking screen — not `useAuthStore`'s `currencySymbol` (Reports home is the one existing exception, already using its own `money()` helper — leave that alone).
- All monetary math goes through `round2` from `@/features/tax/taxEngine`.
- Soft-delete (an `isActive` boolean, default `true`) is this codebase's only delete pattern for anything that might be referenced elsewhere — never a hard `DELETE`.
- Every screen mirrors the closest existing screen's structure exactly (list+detail pairs use `SectionList`/`FlatList` + a separate `[id].tsx` editor, following `app/(app)/inventory/index.tsx` + `[id].tsx`) rather than inventing new UI shape.
- This app only ships Android builds — Android-specific keyboard/behavior choices don't need an iOS branch.

---

## Task 1: Dev-client setup + app-wide keyboard fix

**Files:**
- Modify: `app/_layout.tsx`

**Interfaces:**
- Produces: a running Metro dev server connected to a dev-client build installed on the `resto_test` emulator (already running, confirmed via `adb devices`), plus a throwaway local test restaurant (Owner PIN `1234`, one Captain staff member) — both used by every later task's manual verification in this plan.

- [ ] **Step 1: Build and install the dev client**

This project already has a native `android/` directory (confirmed present), so this is a local build, not an EAS queue wait.

Run (from `D:\POS`, expect several minutes on first run):
```bash
npx expo run:android
```
This builds the dev client, installs it on the connected emulator (package `siddhantsm.RestoInvenPOS` — the same id the previously-built preview APK used, so this replaces it), and launches Metro. Run this with a long timeout (at least 600000ms) since a first Gradle build can be slow even with the native folder already present.

- [ ] **Step 2: Confirm Metro is serving and the app launched**

Run: `curl -s http://localhost:8081/status`
Expected: `packager-status:running`

Run: `"$ANDROID_HOME/platform-tools/adb.exe" exec-out screencap -p > /tmp/screen.png` (set `ANDROID_HOME` to `C:\Users\Crypto\android-sdk` first if not already exported in this shell) and read `/tmp/screen.png`.
Expected: the app is on screen (either the Welcome/setup screen, or a PIN screen if a restaurant is already paired from a prior session).

- [ ] **Step 3: Reset to a fresh, throwaway local test restaurant**

This avoids depending on any real restaurant's PIN — this emulator (`resto_test`) is a disposable test device.

Run: `"$ANDROID_HOME/platform-tools/adb.exe" shell pm clear siddhantsm.RestoInvenPOS`
Then relaunch: `"$ANDROID_HOME/platform-tools/adb.exe" shell monkey -p siddhantsm.RestoInvenPOS -c android.intent.category.LAUNCHER 1`

Screencap and confirm the Welcome screen appears ("Start a new restaurant" / "Pair with an existing restaurant"). Tap "Start Fresh" via:
```bash
"$ANDROID_HOME/platform-tools/adb.exe" shell input tap <x> <y>
```
(read the exact coordinates off the screenshot you just took — this screen has two cards, "Start Fresh" is the first card's button). Wait ~2 seconds, screencap again, confirm it landed on the PIN entry screen.

Log in as Owner: PIN `1234` (the fixed default `createLocalRestaurant()` sets — see `src/db/seed.ts:31`). Tap digits 1, 2, 3, 4 via `adb shell input tap` at their on-screen positions (read coordinates from a screencap of the PIN pad, same layout as any PIN screen in this app). Confirm via screencap that login succeeded (lands on the Menu tab, since Owner's `initialRouteName` is `'menu'` per `app/(app)/_layout.tsx:33`).

- [ ] **Step 4: Create a Captain staff account for later Captain-flow verification**

Navigate: Settings tab → Staff → add a new staff member, name "Test Captain", role Captain, PIN `5678` (exact navigation mirrors the existing Settings → Staff flow already in this app — read the screen, tap the "+ Add" control, fill the name field, select the Captain role chip, enter a PIN, save). Screencap to confirm the new staff member appears in the Staff list. Log out (Settings → Log out) so later tasks can log in as either Owner (PIN 1234) or Captain (PIN 5678) as needed.

- [ ] **Step 5: Fix the keyboard-covering-fields bug at the root layout**

Read the current `app/_layout.tsx` (its `RootLayout` component ends with the `return (...)` block containing `<QueryClientProvider>` wrapping `<StatusBar>` and `<Stack screenOptions={{ headerShown: false }} />`).

Change the import line:
```ts
import { ActivityIndicator, KeyboardAvoidingView, StyleSheet, Text, View } from 'react-native';
```

Change the final `return` block from:
```tsx
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
```
to:
```tsx
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView style={styles.flex} behavior="height">
        <Stack screenOptions={{ headerShown: false }} />
      </KeyboardAvoidingView>
    </QueryClientProvider>
  );
```

Add to the `StyleSheet.create` block at the bottom of the file:
```ts
  flex: { flex: 1 },
```

- [ ] **Step 6: Verify the fix live on the emulator**

Log in (PIN `1234`, Owner) → Inventory tab → "+ Add Item" → scroll down to "Cost per unit" (the last field, closest to the bottom, the one most likely to end up behind the keyboard) → tap it. Screencap and confirm the field and its label are visible above the keyboard, not hidden behind it. Tap outside the field (e.g. the screen title area) and confirm the keyboard dismisses (this was already working via the existing `keyboardDismissMode="on-drag"` on that screen's `ScrollView` — confirm it still does after this change).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors beyond the pre-existing unrelated ones (firebase-admin, expo-file-system, Tesseract).

- [ ] **Step 8: Commit**

```bash
git add app/_layout.tsx
git commit -m "Fix keyboard covering focused fields app-wide via root KeyboardAvoidingView"
```

---

## Task 2: `monthsAgo` / `monthLabel` date helpers

**Files:**
- Modify: `src/features/reports/dateRanges.ts`
- Test: `__tests__/dateRanges.test.ts`

**Interfaces:**
- Produces: `monthsAgo(n: number, now?: Date): DateRange`, `monthLabel(n: number, now?: Date): string` — both exported from `src/features/reports/dateRanges.ts`, consumed by Task 3's `MonthPicker` component and Task 4's report screens.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/dateRanges.test.ts`:
```ts
import { monthsAgo, monthLabel } from '@/features/reports/dateRanges';

describe('monthsAgo', () => {
  it('with n=0 matches thisMonth', () => {
    const now = new Date('2026-08-12T15:30:00');
    expect(monthsAgo(0, now)).toEqual(thisMonth(now));
  });

  it('goes back one calendar month', () => {
    const range = monthsAgo(1, new Date('2026-08-12T15:30:00'));
    expect(localDateString(range.start)).toBe('2026-07-01');
    expect(localDateString(range.end)).toBe('2026-08-01');
  });

  it('crosses a year boundary going back', () => {
    const range = monthsAgo(2, new Date('2027-01-15T00:00:00'));
    expect(localDateString(range.start)).toBe('2026-11-01');
    expect(localDateString(range.end)).toBe('2026-12-01');
  });
});

describe('monthLabel', () => {
  it('formats the current month', () => {
    expect(monthLabel(0, new Date('2026-08-12T15:30:00'))).toBe('Aug 2026');
  });

  it('formats a month several back, crossing a year boundary', () => {
    expect(monthLabel(3, new Date('2026-01-15T00:00:00'))).toBe('Oct 2025');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/dateRanges.test.ts`
Expected: FAIL — `monthsAgo is not a function` (or a TypeScript error).

- [ ] **Step 3: Implement it**

In `src/features/reports/dateRanges.ts`, replace the existing `thisMonth` function:
```ts
export function thisMonth(now = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}
```
with:
```ts
export function thisMonth(now = new Date()): DateRange {
  return monthsAgo(0, now);
}

/** `n=0` is the current calendar month, `n=1` is the month before that, and so on — used by
 * the "Pick a month" control on report screens to look back further than "This Month". JS's
 * Date constructor rolls a negative month index back into the correct prior year on its own
 * (e.g. month index -1 for January becomes December of the previous year), so this needs no
 * special-casing for a year boundary. */
export function monthsAgo(n: number, now = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth() - n, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - n + 1, 1);
  return { start, end };
}

/** Short display label for a monthsAgo() offset, e.g. "Aug 2026" — used both by the
 * MonthPicker component's option list and by any screen that needs to show which month is
 * currently selected. */
export function monthLabel(n: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/dateRanges.test.ts`
Expected: PASS, all tests including the existing `thisMonth` tests (unchanged behavior) and the new `monthsAgo`/`monthLabel` tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/reports/dateRanges.ts __tests__/dateRanges.test.ts
git commit -m "Add monthsAgo/monthLabel date helpers for report month lookback"
```

---

## Task 3: `MonthPicker` shared component

**Files:**
- Create: `src/components/MonthPicker.tsx`

**Interfaces:**
- Consumes: `monthLabel` (Task 2).
- Produces: `MonthPicker` component with props `{ monthsBack: number | null; onChange: (monthsBack: number) => void }`, consumed by Task 4's three report screens.

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { monthLabel } from '@/features/reports/dateRanges';

const MONTHS_BACK_OPTIONS = 24;

interface MonthPickerProps {
  /** null means no month is picked -- the caller's own fixed presets (Today/Yesterday/...)
   * are in effect instead. */
  monthsBack: number | null;
  onChange: (monthsBack: number) => void;
}

/** A "Pick a month" chip that opens a scrollable list of the last 24 months by name (e.g. "Aug
 * 2026") -- lets a report screen look back further than its fixed Today/Yesterday/This Week/
 * This Month presets, without a full calendar date-range picker this app has no dependency for.
 * Same dropdown-in-a-Modal shape as UnitPicker.tsx. */
export function MonthPicker({ monthsBack, onChange }: MonthPickerProps) {
  const [visible, setVisible] = useState(false);
  const label = monthsBack != null ? monthLabel(monthsBack) : 'Pick a month';

  function select(n: number) {
    onChange(n);
    setVisible(false);
  }

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={[styles.chip, monthsBack != null && styles.chipActive]}
      >
        <Text style={[styles.chipText, monthsBack != null && styles.chipTextActive]}>{label}</Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.cardTitle}>Pick a month</Text>
            <ScrollView style={styles.list}>
              {Array.from({ length: MONTHS_BACK_OPTIONS }, (_, n) => (
                <Pressable
                  key={n}
                  style={[styles.row, monthsBack === n && styles.rowActive]}
                  onPress={() => select(n)}
                >
                  <Text style={[styles.rowText, monthsBack === n && styles.rowTextActive]}>
                    {monthLabel(n)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#eee' },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { color: '#333', fontWeight: '600' },
  chipTextActive: { color: 'white' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 20, width: '100%', maxWidth: 360, maxHeight: '70%' },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  list: { maxHeight: 360 },
  row: { paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8 },
  rowActive: { backgroundColor: '#e8f0fe' },
  rowText: { fontSize: 15, fontWeight: '600', color: '#333' },
  rowTextActive: { color: '#2563eb' },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/MonthPicker.tsx
git commit -m "Add MonthPicker component for report date-range lookback"
```

---

## Task 4: Wire month lookback into the three report screens

**Files:**
- Modify: `app/(app)/reports/index.tsx`
- Modify: `app/(app)/reports/purchases/index.tsx`
- Modify: `app/(app)/reports/item-sales.tsx`

**Interfaces:**
- Consumes: `MonthPicker` (Task 3), `monthsAgo`/`monthLabel` (Task 2).

- [ ] **Step 1: Reports home**

In `app/(app)/reports/index.tsx`, add to the imports:
```tsx
import { today, yesterday, thisWeek, thisMonth, monthsAgo, monthLabel } from '@/features/reports/dateRanges';
import { MonthPicker } from '@/components/MonthPicker';
```
(this replaces the existing `import { today, yesterday, thisWeek, thisMonth } from '@/features/reports/dateRanges';` line — same import statement, three more names added.)

Add state right after `const [preset, setPreset] = useState<PresetKey>('today');`:
```tsx
  const [monthsBack, setMonthsBack] = useState<number | null>(null);
```

Replace the `range` `useMemo`:
```tsx
  const range = useMemo(() => {
    if (monthsBack != null) return monthsAgo(monthsBack);
    switch (preset) {
      case 'today':
        return today();
      case 'yesterday':
        return yesterday();
      case 'week':
        return thisWeek();
      case 'month':
        return thisMonth();
    }
  }, [preset, monthsBack]);
```

Update both query keys to include `monthsBack`:
```tsx
  const summaryQuery = useQuery({
    queryKey: ['salesSummary', restaurantId, preset, monthsBack],
    queryFn: () => getSalesSummary(restaurantId, range),
  });

  const purchasesTotalQuery = useQuery({
    queryKey: ['purchasesTotal', restaurantId, preset, monthsBack],
    queryFn: () => getPurchasesTotal(restaurantId, range),
  });
```

In `shareReportMutation`, replace:
```tsx
      const label = PRESETS.find((p) => p.key === preset)?.label ?? '';
```
with:
```tsx
      const label = monthsBack != null ? monthLabel(monthsBack) : (PRESETS.find((p) => p.key === preset)?.label ?? '');
```

Replace the chip row:
```tsx
      <View style={styles.chipRow}>
        {PRESETS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => setPreset(p.key)}
            style={[styles.chip, preset === p.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, preset === p.key && styles.chipTextActive]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
```
with:
```tsx
      <View style={styles.chipRow}>
        {PRESETS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => {
              setPreset(p.key);
              setMonthsBack(null);
            }}
            style={[styles.chip, monthsBack == null && preset === p.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, monthsBack == null && preset === p.key && styles.chipTextActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
        <MonthPicker monthsBack={monthsBack} onChange={setMonthsBack} />
      </View>
```

Replace the "Item-wise Sales" button's `onPress` to carry `monthsBack` along:
```tsx
      <Button
        label="Item-wise Sales"
        onPress={() =>
          router.push({
            pathname: '/reports/item-sales',
            params: { preset, monthsBack: monthsBack != null ? String(monthsBack) : undefined },
          })
        }
        style={styles.button}
      />
```

- [ ] **Step 2: Purchase Report**

In `app/(app)/reports/purchases/index.tsx`, add to the imports:
```tsx
import { today, yesterday, thisWeek, thisMonth, monthsAgo } from '@/features/reports/dateRanges';
import { MonthPicker } from '@/components/MonthPicker';
```

Add state right after `const [preset, setPreset] = useState<PresetKey>('today');`:
```tsx
  const [monthsBack, setMonthsBack] = useState<number | null>(null);
```

Replace the `range` `useMemo`:
```tsx
  const range = useMemo(() => {
    if (monthsBack != null) return monthsAgo(monthsBack);
    switch (preset) {
      case 'today':
        return today();
      case 'yesterday':
        return yesterday();
      case 'week':
        return thisWeek();
      case 'month':
        return thisMonth();
    }
  }, [preset, monthsBack]);
```

Update the query key:
```tsx
  const purchasesQuery = useQuery({
    queryKey: ['purchases', restaurantId, preset, monthsBack],
    queryFn: () => listPurchases(restaurantId, range),
  });
```

Replace the chip row (identical shape to Reports home's):
```tsx
      <View style={styles.chipRow}>
        {PRESETS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => {
              setPreset(p.key);
              setMonthsBack(null);
            }}
            style={[styles.chip, monthsBack == null && preset === p.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, monthsBack == null && preset === p.key && styles.chipTextActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
        <MonthPicker monthsBack={monthsBack} onChange={setMonthsBack} />
      </View>
```

- [ ] **Step 3: Item-wise Sales inherits the month from Reports home**

In `app/(app)/reports/item-sales.tsx`, add to the imports:
```tsx
import { today, yesterday, thisWeek, thisMonth, monthsAgo } from '@/features/reports/dateRanges';
```
(replaces the existing `import { today, yesterday, thisWeek, thisMonth } from '@/features/reports/dateRanges';` line).

Replace:
```tsx
  const { preset } = useLocalSearchParams<{ preset?: string }>();
```
with:
```tsx
  const { preset, monthsBack } = useLocalSearchParams<{ preset?: string; monthsBack?: string }>();
```

Replace the `range` `useMemo`:
```tsx
  const range = useMemo(() => {
    if (monthsBack != null) return monthsAgo(Number(monthsBack));
    switch (preset) {
      case 'yesterday':
        return yesterday();
      case 'week':
        return thisWeek();
      case 'month':
        return thisMonth();
      default:
        return today();
    }
  }, [preset, monthsBack]);
```

Update the query key:
```tsx
  const itemSalesQuery = useQuery({
    queryKey: ['itemWiseSales', restaurantId, preset ?? 'today', monthsBack ?? ''],
    queryFn: () => getItemWiseSales(restaurantId, range),
  });
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

Metro should still be running from Task 1 and will have Fast-Refreshed the app automatically once these files were saved (confirm with `curl -s http://localhost:8081/status`; if not running, restart with `cd D:\POS && npx expo run:android` — the dev client is already installed, so this reconnects rather than rebuilding). Log in as Owner (PIN `1234`) → Reports tab → tap "Pick a month" → select a month other than the current one → screencap and confirm the summary cards update and no fixed preset chip stays highlighted. Tap "This Week" → confirm it re-highlights and the month picker's chip reverts to "Pick a month". Tap "Item-wise Sales" while a custom month is selected → confirm the list reflects that same month, not "Today". Repeat the month-picker check on Reports → Purchase Report.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/reports/index.tsx" "app/(app)/reports/purchases/index.tsx" "app/(app)/reports/item-sales.tsx"
git commit -m "Add month-lookback picker to Reports home, Purchase Report, Item-wise Sales"
```

---

## Task 5: Simplify Inventory screens

**Files:**
- Modify: `app/(app)/inventory/index.tsx`
- Modify: `app/(app)/inventory/[id].tsx`
- Modify: `src/features/inventory/inventoryService.ts`

**Interfaces:**
- Removes: `recordPurchase` and `RecordPurchaseInput` from `inventoryService.ts` (confirmed this session's only caller is the Restock section being removed here).

- [ ] **Step 1: Remove "+ Record Purchase" from the Inventory list**

In `app/(app)/inventory/index.tsx`, replace:
```tsx
      <View style={styles.footerRow}>
        <Button
          label="+ Add Item"
          variant="secondary"
          onPress={() => router.push('/inventory/new')}
          style={{ flex: 1 }}
        />
        <Button label="+ Record Purchase" onPress={() => router.push('/inventory/purchase')} style={{ flex: 1 }} />
      </View>
```
with:
```tsx
      <Button label="+ Add Item" onPress={() => router.push('/inventory/new')} style={styles.addItemButton} />
```

Replace the `footerRow` entry in that file's `StyleSheet.create` block with:
```ts
  addItemButton: { position: 'absolute', bottom: 16, left: 16, right: 16 },
```

- [ ] **Step 2: Remove the Restock section from the Inventory Item screen**

In `app/(app)/inventory/[id].tsx`:

Remove `recordPurchase` from the import block (it currently reads `createInventoryItem, deleteInventoryItem, formatQuantity, getInventoryItem, listInventoryItems, recordPurchase, updateInventoryItem` — remove just `recordPurchase,`).

Remove these two state lines:
```tsx
  const [restockQuantity, setRestockQuantity] = useState('');
  const [restockCost, setRestockCost] = useState('');
```

Remove this line from the `useEffect` that hydrates the edit form:
```tsx
    // Restocking the same item again is the common case -- default to what was last paid so
    // staff usually just needs to confirm the quantity, not retype a price every time.
    if (item.costPerUnit != null) setRestockCost((prev) => prev || String(item.costPerUnit));
```

Remove the entire `restockMutation` block:
```tsx
  const restockMutation = useMutation({
    mutationFn: () =>
      recordPurchase({
        restaurantId,
        inventoryItemId: id,
        quantity: parseFloat(restockQuantity) || 0,
        costPerUnit: parseFloat(restockCost) || 0,
        staffId: currentUser.id,
      }),
    onSuccess: () => {
      invalidate();
      // Broad prefix match -- clears every date-range variant of the Daily Expense query
      // without this screen needing to know which range(s) are currently cached.
      queryClient.invalidateQueries({ queryKey: ['dailyExpense', restaurantId] });
      setRestockQuantity('');
    },
  });
```

Remove these two lines:
```tsx
  const canRestock = (parseFloat(restockQuantity) || 0) > 0 && (parseFloat(restockCost) || 0) > 0;
  const restockTotal = round2((parseFloat(restockQuantity) || 0) * (parseFloat(restockCost) || 0));
```

Remove the entire Restock section from the JSX (everything between the delete button and the closing `</ScrollView>`):
```tsx
      {!isNew && (
        <View style={styles.restockSection}>
          <Text style={styles.restockTitle}>Record restock</Text>
          <Text style={styles.restockHint}>
            Logs this as money spent (for the Daily Expense report) and adds it to stock -- unlike
            editing "Quantity in stock" above, which is for corrections and doesn't count as an expense.
          </Text>
          <FormField
            label={`Quantity purchased (${unit || 'units'})`}
            value={restockQuantity}
            onChangeText={setRestockQuantity}
            keyboardType="decimal-pad"
            placeholder="0"
          />
          <FormField
            label="Cost per unit"
            value={restockCost}
            onChangeText={setRestockCost}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
          {canRestock && <Text style={styles.restockTotal}>Total: ₹{restockTotal.toFixed(2)}</Text>}
          <Button
            label={restockMutation.isPending ? 'Recording…' : 'Record Restock'}
            onPress={() => restockMutation.mutate()}
            disabled={!canRestock || restockMutation.isPending}
            style={styles.restockButton}
          />
        </View>
      )}
```

Remove the now-unused style entries from the `StyleSheet.create` block: `restockSection`, `restockTitle`, `restockHint`, `restockTotal`, `restockButton`.

`round2` is no longer used anywhere in this file after this removal — remove its import line (`import { round2 } from '@/features/tax/taxEngine';`) too.

- [ ] **Step 3: Remove `recordPurchase` from `inventoryService.ts`**

In `src/features/inventory/inventoryService.ts`, remove the `RecordPurchaseInput` interface and the `recordPurchase` function in their entirety:
```ts
export interface RecordPurchaseInput {
  restaurantId: string;
  inventoryItemId: string;
  quantity: number;
  costPerUnit: number;
  staffId: string;
  /** Defaults to now — override for a purchase entered a day (or more) late, so it still counts
   * against the day it actually happened rather than the day someone got around to logging it. */
  purchasedAt?: Date;
}

/** Logs a restock as money spent (for the Daily Expense report) AND adds the quantity to the
 * item's running stock, in one transaction — the two must never drift apart. This is the only
 * supported way to increase stock with a cost attached; editing "Quantity in stock" directly in
 * the item editor is for corrections/stocktakes and intentionally does not log an expense. Also
 * updates the item's costPerUnit to this purchase's price, so the next restock/recipe costing
 * defaults to the latest price paid rather than a stale one. */
export async function recordPurchase(input: RecordPurchaseInput): Promise<void> {
  const totalCost = round2(input.quantity * input.costPerUnit);
  const purchasedAt = input.purchasedAt ?? new Date();
  await db.transaction(async (tx) => {
    await tx.insert(inventoryPurchases).values({
      id: generateId(),
      restaurantId: input.restaurantId,
      inventoryItemId: input.inventoryItemId,
      quantity: input.quantity,
      costPerUnit: input.costPerUnit,
      totalCost,
      staffId: input.staffId,
      purchasedAt,
    });
    await tx
      .update(inventoryItems)
      .set({
        quantity: sql`ROUND(${inventoryItems.quantity} + ${input.quantity}, 3)`,
        costPerUnit: input.costPerUnit,
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, input.inventoryItemId));
  });
}
```
Leave everything else in the file untouched — `getDailyExpenseSummary` and its types are removed separately, in Task 6, since Daily Expense is a distinct removal.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

Log in as Owner (PIN `1234`) → Inventory tab → confirm only "+ Add Item" appears (no "+ Record Purchase"). Open an existing item → confirm there is no "Record restock" section below "Delete item".

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/inventory/index.tsx" "app/(app)/inventory/[id].tsx" src/features/inventory/inventoryService.ts
git commit -m "Remove the single-item Restock flow, superseded by multi-item Purchase entry"
```

---

## Task 6: Remove the Daily Expense report

**Files:**
- Delete: `app/(app)/reports/daily-expense.tsx`
- Modify: `app/(app)/reports/_layout.tsx`
- Modify: `app/(app)/reports/index.tsx`
- Modify: `src/features/inventory/inventoryService.ts`
- Modify: `app/(app)/inventory/purchase.tsx`

- [ ] **Step 1: Delete the screen**

```bash
git rm "app/(app)/reports/daily-expense.tsx"
```

- [ ] **Step 2: Remove its route**

In `app/(app)/reports/_layout.tsx`, remove this line:
```tsx
      <Stack.Screen name="daily-expense" options={{ title: 'Daily Expense' }} />
```

- [ ] **Step 3: Remove its button from Reports home**

In `app/(app)/reports/index.tsx`, remove:
```tsx
      <Button
        label="Daily Expense"
        variant="secondary"
        onPress={() => router.push('/reports/daily-expense')}
        style={styles.button}
      />
```

- [ ] **Step 4: Remove `getDailyExpenseSummary` and its types from `inventoryService.ts`**

In `src/features/inventory/inventoryService.ts`, remove the following in their entirety: `DailyExpenseDay`, `DailyExpenseItem`, `DailyExpenseSummary` interfaces, the `localDateKey` function, and the `getDailyExpenseSummary` function (everything from `export interface DailyExpenseDay {` through the end of `getDailyExpenseSummary`'s closing brace, i.e. the rest of the file after `recordPurchase` — but `recordPurchase` was already removed in Task 5, so after this step the file ends at `restoreIngredients`).

After this removal, `gte`, `lt`, and `inArray` are no longer used anywhere in this file — check the remaining code (`listInventoryItems`, `getInventoryItem`, `createInventoryItem`, `updateInventoryItem`, `deleteInventoryItem`, `getRecipeIngredients`, `setRecipeIngredients`, `countIngredientsByMenuItem`, `consumeIngredients`, `restoreIngredients`) and confirm none of them reference `gte`, `lt`, or `inArray` (they don't — those three were only used inside `getDailyExpenseSummary`). Update the top import line from:
```ts
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
```
to:
```ts
import { eq, sql } from 'drizzle-orm';
```
(`and` was only used inside `getDailyExpenseSummary` too — check `listInventoryItems`, `deleteInventoryItem`, etc. still compile without it; they use the relational-query-builder callback form `(i, { and, eq: eqOp }) => ...` which shadows its own local `and`, not the top-level import, so removing the top-level `and` import is safe.)

- [ ] **Step 5: Remove the now-dead `dailyExpense` cache invalidation from the Purchase entry screen**

In `app/(app)/inventory/purchase.tsx`, remove this line from `saveMutation`'s `onSuccess`:
```tsx
      queryClient.invalidateQueries({ queryKey: ['dailyExpense', restaurantId] });
```
(the query key it referenced no longer exists anywhere after Daily Expense is deleted — this line would be a harmless no-op if left, but it's dead code referencing a removed feature).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx jest`
Expected: all suites pass (no test file references `getDailyExpenseSummary` or Daily Expense — confirm by checking `npx jest --listTests` output doesn't include a daily-expense test file; there isn't one in this codebase today).

- [ ] **Step 8: Manual verification**

Log in as Owner (PIN `1234`) → Reports tab → confirm there is no "Daily Expense" button (only "Item-wise Sales" and "Purchase Report" remain alongside the summary cards).

- [ ] **Step 9: Commit**

```bash
git add -A "app/(app)/reports/" "app/(app)/inventory/purchase.tsx" src/features/inventory/inventoryService.ts
git commit -m "Remove the Daily Expense report, superseded by Purchase Report"
```

---

## Task 7: `suppliers.isActive` schema column

**Files:**
- Modify: `src/db/schema/inventory.ts`
- Create: `supabase/migrations/012_supplier_soft_delete.sql`

**Interfaces:**
- Produces: `suppliers.isActive: boolean`, consumed by Task 8's vendor CRUD functions and the updated `getSupplierSuggestions`.

- [ ] **Step 1: Add the column to the Drizzle schema**

In `src/db/schema/inventory.ts`, the `suppliers` table currently reads:
```ts
export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  name: text('name').notNull(),
  phone: text('phone'),
  gstNumber: text('gst_number'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
```
Add an `isActive` field between `gstNumber` and `createdAt`, matching `inventoryItems.isActive`'s exact shape:
```ts
export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  name: text('name').notNull(),
  phone: text('phone'),
  gstNumber: text('gst_number'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

- [ ] **Step 2: Generate the local migration**

Run: `npx drizzle-kit generate`
Expected: a new `src/db/migrations/00NN_<name>.sql` containing `ALTER TABLE suppliers ADD is_active integer DEFAULT true NOT NULL;` (or equivalent) — read it and confirm.

- [ ] **Step 3: Write the Supabase migration**

Create `supabase/migrations/012_supplier_soft_delete.sql`:
```sql
-- Vendor CRUD (see the follow-up design spec) needs a way to remove a vendor from lists and
-- autocomplete without breaking existing purchase bills that reference it -- suppliers.id has
-- no ON DELETE behavior specified on purchases.supplier_id, so a hard delete would fail outright
-- for any vendor with purchase history. Soft-delete, matching inventory_items.is_active.
ALTER TABLE suppliers ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/inventory.ts src/db/migrations/ supabase/migrations/012_supplier_soft_delete.sql
git commit -m "Add suppliers.is_active for vendor soft-delete"
```

- [ ] **Step 6: Flag the manual production step**

This migration is not auto-applied — note in your task report that `supabase/migrations/012_supplier_soft_delete.sql` needs to be run against the live database before this branch's vendor-CRUD API changes matter for production data (same one-off-run process as `010_inventory_purchases.sql` and `011_purchases.sql` before it).

---

## Task 8: Vendor CRUD service functions

**Files:**
- Modify: `src/features/inventory/purchaseService.ts`

**Interfaces:**
- Consumes: `suppliers.isActive` (Task 7).
- Produces: `VendorInput` type, `listVendors(restaurantId): Promise<Supplier[]>`, `getVendor(id): Promise<Supplier | null>`, `createVendor(input: VendorInput): Promise<string>`, `updateVendor(id, input): Promise<void>`, `deleteVendor(id): Promise<void>` — all consumed by Task 9's Vendors screens.

- [ ] **Step 1: Update `getSupplierSuggestions` to exclude soft-deleted vendors**

In `src/features/inventory/purchaseService.ts`, change the top import line from:
```ts
import { eq, sql } from 'drizzle-orm';
```
to:
```ts
import { and, eq, sql } from 'drizzle-orm';
```

Replace `getSupplierSuggestions`:
```ts
export async function getSupplierSuggestions(restaurantId: string, query: string): Promise<Supplier[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const all = await db.query.suppliers.findMany({
    where: eq(suppliers.restaurantId, restaurantId),
    orderBy: (s, { desc }) => desc(s.updatedAt),
  });
  const q = trimmed.toLowerCase();
  return all.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 5);
}
```
with:
```ts
export async function getSupplierSuggestions(restaurantId: string, query: string): Promise<Supplier[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const all = await db.query.suppliers.findMany({
    where: and(eq(suppliers.restaurantId, restaurantId), eq(suppliers.isActive, true)),
    orderBy: (s, { desc }) => desc(s.updatedAt),
  });
  const q = trimmed.toLowerCase();
  return all.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 5);
}
```

- [ ] **Step 2: Add the vendor CRUD functions**

Append to the end of `src/features/inventory/purchaseService.ts`:
```ts
export interface VendorInput {
  restaurantId: string;
  name: string;
  phone?: string;
  gstNumber?: string;
}

/** Active vendors, alphabetical -- powers the Vendors list screen. Unlike
 * getSupplierSuggestions (autocomplete, capped at 5, substring-matched), this returns every
 * active vendor for full CRUD browsing. */
export async function listVendors(restaurantId: string): Promise<Supplier[]> {
  return db.query.suppliers.findMany({
    where: and(eq(suppliers.restaurantId, restaurantId), eq(suppliers.isActive, true)),
    orderBy: (s, { asc }) => asc(s.name),
  });
}

export async function getVendor(id: string): Promise<Supplier | null> {
  const row = await db.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
  return row ?? null;
}

export async function createVendor(input: VendorInput): Promise<string> {
  const id = generateId();
  await db.insert(suppliers).values({
    id,
    restaurantId: input.restaurantId,
    name: input.name,
    phone: input.phone || null,
    gstNumber: input.gstNumber || null,
  });
  return id;
}

export async function updateVendor(
  id: string,
  input: Partial<Pick<VendorInput, 'name' | 'phone' | 'gstNumber'>>,
): Promise<void> {
  await db
    .update(suppliers)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(suppliers.id, id));
}

/** Soft delete -- a vendor with past purchase bills keeps its row (those bills still resolve its
 * name correctly via listPurchases/getPurchaseDetail, which join suppliers by id regardless of
 * isActive), it just stops appearing in the Vendors list or the Purchase entry autocomplete. */
export async function deleteVendor(id: string): Promise<void> {
  await db.update(suppliers).set({ isActive: false, updatedAt: new Date() }).where(eq(suppliers.id, id));
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/inventory/purchaseService.ts
git commit -m "Add vendor CRUD functions and filter soft-deleted vendors from suggestions"
```

---

## Task 9: Vendors list + detail screens

**Files:**
- Create: `app/(app)/vendors/_layout.tsx`
- Create: `app/(app)/vendors/index.tsx`
- Create: `app/(app)/vendors/[id].tsx`

**Interfaces:**
- Consumes: `listVendors`, `getVendor`, `createVendor`, `updateVendor`, `deleteVendor`, `VendorInput` (Task 8).

- [ ] **Step 1: Register the routes**

Create `app/(app)/vendors/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';

export default function VendorsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Vendors' }} />
      <Stack.Screen name="[id]" options={{ title: 'Vendor', presentation: 'modal' }} />
    </Stack>
  );
}
```

- [ ] **Step 2: Write the list screen**

Create `app/(app)/vendors/index.tsx`:
```tsx
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { listVendors } from '@/features/inventory/purchaseService';
import { Button } from '@/components/Button';

export default function VendorsScreen() {
  const router = useRouter();
  const restaurantId = useRestaurantId();

  const vendorsQuery = useQuery({
    queryKey: ['vendors', restaurantId],
    queryFn: () => listVendors(restaurantId),
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={vendorsQuery.data ?? []}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No vendors yet.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/vendors/${item.id}`)}>
            <Text style={styles.rowName}>{item.name}</Text>
            {item.phone ? <Text style={styles.rowMeta}>{item.phone}</Text> : null}
          </Pressable>
        )}
      />
      <Button label="+ Add Vendor" onPress={() => router.push('/vendors/new')} style={styles.addButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingBottom: 90, gap: 8 },
  empty: { textAlign: 'center', color: '#999', marginTop: 40 },
  row: { padding: 14, borderRadius: 10, backgroundColor: '#f5f5f5' },
  rowName: { fontSize: 16, fontWeight: '600' },
  rowMeta: { fontSize: 13, color: '#666', marginTop: 2 },
  addButton: { position: 'absolute', bottom: 16, left: 16, right: 16 },
});
```

- [ ] **Step 3: Write the create/edit screen**

Create `app/(app)/vendors/[id].tsx`:
```tsx
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '@/features/auth/useRestaurantId';
import { createVendor, deleteVendor, getVendor, updateVendor } from '@/features/inventory/purchaseService';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';

export default function VendorEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const restaurantId = useRestaurantId();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gstNumber, setGstNumber] = useState('');

  const vendorQuery = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => getVendor(id),
    enabled: !isNew,
  });

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate the edit form once the record loads */
  useEffect(() => {
    const vendor = vendorQuery.data;
    if (!vendor) return;
    setName(vendor.name);
    setPhone(vendor.phone ?? '');
    setGstNumber(vendor.gstNumber ?? '');
  }, [vendorQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['vendors', restaurantId] });
    queryClient.invalidateQueries({ queryKey: ['vendor', id] });
    queryClient.invalidateQueries({ queryKey: ['supplierSuggestions', restaurantId] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const input = { name, phone: phone.trim() || undefined, gstNumber: gstNumber.trim() || undefined };
      if (isNew) {
        await createVendor({ restaurantId, ...input });
      } else {
        await updateVendor(id, input);
      }
    },
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteVendor(id),
    onSuccess: () => {
      invalidate();
      router.back();
    },
  });

  const canSave = name.trim().length > 0;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardDismissMode="on-drag">
      <FormField label="Vendor name" value={name} onChangeText={setName} placeholder="e.g. Fresh Farms Traders" />
      <FormField label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <FormField label="GST number (optional)" value={gstNumber} onChangeText={setGstNumber} autoCapitalize="characters" />

      <Button
        label={isNew ? 'Add vendor' : 'Save changes'}
        onPress={() => saveMutation.mutate()}
        disabled={!canSave}
        style={styles.saveButton}
      />
      {!isNew && (
        <Button label="Delete vendor" variant="danger" onPress={() => deleteMutation.mutate()} style={styles.deleteButton} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  saveButton: { marginTop: 8 },
  deleteButton: { marginTop: 12 },
});
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

Metro should have Fast-Refreshed automatically; if not, restart per Task 4 Step 5's instructions. There's no navigation entry point to `/vendors` yet (that's Task 11) — reach it directly for this task's verification via:
```bash
"$ANDROID_HOME/platform-tools/adb.exe" shell am start -a android.intent.action.VIEW -d "pos://vendors"
```
(this app's Expo Router scheme is `pos`, confirmed in `app.json`'s `scheme` field — confirm it opens the Vendors list.) If the deep link doesn't resolve, temporarily add `router.push('/vendors')` to any already-open screen's button `onPress` for this check, then revert that ad hoc edit before committing.

Create a vendor named "Test Vendor Co" with phone "9999999999" → confirm it appears in the list. Tap it → edit its GST number → save → confirm the change persisted (reopen it). Delete it → confirm it disappears from the list.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/vendors/"
git commit -m "Add Vendors list and create/edit screens"
```

---

## Task 10: "More" screen

**Files:**
- Create: `app/(app)/more/_layout.tsx`
- Create: `app/(app)/more/index.tsx`

**Interfaces:**
- Produces: a `/more` route with two rows, consumed by Task 11's navigation wiring.

- [ ] **Step 1: Register the route**

Create `app/(app)/more/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';

export default function MoreLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'More' }} />
    </Stack>
  );
}
```

- [ ] **Step 2: Write the screen**

Create `app/(app)/more/index.tsx`:
```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

export default function MoreScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Pressable style={styles.row} onPress={() => router.push('/inventory/purchase')}>
        <Text style={styles.rowText}>Add Purchase Record</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/vendors')}>
        <Text style={styles.rowText}>Vendors</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  row: { padding: 16, borderRadius: 10, backgroundColor: '#f5f5f5' },
  rowText: { fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/more/"
git commit -m "Add the More screen (Add Purchase Record, Vendors)"
```

---

## Task 11: Navigation wiring

**Files:**
- Modify: `app/(app)/_layout.tsx`
- Modify: `app/(app)/settings/index.tsx`

**Interfaces:**
- Consumes: `/more` route (Task 10).

- [ ] **Step 1: Add Captain's new "More" tab**

In `app/(app)/_layout.tsx`, add a new boolean alongside the existing role booleans:
```tsx
  const isOwner = currentUser.role === 'owner';
  const isWaiter = currentUser.role === 'cashier';
  const showBillingAndTables = !isOwner;
  const showInventoryAndRecipes = !isWaiter;
  const showReports = isOwner;
  const showMenu = !isWaiter;
  // Captain-only: Owner reaches the same /more screen through a link inside Settings instead
  // (see settings/index.tsx) since Owner already has a dedicated Settings section for
  // management links, and Waiter needs neither -- Purchase Tracking is Owner/Captain only,
  // same as Inventory/Recipes.
  const showMoreTab = currentUser.role === 'admin';
```

Add a new `Tabs.Screen` directly before the existing `settings` one:
```tsx
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          headerShown: false,
          href: showMoreTab ? undefined : null,
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal-outline" size={size} color={color} />,
        }}
      />
```

- [ ] **Step 2: Add Owner's "More" link in Settings**

In `app/(app)/settings/index.tsx`, add a new `Pressable` link row right after the existing "Sync" one, still inside the `isManager && (...)` block:
```tsx
          <Pressable style={styles.linkRow} onPress={() => router.push('/settings/sync')}>
            <Text style={styles.linkText}>Sync</Text>
          </Pressable>
          <Pressable style={styles.linkRow} onPress={() => router.push('/more')}>
            <Text style={styles.linkText}>More</Text>
          </Pressable>
```
(the first line above is the existing Sync row, shown for context — only the new "More" row after it is an addition.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Log in as Captain (PIN `5678`, the test account created in Task 1) → confirm a "More" tab appears in the bottom tab bar, positioned right before Settings, and that tapping it shows "Add Purchase Record" and "Vendors" → tap "Add Purchase Record" and confirm it opens the Purchase entry screen (note: this will visually switch the highlighted bottom tab to Inventory, since that route lives under Inventory's own stack — this is expected, not a bug, per the design spec). Go back, tap "Vendors" and confirm the Vendors list opens.

Log out, log in as Owner (PIN `1234`) → confirm there is NO "More" tab in the bottom bar → go to Settings → confirm a "More" link now appears after "Sync" → tap it → confirm it opens the same More screen.

Log in as a Waiter, if one exists on this test restaurant (Task 1 only created an Owner and a Captain — skip this check if no Waiter account exists; it is not worth creating one solely for this check, since Waiter's tab visibility for Inventory/Recipes/Menu/Reports already excludes Purchase-Tracking-adjacent surfaces entirely and this tab uses the identical `!isWaiter`-style gating pattern already proven correct elsewhere in this same file).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/_layout.tsx" "app/(app)/settings/index.tsx"
git commit -m "Wire up Captain's More tab and Owner's More link in Settings"
```

---

## Final check (after all 11 tasks)

- [ ] Run the full test suite: `npx jest` — expect all suites passing, including the 4 new `monthsAgo`/`monthLabel` tests from Task 2.
- [ ] Run a full typecheck one more time: `npx tsc --noEmit` — expect only the pre-existing unrelated errors (`firebase-admin`, `expo-file-system`, `Tesseract`).
- [ ] Confirm with the user that `supabase/migrations/012_supplier_soft_delete.sql` (Task 7) has been run against the live database before deploying anything that depends on vendor soft-delete.
- [ ] Confirm the emulator's throwaway test restaurant (created in Task 1) is not something the user needs preserved — it's local-only test data on the `resto_test` AVD, not synced to any real restaurant.
