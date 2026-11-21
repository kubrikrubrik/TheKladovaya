// view-base.js — база продуктов: поиск с исправлением опечаток, магазины, импорт, свои записи, Open Food Facts.
import * as C from './core.js';
import * as St from './state.js';
import * as U from './ui.js';

const { esc, icon } = U;
const PAGE = 60;
const v = { root: null, q: '', cat: '', store: '', src: '', limit: PAGE, off: null, offBusy: false };

export const BaseView = {
  id: 'base',
  title: 'База продуктов',
  mount(root) {
    v.root = root;
    root.innerHTML = `
    <section class="view">
      <header class="page-head">
        <div><h1 class="page-title">База продуктов</h1><p class="page-sub" data-sub></p></div>
        <div class="head-actions">
          <button class="btn" data-act="import">${icon('upload')}Импорт CSV/JSON</button>
          <button class="btn btn-primary" data-act="new">${icon('plus')}Новый товар</button>
        </div>
      </header>
      <div class="toolbar">
        <label class="search"><span class="sr-only">Поиск по базе</span>${icon('search')}<input class="input" type="search" data-q placeholder="Название или бренд: «кола», «гречка увелка», «makfa»" value="${esc(v.q)}" autocomplete="off"></label>
      </div>
      <div class="toolbar" style="margin-top:0">
        <label class="sr-only" for="bcat">Категория</label>
        <select class="input" id="bcat" data-cat style="width:auto;min-height:38px"><option value="">Все категории</option>${St.sortedCategories().map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
        <label class="sr-only" for="bstore">Магазин</label>
        <select class="input" id="bstore" data-store style="width:auto;min-height:38px"><option value="">Все магазины</option>${St.STORES.map(s => `<option>${esc(s)}</option>`).join('')}</select>
        <label class="sr-only" for="bsrc">Источник</label>
        <select class="input" id="bsrc" data-src style="width:auto;min-height:38px"><option value="">Все записи</option><option value="ref">Справочные</option><option value="mine">Мои записи и импорт</option></select>
      </div>
      <div data-hint></div>
      <ul class="prod-list" data-list></ul>
      <div class="more" data-more></div>
      <section data-online style="margin-top:28px"></section>
      <section class="panel" style="margin-top:28px">
        <h3>Обновление и пополнение базы</h3>
        <p>Справочная база лежит в файле <code>products.json</code> в корне сайта: замените его на GitHub — и после нажатия «Обновить базу» приложение подхватит новую версию. Свои товары можно добавить вручную, импортировать из CSV или JSON или найти в открытой базе Open Food Facts.</p>
        <div class="btns">
          <button class="btn" data-act="reload">${icon('refresh')}Обновить базу</button>
          <button class="btn" data-act="export-mine">${icon('download')}Выгрузить мои записи</button>
          <button class="btn" data-act="template">${icon('download')}Шаблон CSV</button>
        </div>
      </section>
    </section>`;
    root.querySelector('[data-cat]').value = v.cat;
    root.querySelector('[data-store]').value = v.store;
    root.querySelector('[data-src]').value = v.src;
    bind(root);
    this.update({});
  },
  update() {
    if (!v.root) return;
    const m = St.S.productsMeta;
    const counts = St.S.products.reduce((a, p) => (a[p.source] = (a[p.source] || 0) + 1, a), {});
    v.root.querySelector('[data-sub]').textContent = `${m.count} справочных товаров (${counts.generic || 0} типовых, ${(counts.brand || 0) + (counts.store || 0)} брендовых), ваших записей: ${St.S.userProducts.length}. Версия базы от ${m.updated ? new Date(m.updated).toLocaleDateString('ru-RU') : '—'}.`;
    renderList();
    renderOnline();
  },
};

function sourceBadge(p) {
  if (p.source === 'user') return '<span class="src user">Моя запись</span>';
  if (p.source === 'import') return '<span class="src user">Импорт</span>';
  if (p.source === 'off') return '<span class="src off">Open Food Facts</span>';
  if (p.source === 'store') return `<span class="src store">Собственная марка</span>`;
  if (p.source === 'brand') return '<span class="src">Бренд</span>';
  return '<span class="src">Типовой товар</span>';
}

function filteredProducts() {
  let list;
  let corrected = null;
  if (v.q.trim()) {
    const r = C.searchProducts(St.searchIndex(), v.q, 600);
    list = r.results.map(x => x.p); corrected = r.corrected;
  } else {
    const order = new Map(St.sortedCategories().map((c, i) => [c.id, i]));
    list = [...St.S.userProducts, ...St.S.products].sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) || a.name.localeCompare(b.name, 'ru'));
  }
  list = list.filter(p => {
    if (v.cat && p.category !== v.cat) return false;
    if (v.store && !(p.stores || []).includes(v.store)) return false;
    if (v.src === 'ref' && ['user', 'import', 'off'].includes(p.source)) return false;
    if (v.src === 'mine' && !['user', 'import', 'off'].includes(p.source)) return false;
    return true;
  });
  return { list, corrected };
}

function groupProducts(list) {
  const groups = []; const by = new Map();
  for (const p of list) {
    const k = `${C.norm(p.name)}|${C.norm(p.brand || '')}|${p.source}`;
    if (!by.has(k)) { const g = { p, items: [] }; by.set(k, g); groups.push(g); }
    by.get(k).items.push(p);
  }
  return groups;
}

function renderList() {
  const { list, corrected } = filteredProducts();
  const groups = groupProducts(list);
  const hint = v.root.querySelector('[data-hint]');
  const notes = [];
  if (corrected) notes.push(`<div class="notice">Показаны результаты для «${esc(corrected)}».</div>`);
  if (v.store) notes.push(`<div class="notice">Для «${esc(v.store)}» показаны товары собственных марок сети, о которых известно точно. Товары национальных брендов продаются в большинстве сетей, но наличие в конкретном магазине база не гарантирует.</div>`);
  hint.innerHTML = notes.join('');
  const el = v.root.querySelector('[data-list]');
  if (!groups.length) {
    el.innerHTML = `<li><div class="empty"><h3>Ничего не найдено</h3><p>${v.q ? 'Попробуйте другое написание или поищите в открытой базе Open Food Facts ниже. Можно добавить товар вручную.' : 'Под выбранные фильтры товаров нет.'}</p><div class="btns"><button class="btn btn-primary" data-act="new">${icon('plus')}Новый товар</button></div></div></li>`;
    v.root.querySelector('[data-more]').innerHTML = '';
    return;
  }
  el.innerHTML = groups.slice(0, v.limit).map(g => {
    const p = g.p; const t = U.productTitle(p);
    return `<li class="prod">
      <div>
        <div class="prod-name">${esc(t.name)}${t.brand ? ` <span class="muted" style="font-weight:400">${esc(t.brand)}</span>` : ''}</div>
        <div class="prod-meta">${sourceBadge(p)}<span>${esc(St.categoryName(p.category))}</span>${p.key ? `<span>для рецептов: ${esc(p.key)}</span>` : ''}${p.stores?.length ? `<span>${esc(p.stores.join(', '))}</span>` : ''}${p.barcode ? `<span>штрихкод ${esc(p.barcode)}</span>` : ''}</div>
        <div class="sizes">${g.items.map(x => `<button type="button" class="size" data-pid="${esc(x.id)}" title="Действия с товаром">${esc(C.packLabel(x))}</button>`).join('')}</div>
      </div>
      <div class="prod-actions"><button class="btn btn-sm" data-act="add" data-pid="${esc(g.items[0].id)}">${icon('plus')}<span class="hide-sm">В запасы</span></button></div>
    </li>`;
  }).join('');
  v.root.querySelector('[data-more]').innerHTML = groups.length > v.limit ? `<button class="btn" data-act="more">Показать ещё (${groups.length - v.limit})</button>` : '';
}

/* ---------- Open Food Facts ---------- */
function renderOnline() {
  const el = v.root.querySelector('[data-online]');
  const scan = 'BarcodeDetector' in window;
  el.innerHTML = `
    <h2 class="section-title" style="margin-top:0">Открытая база Open Food Facts</h2>
    <p class="muted" style="margin:0 0 10px;max-width:70ch;font-size:14px">Бесплатная общественная база товаров со штрихкодами. Нужен интернет. Найденный товар сохраняется в ваши записи — дальше работает без сети.</p>
    <div class="toolbar">
      <button class="btn" data-act="off-search" ${v.q.trim().length < 2 ? 'disabled' : ''}>${icon('globe')}Искать «${esc(v.q.trim() || '…')}» в Open Food Facts</button>
      <form data-barcode style="display:flex;gap:8px;flex:1 1 260px"><input class="input" name="code" inputmode="numeric" pattern="[0-9]{8,14}" placeholder="Штрихкод, 8–14 цифр" aria-label="Штрихкод"><button class="btn">${icon('barcode')}Найти</button></form>
      ${scan ? `<button class="btn" data-act="scan">${icon('camera')}Сканировать</button>` : ''}
    </div>
    <div data-offres>${v.offBusy ? '<p class="muted">Ищу…</p>' : v.off ? offResultsHTML(v.off) : ''}</div>`;
}
function offResultsHTML(res) {
  if (res.error) return `<div class="notice warn">${esc(res.error)}</div>`;
  if (!res.items.length) return `<p class="muted">В Open Food Facts ничего не найдено.</p>`;
  return `<ul class="prod-list">${res.items.map((p, i) => `<li class="prod"><div><div class="prod-name">${esc(p.name)}${p.brand ? ` <span class="muted" style="font-weight:400">${esc(p.brand)}</span>` : ''}</div>
    <div class="prod-meta"><span class="src off">Open Food Facts</span>${p.quantityText ? `<span>${esc(p.quantityText)}</span>` : ''}${p.barcode ? `<span>штрихкод ${esc(p.barcode)}</span>` : ''}<span>${esc(St.categoryName(p.category))}</span></div></div>
    <div class="prod-actions"><button class="btn btn-sm" data-act="off-save" data-i="${i}">${icon('plus')}В мою базу</button></div></li>`).join('')}</ul>`;
}

function parseQuantity(q) {
  const s = String(q || '').toLowerCase().replace(',', '.');
  let m = s.match(/(\d+)\s*[x×х*]\s*(\d+(?:\.\d+)?)\s*(kg|кг|g|г|гр|l|л|ml|мл|cl)/);
  if (m) { let size = +m[2]; let u = m[3]; if (/^(kg|кг)$/.test(u)) { size *= 1000; u = 'г'; } else if (/^(l|л)$/.test(u)) { size *= 1000; u = 'мл'; } else if (u === 'cl') { size *= 10; u = 'мл'; } else u = /^(g|г|гр)$/.test(u) ? 'г' : 'мл'; return { perPack: +m[1], size, measure: u }; }
  m = s.match(/(\d+(?:\.\d+)?)\s*(kg|кг|g|г|гр|l|л|ml|мл|cl)/);
  if (m) { let size = +m[1]; let u = m[2]; if (/^(kg|кг)$/.test(u)) { size *= 1000; u = 'г'; } else if (/^(l|л)$/.test(u)) { size *= 1000; u = 'мл'; } else if (u === 'cl') { size *= 10; u = 'мл'; } else u = /^(g|г|гр)$/.test(u) ? 'г' : 'мл'; return { perPack: 1, size, measure: u }; }
  m = s.match(/(\d+)\s*(шт|pcs|pieces|eggs)/);
  if (m) return { perPack: +m[1], size: 1, measure: 'шт', unit: 'шт' };
  return null;
}
function mapOff(p) {
  const name = (p.product_name_ru || p.product_name || '').trim();
  if (!name) return null;
  const brand = (p.brands || '').split(',')[0].trim();
  const q = parseQuantity(p.quantity);
  const key = St.detectKey(name, brand);
  const unit = q?.unit || (q && q.perPack > 1 ? 'шт' : (St.categoryForKey(key) === 'soda' || St.categoryForKey(key) === 'juice' ? 'бутылка' : 'упаковка'));
  return { name, brand, key, category: St.categoryForKey(key), unit, perPack: q?.perPack || 1, size: q?.size || null, measure: q?.measure || null, barcode: p.code || p._id || null, quantityText: p.quantity || '', source: 'off', image: p.image_small_url || undefined };
}
async function offFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Сервис ответил с ошибкой ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function offSearch(q) {
  v.offBusy = true; renderOnline();
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=code,product_name,product_name_ru,brands,quantity,image_small_url&tagtype_0=countries&tag_contains_0=contains&tag_0=russia`;
    const data = await offFetch(url);
    v.off = { items: (data.products || []).map(mapOff).filter(Boolean) };
  } catch (e) {
    v.off = { error: navigator.onLine === false ? 'Нет подключения к интернету. Поиск в Open Food Facts работает только онлайн.' : `Не удалось получить ответ от Open Food Facts (${e.name === 'AbortError' ? 'превышено время ожидания' : e.message}). Попробуйте позже.` };
  }
  v.offBusy = false; renderOnline();
}
async function offBarcode(code) {
  const local = St.allProducts().find(p => p.barcode === code);
  if (local) { U.toast('Товар с этим штрихкодом уже есть в базе'); U.confirmProductSheet(local); return; }
  v.offBusy = true; renderOnline();
  try {
    const data = await offFetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_ru,brands,quantity,image_small_url`);
    const p = data && data.status === 1 ? mapOff(data.product) : null;
    v.off = p ? { items: [p] } : { error: `Штрихкод ${code} не найден в Open Food Facts. Добавьте товар вручную — штрихкод сохранится.` };
    if (!p) { v.offBusy = false; renderOnline(); productEditor({ barcode: code }); return; }
  } catch (e) {
    v.off = { error: navigator.onLine === false ? 'Нет подключения к интернету.' : `Не удалось получить ответ от Open Food Facts (${e.name === 'AbortError' ? 'превышено время ожидания' : e.message}).` };
  }
  v.offBusy = false; renderOnline();
}

async function scanBarcode() {
  let stream, raf, closed = false;
  const sheet = U.openSheet({
    title: 'Сканирование штрихкода',
    body: `<video class="scan-video" playsinline muted></video><p class="muted" style="margin:0">Наведите камеру на штрихкод товара.</p>`,
    onClose: () => { closed = true; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(t => t.stop()); },
  });
  try {
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    if (closed) { stream.getTracks().forEach(t => t.stop()); return; }
    const video = sheet.body.querySelector('video');
    video.srcObject = stream; await video.play();
    const loop = async () => {
      if (closed) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) { const code = codes[0].rawValue; sheet.close(); U.toast(`Штрихкод: ${code}`); offBarcode(code); return; }
      } catch { /* продолжаем */ }
      raf = requestAnimationFrame(loop);
    };
    loop();
  } catch (e) {
    sheet.setBody(`<div class="notice warn">Камера недоступна: ${esc(e.message || 'нет разрешения')}. Введите штрихкод вручную.</div>`);
  }
}

/* ---------- свой товар ---------- */
function productEditor(p = {}) {
  const unitOpts = C.INNER_UNITS.map(u => `<option value="${u}"${u === (p.unit || 'упаковка') ? ' selected' : ''}>${u === 'г' ? 'на вес (г)' : u === 'мл' ? 'на розлив (мл)' : u}</option>`).join('');
  U.openSheet({
    title: p.id ? 'Изменить товар' : 'Новый товар в базе',
    wide: true,
    body: `
      <div class="grid-2">
        <label class="field"><span>Название</span><input class="input" data-f="name" value="${esc(p.name || '')}" placeholder="Гречка ядрица"></label>
        <label class="field"><span>Бренд</span><input class="input" data-f="brand" value="${esc(p.brand || '')}" placeholder="Необязательно"></label>
      </div>
      <div class="grid-3">
        <label class="field"><span>Категория</span><select class="input" data-f="category">${U.categoryOptions(p.category || St.categoryForKey(p.key))}</select></label>
        <label class="field"><span>Единица</span><select class="input" data-f="unit">${unitOpts}</select></label>
        <label class="field"><span>Единиц в упаковке</span><input class="input" type="number" min="1" data-f="perPack" value="${p.perPack || 1}"></label>
      </div>
      <div class="grid-3">
        <label class="field"><span>Вес/объём единицы</span><input class="input" type="number" min="0" step="any" data-f="size" value="${p.size && p.measure !== 'шт' ? p.size : ''}"></label>
        <label class="field"><span>Мера</span><select class="input" data-f="measure"><option value="г"${p.measure === 'г' ? ' selected' : ''}>г</option><option value="мл"${p.measure === 'мл' ? ' selected' : ''}>мл</option></select></label>
        <label class="field"><span>Штрихкод</span><input class="input" inputmode="numeric" data-f="barcode" value="${esc(p.barcode || '')}"></label>
      </div>
      <div class="field"><span class="field-label">Где продаётся</span><div class="chips" style="flex-wrap:wrap">${St.STORES.map(s => `<label class="chip"><input type="checkbox" value="${esc(s)}" data-store ${(p.stores || []).includes(s) ? 'checked' : ''} style="margin-right:6px;accent-color:var(--spruce)">${esc(s)}</label>`).join('')}</div></div>
      <div class="preview" data-prev></div>`,
    foot: `${p.id ? `<button class="btn btn-danger" data-del>${icon('trash')}Удалить</button>` : ''}<button class="btn" data-close>Отмена</button><button class="btn btn-primary" data-save>${icon('check')}Сохранить</button>`,
    onMount: api => {
      const f = n => api.body.querySelector(`[data-f="${n}"]`);
      const read = () => ({ id: p.id, name: f('name').value.trim(), brand: f('brand').value.trim(), category: f('category').value, unit: f('unit').value, perPack: +f('perPack').value || 1, size: +f('size').value || null, measure: f('measure').value, barcode: f('barcode').value.trim() || undefined, stores: [...api.body.querySelectorAll('[data-store]:checked')].map(c => c.value), source: p.source || 'user', image: p.image });
      const prev = () => { const d = read(); const k = St.detectKey(d.name, d.brand); api.body.querySelector('[data-prev]').innerHTML = `Фасовка: <b>${esc(C.packLabel(d))}</b>. ${k ? `Для рецептов: <b>${esc(k)}</b>.` : 'С рецептами не связан — уточните название, если это продукт для готовки.'}`; };
      api.body.addEventListener('input', prev); api.body.addEventListener('change', prev); prev();
      api.foot.querySelector('[data-save]').addEventListener('click', () => {
        const d = read(); if (!d.name) { U.toast('Введите название'); return; }
        if (d.barcode && !/^\d{8,14}$/.test(d.barcode)) { U.toast('Штрихкод — 8–14 цифр'); return; }
        St.saveUserProduct(d); api.close(); U.toast('Товар сохранён в вашей базе');
      });
      const del = api.foot.querySelector('[data-del]');
      if (del) del.addEventListener('click', async () => { if (await U.confirmDialog(`Удалить «${p.name}» из вашей базы? Продукты в запасах не изменятся.`, { ok: 'Удалить', danger: true })) { St.deleteUserProduct(p.id); api.close(); U.toast('Удалено'); } });
    },
  });
}

function productActions(pid) {
  const p = U.productById(pid); if (!p) return;
  const mine = ['user', 'import', 'off'].includes(p.source);
  const items = [
    { label: 'Добавить в запасы', icon: 'box', fn: () => U.confirmProductSheet(p) },
    { label: 'В список покупок', icon: 'cart', fn: () => { const f = St.itemFromProduct(p); const per = f.perPack > 1; const r = St.addShoppingEntry({ ...f, qtyMode: per ? 'pack' : 'unit', qty: f.unit === 'г' || f.unit === 'мл' ? 1000 : 1 }); if (r) U.toast(r.merged ? 'Количество в списке увеличено' : `${p.name} — в списке покупок`); } },
  ];
  if (mine) items.push({ label: 'Изменить запись', icon: 'edit', fn: () => productEditor(p) });
  else items.push({ label: 'Скопировать в мои записи и изменить', icon: 'edit', fn: () => productEditor({ ...p, id: undefined, source: 'user' }) });
  U.actionMenu(`${p.name}${p.brand ? ', ' + p.brand : ''} — ${C.packLabel(p)}`, items);
}

async function importFile() {
  const file = await U.pickFile('.csv,.json,text/csv,application/json');
  if (!file) return;
  try {
    const text = await file.text();
    let rows;
    if (/\.json$/i.test(file.name) || text.trim().startsWith('[') || text.trim().startsWith('{')) {
      const data = JSON.parse(text);
      rows = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : null;
      if (!rows) throw new Error('В JSON ожидается массив товаров или объект с полем items');
    } else rows = St.parseCSV(text);
    if (!rows.length) throw new Error('Файл пустой');
    const r = St.importProducts(rows, 'import');
    U.toast(`Импортировано товаров: ${r.added}${r.skipped ? `, пропущено без названия: ${r.skipped}` : ''}`);
  } catch (e) {
    U.toast(`Не удалось импортировать: ${e.message}`, { timeout: 7000 });
  }
}

function bind(root) {
  let t;
  root.querySelector('[data-q]').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { v.q = e.target.value; v.limit = PAGE; v.off = null; renderList(); renderOnline(); }, 140); });
  root.querySelector('[data-cat]').addEventListener('change', e => { v.cat = e.target.value; v.limit = PAGE; renderList(); });
  root.querySelector('[data-store]').addEventListener('change', e => { v.store = e.target.value; v.limit = PAGE; renderList(); });
  root.querySelector('[data-src]').addEventListener('change', e => { v.src = e.target.value; v.limit = PAGE; renderList(); });
  root.addEventListener('submit', e => {
    if (!e.target.matches('[data-barcode]')) return;
    e.preventDefault();
    const code = e.target.elements.code.value.replace(/\D/g, '');
    if (code.length < 8 || code.length > 14) { U.toast('Штрихкод — от 8 до 14 цифр'); return; }
    offBarcode(code);
  });
  root.addEventListener('click', async e => {
    const size = e.target.closest('.size[data-pid]');
    if (size) { productActions(size.dataset.pid); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'add': { const p = U.productById(a.dataset.pid); if (p) U.confirmProductSheet(p); break; }
      case 'more': v.limit += PAGE; renderList(); break;
      case 'new': productEditor({ name: C.parseQuick(v.q)?.name || '' }); break;
      case 'import': importFile(); break;
      case 'reload':
        try { const m = await St.reloadProducts(); U.toast(`База обновлена: ${m.count} товаров, версия от ${new Date(m.updated).toLocaleDateString('ru-RU')}`); BaseView.update(); }
        catch (err) { U.toast(`Не удалось обновить базу: ${err.message}`); }
        break;
      case 'export-mine': {
        const head = 'name;brand;category;key;unit;perPack;size;measure;stores;barcode';
        const rows = St.S.userProducts.map(p => [p.name, p.brand || '', St.categoryName(p.category), p.key || '', p.unit, p.perPack || 1, p.size || '', p.measure || '', (p.stores || []).join(','), p.barcode || ''].map(x => `"${String(x).replace(/"/g, '""')}"`).join(';'));
        U.downloadFile('kladovaya-moi-tovary.csv', '﻿' + [head, ...rows].join('\n'), 'text/csv;charset=utf-8');
        break;
      }
      case 'template':
        U.downloadFile('kladovaya-shablon.csv', '﻿name;brand;category;key;unit;perPack;size;measure;stores;barcode\n"Гречка ядрица";"Мой бренд";"Крупы";"гречка";"пакетик";5;80;"г";"Пятёрочка";\n"Молоко 3,2%";"";"Молочные продукты";"молоко";"бутылка";1;930;"мл";"";\n', 'text/csv;charset=utf-8');
        break;
      case 'off-search': if (v.q.trim().length >= 2) offSearch(v.q.trim()); break;
      case 'scan': scanBarcode(); break;
      case 'off-save': {
        const p = v.off?.items?.[+a.dataset.i]; if (!p) break;
        const saved = St.saveUserProduct(p);
        U.toast(`«${p.name}» сохранён в вашей базе`, { action: { label: 'В запасы', fn: () => U.confirmProductSheet(saved) } });
        break;
      }
    }
  });
}
