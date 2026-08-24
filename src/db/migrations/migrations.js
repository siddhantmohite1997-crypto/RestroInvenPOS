// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_aberrant_sleeper.sql';
import m0001 from './0001_boring_nitro.sql';
import m0002 from './0002_powerful_cammi.sql';
import m0003 from './0003_flowery_tiger_shark.sql';
import m0004 from './0004_giant_goblin_queen.sql';
import m0005 from './0005_normal_sway.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005
    }
  }
  