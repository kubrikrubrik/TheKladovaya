// sw.js — офлайн-режим: интерфейс и базы доступны без интернета после первого открытия.
const VERSION = 'kladovaya-v1.0.0';
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'core.js', 'state.js', 'storage.js', 'ui.js',
  'view-products.js', 'view-shopping.js', 'view-recipes.js', 'view-base.js', 'view-settings.js',
  'ingredients.json', 'products.json', 'recipes.json',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k.startsWith('kladovaya-')).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return cache.match('index.html');
    throw new Error('Нет сети и нет копии в кэше');
  }
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  const update = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) { event.waitUntil(update); return hit; }
  const res = await update;
  return res || new Response('', { status: 504, statusText: 'Offline' });
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION + '-fonts');
  const hit = await cache.match(req);
  if (hit) return hit;
  try { const res = await fetch(req); if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }
  catch { return new Response('', { status: 504 }); }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' || req.cache === 'reload' || req.cache === 'no-cache') event.respondWith(networkFirst(req));
    else event.respondWith(staleWhileRevalidate(req, event));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') event.respondWith(cacheFirst(req));
});
