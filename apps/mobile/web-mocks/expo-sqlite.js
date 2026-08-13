// TESTING-ONLY web mock. expo-sqlite has no browser implementation (throws
// by design). Expo Router eagerly evaluates all app/ routes to build its
// manifest, which pulls this in even off-screen, crashing the whole app
// shell on web. Real native builds use the real module; this file is not
// part of the shipped app (see metro.config.js resolver.alias, web-only).
// All methods are silent no-ops so navigation doesn't crash -- offline
// cache/queue behavior itself is out of scope for this web-preview session
// and is verified on a physical device instead.
module.exports = {
  openDatabaseSync: () => ({
    execSync: () => {},
    execAsync: async () => {},
    runSync: () => ({ changes: 0, lastInsertRowId: 0 }),
    runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
    getFirstSync: () => null,
    getFirstAsync: async () => null,
    getAllSync: () => [],
    getAllAsync: async () => [],
  }),
};
