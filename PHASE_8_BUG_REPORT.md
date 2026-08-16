# Phase 8: Bug Report & Fixes

## Date: 2026-08-16
## Testing Environment: Android physical device

---

## Bugs Found (5 Critical)

### Bug #1: Combos Not Available in Billing
**Severity:** HIGH  
**Status:** UNFIXED

**Description:**
Combo deals created in Menu → Combos are not available when adding items to an order (billing screen).

**Root Cause:**
The item-add flow (`app/(app)/orders/[id]/add-item/[menuItemId].tsx`) only supports regular menu items with modifiers. It doesn't query or display combos.

**Expected Behavior:**
Combos should appear as selectable items in the billing flow alongside regular items.

**Actual Behavior:**
No combo option exists; users can only add regular items.

**Steps to Reproduce:**
1. Go to Menu → Combos
2. Create a combo with items
3. Go to Billing → New Order
4. Try to add a combo — it's not available

---

### Bug #2: Printer Detection Missing
**Severity:** CRITICAL  
**Status:** UNFIXED

**Description:**
When clicking "Print receipt," the button changes to "Printing…" but hangs indefinitely if no printer is connected.

**Root Cause:**
`printerService.ts` calls `expo-print.printAsync()` without:
- Checking if a printer is available beforehand
- Catching user cancellation or failures
- Saving the bill locally if printing fails

**Expected Behavior:**
- Before printing: Detect if a printer is available
- If yes: Proceed with print dialog
- If no: Show error message "No printer connected" and save bill locally
- If user cancels: Gracefully dismiss and keep bill in drafts

**Actual Behavior:**
UI hangs on "Printing…"; users cannot proceed or save the bill.

---

### Bug #3: Receipt Format (A4 vs 70–80mm Thermal)
**Severity:** HIGH  
**Status:** UNFIXED

**Description:**
The receipt HTML template generates A4-sized invoices, not thermal paper (70–80mm width) POS receipts.

**Root Cause:**
`receiptHtml.ts` doesn't specify thermal paper dimensions; it assumes full-page layout.

**Expected Behavior:**
Receipt should render as 70–80mm width (standard ESC/POS thermal roll), with vertical layout optimized for narrow paper.

**Actual Behavior:**
Receipts print/display as full A4 page, unsuitable for thermal printers.

---

### Bug #4: Tab Icons Corrupted/Missing
**Severity:** MEDIUM  
**Status:** UNFIXED

**Description:**
The bottom tab bar shows no/corrupted icons for Billing, Tables, Menu, Reports, Settings tabs.

**Root Cause:**
`app/(app)/_layout.tsx` defines tabs with `title` only, no icon definitions. Expo Tabs tries to render default icons, but they appear broken or invisible.

**Expected Behavior:**
Each tab should have a clear, recognizable icon.

**Actual Behavior:**
Tabs show text labels but icons are missing or visibly broken.

---

### Bug #5: Clarification Needed — Modifiers
**Severity:** LOW (Documentation)  
**Status:** RESOLVED

**Description:**
User asked: "What is the use of modifier?"

**Answer:**
Modifiers are optional add-ons for menu items:
- Example: A pizza "Pepperoni" can have modifiers like "Extra cheese" (+₹50), "Thin crust" (no price), etc.
- Use: Menu → Modifiers → Create groups (e.g., "Cheese", "Crust") → Add modifiers to each
- Then: Assign modifier groups to menu items
- In billing: When adding an item, the user is prompted to select modifiers
- Currently working: Modifiers are fully integrated into the billing flow ✓

---

## Test Cases (Created Below)

---

## Fixes Summary

- **Bug #1 (Combos):** Add combos to item-add flow + display in menu billing
- **Bug #2 (Printer):** Add printer availability check + graceful error handling + local save
- **Bug #3 (Thermal receipt):** Update HTML template to 70–80mm CSS dimensions
- **Bug #4 (Icons):** Add icon definitions to tab screen options
- **Bug #5:** Document modifiers feature (complete)

---

## Files to Modify

1. `app/(app)/orders/[id]/add-item/` — Add combo selection
2. `src/features/receipts/printerService.ts` — Add printer detection & error handling
3. `src/features/receipts/receiptHtml.ts` — Update CSS for 70–80mm thermal layout
4. `app/(app)/_layout.tsx` — Add tab icons
5. Unit tests for all four bug fixes

