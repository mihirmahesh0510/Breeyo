// Learn more https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];
// 2. Let Metro know where to resolve packages, and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Note: disableHierarchicalLookup is intentionally NOT set here -- pnpm's strict,
// symlinked node_modules layout needs hierarchical lookup enabled to find nested
// workspace-package dependencies; that setting is meant for Yarn/npm-hoisted layouts.
config.resolver.unstable_enableSymlinks = true;
// @breeyo/types uses package.json "exports" to map deep subpath imports
// (e.g. @breeyo/types/constants/queue-status) to its dist/ output -- Metro
// only honors "exports" maps when this is explicitly turned on.
config.resolver.unstable_enablePackageExports = true;

// TESTING-ONLY: expo-sqlite has no web implementation and Expo Router's route
// manifest eagerly evaluates every app/ file, crashing the whole web preview
// even when not on an inventory screen. Swap in a silent no-op stub for the
// web platform only -- native bundling (Android/iOS) is untouched and still
// resolves the real module. See web-mocks/expo-sqlite.js for details.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'expo-sqlite') {
    return {
      filePath: path.resolve(projectRoot, 'web-mocks/expo-sqlite.js'),
      type: 'sourceFile',
    };
  }
  if (platform === 'web' && moduleName === 'expo-secure-store') {
    return {
      filePath: path.resolve(projectRoot, 'web-mocks/expo-secure-store.js'),
      type: 'sourceFile',
    };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
