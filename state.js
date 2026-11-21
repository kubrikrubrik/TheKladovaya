// state.js — данные приложения и все операции над ними (без DOM).
import * as C from './core.js';
import { kv } from './storage.js';

export const APP_VERSION = '1.0.0';
export const DATA_VERSION = 1;

export const DEFAULT_CATEGORIES = [
  ['veg', 'Овощи'], ['fruit', 'Фрукты и ягоды'], ['meat', 'Мясо и птица'], ['fish', 'Рыба и морепродукты'],
  ['dairy', 'Молочные продукты'], ['cheese', 'Сыры'], ['eggs', 'Яйца'], ['sausage', 'Колбасные изделия'],
  ['grains', 'Крупы'], ['pasta', 'Макароны и паста'], ['legumes', 'Бобовые'], ['bread', 'Хлеб и выпечка'],
  ['sweets', 'Сладости'], ['snacks', 'Снеки и чипсы'], ['drinks', 'Напитки'], ['soda', 'Газировка'],
  ['juice', 'Соки и вода'], ['frozen', 'Замороженные продукты'], ['canned', 'Консервы'], ['sauces', 'Соусы и специи'],
  ['oils', 'Масла'], ['coffee', 'Кофе и чай'], ['grocery', 'Бакалея'], ['other', 'Прочее'],
].map(([id, name], i) => ({ id, name, order: i }));

export const STORES = ['Самокат', 'Пятёрочка', 'Перекрёсток', 'Чижик', 'Ашан', 'Лента', 'Магнит', 'ВкусВилл', 'METRO', 'О\'КЕЙ'];

const PERSIST_KEYS = ['inventory', 'categories', 'shopping', 'customRecipes', 'userProducts', 'settings', 'history', 'dismissed', 'cooked'];

export const S = {
  ready: false,
  inventory: [], categories: [], shopping: [], customRecipes: [], userProducts: [],
  settings: {}, history: [], dismissed: {}, cooked: {},
  products: [], productsMeta: {}, recipes: [], recipeCategories: [], ingredients: [], tax: null,
  storageMode: 'idb',
};

/* ---------- события ---------- */
const bus = new EventTarget();
export function onChange(fn) { bus.addEventListener('change', e => fn(e.detail || {})); }
let stockCache = null, searchCache = null, evalCache = null;
function invalidate(kind) {
  if (!kind || kind.inventory || kind.settings) { stockCache = null; evalCache = null; }
  if (!kind || kind.products) searchCache = null;
  if (kind && kind.recipes) evalCache = null;
}
const pending = new Set();
let saveTimer = null;
export function commit(keys, detail = {}) {
  for (const k of keys) pending.add(k);
  const kind = {}; for (const k of keys) kind[k === 'userProducts' ? 'products' : k === 'customRecipes' ? 'recipes' : k] = true;
  invalidate(kind);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 120);
  bus.dispatchEvent(new CustomEvent('change', { detail: { keys, ...detail } }));
}
export async function flush() {
  clearTimeout(saveTimer);
  const keys = [...pending]; pending.clear();
  for (const k of keys) await kv.set(k, S[k]);
}
window.addEventListener('pagehide', () => { if (pending.size) flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && pending.size) flush(); });

/* ---------- загрузка ---------- */
async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`Не удалось загрузить ${url} (${r.status})`);
  return r.json();
}

export async function load() {
  const [ingr, prods, recs] = await Promise.all([fetchJSON('ingredients.json'), fetchJSON('products.json'), fetchJSON('recipes.json')]);
  S.ingredients = ingr.items;
  S.tax = C.buildTaxonomy(ingr.items);
  S.products = prods.items.map(p => ({ ...p, source: p.source || 'generic' }));
  S.productsMeta = { version: prods.version, updated: prods.updated, note: prods.note, count: prods.items.length };
  S.recipes = recs.items;
  S.recipeCategories = recs.categories;
  const saved = await kv.getMany([...PERSIST_KEYS, 'meta']);
  S.storageMode = kv.mode;
  S.inventory = Array.isArray(saved.inventory) ? saved.inventory.map(it => ({ ...normalizeItem(it), updatedAt: it.updatedAt || Date.now() })) : [];
  S.categories = Array.isArray(saved.categories) && saved.categories.length ? saved.categories : DEFAULT_CATEGORIES.map(c => ({ ...c }));
  if (!S.categories.find(c => c.id === 'other')) S.categories.push({ id: 'other', name: 'Прочее', order: 999 });
  S.shopping = Array.isArray(saved.shopping) ? saved.shopping : [];
  S.customRecipes = Array.isArray(saved.customRecipes) ? saved.customRecipes : [];
  S.userProducts = Array.isArray(saved.userProducts) ? saved.userProducts : [];
  S.history = Array.isArray(saved.history) ? saved.history : [];
  S.dismissed = saved.dismissed && typeof saved.dismissed === 'object' ? saved.dismissed : {};
  S.cooked = saved.cooked && typeof saved.cooked === 'object' ? saved.cooked : {};
  S.settings = {
    staples: ingr.staplesDefault || ['вода', 'соль', 'чёрный перец'],
    hideBought: false,
    shoppingSort: 'category',
    productSort: 'category',
    lastBackup: null,
    ...(saved.settings || {}),
  };
  if (!saved.meta) await kv.set('meta', { created: Date.now(), dataVersion: DATA_VERSION });
  kv.persist();
  syncShopping(true);
  S.ready = true;
}

export async function reloadProducts() {
  const prods = await fetchJSON('products.json', { cache: 'reload' });
  S.products = prods.items.map(p => ({ ...p, source: p.source || 'generic' }));
  S.productsMeta = { version: prods.version, updated: prods.updated, note: prods.note, count: prods.items.length };
  commit([], { products: true });
  invalidate({ products: true });
  return S.productsMeta;
}

/* ---------- категории ---------- */
export function sortedCategories() { return [...S.categories].sort((a, b) => a.order - b.order); }
export function categoryName(id) { return (S.categories.find(c => c.id === id) || S.categories.find(c => c.id === 'other') || { name: 'Прочее' }).name; }
export function validCategory(id) { return S.categories.some(c => c.id === id) ? id : 'other'; }
export function addCategory(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const ex = S.categories.find(c => c.name.toLowerCase() === n.toLowerCase());
  if (ex) return ex;
  const c = { id: C.uid('c'), name: n, order: Math.max(0, ...S.categories.filter(x => x.id !== 'other').map(x => x.order)) + 1 };
  S.categories.push(c);
  const other = S.categories.find(x => x.id === 'other'); if (other) other.order = Math.max(other.order, c.order + 1);
  commit(['categories']);
  return c;
}
export function renameCategory(id, name) {
  const c = S.categories.find(x => x.id === id); const n = String(name || '').trim();
  if (!c || !n) return false;
  c.name = n; commit(['categories']); return true;
}
export function deleteCategory(id) {
  if (id === 'other') return false;
  S.categories = S.categories.filter(c => c.id !== id);
  let moved = 0;
  for (const it of S.inventory) if (it.category === id) { it.category = 'other'; moved++; }
  for (const e of S.shopping) if (e.category === id) e.category = 'other';
  commit(['categories', 'inventory', 'shopping']);
  return moved;
}
export function moveCategory(id, dir) {
  const list = sortedCategories(); const i = list.findIndex(c => c.id === id); const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i].order, list[j].order] = [list[j].order, list[i].order];
  commit(['categories']);
}

/* ---------- автоматическое определение ---------- */
export function detectKey(name, brand) { return S.tax.match(name) || (brand ? S.tax.match(`${brand} ${name}`) : null); }
export function categoryForKey(key) {
  const info = key ? S.tax.info(key) : null;
  return info ? validCategory(info.category) : 'other';
}
export function defaultUnitForKey(key) { const i = key ? S.tax.info(key) : null; return i?.unit || 'шт'; }

/* ---------- запасы ---------- */
export function defaultMin(item) {
  const per = +item.perPack || 1;
  if (C.isLoose(item)) return 0;
  if (per > 1) return Math.max(1, Math.round(per * 0.3));
  return 0;
}

export function normalizeItem(raw) {
  const unit = raw.unit || 'шт';
  const it = {
    id: raw.id || C.uid('i'),
    name: String(raw.name || '').trim() || 'Без названия',
    brand: raw.brand ? String(raw.brand).trim() : '',
    category: validCategory(raw.category || categoryForKey(raw.key)),
    key: raw.key || null,
    unit,
    perPack: Math.max(1, Math.round(+raw.perPack || 1)),
    size: raw.size > 0 ? +raw.size : null,
    measure: raw.size > 0 ? (raw.measure || null) : null,
    packName: raw.packName || 'упаковка',
    qty: Math.max(0, Math.round((+raw.qty || 0) * 100) / 100),
    min: Math.max(0, +raw.min || 0),
    target: raw.target > 0 ? +raw.target : null,
    productId: raw.productId || null,
    barcode: raw.barcode || null,
    createdAt: raw.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  if (unit === 'г' || unit === 'мл') {
    it.size = null; it.measure = null;
    const pw = it.key ? (S.tax?.info(it.key)?.pieceWeight || 0) : 0;
    it.step = raw.step > 0 ? +raw.step : (pw >= 20 && pw <= 300 ? Math.round(pw / 10) * 10 : 100);
  }
  if (unit === 'шт' && !it.measure) { it.size = 1; it.measure = 'шт'; }
  return it;
}

export function itemFromProduct(p) {
  const loose = p.loose || p.unit === 'г' || p.unit === 'мл';
  return {
    name: p.name, brand: p.brand || '', category: validCategory(p.category || categoryForKey(p.key)), key: p.key || detectKey(p.name, p.brand),
    unit: loose ? (p.unit === 'мл' ? 'мл' : 'г') : (p.unit || 'шт'), perPack: loose ? 1 : (p.perPack || 1),
    size: p.size || null, measure: p.measure || null, productId: p.id, barcode: p.barcode || null,
  };
}

function sameThing(a, b) {
  if (a.productId && b.productId) return a.productId === b.productId;
  return C.norm(a.name) === C.norm(b.name) && C.norm(a.brand || '') === C.norm(b.brand || '') && a.unit === b.unit && (a.size || 0) === (b.size || 0);
}
export function findDuplicate(fields) { return S.inventory.find(it => sameThing(it, fields)) || null; }

export function addItem(fields, qtyUnits, opts = {}) {
  const dup = opts.noMerge ? null : findDuplicate(fields);
  if (dup) {
    dup.qty = Math.round((dup.qty + Math.max(0, qtyUnits)) * 100) / 100;
    dup.updatedAt = Date.now();
    if (opts.batch) return { item: dup, merged: true };
    syncShopping();
    commit(['inventory', 'shopping'], { added: dup.id });
    return { item: dup, merged: true };
  }
  const it = normalizeItem({ ...fields, qty: qtyUnits });
  if (fields.min == null) it.min = defaultMin(it);
  S.inventory.push(it);
  if (opts.batch) return { item: it, merged: false };
  syncShopping();
  commit(['inventory', 'shopping'], { added: it.id });
  return { item: it, merged: false };
}

export function updateItem(id, fields) {
  const i = S.inventory.findIndex(x => x.id === id);
  if (i < 0) return null;
  const merged = normalizeItem({ ...S.inventory[i], ...fields, id, createdAt: S.inventory[i].createdAt });
  S.inventory[i] = merged;
  delete S.dismissed[id];
  syncShopping();
  commit(['inventory', 'shopping', 'dismissed'], { updated: id });
  return merged;
}

export function getItem(id) { return S.inventory.find(x => x.id === id) || null; }

function logUse(item, units, kind) {
  if (units <= 0) return;
  S.history.push({ t: Date.now(), itemId: item.id, key: item.key, units: Math.round(units * 100) / 100, kind });
  if (S.history.length > 3000) S.history.splice(0, S.history.length - 3000);
}

// Изменение количества: delta во внутренних единицах. Никогда не уходит ниже нуля.
export function changeQty(id, delta, kind = null) {
  const it = getItem(id);
  if (!it) return { ok: false };
  const before = it.qty;
  const next = Math.max(0, Math.round((before + delta) * 100) / 100);
  it.qty = next; it.updatedAt = Date.now();
  const used = before - next;
  if (kind && used > 0) logUse(it, used, kind);
  syncShopping();
  commit(['inventory', 'shopping', 'history'], { qty: id });
  return { ok: true, item: it, applied: next - before, clamped: before + delta < 0 };
}
export function setQty(id, qty) {
  const it = getItem(id); if (!it) return;
  return changeQty(id, Math.max(0, +qty || 0) - it.qty);
}

export function removeItem(id) {
  const i = S.inventory.findIndex(x => x.id === id);
  if (i < 0) return null;
  const [it] = S.inventory.splice(i, 1);
  S.shopping = S.shopping.filter(e => !(e.itemId === id && e.auto && !e.bought));
  for (const e of S.shopping) if (e.itemId === id) e.itemId = null;
  delete S.dismissed[id];
  commit(['inventory', 'shopping', 'dismissed']);
  return it;
}

/* ---------- снимки для «Отменить» ---------- */
export function snapshot() {
  return JSON.parse(JSON.stringify({ inventory: S.inventory, shopping: S.shopping, history: S.history, dismissed: S.dismissed, cooked: S.cooked }));
}
export function restore(snap) {
  Object.assign(S, JSON.parse(JSON.stringify(snap)));
  commit(['inventory', 'shopping', 'history', 'dismissed', 'cooked']);
}

/* ---------- сводка ---------- */
export function stats() {
  let low = 0, out = 0;
  for (const it of S.inventory) { const s = C.status(it); if (s === 'low') low++; else if (s === 'out') out++; }
  const cats = new Set(S.inventory.map(i => i.category));
  const toBuy = S.shopping.filter(e => !e.bought).length;
  return { total: S.inventory.length, categories: cats.size, low, out, attention: low + out, toBuy };
}

/* ---------- прогноз расхода ---------- */
export function forecast(days = 7) {
  const now = Date.now();
  const res = [];
  for (const it of S.inventory) {
    if (C.status(it) !== 'ok') continue;
    const rate = C.consumptionRate(S.history, it.id, now);
    if (rate <= 0) continue;
    const left = (it.qty - (it.min || 0)) / rate;
    if (left <= days) res.push({ item: it, rate, daysLeft: Math.max(0, left) });
  }
  return res.sort((a, b) => a.daysLeft - b.daysLeft);
}

/* ---------- список покупок ---------- */
function entryUnits(e) { return (+e.qty || 0) * (e.qtyMode === 'pack' ? Math.max(1, +e.perPack || 1) : 1); }
export { entryUnits };

function entryFromItem(it, auto = true) {
  const rec = C.recommend(it);
  return {
    id: C.uid('s'), itemId: it.id, name: it.name, brand: it.brand, category: it.category, key: it.key, productId: it.productId,
    unit: it.unit, perPack: it.perPack, size: it.size, measure: it.measure,
    qtyMode: rec.mode, qty: rec.mode === 'pack' ? rec.packs : rec.units,
    auto, edited: false, bought: false, addedAt: Date.now(),
  };
}

export function syncShopping(silent = false) {
  let changed = false;
  const ids = new Set(S.inventory.map(i => i.id));
  for (const it of S.inventory) {
    const st = C.status(it);
    const open = S.shopping.find(e => e.itemId === it.id && !e.bought);
    if (st !== 'ok') {
      if (S.dismissed[it.id] !== undefined && Math.abs(S.dismissed[it.id] - it.qty) < C.EPS) continue;
      if (S.dismissed[it.id] !== undefined) delete S.dismissed[it.id];
      if (!open) { S.shopping.push(entryFromItem(it)); changed = true; }
      else if (open.auto && !open.edited) {
        const fresh = entryFromItem(it);
        if (open.qty !== fresh.qty || open.qtyMode !== fresh.qtyMode || open.name !== it.name) {
          Object.assign(open, { qty: fresh.qty, qtyMode: fresh.qtyMode, name: it.name, brand: it.brand, category: it.category, unit: it.unit, perPack: it.perPack, size: it.size, measure: it.measure });
          changed = true;
        }
      }
    } else {
      if (open && open.auto && !open.edited) { S.shopping = S.shopping.filter(e => e !== open); changed = true; }
      if (S.dismissed[it.id] !== undefined) { delete S.dismissed[it.id]; changed = true; }
    }
  }
  const before = S.shopping.length;
  S.shopping = S.shopping.filter(e => e.bought || !e.auto || (e.itemId && ids.has(e.itemId)));
  if (S.shopping.length !== before) changed = true;
  if (changed && !silent) pending.add('shopping');
  return changed;
}

export function refreshShopping() {
  S.dismissed = {};
  for (const e of S.shopping) if (e.auto && !e.bought) e.edited = false;
  syncShopping();
  commit(['shopping', 'dismissed']);
}

export function entryReason(e) {
  const it = e.itemId ? getItem(e.itemId) : null;
  if (!it) return e.auto ? '' : 'Добавлено вручную';
  const st = C.status(it);
  const left = C.fmtUnits(it, it.qty);
  if (st === 'out') return `Закончилось${it.min ? `, минимум ${C.fmtUnits(it, it.min)}` : ''}`;
  if (st === 'low') return `Осталось ${left}, минимум ${C.fmtUnits(it, it.min)}`;
  return `Осталось ${left}`;
}

function sameEntry(a, b) {
  if (a.itemId && b.itemId) return a.itemId === b.itemId;
  if (a.productId && b.productId) return a.productId === b.productId;
  return C.norm(a.name) === C.norm(b.name) && C.norm(a.brand || '') === C.norm(b.brand || '');
}

export function addShoppingEntry(fields) {
  const e = {
    id: C.uid('s'), itemId: fields.itemId || null, name: String(fields.name || '').trim(), brand: fields.brand || '',
    category: validCategory(fields.category || categoryForKey(fields.key)), key: fields.key || detectKey(fields.name || ''),
    productId: fields.productId || null, unit: fields.unit || 'шт', perPack: Math.max(1, +fields.perPack || 1),
    size: fields.size || null, measure: fields.measure || null,
    qtyMode: fields.qtyMode || ((+fields.perPack || 1) > 1 ? 'pack' : 'unit'), qty: Math.max(0.01, +fields.qty || 1),
    auto: false, edited: true, bought: false, addedAt: Date.now(), note: fields.note || '',
  };
  if (!e.name) return null;
  if (!e.itemId) { const inv = S.inventory.find(it => sameThing(it, e) || (e.productId && it.productId === e.productId)); if (inv) e.itemId = inv.id; }
  const ex = S.shopping.find(x => !x.bought && sameEntry(x, e));
  if (ex) {
    const add = entryUnits(e);
    ex.qty = ex.qtyMode === 'pack' ? Math.round((ex.qty + add / Math.max(1, ex.perPack)) * 100) / 100 : Math.round((ex.qty + add) * 100) / 100;
    ex.edited = true;
    commit(['shopping']);
    return { entry: ex, merged: true };
  }
  S.shopping.push(e);
  commit(['shopping'], { addedEntry: e.id });
  return { entry: e, merged: false };
}

export function updateEntry(id, fields) {
  const e = S.shopping.find(x => x.id === id); if (!e) return;
  Object.assign(e, fields, { edited: true });
  if (e.qty < 0.01) e.qty = 0.01;
  commit(['shopping']);
}

export function removeEntry(id) {
  const e = S.shopping.find(x => x.id === id); if (!e) return null;
  S.shopping = S.shopping.filter(x => x.id !== id);
  if (e.auto && e.itemId && !e.bought) { const it = getItem(e.itemId); if (it) S.dismissed[it.id] = it.qty; }
  commit(['shopping', 'dismissed']);
  return e;
}

// «Куплено» — сразу добавляет покупку в запасы без дублей; повторное нажатие отменяет.
export function toggleBought(id) {
  const e = S.shopping.find(x => x.id === id); if (!e) return null;
  if (!e.bought) {
    const units = entryUnits(e);
    let it = e.itemId ? getItem(e.itemId) : null;
    if (!it) it = S.inventory.find(x => (e.productId && x.productId === e.productId) || sameThing(x, e)) || null;
    if (!it && e.key) it = S.inventory.find(x => x.key === e.key && C.norm(x.name) === C.norm(e.name)) || null;
    let created = false;
    if (it) { it.qty = Math.round((it.qty + units) * 100) / 100; it.updatedAt = Date.now(); }
    else {
      it = normalizeItem({ name: e.name, brand: e.brand, category: e.category, key: e.key, unit: e.unit, perPack: e.perPack, size: e.size, measure: e.measure, productId: e.productId, qty: units });
      it.min = defaultMin(it);
      S.inventory.push(it); created = true;
    }
    Object.assign(e, { bought: true, boughtAt: Date.now(), boughtUnits: units, boughtItemId: it.id, createdItem: created, itemId: it.id });
  } else {
    const it = getItem(e.boughtItemId);
    if (it) {
      it.qty = Math.max(0, Math.round((it.qty - (e.boughtUnits || 0)) * 100) / 100);
      if (e.createdItem && it.qty <= C.EPS) S.inventory = S.inventory.filter(x => x.id !== it.id);
    }
    Object.assign(e, { bought: false, boughtAt: null, boughtUnits: 0, createdItem: false });
    if (e.itemId && !getItem(e.itemId)) e.itemId = null;
  }
  syncShopping();
  commit(['inventory', 'shopping'], { bought: id });
  return e;
}

export function clearBought() {
  const n = S.shopping.filter(e => e.bought).length;
  S.shopping = S.shopping.filter(e => !e.bought);
  commit(['shopping']);
  return n;
}

export function mergeShoppingDuplicates() {
  const open = S.shopping.filter(e => !e.bought);
  const keep = [];
  let merged = 0;
  for (const e of open) {
    const ex = keep.find(k => sameEntry(k, e) || (e.key && k.key === e.key && C.norm(k.name) === C.norm(e.name)));
    if (ex) {
      const units = entryUnits(ex) + entryUnits(e);
      ex.qty = ex.qtyMode === 'pack' ? Math.round(units / Math.max(1, ex.perPack) * 100) / 100 : units;
      ex.edited = true; ex.auto = ex.auto && e.auto;
      merged++;
    } else keep.push(e);
  }
  S.shopping = [...keep, ...S.shopping.filter(e => e.bought)];
  commit(['shopping']);
  return merged;
}

/* ---------- рецепты ---------- */
export function allRecipes() { return [...S.customRecipes, ...S.recipes]; }
export function getRecipe(id) { return allRecipes().find(r => r.id === id) || null; }

export function ctx() {
  if (!stockCache) stockCache = C.buildStockIndex(S.inventory, S.tax);
  return { tax: S.tax, stock: stockCache, staples: new Set(S.settings.staples || []) };
}
export function evaluateAll() {
  if (evalCache) return evalCache;
  const c = ctx();
  evalCache = new Map();
  for (const r of allRecipes()) evalCache.set(r.id, C.evaluateRecipe(r, c));
  return evalCache;
}
export function evaluate(recipe, mult = 1) { return C.evaluateRecipe(recipe, ctx(), mult); }
export function planCooking(recipe, mult = 1) { return C.cookPlan(recipe, ctx(), mult); }

export function applyCooking(recipe, rows) {
  let n = 0;
  for (const r of rows) {
    if (!r.include || !r.item || !(r.units > 0)) continue;
    const it = getItem(r.item.id); if (!it) continue;
    const before = it.qty;
    it.qty = Math.max(0, Math.round((it.qty - r.units) * 100) / 100);
    it.updatedAt = Date.now();
    logUse(it, before - it.qty, 'cook');
    n++;
  }
  const c = S.cooked[recipe.id] || { count: 0 };
  S.cooked[recipe.id] = { count: c.count + 1, last: Date.now() };
  syncShopping();
  commit(['inventory', 'shopping', 'history', 'cooked'], { cooked: recipe.id });
  return n;
}

export function saveCustomRecipe(r) {
  const rec = { ...r, custom: true, id: r.id || C.uid('u'), updatedAt: Date.now() };
  const i = S.customRecipes.findIndex(x => x.id === rec.id);
  if (i >= 0) S.customRecipes[i] = rec; else S.customRecipes.unshift(rec);
  commit(['customRecipes']);
  return rec;
}
export function deleteCustomRecipe(id) {
  S.customRecipes = S.customRecipes.filter(r => r.id !== id);
  commit(['customRecipes']);
}

// Недостающее из рецепта — в список покупок
export function addRecipeNeedToShopping(row, mult = 1) {
  const ing = row.ing;
  const key = row.keys[0] || null;
  const inv = row.items[0] || null;
  if (inv) {
    // есть, но мало — докупаем к имеющемуся продукту
    const need = row.shortBy;
    let units = 1;
    if (need) {
      const info = S.tax.info(inv.key) || {};
      const nb = C.recipeNeed(need.amount, need.unit, { density: info.density || 1, pieceWeight: info.pieceWeight || 0 });
      const u = nb ? C.unitsFor(inv, nb.amount, nb.m, { density: info.density || 1, pieceWeight: info.pieceWeight || 0 }) : null;
      units = u ? u : 1;
    }
    const per = inv.perPack > 1 ? inv.perPack : 1;
    return addShoppingEntry({
      itemId: inv.id, name: inv.name, brand: inv.brand, category: inv.category, key: inv.key, productId: inv.productId,
      unit: inv.unit, perPack: inv.perPack, size: inv.size, measure: inv.measure,
      qtyMode: per > 1 ? 'pack' : 'unit', qty: per > 1 ? Math.max(1, Math.ceil(units / per - C.EPS)) : (C.isLoose(inv) ? Math.max(100, Math.ceil(units / 100) * 100) : Math.max(1, Math.ceil(units - C.EPS))),
    });
  }
  // нет совсем — добавляем как продукт по ингредиенту
  const name = key ? key.charAt(0).toUpperCase() + key.slice(1) : ing.name;
  let qty = 1, unit = defaultUnitForKey(key), qtyMode = 'unit';
  if (ing.qty != null && ing.unit) {
    const info = S.tax.info(key) || {};
    const need = C.recipeNeed(ing.qty * mult, ing.unit, { density: info.density || 1, pieceWeight: info.pieceWeight || 0 });
    if (need && unit === 'г' && need.m === 'g') qty = Math.max(100, Math.ceil(need.amount / 50) * 50);
    else if (need && unit === 'мл' && need.m === 'ml') qty = Math.max(100, Math.ceil(need.amount / 50) * 50);
    else if (need && unit === 'шт' && need.m === 'pc') qty = Math.max(1, Math.ceil(need.amount));
    else if (unit === 'г' || unit === 'мл') qty = 500;
  } else if (unit === 'г' || unit === 'мл') qty = 500;
  return addShoppingEntry({ name, key, category: categoryForKey(key), unit, qty, qtyMode, perPack: 1 });
}

/* ---------- база продуктов ---------- */
export function allProducts() { return [...S.userProducts, ...S.products]; }
export function searchIndex() {
  if (!searchCache) searchCache = C.buildSearchIndex(allProducts(), S.tax);
  return searchCache;
}
export function saveUserProduct(p) {
  const rec = {
    id: p.id || C.uid('u'), name: String(p.name || '').trim(), brand: (p.brand || '').trim() || undefined,
    category: validCategory(p.category || categoryForKey(p.key)), key: p.key || detectKey(p.name, p.brand),
    unit: p.unit || 'шт', perPack: Math.max(1, +p.perPack || 1), size: p.size > 0 ? +p.size : undefined, measure: p.size > 0 ? p.measure : undefined,
    stores: p.stores && p.stores.length ? p.stores : undefined, barcode: p.barcode || undefined, image: p.image || undefined,
    source: p.source || 'user',
  };
  if (rec.unit === 'г' || rec.unit === 'мл') rec.loose = true;
  if (!rec.name) return null;
  const i = S.userProducts.findIndex(x => x.id === rec.id || (rec.barcode && x.barcode === rec.barcode));
  if (i >= 0) S.userProducts[i] = { ...S.userProducts[i], ...rec, id: S.userProducts[i].id }; else S.userProducts.unshift(rec);
  commit(['userProducts']);
  return i >= 0 ? S.userProducts[i] : rec;
}
export function deleteUserProduct(id) { S.userProducts = S.userProducts.filter(p => p.id !== id); commit(['userProducts']); }

// Импорт CSV/JSON в пользовательскую базу
export function importProducts(rows, source = 'import') {
  let added = 0, skipped = 0;
  for (const r of rows) {
    const name = r.name || r['название'] || r['наименование'];
    if (!name) { skipped++; continue; }
    const sizeRaw = r.size ?? r['вес'] ?? r['объём'] ?? r['объем'] ?? '';
    let size = parseFloat(String(sizeRaw).replace(',', '.')) || null;
    let measure = r.measure || r['мера'] || null;
    const m = String(sizeRaw).match(/([\d.,]+)\s*(кг|г|л|мл)/i);
    if (m) { size = parseFloat(m[1].replace(',', '.')); measure = m[2].toLowerCase(); if (measure === 'кг') { size *= 1000; measure = 'г'; } if (measure === 'л') { size *= 1000; measure = 'мл'; } }
    const catName = r.category || r['категория'];
    let category = null;
    if (catName) { const c = S.categories.find(x => x.id === catName || x.name.toLowerCase() === String(catName).toLowerCase()); category = c ? c.id : addCategory(catName)?.id; }
    const storesRaw = r.stores || r.store || r['магазин'] || '';
    saveUserProduct({
      name, brand: r.brand || r['бренд'] || '', category, key: r.key || r['ингредиент'] || null,
      unit: r.unit || r['единица'] || (measure && !r.perPack ? 'упаковка' : 'шт'), perPack: r.perPack || r['в упаковке'] || 1,
      size, measure, stores: Array.isArray(storesRaw) ? storesRaw : String(storesRaw).split(/[,;|]/).map(s => s.trim()).filter(Boolean),
      barcode: r.barcode || r['штрихкод'] || undefined, image: r.image || r['изображение'] || undefined, source,
    });
    added++;
  }
  return { added, skipped };
}

export function parseCSV(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(c => c.trim()));
  if (!clean.length) return [];
  const head = clean[0].map(h => h.trim().toLowerCase());
  return clean.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}

/* ---------- настройки ---------- */
export function setSetting(k, v) { S.settings[k] = v; commit(['settings']); }

/* ---------- резервная копия ---------- */
export function exportData() {
  S.settings.lastBackup = Date.now(); commit(['settings']);
  return {
    app: 'kladovaya', dataVersion: DATA_VERSION, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
    data: Object.fromEntries(PERSIST_KEYS.map(k => [k, S[k]])),
  };
}
export async function importData(obj, mode = 'replace') {
  if (!obj || obj.app !== 'kladovaya' || !obj.data) throw new Error('Это не резервная копия «Кладовой».');
  const d = obj.data;
  if (mode === 'replace') {
    for (const k of PERSIST_KEYS) if (d[k] !== undefined) S[k] = d[k];
  } else {
    const mergeList = (key, idField = 'id') => { const have = new Set(S[key].map(x => x[idField])); for (const x of d[key] || []) if (!have.has(x[idField])) S[key].push(x); };
    mergeList('inventory'); mergeList('shopping'); mergeList('customRecipes'); mergeList('userProducts'); mergeList('categories');
    S.history = [...S.history, ...(d.history || [])].sort((a, b) => a.t - b.t).slice(-3000);
    S.settings = { ...d.settings, ...S.settings };
  }
  if (!S.categories.find(c => c.id === 'other')) S.categories.push({ id: 'other', name: 'Прочее', order: 999 });
  S.inventory = S.inventory.map(it => normalizeItem({ ...it, updatedAt: it.updatedAt }));
  syncShopping(true);
  commit(PERSIST_KEYS);
  await flush();
}
export async function resetAll() {
  await kv.clear();
  S.inventory = []; S.shopping = []; S.customRecipes = []; S.userProducts = []; S.history = []; S.dismissed = {}; S.cooked = {};
  S.categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
  S.settings = { staples: ['вода', 'соль', 'чёрный перец'], hideBought: false, shoppingSort: 'category', productSort: 'category', lastBackup: null };
  commit(PERSIST_KEYS);
  await flush();
}

/* ---------- пример для первого запуска ---------- */
export function loadSample() {
  const pick = (name, brand, qtyPacks, min) => {
    const p = S.products.find(x => x.name === name && (brand ? x.brand === brand : !x.brand));
    if (!p) return;
    const f = itemFromProduct(p);
    const per = f.perPack || 1;
    const qty = f.unit === 'г' || f.unit === 'мл' ? qtyPacks : qtyPacks * per;
    addItem({ ...f, min: min ?? undefined }, qty, { batch: true });
  };
  pick('Гречка ядрица', 'Увелка', 3, 3);
  pick('Молоко 3,2%', 'Простоквашино', 1, 1);
  pick('Яйцо куриное С1', '', 0.3, 5);
  pick('Масло сливочное 82,5%', 'Домик в деревне', 1, 0);
  pick('Сыр Российский 50%', '', 1, 0);
  pick('Макароны из твёрдых сортов', '', 1, 0);
  pick('Картофель', '', 2000, 500);
  pick('Морковь', '', 600, 200);
  pick('Лук репчатый', '', 500, 200);
  pick('Филе куриное охлаждённое', '', 900, 0);
  pick('Сметана 20%', 'Простоквашино', 1, 0);
  pick('Помидоры', '', 600, 0);
  pick('Coca-Cola', 'Coca-Cola', 1, 2);
  pick('Мука пшеничная высший сорт', 'Makfa', 1, 0);
  pick('Сахар-песок', 'Русский сахар', 1, 0);
  pick('Масло подсолнечное рафинированное', '', 1, 0);
  pick('Чеснок', '', 150, 0);
  syncShopping();
  commit(['inventory', 'shopping'], { sample: true });
}
