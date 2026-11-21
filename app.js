// app.js — запуск приложения, маршрутизация по разделам, счётчики в навигации, офлайн-режим.
import * as C from './core.js';
import * as St from './state.js';
import * as U from './ui.js';
import { ProductsView } from './view-products.js';
import { ShoppingView } from './view-shopping.js';
import { RecipesView, RecipeView } from './view-recipes.js';
import { BaseView } from './view-base.js';
import { SettingsView } from './view-settings.js';

const ROUTES = { products: ProductsView, shopping: ShoppingView, recipes: RecipesView, recipe: RecipeView, base: BaseView, settings: SettingsView };
const NAV_OF = { recipe: 'recipes' };
let current = null;
let currentName = '';
let lastHash = '';

function parseHash() {
  const h = location.hash || '#/products';
  const parts = h.replace(/^#\/?/, '').split('/').filter(Boolean);
  const name = ROUTES[parts[0]] ? parts[0] : 'products';
  return { name, params: parts.slice(1).map(decodeURIComponent) };
}

function route() {
  const { name, params } = parseHash();
  sessionStorage.setItem('k-prevRoute', lastHash);
  lastHash = location.hash || '#/products';
  const main = document.getElementById('main');
  current = ROUTES[name];
  currentName = name;
  if (name !== 'recipe') document.title = `${current.title} — Кладовая`;
  // Каждый раздел получает новый контейнер — обработчики событий не накапливаются
  const host = document.createElement('div');
  host.className = 'view-host';
  main.replaceChildren(host);
  current.mount(host, params);
  const navName = NAV_OF[name] || name;
  document.querySelectorAll('[data-nav]').forEach(a => {
    const on = a.dataset.nav === navName;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (name !== 'recipe') window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

let countsTimer = null;
function updateCounts() {
  clearTimeout(countsTimer);
  countsTimer = setTimeout(() => {
    const s = St.stats();
    document.querySelectorAll('[data-count="products"]').forEach(el => { el.textContent = s.total || ''; });
    document.querySelectorAll('[data-count="shopping"]').forEach(el => { el.textContent = s.toBuy || ''; });
    const idle = window.requestIdleCallback || (fn => setTimeout(fn, 60));
    idle(() => {
      if (!St.S.inventory.length) { document.querySelectorAll('[data-count="recipes"]').forEach(el => { el.textContent = ''; }); return; }
      const evs = St.evaluateAll();
      let n = 0; for (const ev of evs.values()) if (ev.missing === 0) n++;
      document.querySelectorAll('[data-count="recipes"]').forEach(el => { el.textContent = n || ''; el.title = 'Можно приготовить сейчас'; });
    });
    const note = document.getElementById('side-note');
    if (note) {
      const lb = St.S.settings.lastBackup;
      const days = lb ? Math.floor((Date.now() - lb) / 864e5) : null;
      note.textContent = !St.S.inventory.length ? 'Данные хранятся в этом браузере.' : lb == null ? 'Резервной копии ещё нет — сделайте её в настройках.' : days >= 14 ? `Последняя копия ${days} дн. назад — пора обновить.` : `Последняя копия: ${U.fmtDate(lb)}.`;
    }
  }, 30);
}

function bindChrome() {
  window.addEventListener('hashchange', route);
  document.addEventListener('click', e => {
    if (e.target.closest('[data-act="global-add"]')) { e.preventDefault(); U.openAddSheet(); }
  });
  const topbar = document.querySelector('.topbar');
  window.addEventListener('scroll', () => { topbar.classList.toggle('scrolled', window.scrollY > 4); }, { passive: true });
  St.onChange(detail => {
    if (current && current.update) current.update(detail);
    updateCounts();
  });
  // Горячая клавиша: «/» — к строке быстрого ввода или поиску на текущей странице
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.target.closest('input, textarea, select')) return;
    const el = document.querySelector('#main [data-quick], #main [data-q], #main [data-search]');
    if (el) { e.preventDefault(); el.focus(); }
  });
}

function showBootError(err) {
  const boot = document.getElementById('boot');
  const html = `<div class="boot-error"><h2>Не удалось загрузить данные</h2><p>${U.esc(err.message || String(err))}</p><p>Проверьте, что все файлы проекта (в том числе <code>products.json</code>, <code>recipes.json</code> и <code>ingredients.json</code>) лежат в одной папке рядом с <code>index.html</code>, и обновите страницу.</p><p><button class="btn btn-primary" onclick="location.reload()">Обновить страницу</button></p></div>`;
  if (boot) boot.innerHTML = html; else document.getElementById('main').innerHTML = html;
}

window.addEventListener('error', e => { console.error(e.error || e.message); });
window.addEventListener('unhandledrejection', e => { console.error(e.reason); });

async function start() {
  if (location.protocol === 'file:') return;
  try {
    await St.load();
  } catch (err) {
    console.error(err);
    showBootError(err);
    return;
  }
  document.getElementById('app').removeAttribute('aria-busy');
  bindChrome();
  route();
  updateCounts();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('Офлайн-режим недоступен:', err.message));
  }
  window.__kladovaya = { St, C };
}

start();
