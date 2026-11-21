// ui.js — общие элементы интерфейса: листы, уведомления, редактор продукта, быстрое добавление, обложки.
import * as C from './core.js';
import * as St from './state.js';

export const esc = C.escapeHtml;
export const icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- уведомления ---------- */
export function toast(message, opts = {}) {
  const root = document.getElementById('toast-root');
  while (root.children.length >= 3) root.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(message)}</span>`;
  const actions = opts.actions || (opts.action ? [opts.action] : []);
  let timer;
  const close = () => { clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = a.label;
    b.addEventListener('click', () => { close(); a.fn(); });
    el.appendChild(b);
  }
  root.appendChild(el);
  timer = setTimeout(close, opts.timeout || (actions.length ? 6000 : 3200));
  return close;
}
export function undoToast(message, snap, extra = []) {
  return toast(message, { actions: [...extra, { label: 'Отменить', fn: () => { St.restore(snap); toast('Действие отменено'); } }] });
}

/* ---------- листы (диалоги) ---------- */
const stack = [];
document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) stack[stack.length - 1].close(); });
// При переходе на другой раздел открытые листы закрываются
window.addEventListener('hashchange', () => { while (stack.length) stack[stack.length - 1].close(); });

export function openSheet({ title, body = '', foot = '', wide = false, onMount, onClose, label, autofocus = true }) {
  const root = document.getElementById('sheet-root');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label || title || '')}">
      ${title ? `<header class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть">${icon('close')}</button></header>` : ''}
      <div class="sheet-body">${body}</div>
      ${foot ? `<footer class="sheet-foot">${foot}</footer>` : ''}
    </section>`;
  const prevFocus = document.activeElement;
  let closed = false;
  const api = {
    el: wrap.querySelector('.sheet'),
    body: wrap.querySelector('.sheet-body'),
    foot: wrap.querySelector('.sheet-foot'),
    close() {
      if (closed) return; closed = true;
      const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
      api.el.classList.add('closing');
      setTimeout(() => wrap.remove(), 170);
      if (!stack.length) document.body.style.overflow = '';
      if (onClose) onClose();
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
    },
    setBody(html) { api.body.innerHTML = html; },
    setFoot(html) { if (api.foot) api.foot.innerHTML = html; },
  };
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) api.close(); });
  root.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  stack.push(api);
  if (onMount) onMount(api);
  const first = wrap.querySelector('[autofocus], input:not([type=hidden]):not([type=checkbox]), select, textarea, button:not([data-close])');
  if (autofocus && first && window.matchMedia('(pointer:fine)').matches && !wrap.contains(document.activeElement)) first.focus();
  return api;
}
export function closeAllSheets() { while (stack.length) stack[stack.length - 1].close(); }

export function confirmDialog(text, { title = 'Подтвердите действие', ok = 'Да', danger = false } = {}) {
  return new Promise(resolve => {
    let answered = false;
    const s = openSheet({
      title, body: `<p style="margin:0">${esc(text)}</p>`,
      foot: `<button class="btn" data-close>Отмена</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button>`,
      onMount: api => api.foot.querySelector('[data-ok]').addEventListener('click', () => { answered = true; resolve(true); api.close(); }),
      onClose: () => { if (!answered) resolve(false); },
    });
    return s;
  });
}

export function promptSheet(title, label, value = '', { ok = 'Сохранить', placeholder = '' } = {}) {
  return new Promise(resolve => {
    let done = false;
    openSheet({
      title,
      body: `<label class="field"><span>${esc(label)}</span><input class="input" data-v value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`,
      foot: `<button class="btn" data-close>Отмена</button><button class="btn btn-primary" data-ok>${esc(ok)}</button>`,
      onMount: api => {
        const inp = api.body.querySelector('[data-v]');
        const submit = () => { const v = inp.value.trim(); if (!v) { inp.focus(); return; } done = true; resolve(v); api.close(); };
        api.foot.querySelector('[data-ok]').addEventListener('click', submit);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        setTimeout(() => inp.focus(), 40);
      },
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

export function actionMenu(title, items) {
  const s = openSheet({
    title,
    body: `<div class="menu-list">${items.map((it, i) => it === '-' ? '<hr>' : `<button type="button" data-i="${i}" class="${it.danger ? 'danger' : ''}">${icon(it.icon || 'bolt')}<span>${esc(it.label)}</span></button>`).join('')}</div>`,
    onMount: api => api.body.addEventListener('click', e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const it = items[+b.dataset.i]; api.close(); setTimeout(() => it.fn(), 60);
    }),
  });
  return s;
}

/* ---------- форматирование ---------- */
export function productTitle(p) {
  const b = p.brand && !C.norm(p.name).includes(C.norm(p.brand)) ? p.brand : '';
  return { name: p.name, brand: b };
}
export function statusPill(item) {
  const s = C.status(item);
  return `<span class="st st-${s}">${C.STATUS_LABEL[s]}</span>`;
}
export function gauge(item) {
  const s = C.status(item);
  const q = Math.max(0, +item.qty || 0), min = +item.min || 0;
  const per = +item.perPack > 1 ? +item.perPack : 0;
  const scale = Math.max(item.target || 0, min * 2, per, q, C.isLoose(item) ? 1000 : 1) || 1;
  const w = Math.min(100, (q / scale) * 100);
  const tick = min > 0 ? `<b style="left:${Math.min(98, (min / scale) * 100)}%" title="Минимум: ${esc(C.fmtUnits(item, min))}"></b>` : '';
  return `<div class="gauge ${s}" role="img" aria-label="Уровень запаса"><i style="width:${w}%"></i>${tick}</div>`;
}
export function plural(n, forms) { return C.plural(n, forms); }

/* ---------- обложка рецепта ---------- */
const COVER_TONES = {
  'Суп': ['#8A3B2F', '#F6E7DD'], 'Салат': ['#3F5D3A', '#ECF1E4'], 'Горячее': ['#6A4A30', '#F4E8DA'], 'Паста': ['#A9843A', '#FCF4E0'],
  'Гарнир': ['#776E47', '#F4F0DF'], 'Выпечка': ['#A2703A', '#FBF0E0'], 'Десерт': ['#79394F', '#F8E8EE'], 'Закуска': ['#56603F', '#EFF1E3'],
  'Завтрак': ['#B98E35', '#FFF7E4'], 'Каша': ['#94805A', '#FBF6E9'], 'Напиток': ['#2E5B63', '#E6F1F2'], 'Соус': ['#90402C', '#F9E8E0'], 'Заготовка': ['#4A5832', '#EDF1E1'],
};
const PATTERNS = [
  'repeating-linear-gradient(135deg, rgba(255,255,255,.07) 0 1px, transparent 1px 13px)',
  'radial-gradient(rgba(255,255,255,.12) 1px, transparent 1.3px) 0 0/12px 12px',
  'repeating-linear-gradient(0deg, rgba(255,255,255,.06) 0 1px, transparent 1px 11px)',
  'repeating-radial-gradient(circle at 100% 100%, rgba(255,255,255,.08) 0 1px, transparent 1px 15px)',
  'repeating-linear-gradient(90deg, rgba(255,255,255,.06) 0 1px, transparent 1px 18px)',
  'linear-gradient(160deg, rgba(255,255,255,.10), rgba(0,0,0,.10))',
];
export function cover(recipe, { badge = '' } = {}) {
  const h = C.hash(recipe.title);
  const [bg, ink] = COVER_TONES[recipe.type] || ['#5E5A50', '#F3F0E8'];
  const pat = PATTERNS[h % PATTERNS.length];
  const shade = ((h >> 3) % 5) * 0.035;
  const letter = (recipe.title.match(/[A-Za-zА-Яа-яЁё]/) || ['•'])[0].toUpperCase();
  const pos = 4 + ((h >> 6) % 14);
  const img = recipe.image ? `<img src="${esc(recipe.image)}" alt="${esc(recipe.title)}" loading="lazy" onerror="this.remove()">` : '';
  return `<div class="cover" style="--cv-bg:${bg};--cv-ink:${ink};--cv-pattern:${pat};--cv-shade:${shade};--cv-pos:${pos}%">
    <span class="cv-letter" aria-hidden="true">${esc(letter)}</span>
    <span class="cv-type">${esc(recipe.type || '')}</span>
    <span class="cv-title">${esc(recipe.title)}</span>
    ${img}${badge ? `<span class="badge">${esc(badge)}</span>` : ''}
  </div>`;
}

/* ---------- движок быстрого добавления ---------- */
// Возвращает подсказки: распознанный ввод + товары из базы (сгруппированные по названию и бренду)
export function suggestions(query, limit = 7) {
  const q = String(query || '').trim();
  if (!q) return { parsed: null, groups: [], corrected: null };
  const parsed = C.parseQuick(q);
  const term = parsed ? parsed.name : q;
  const { results, corrected } = C.searchProducts(St.searchIndex(), term, 60);
  const groups = [];
  const byKey = new Map();
  for (const r of results) {
    const k = `${C.norm(r.p.name)}|${C.norm(r.p.brand || '')}`;
    if (!byKey.has(k)) { const g = { key: k, name: r.p.name, brand: r.p.brand || '', items: [], score: r.score }; byKey.set(k, g); groups.push(g); }
    byKey.get(k).items.push(r.p);
  }
  return { parsed, groups: groups.slice(0, limit), corrected, total: results.length };
}

// Сколько внутренних единиц добавить по распознанному вводу для выбранного товара
export function unitsFromParsed(fields, parsed) {
  const per = Math.max(1, +fields.perPack || 1);
  const loose = fields.unit === 'г' || fields.unit === 'мл';
  if (!parsed || parsed.qty == null) return loose ? 1000 : per;
  const q = parsed.qty, u = parsed.unit;
  if (u === 'кг' || u === 'г' || u === 'л' || u === 'мл') {
    const amount = u === 'кг' || u === 'л' ? q * 1000 : q;
    if (loose) return amount;
    if (fields.size && fields.measure && fields.measure !== 'шт') return Math.max(1, Math.round(amount / fields.size * 100) / 100);
    return q;
  }
  if (u === 'уп') return q * per;
  if (loose) return q * 1000;
  return per > 1 && (u === 'шт' || !u) && fields.unit !== 'шт' ? q * per : q;
}

// Поля нового продукта по свободному тексту («Молоко 2 шт»)
export function fieldsFromText(parsed) {
  const key = St.detectKey(parsed.name);
  let unit = 'шт', size = null, measure = null;
  if (parsed.unit === 'кг' || parsed.unit === 'г') unit = 'г';
  else if (parsed.unit === 'л' || parsed.unit === 'мл') unit = 'мл';
  else if (parsed.unit === 'бут') unit = 'бутылка';
  else if (parsed.unit === 'бан') unit = 'банка';
  else if (parsed.unit === 'пак') unit = 'пакет';
  else if (parsed.unit === 'уп') unit = 'упаковка';
  else if (!parsed.unit && key) { const d = St.defaultUnitForKey(key); unit = d === 'мл' ? 'шт' : d === 'г' ? 'г' : 'шт'; if (unit === 'г' && parsed.qty != null && parsed.qty < 20) unit = 'шт'; }
  let qty = parsed.qty ?? (unit === 'г' || unit === 'мл' ? 500 : 1);
  if (parsed.unit === 'кг' || parsed.unit === 'л') qty *= 1000;
  return { fields: { name: parsed.name, key, category: St.categoryForKey(key), unit, perPack: 1, size, measure }, qty };
}

export function describeAdd(fields, units) {
  const it = { ...fields, qty: units };
  return C.fmtUnits(it, units);
}

// Добавить в запасы с уведомлением (отмена и редактирование)
export function commitAdd(fields, units, { silent = false } = {}) {
  const snap = St.snapshot();
  const { item, merged } = St.addItem(fields, units);
  if (!silent) {
    const msg = merged ? `${item.name}: добавлено ${describeAdd(item, units)}, теперь ${C.fmtUnits(item, item.qty)}` : `Добавлено: ${item.name}, ${C.fmtUnits(item, item.qty)}`;
    undoToast(msg, snap, [{ label: 'Изменить', fn: () => editItemSheet(item.id) }]);
  }
  return item;
}

export function suggestionsHTML(sg, { compact = false } = {}) {
  if (!sg.parsed && !sg.groups.length) return '';
  let html = '';
  if (sg.parsed) {
    const { fields, qty } = fieldsFromText(sg.parsed);
    const exactInv = St.S.inventory.find(it => C.norm(it.name) === C.norm(sg.parsed.name));
    const what = exactInv ? `к имеющемуся «${esc(exactInv.name)}»` : `в «${esc(St.categoryName(fields.category))}»`;
    html += `<button type="button" class="sugg sugg-parse" data-sg="parsed">
      ${icon('plus')}<span class="sg-main"><span class="sg-title">Добавить <b>${esc(sg.parsed.name)}</b> — ${esc(exactInv ? describeAdd(exactInv, unitsFromParsed(exactInv, sg.parsed)) : describeAdd(fields, qty))}</span>
      <span class="sg-meta">${exactInv ? 'Количество прибавится ' + what : 'Новый продукт ' + what + (fields.key ? `, для рецептов: ${esc(fields.key)}` : '')}</span></span>
      <span class="sg-tag">Enter</span></button>`;
  }
  for (const g of sg.groups) {
    const t = productTitle(g);
    const first = g.items[0];
    const src = first.source === 'user' || first.source === 'import' ? 'моя запись' : first.source === 'off' ? 'Open Food Facts' : first.stores?.length ? first.stores.join(', ') : '';
    html += `<div class="sugg" role="group">
      <span class="sg-main"><span class="sg-title">${esc(t.name)}${t.brand ? ` <span class="muted">${esc(t.brand)}</span>` : ''}</span>
      <span class="sg-meta">${esc(St.categoryName(first.category))}${src ? ', ' + esc(src) : ''}</span>
      <span class="sizes">${g.items.slice(0, compact ? 5 : 8).map(p => `<button type="button" class="size" data-pid="${esc(p.id)}">${esc(C.packLabel(p))}</button>`).join('')}</span></span>
    </div>`;
  }
  return html;
}

export function productById(id) { return St.allProducts().find(p => p.id === id) || null; }

/* ---------- лист «Добавить продукт» ---------- */
export function openAddSheet(initial = '') {
  const s = openSheet({
    title: 'Добавить продукт',
    body: `
      <label class="search"><span class="sr-only">Название продукта</span>${icon('search')}
        <input class="input" type="search" data-q placeholder="Например: гречка, молоко 2 шт, кола 1,5 л" autocomplete="off" value="${esc(initial)}" enterkeyhint="done"></label>
      <div data-res></div>
      <div class="pop-foot" style="border:0;padding:0">
        <span>Нет нужного? Добавьте вручную — с фасовкой и минимальным остатком.</span>
        <button type="button" class="btn btn-sm" data-manual>${icon('edit')}Вручную</button>
      </div>`,
    onMount: api => {
      const input = api.body.querySelector('[data-q]');
      const res = api.body.querySelector('[data-res]');
      let sg = null;
      const render = () => {
        sg = suggestions(input.value, 8);
        res.innerHTML = input.value.trim()
          ? (sg.corrected ? `<p class="muted" style="margin:0 0 6px;font-size:13px">Показаны результаты для «${esc(sg.corrected)}»</p>` : '') + (suggestionsHTML(sg) || '<p class="muted">Ничего не найдено. Нажмите «Вручную», чтобы создать продукт.</p>')
          : `<p class="muted" style="margin:0">Начните вводить название. Можно сразу указать количество: «яйца 10», «сыр 300 г», «2 бутылки колы».</p>`;
      };
      input.addEventListener('input', render);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (sg?.parsed) { addParsed(sg.parsed); api.close(); } } });
      res.addEventListener('click', e => {
        const b = e.target.closest('[data-sg="parsed"]');
        if (b && sg?.parsed) { addParsed(sg.parsed); api.close(); return; }
        const p = e.target.closest('[data-pid]');
        if (p) { const prod = productById(p.dataset.pid); if (prod) { api.close(); setTimeout(() => confirmProductSheet(prod, sg?.parsed), 80); } }
      });
      api.body.querySelector('[data-manual]').addEventListener('click', () => { const name = (C.parseQuick(input.value) || {}).name || ''; api.close(); setTimeout(() => editItemSheet(null, { name }), 80); });
      render();
    },
  });
  return s;
}

export function addParsed(parsed) {
  const exact = St.S.inventory.find(it => C.norm(it.name) === C.norm(parsed.name));
  if (exact) {
    const snap = St.snapshot();
    const units = unitsFromParsed(exact, parsed);
    St.changeQty(exact.id, units);
    undoToast(`${exact.name}: +${describeAdd(exact, units)}, теперь ${C.fmtUnits(exact, exact.qty)}`, snap);
    return exact;
  }
  const { fields, qty } = fieldsFromText(parsed);
  return commitAdd(fields, qty);
}

// Подтверждение количества для товара из базы
export function confirmProductSheet(prod, parsed = null) {
  const f = St.itemFromProduct(prod);
  const per = Math.max(1, f.perPack || 1);
  const loose = f.unit === 'г' || f.unit === 'мл';
  const startUnits = parsed ? unitsFromParsed(f, parsed) : (loose ? 1000 : per);
  const dup = St.findDuplicate(f);
  const t = productTitle(prod);
  openSheet({
    title: t.name,
    body: `
      <p class="muted" style="margin:-4px 0 0">${esc([t.brand, C.packLabel(prod), St.categoryName(f.category)].filter(Boolean).join(', '))}</p>
      ${dup ? `<div class="notice">Этот продукт уже есть дома: ${esc(C.fmtUnits(dup, dup.qty))}. Количество прибавится, дубль не появится.</div>` : ''}
      <div class="grid-2">
        ${per > 1 ? `<label class="field"><span>Упаковок</span><input class="input" type="number" inputmode="decimal" min="0" step="1" data-packs value="${Math.floor(startUnits / per)}"></label>
        <label class="field"><span>И ещё ${esc(C.unitWord(f.unit, 5))}</span><input class="input" type="number" inputmode="decimal" min="0" step="1" data-rest value="${Math.round((startUnits % per) * 100) / 100}"></label>`
        : `<label class="field"><span>Количество, ${esc(loose ? f.unit : C.unitWord(f.unit, 5))}</span><input class="input" type="number" inputmode="decimal" min="0" step="${loose ? 50 : 1}" data-units value="${startUnits}"></label>`}
        ${dup ? '' : `<label class="field"><span>Минимальный остаток</span><input class="input" type="number" inputmode="decimal" min="0" step="1" data-min value="${St.defaultMin({ ...f })}"><small>в ${esc(loose ? f.unit : C.unitWord(f.unit, 5))}</small></label>`}
      </div>
      <div class="preview" data-prev></div>`,
    foot: `<button class="btn" data-more>${icon('edit')}Подробнее</button><button class="btn btn-primary" data-ok>${icon('plus')}Добавить</button>`,
    onMount: api => {
      const get = () => {
        if (per > 1) return (+api.body.querySelector('[data-packs]').value || 0) * per + (+api.body.querySelector('[data-rest]').value || 0);
        return +api.body.querySelector('[data-units]').value || 0;
      };
      const prev = () => { api.body.querySelector('[data-prev]').innerHTML = `Будет учтено: <b>${esc(C.fmtUnits(f, get()))}</b>${per > 1 && get() > 0 ? ` — ${esc(C.fmtQty({ ...f, qty: get() }).sub)}` : ''}`; };
      api.body.addEventListener('input', prev); prev();
      api.foot.querySelector('[data-ok]').addEventListener('click', () => {
        const units = get();
        if (!(units > 0)) { toast('Укажите количество больше нуля'); return; }
        const minEl = api.body.querySelector('[data-min]');
        commitAdd({ ...f, min: minEl ? +minEl.value || 0 : undefined }, units);
        api.close();
      });
      api.foot.querySelector('[data-more]').addEventListener('click', () => { const units = get(); api.close(); setTimeout(() => editItemSheet(null, { ...f, qty: units }), 80); });
    },
  });
}

/* ---------- редактор продукта ---------- */
export function categoryOptions(sel) {
  return St.sortedCategories().map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
}
function keyOptions(sel) {
  const keys = St.S.ingredients.map(i => i.key).sort((a, b) => a.localeCompare(b, 'ru'));
  return `<option value="">— не использовать в рецептах —</option>` + keys.map(k => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(k)}</option>`).join('');
}

export function editItemSheet(id, preset = {}) {
  const ex = id ? St.getItem(id) : null;
  const base = ex ? { ...ex } : {
    name: preset.name || '', brand: preset.brand || '', category: preset.category || 'other', key: preset.key || null,
    unit: preset.unit || 'шт', perPack: preset.perPack || 1, size: preset.size || null, measure: preset.measure || null,
    qty: preset.qty ?? 1, min: preset.min ?? null, target: null, productId: preset.productId || null, barcode: preset.barcode || null,
  };
  if (!ex && base.name && !preset.key) { base.key = St.detectKey(base.name, base.brand); if (!preset.category) base.category = St.categoryForKey(base.key); }
  const per = Math.max(1, base.perPack || 1);
  const unitOpts = C.INNER_UNITS.map(u => `<option value="${u}"${u === base.unit ? ' selected' : ''}>${u === 'г' ? 'граммы (на вес)' : u === 'мл' ? 'миллилитры (на розлив)' : u}</option>`).join('');
  const s = openSheet({
    title: ex ? 'Изменить продукт' : 'Новый продукт',
    wide: true,
    autofocus: !ex,
    body: `
      <div class="grid-2">
        <label class="field"><span>Название</span><input class="input" data-f="name" value="${esc(base.name)}" placeholder="Например, Гречка ядрица" required></label>
        <label class="field"><span>Бренд <span class="muted">— необязательно</span></span><input class="input" data-f="brand" value="${esc(base.brand || '')}" placeholder="Увелка"></label>
      </div>
      <div class="grid-2">
        <label class="field"><span>Категория</span><select class="input" data-f="category">${categoryOptions(base.category)}<option value="__new">+ Новая категория…</option></select></label>
        <label class="field"><span>Для рецептов считать как</span><select class="input" data-f="key">${keyOptions(base.key)}</select><small data-keyhint></small></label>
      </div>
      <div class="grid-3">
        <label class="field"><span>Единица учёта</span><select class="input" data-f="unit">${unitOpts}</select></label>
        <label class="field" data-perwrap><span>Единиц в упаковке</span><input class="input" type="number" inputmode="numeric" min="1" step="1" data-f="perPack" value="${per}"></label>
        <label class="field" data-sizewrap><span>Вес или объём единицы</span>
          <span style="display:flex;gap:6px"><input class="input" type="number" inputmode="decimal" min="0" step="any" data-f="size" value="${base.size && base.measure !== 'шт' ? base.size : ''}" placeholder="80">
          <select class="input" data-f="measure" style="max-width:84px"><option value="г"${base.measure === 'г' ? ' selected' : ''}>г</option><option value="мл"${base.measure === 'мл' ? ' selected' : ''}>мл</option></select></span></label>
      </div>
      <div class="grid-3">
        <label class="field"><span>Сейчас дома</span><input class="input" type="number" inputmode="decimal" min="0" step="any" data-f="qty" value="${Math.round((base.qty ?? 0) * 100) / 100}"><small data-u1></small></label>
        <label class="field"><span>Минимальный остаток</span><input class="input" type="number" inputmode="decimal" min="0" step="any" data-f="min" value="${base.min ?? ''}" placeholder="0"><small>При этом количестве — «Заканчивается»</small></label>
        <label class="field"><span>Желаемый запас</span><input class="input" type="number" inputmode="decimal" min="0" step="any" data-f="target" value="${base.target ?? ''}" placeholder="—"><small>Сколько держать дома после покупки</small></label>
      </div>
      <div class="preview" data-prev></div>`,
    foot: `${ex ? `<button class="btn btn-danger" data-del>${icon('trash')}Удалить</button>` : ''}<button class="btn" data-close>Отмена</button><button class="btn btn-primary" data-save>${icon('check')}${ex ? 'Сохранить' : 'Добавить'}</button>`,
    onMount: api => {
      const b = api.body;
      const f = n => b.querySelector(`[data-f="${n}"]`);
      const read = () => ({
        name: f('name').value.trim(), brand: f('brand').value.trim(), category: f('category').value, key: f('key').value || null,
        unit: f('unit').value, perPack: Math.max(1, Math.round(+f('perPack').value || 1)),
        size: +f('size').value > 0 ? +f('size').value : null, measure: +f('size').value > 0 ? f('measure').value : null,
        qty: Math.max(0, +f('qty').value || 0), min: Math.max(0, +f('min').value || 0), target: +f('target').value > 0 ? +f('target').value : null,
      });
      let keyTouched = !!ex;
      f('key').addEventListener('change', () => { keyTouched = true; });
      f('name').addEventListener('input', () => {
        if (keyTouched) return;
        const k = St.detectKey(f('name').value, f('brand').value);
        f('key').value = k || '';
        if (!ex) f('category').value = St.categoryForKey(k);
      });
      f('category').addEventListener('change', async () => {
        if (f('category').value !== '__new') return;
        const name = await promptSheet('Новая категория', 'Название категории', '');
        const c = name ? St.addCategory(name) : null;
        f('category').innerHTML = categoryOptions(c ? c.id : 'other') + '<option value="__new">+ Новая категория…</option>';
      });
      const prev = () => {
        const d = read();
        const loose = d.unit === 'г' || d.unit === 'мл';
        b.querySelector('[data-perwrap]').style.display = loose ? 'none' : '';
        b.querySelector('[data-sizewrap]').style.display = loose ? 'none' : '';
        const uw = loose ? d.unit : C.unitWord(d.unit, 5);
        b.querySelector('[data-u1]').textContent = `в единицах учёта (${uw})`;
        const it = { ...d, qty: d.qty };
        const q = C.fmtQty(it);
        const st = C.status(it);
        b.querySelector('[data-prev]').innerHTML = `Будет учтено: <b>${esc(q.main)}</b>${q.sub ? ` — ${esc(q.sub)}` : ''}. Статус: <b>${C.STATUS_LABEL[st]}</b>.` +
          (d.perPack > 1 && !loose ? ` Списание по одной единице: «${esc(C.unitWord(d.unit, 1))}».` : '');
        b.querySelector('[data-keyhint]').textContent = d.key ? 'Учитывается при подборе рецептов' : 'Продукт не участвует в подборе рецептов';
      };
      b.addEventListener('input', prev); b.addEventListener('change', prev); prev();
      api.foot.querySelector('[data-save]').addEventListener('click', () => {
        const d = read();
        if (!d.name) { toast('Введите название продукта'); f('name').focus(); return; }
        if (d.category === '__new') d.category = 'other';
        if (ex) {
          St.updateItem(ex.id, d);
          toast('Сохранено');
        } else {
          commitAdd({ ...d, productId: base.productId, barcode: base.barcode }, d.qty);
        }
        api.close();
      });
      const del = api.foot.querySelector('[data-del]');
      if (del) del.addEventListener('click', () => { api.close(); setTimeout(() => deleteItem(ex.id), 60); });
    },
  });
  return s;
}

export function deleteItem(id) {
  const it = St.getItem(id); if (!it) return;
  const snap = St.snapshot();
  St.removeItem(id);
  undoToast(`Удалено: ${it.name}`, snap);
}

/* ---------- списание части ---------- */
export function writeOffSheet(id) {
  const it = St.getItem(id); if (!it) return;
  const im = C.itemMeasure(it);
  const opts = [];
  if (!C.isLoose(it)) opts.push(['unit', C.unitWord(it.unit, 5)]);
  if (it.perPack > 1) opts.push(['pack', it.packName === 'упаковка' ? 'упаковок' : it.packName]);
  if (im && im.m === 'g') opts.push(['g', 'г']);
  if (im && im.m === 'ml') opts.push(['ml', 'мл']);
  openSheet({
    title: `Списать: ${it.name}`,
    body: `<p class="muted" style="margin:0">Сейчас дома: ${esc(C.fmtUnits(it, it.qty))}${C.fmtQty(it).sub ? ` (${esc(C.fmtQty(it).sub)})` : ''}</p>
      <div class="grid-2"><label class="field"><span>Сколько</span><input class="input" type="number" inputmode="decimal" min="0" step="any" data-a value="1"></label>
      <label class="field"><span>Единица</span><select class="input" data-u>${opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></label></div>
      <label class="check"><input type="checkbox" data-eat checked> Учитывать в расходе (для прогноза покупок)</label>
      <div class="preview" data-prev></div>`,
    foot: `<button class="btn" data-close>Отмена</button><button class="btn btn-primary" data-ok>Списать</button>`,
    onMount: api => {
      const calc = () => {
        const a = +api.body.querySelector('[data-a]').value || 0; const u = api.body.querySelector('[data-u]').value;
        if (u === 'unit') return a;
        if (u === 'pack') return a * it.perPack;
        if (u === 'g' || u === 'ml') return a / im.per;
        return a;
      };
      const prev = () => { const n = calc(); const left = Math.max(0, it.qty - n); api.body.querySelector('[data-prev]').innerHTML = `Спишется ${esc(C.fmtUnits(it, Math.min(n, it.qty)))}, останется <b>${esc(C.fmtUnits(it, left))}</b>${n > it.qty ? '. Больше, чем есть, списать нельзя — остаток станет нулевым.' : ''}`; };
      api.body.addEventListener('input', prev); api.body.addEventListener('change', prev); prev();
      api.foot.querySelector('[data-ok]').addEventListener('click', () => {
        const n = calc(); if (!(n > 0)) { toast('Укажите количество'); return; }
        const snap = St.snapshot();
        St.changeQty(it.id, -n, api.body.querySelector('[data-eat]').checked ? 'eat' : null);
        undoToast(`${it.name}: осталось ${C.fmtUnits(it, it.qty)}`, snap);
        api.close();
      });
    },
  });
}

/* ---------- меню продукта ---------- */
export function itemMenu(id) {
  const it = St.getItem(id); if (!it) return;
  const items = [
    { label: 'Изменить', icon: 'edit', fn: () => editItemSheet(id) },
  ];
  if (it.perPack > 1) {
    items.push({ label: `Добавить ${it.packName || 'упаковку'} (+${it.perPack})`, icon: 'plus', fn: () => packChange(id, +1) });
    items.push({ label: `Списать ${it.packName || 'упаковку'} целиком (−${it.perPack})`, icon: 'minus', fn: () => packChange(id, -1) });
  }
  items.push({ label: 'Списать часть…', icon: 'minus', fn: () => writeOffSheet(id) });
  items.push({ label: 'Закончилось — обнулить', icon: 'close', fn: () => { const snap = St.snapshot(); St.changeQty(id, -it.qty, 'eat'); undoToast(`${it.name}: закончилось, добавлено в список покупок`, snap); } });
  items.push({ label: 'В список покупок', icon: 'cart', fn: () => addItemToShopping(id) });
  items.push('-');
  items.push({ label: 'Удалить продукт', icon: 'trash', danger: true, fn: () => deleteItem(id) });
  actionMenu(it.name, items);
}
export function packChange(id, dir) {
  const it = St.getItem(id); if (!it) return;
  const snap = St.snapshot();
  const r = St.changeQty(id, dir * it.perPack, dir < 0 ? 'eat' : null);
  undoToast(`${it.name}: ${dir > 0 ? 'добавлена' : 'списана'} ${it.packName || 'упаковка'}, теперь ${C.fmtUnits(it, it.qty)}${r.clamped ? ' (больше не было)' : ''}`, snap);
}
export function addItemToShopping(id) {
  const it = St.getItem(id); if (!it) return;
  const rec = C.recommend(it);
  const r = St.addShoppingEntry({ itemId: it.id, name: it.name, brand: it.brand, category: it.category, key: it.key, productId: it.productId, unit: it.unit, perPack: it.perPack, size: it.size, measure: it.measure, qtyMode: rec.mode, qty: rec.mode === 'pack' ? rec.packs : rec.units });
  if (r) toast(r.merged ? `${it.name}: количество в списке увеличено` : `${it.name} — в списке покупок`, { action: { label: 'Открыть список', fn: () => { location.hash = '#/shopping'; } } });
}

/* ---------- загрузка файла ---------- */
export function downloadFile(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function pickFile(accept) {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
    inp.addEventListener('change', () => { resolve(inp.files[0] || null); inp.remove(); });
    document.body.appendChild(inp); inp.click();
  });
}
export function fmtDate(t) {
  if (!t) return '';
  return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
export function fmtTime(min) {
  if (min >= 60) return min % 60 ? `${Math.floor(min / 60)} ч ${min % 60} мин` : `${min / 60} ч`;
  return `${min} мин`;
}
export const DIFF = { 1: 'Легко', 2: 'Средне', 3: 'Сложно' };
