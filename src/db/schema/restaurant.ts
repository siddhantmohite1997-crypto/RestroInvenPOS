import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * One row per business. Invoice/tax fields are deliberately region-agnostic
 * (taxIdLabel/country) rather than India-hardcoded, per the region-configurable
 * invoice requirement in Phase 4.
 */
export const restaurants = sqliteTable('restaurants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  country: text('country').notNull().default('IN'),
  phone: text('phone'),
  email: text('email'),
  taxIdLabel: text('tax_id_label').notNull().default('GSTIN'),
  taxId: text('tax_id'),
  currencyCode: text('currency_code').notNull().default('INR'),
  currencySymbol: text('currency_symbol').notNull().default('₹'),
  logoUri: text('logo_uri'),
  invoiceFooterText: text('invoice_footer_text'),
  invoicePrefix: text('invoice_prefix').notNull().default('INV'),
  nextInvoiceSequence: integer('next_invoice_sequence').notNull().default(1),
  serviceChargeEnabled: integer('service_charge_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  serviceChargePercent: real('service_charge_percent').notNull().default(0),
  /** Lets counter-service/QSR restaurants turn off table tracking entirely; toggle in Settings. */
  tablesEnabled: integer('tables_enabled', { mode: 'boolean' }).notNull().default(true),
  roundingRule: text('rounding_rule')
    .$type<'none' | 'nearest_1' | 'nearest_0_5' | 'nearest_5'>()
    .notNull()
    .default('nearest_1'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Staff account. Auth is PIN-based (see src/features/auth) — pinHash/pinSalt only, never plaintext. */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  name: text('name').notNull(),
  pinHash: text('pin_hash').notNull(),
  pinSalt: text('pin_salt').notNull(),
  /** Set only for a staff row restored from the cloud (not the device's own paired login) --
   * the cloud only ever has an unsalted SHA-256 of the PIN (see /pair, /staff in api/src/index.ts),
   * so this device can't compute a real salted pinHash for that staff member until they actually
   * log in once. authenticateByPin() falls back to this, then upgrades to a proper salted
   * pinHash/pinSalt and clears this column. */
  cloudPinHash: text('cloud_pin_hash'),
  role: text('role').$type<'owner' | 'admin' | 'cashier'>().notNull().default('cashier'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
