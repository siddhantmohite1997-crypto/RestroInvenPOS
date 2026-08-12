import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

export const DATABASE_NAME = 'pos.db';

export const sqlite = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });

// PRAGMA foreign_keys is off by default in SQLite; we rely on FK constraints for data integrity.
sqlite.execSync('PRAGMA foreign_keys = ON;');
sqlite.execSync('PRAGMA journal_mode = WAL;');

export const db = drizzle(sqlite, { schema });

export type Database = typeof db;
