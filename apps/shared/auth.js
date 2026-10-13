// Sesión segura (TRANS-70): token en SecureStore, nunca en AsyncStorage plano.
// Diseño testeable: createAuthStore(adapter). En Expo se usa SecureStore;
// en Node/tests se inyecta adaptador memoria. Sin dependencias extra.
let expoStore = null;
try {
  // eslint-disable-next-line global-require
  expoStore = require('expo-secure-store');
} catch (e) {
  expoStore = null;
}

const memoryAdapter = (() => {
  const m = new Map();
  return {
    setItem: async (k, v) => { m.set(k, v); },
    getItem: async (k) => (m.has(k) ? m.get(k) : null),
    deleteItem: async (k) => { m.delete(k); },
  };
})();

const expoAdapter = expoStore
  ? {
      setItem: (k, v) => expoStore.setItemAsync(k, v),
      getItem: (k) => expoStore.getItemAsync(k),
      deleteItem: (k) => expoStore.deleteItemAsync(k),
    }
  : memoryAdapter;

// Si SecureStore no está disponible o falla (web, nativo sin módulo),
// se usa memoria como respaldo para no dejar la app colgada.
function withMemoryFallback(adapter) {
  return {
    setItem: async (k, v) => {
      try {
        await adapter.setItem(k, v);
      } catch (e) {
        await memoryAdapter.setItem(k, v);
      }
    },
    getItem: async (k) => {
      try {
        const v = await adapter.getItem(k);
        return v !== null && v !== undefined ? v : await memoryAdapter.getItem(k);
      } catch (e) {
        return memoryAdapter.getItem(k);
      }
    },
    deleteItem: async (k) => {
      try {
        await adapter.deleteItem(k);
      } catch (e) {
        /* noop: igual se limpia memoria */
      }
      await memoryAdapter.deleteItem(k);
    },
  };
}

export function createAuthStore(adapter = expoAdapter) {
  const safe = adapter === memoryAdapter ? adapter : withMemoryFallback(adapter);
  return {
    saveSession: async (token, user, refresh = null) => {
      await safe.setItem('despegar.token', token);
      await safe.setItem('despegar.user', JSON.stringify(user));
      if (refresh) await safe.setItem('despegar.refresh', refresh);
      else await safe.deleteItem('despegar.refresh');
    },
    getToken: () => safe.getItem('despegar.token'),
    getRefresh: () => safe.getItem('despegar.refresh'),
    getUser: async () => {
      const raw = await safe.getItem('despegar.user');
      try {
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    clearSession: async () => {
      await safe.deleteItem('despegar.token');
      await safe.deleteItem('despegar.user');
      await safe.deleteItem('despegar.refresh');
    },
    getOfflineQueue: () => safe.getItem('despegar.offline_queue'),
    setOfflineQueue: (v) => safe.setItem('despegar.offline_queue', v),
  };
}

// Instancia por defecto para las apps.
export const authStore = createAuthStore();
export { memoryAdapter };
