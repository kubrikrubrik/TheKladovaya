// storage.js — постоянное хранение данных в IndexedDB (запасной вариант — localStorage).
const DB_NAME = 'kladovaya';
const STORE = 'kv';
const LS_PREFIX = 'kladovaya:';

let dbPromise = null;
let mode = 'idb';

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB недоступен')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('База заблокирована другой вкладкой'));
  }).catch(err => { mode = 'ls'; console.warn('Хранилище: переключение на localStorage —', err.message); return null; });
  return dbPromise;
}

function lsGet(key) {
  try { const v = localStorage.getItem(LS_PREFIX + key); return v == null ? undefined : JSON.parse(v); } catch { return undefined; }
}
function lsSet(key, value) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); return true; } catch (e) { console.error(e); return false; }
}

export const kv = {
  get mode() { return mode; },
  async get(key) {
    const db = await openDb();
    if (!db) return lsGet(key);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(lsGet(key));
      } catch { resolve(lsGet(key)); }
    });
  },
  async getMany(keys) {
    const out = {};
    for (const k of keys) out[k] = await this.get(k);
    return out;
  },
  async set(key, value) {
    const db = await openDb();
    if (!db) return lsSet(key, value);
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(lsSet(key, value));
        tx.onabort = () => resolve(lsSet(key, value));
      } catch { resolve(lsSet(key, value)); }
    });
  },
  async clear() {
    const db = await openDb();
    try { Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX)).forEach(k => localStorage.removeItem(k)); } catch { /* ничего */ }
    if (!db) return true;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  },
  async persist() {
    // Просим браузер не удалять данные при нехватке места
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch { /* ничего */ }
    return false;
  },
};
