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

export function createAuthStore(adapter = expoAdapter) {
  return {
    saveSession: async (token, user) => {
      await adapter.setItem('despegar.token', token);
      await adapter.setItem('despegar.user', JSON.stringify(user));
    },
    getToken: () => adapter.getItem('despegar.token'),
    getUser: async () => {
      const raw = await adapter.getItem('despegar.user');
      return raw ? JSON.parse(raw) : null;
    },
    clearSession: async () => {
      await adapter.deleteItem('despegar.token');
      await adapter.deleteItem('despegar.user');
    },
  };
}

// Instancia por defecto para las apps.
export const authStore = createAuthStore();
export { memoryAdapter };
