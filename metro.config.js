const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Required so Metro can bundle the raw .sql migration files that drizzle-kit generates.
config.resolver.sourceExts.push('sql');

// TanStack Query ships a package.json#exports map whose "require"/"import" conditions Metro
// can't resolve; their documented fix for Metro/RN is this custom condition, which points
// Metro at the package's TS source instead.
config.resolver.unstable_conditionNames = [
  ...(config.resolver.unstable_conditionNames ?? ['require', 'react-native']),
  '@tanstack/custom-condition',
];

module.exports = config;
