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

// Add wasm asset support (required by expo-sqlite on web)
config.resolver.assetExts.push('wasm');

// Add COEP and COOP headers to support SharedArrayBuffer (required by expo-sqlite on web).
// expo-router's dev server serves the HTML document through a code path that bypasses
// Metro's own `server.enhanceMiddleware` hook, so we patch http.ServerResponse directly
// to guarantee every response (bundle, asset, or the document itself) carries the headers.
const http = require('http');
const originalWriteHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function writeHead(...args) {
  this.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  this.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return originalWriteHead.apply(this, args);
};

module.exports = config;
