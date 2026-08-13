// TESTING-ONLY web shim. expo-secure-store is backed by the OS keychain and
// has no full web parity. Backed by localStorage so an auth session actually
// persists across navigation during a web-preview test (better than a no-op,
// which would log the user out on every screen). Not part of the shipped
// app -- see metro.config.js resolver.resolveRequest, web-only.
const PREFIX = 'breeyo-securestore-test:';

module.exports = {
  getItemAsync: async (key) => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(PREFIX + key);
  },
  setItemAsync: async (key, value) => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PREFIX + key, value);
  },
  deleteItemAsync: async (key) => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(PREFIX + key);
  },
};
