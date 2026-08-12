const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Required so Metro can bundle the raw .sql migration files that drizzle-kit generates.
config.resolver.sourceExts.push('sql');

module.exports = config;
