// view-shopping.js — умный список покупок.
import * as C from './core.js';
import * as St from './state.js';
import * as U from './ui.js';

const { esc, icon } = U;
const v = { root: null };
let docBound = false;

export const ShoppingView = {
  id: 'shopping',
  title: 'Список покупок',
  mount(root) {
    v.root = root;
    root.innerHTML = `
    <section class="view">
      <header class="page-head">
        <div><h1 class="page-title">Список покупок</h1><p class="page-sub" data-sub></p></div>
        <div class="head-actions">
          <button class="btn" data-act="refresh" title="Пересобрать список по текущим остаткам">${icon('refresh')}Обновить список</button>
        </div>
      </header>
      <h2 class="section-title" style="margin-top:4px">Покупки на эту неделю</h2>
      <div class="week" data-week></div>
      <div data-forecast></div>
      <div class="quick" data-quickwrap style="margin-top:22px">
        <div class="quick-row">
          <label class="search" style="flex:1"><span class="sr-only">Добавить товар в список</span>${icon('plus')}
            <input class="input" data-quick autocomplete="off" enterkeyhint="done" placeholder="Добавить в список: «хлеб», «кефир 2 шт», «бананы 1 кг»"></label>
          <button class="btn btn-primary btn-lg" data-act="quick-add">${icon('plus')}<span class="hide-sm">В список</span></button>
        </div>
        <div class="quick-pop" data-pop hidden></div>
      </div>
      <div class="toolbar">
        <label class="check"><input type="checkbox" data-hide> Скрыть купленные</label>
        <span class="spacer-flex"></span>
        <label class="sr-only" for="ssort">Сортировка</label>
        <select class="input" id="ssort" data-sort style="width:auto;min-height:38px"><option value="category">По категориям</option><option value="added">По порядку добавления</option><option value="name">По названию</option></select>
        <button class="btn btn-sm" data-act="merge" title="Объединить одинаковые позиции" aria-label="Объединить одинаковые позиции">${icon('merge')}<span class="hide-sm">Объединить одинаковые</span></button>
        <button class="btn btn-sm" data-act="clear" title="Убрать купленные из списка" aria-label="Убрать купленные из списка">${icon('trash')}<span class="hide-sm">Убрать купленные</span></button>
      </div>
      <div data-list></div>
    </section>`;
    root.querySelector('[data-hide]').checked = !!St.S.settings.hideBought;
    root.querySelector('[data-sort]').value = St.S.settings.shoppingSort || 'category';
    if (window.matchMedia('(max-width: 560px)').matches) root.querySelector('[data-quick]').placeholder = 'В список: «хлеб», «кефир 2 шт»';
    bind(root);
    this.update({});
  },
  update(detail) {
    if (!v.root) return;
    const open = St.S.shopping.filter(e => !e.bought).length;
    const bought = St.S.shopping.filter(e => e.bought).length;
    v.root.querySelector('[data-sub]').textContent = open || bought
      ? `${open} ${U.plural(open, ['позиция', 'позиции', 'позиций'])} к покупке${bought ? `, куплено ${bought}` : ''}. Список пополняется сам, когда продукты заканчиваются.`
      : 'Список пополняется сам, когда продукт доходит до минимального остатка';
    renderWeek();
    renderList(detail);
  },
};

function renderWeek() {
  let out = 0, low = 0;
  for (const it of St.S.inventory) { const s = C.status(it); if (s === 'out') out++; else if (s === 'low') low++; }
  const fc = St.forecast(7);
  const total = St.S.shopping.filter(e => !e.bought).length;
  v.root.querySelector('[data-week]').innerHTML = `
    <div class="${out ? 'alert' : ''}"><b class="num">${out}</b><span>Закончилось</span></div>
    <div class="${low ? 'warn' : ''}"><b class="num">${low}</b><span>Скоро закончится</span></div>
    <div class="${fc.length ? 'info' : ''}"><b class="num">${fc.length}</b><span>Желательно докупить</span></div>
    <div><b class="num">${total}</b><span>Всего позиций</span></div>`;
  const inList = new Set(St.S.shopping.filter(e => !e.bought).map(e => e.itemId));
  const fEl = v.root.querySelector('[data-forecast]');
  if (!fc.length) {
    fEl.innerHTML = St.S.history.length < 3 ? `<p class="muted" style="font-size:13.5px;margin:8px 0 0">Прогноз появится, когда наберётся история расхода: отмечайте «Съели» и «Я приготовил».</p>` : '';
    return;
  }
  fEl.innerHTML = `<div class="forecast"><h4>Желательно докупить</h4><p>По вашему расходу за последние недели эти продукты закончатся в ближайшие 7 дней.</p>
    ${fc.map(f => `<div class="forecast-row" data-iid="${f.item.id}"><span><b style="font-weight:500">${esc(f.item.name)}</b><br><span class="muted" style="font-size:13px">Осталось ${esc(C.fmtUnits(f.item, f.item.qty))}, хватит примерно на ${Math.max(1, Math.round(f.daysLeft))} ${U.plural(Math.max(1, Math.round(f.daysLeft)), ['день', 'дня', 'дней'])}</span></span>
      ${inList.has(f.item.id) ? `<span class="muted" style="font-size:13px">${icon('check')} В списке</span>` : `<button class="btn btn-sm" data-act="fc-add">${icon('cart')}В список</button>`}</div>`).join('')}</div>`;
}

function qtyLabel(e) {
  if (e.qtyMode === 'pack') return 'уп.';
  if (e.unit === 'г' || e.unit === 'мл') return e.unit;
  return C.unitWord(e.unit, e.qty);
}
function rowHTML(e, detail) {
  const t = U.productTitle(e);
  const reason = St.entryReason(e);
  const units = St.entryUnits(e);
  const per = e.perPack > 1;
  const pack = e.size && e.measure ? C.packLabel(e) : '';
  const it = e.itemId ? St.getItem(e.itemId) : null;
  let rec = '';
  if (!e.bought) {
    const what = e.qtyMode === 'pack' ? `${C.fmtNum(e.qty)} уп. (${C.fmtNum(units)} ${C.unitWord(e.unit, units)})` : (e.unit === 'г' || e.unit === 'мл' ? C.fmtMeasure(e.qty, e.unit) : `${C.fmtNum(e.qty)} ${C.unitWord(e.unit, e.qty)}`);
    rec = (e.auto && !e.edited && it ? 'рекомендуем купить ' : 'купить ') + what;
  }
  const step = e.qtyMode === 'pack' ? 1 : (e.unit === 'г' || e.unit === 'мл' ? 100 : 1);
  return `<li class="shop-row${e.bought ? ' bought' : ''}${detail.addedEntry === e.id ? ' is-new' : ''}" data-eid="${e.id}">
    <button class="tick-btn" data-act="toggle" aria-pressed="${e.bought}" aria-label="${e.bought ? 'Отменить покупку' : 'Отметить купленным'}: ${esc(e.name)}">${icon('check')}</button>
    <div>
      <div class="sh-name">${esc(t.name)}${t.brand ? ` <span class="muted" style="font-weight:400">${esc(t.brand)}</span>` : ''}</div>
      <div class="sh-meta">${esc([reason, pack].filter(Boolean).join(', '))}${rec ? `<br><span class="tag">${esc(rec.charAt(0).toUpperCase() + rec.slice(1))}</span>` : ''}${e.bought ? `<br><span class="tag">Куплено и добавлено в запасы</span>` : ''}</div>
    </div>
    <div class="sh-qty">
      <div class="stepper"><button type="button" data-act="dec" aria-label="Меньше" ${e.bought ? 'disabled' : ''}>${icon('minus')}</button>
        <input type="number" inputmode="decimal" min="0" step="${step}" value="${C.fmtNum(e.qty).replace(',', '.').replace(/\s/g, '')}" data-qty aria-label="Сколько купить" ${e.bought ? 'disabled' : ''}>
        <button type="button" data-act="inc" aria-label="Больше" ${e.bought ? 'disabled' : ''}>${icon('plus')}</button></div>
      ${per ? `<button type="button" class="unit-toggle" data-act="mode" title="Переключить упаковки и штуки" ${e.bought ? 'disabled' : ''}>${esc(qtyLabel(e))}</button>` : `<span class="muted" style="font-size:13px;min-width:30px">${esc(qtyLabel(e))}</span>`}
      <button type="button" class="icon-btn sm" data-act="del" aria-label="Удалить из списка">${icon('trash')}</button>
    </div>
  </li>`;
}

function renderList(detail = {}) {
  const el = v.root.querySelector('[data-list]');
  let list = [...St.S.shopping];
  if (St.S.settings.hideBought) list = list.filter(e => !e.bought);
  if (!St.S.shopping.length) {
    el.innerHTML = `<div class="empty"><h3>Список пуст</h3><p>${St.S.inventory.length ? 'Все продукты в достатке. Когда что-то дойдёт до минимального остатка или закончится, оно появится здесь само.' : 'Добавьте продукты в разделе «Мои продукты» и задайте минимальные остатки — список будет собираться автоматически. Или добавьте товар вручную в строке выше.'}</p></div>`;
    return;
  }
  if (!list.length) { el.innerHTML = `<div class="empty"><h3>Всё куплено</h3><p>Купленные позиции скрыты. Покупки уже добавлены в запасы.</p></div>`; return; }
  const sort = St.S.settings.shoppingSort || 'category';
  const openFirst = (a, b) => (a.bought ? 1 : 0) - (b.bought ? 1 : 0);
  if (sort === 'category') {
    const order = new Map(St.sortedCategories().map((c, i) => [c.id, i]));
    const groups = new Map();
    for (const e of list) { const c = St.validCategory(e.category); if (!groups.has(c)) groups.set(c, []); groups.get(c).push(e); }
    const ids = [...groups.keys()].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
    el.innerHTML = ids.map(id => `<section class="cat-block"><div class="cat-head"><h3>${esc(St.categoryName(id))}</h3><span>${groups.get(id).filter(e => !e.bought).length}</span></div>
      <ul class="rows">${groups.get(id).sort((a, b) => openFirst(a, b) || a.name.localeCompare(b.name, 'ru')).map(e => rowHTML(e, detail)).join('')}</ul></section>`).join('');
  } else {
    list.sort(sort === 'name' ? (a, b) => openFirst(a, b) || a.name.localeCompare(b.name, 'ru') : (a, b) => openFirst(a, b) || a.addedAt - b.addedAt);
    el.innerHTML = `<ul class="rows">${list.map(e => rowHTML(e, detail)).join('')}</ul>`;
  }
}

/* ---------- добавление вручную ---------- */
function renderPop() {
  const input = v.root.querySelector('[data-quick]');
  const pop = v.root.querySelector('[data-pop]');
  const q = input.value.trim();
  if (!q) { pop.hidden = true; return; }
  const sg = U.suggestions(q, 5);
  const p = sg.parsed;
  pop.innerHTML = (p ? `<button type="button" class="sugg sugg-parse" data-sg="parsed">${icon('plus')}<span class="sg-main"><span class="sg-title">В список: <b>${esc(p.name)}</b>${p.qty != null ? ` — ${esc(C.fmtNum(p.qty))} ${esc(p.unit || 'шт')}` : ''}</span><span class="sg-meta">Свободная позиция, при покупке появится в запасах</span></span><span class="sg-tag">Enter</span></button>` : '') +
    sg.groups.map(g => `<div class="sugg"><span class="sg-main"><span class="sg-title">${esc(g.name)}${g.brand && !C.norm(g.name).includes(C.norm(g.brand)) ? ` <span class="muted">${esc(g.brand)}</span>` : ''}</span><span class="sizes">${g.items.slice(0, 6).map(x => `<button type="button" class="size" data-pid="${esc(x.id)}">${esc(C.packLabel(x))}</button>`).join('')}</span></span></div>`).join('');
  pop.hidden = false;
}
function addParsedToList(parsed) {
  if (!parsed) return;
  const inv = St.S.inventory.find(it => C.norm(it.name) === C.norm(parsed.name));
  let fields;
  if (inv) {
    const units = U.unitsFromParsed(inv, parsed);
    const per = inv.perPack > 1;
    fields = { itemId: inv.id, name: inv.name, brand: inv.brand, category: inv.category, key: inv.key, productId: inv.productId, unit: inv.unit, perPack: inv.perPack, size: inv.size, measure: inv.measure, qtyMode: per ? 'pack' : 'unit', qty: per ? Math.max(1, Math.round(units / inv.perPack * 100) / 100) : units };
  } else {
    const { fields: f, qty } = U.fieldsFromText(parsed);
    fields = { ...f, qty, qtyMode: 'unit' };
  }
  const r = St.addShoppingEntry(fields);
  if (r) U.toast(r.merged ? `${r.entry.name}: количество в списке увеличено` : `${r.entry.name} — в списке`);
}
function addProductToList(pid, parsed) {
  const p = U.productById(pid); if (!p) return;
  const f = St.itemFromProduct(p);
  const per = (f.perPack || 1) > 1;
  const loose = f.unit === 'г' || f.unit === 'мл';
  let qty = 1;
  if (parsed && parsed.qty != null) { const u = U.unitsFromParsed(f, parsed); qty = per ? Math.max(1, Math.round(u / f.perPack * 100) / 100) : u; }
  else if (loose) qty = 1000;
  const r = St.addShoppingEntry({ ...f, qtyMode: per ? 'pack' : 'unit', qty });
  if (r) U.toast(r.merged ? `${r.entry.name}: количество в списке увеличено` : `${r.entry.name} — в списке`);
}

function bind(root) {
  const input = root.querySelector('[data-quick]');
  const pop = root.querySelector('[data-pop]');
  input.addEventListener('input', renderPop);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addParsedToList(C.parseQuick(input.value)); input.value = ''; pop.hidden = true; }
    if (e.key === 'Escape') pop.hidden = true;
  });
  pop.addEventListener('mousedown', e => e.preventDefault());
  pop.addEventListener('click', e => {
    if (e.target.closest('[data-sg]')) { addParsedToList(C.parseQuick(input.value)); input.value = ''; pop.hidden = true; return; }
    const b = e.target.closest('[data-pid]'); if (b) { addProductToList(b.dataset.pid, C.parseQuick(input.value)); input.value = ''; pop.hidden = true; }
  });
  if (!docBound) { docBound = true; document.addEventListener('click', e => { const p = v.root?.querySelector('[data-pop]'); if (p && !e.target.closest('[data-quickwrap]')) p.hidden = true; }); }
  root.querySelector('[data-hide]').addEventListener('change', e => St.setSetting('hideBought', e.target.checked));
  root.querySelector('[data-sort]').addEventListener('change', e => St.setSetting('shoppingSort', e.target.value));

  root.addEventListener('change', e => {
    const inp = e.target.closest('[data-qty]'); if (!inp) return;
    const id = inp.closest('[data-eid]').dataset.eid;
    const val = parseFloat(String(inp.value).replace(',', '.'));
    if (!(val > 0)) { U.toast('Количество должно быть больше нуля'); ShoppingView.update({}); return; }
    St.updateEntry(id, { qty: Math.round(val * 100) / 100 });
  });

  root.addEventListener('click', async e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    const id = a.closest('[data-eid]')?.dataset.eid;
    const entry = id ? St.S.shopping.find(x => x.id === id) : null;
    switch (act) {
      case 'quick-add': if (input.value.trim()) { addParsedToList(C.parseQuick(input.value)); input.value = ''; pop.hidden = true; } else input.focus(); break;
      case 'refresh': St.refreshShopping(); U.toast('Список обновлён по текущим остаткам'); break;
      case 'merge': { const n = St.mergeShoppingDuplicates(); U.toast(n ? `Объединено позиций: ${n}` : 'Одинаковых позиций нет'); break; }
      case 'clear': {
        const n = St.S.shopping.filter(x => x.bought).length;
        if (!n) { U.toast('Купленных позиций нет'); break; }
        if (await U.confirmDialog(`Убрать из списка ${n} ${U.plural(n, ['купленную позицию', 'купленные позиции', 'купленных позиций'])}? В запасах они останутся.`, { ok: 'Убрать' })) { St.clearBought(); U.toast('Купленные убраны из списка'); }
        break;
      }
      case 'fc-add': {
        const iid = a.closest('[data-iid]').dataset.iid; U.addItemToShopping(iid); break;
      }
      case 'toggle': {
        if (!entry) break;
        const snap = St.snapshot();
        const r = St.toggleBought(id);
        if (r.bought) {
          const it = St.getItem(r.boughtItemId);
          U.undoToast(`Куплено: ${r.name}. Дома теперь ${it ? C.fmtUnits(it, it.qty) : ''}`, snap);
        } else U.toast(`${r.name}: покупка отменена, запасы пересчитаны`);
        break;
      }
      case 'inc': case 'dec': {
        if (!entry) break;
        const step = entry.qtyMode === 'pack' ? 1 : (entry.unit === 'г' || entry.unit === 'мл' ? 100 : 1);
        const next = Math.round((entry.qty + (act === 'inc' ? step : -step)) * 100) / 100;
        if (next <= 0) { U.toast('Чтобы убрать позицию, нажмите на корзину'); break; }
        St.updateEntry(id, { qty: next });
        break;
      }
      case 'mode': {
        if (!entry || entry.perPack <= 1) break;
        if (entry.qtyMode === 'pack') St.updateEntry(id, { qtyMode: 'unit', qty: Math.round(entry.qty * entry.perPack * 100) / 100 });
        else St.updateEntry(id, { qtyMode: 'pack', qty: Math.max(1, Math.ceil(entry.qty / entry.perPack - C.EPS)) });
        break;
      }
      case 'del': {
        if (!entry) break;
        const snap = St.snapshot();
        St.removeEntry(id);
        U.undoToast(`${entry.name} — убрано из списка${entry.auto ? '. Вернётся, если остаток изменится' : ''}`, snap);
        break;
      }
    }
  });
}
