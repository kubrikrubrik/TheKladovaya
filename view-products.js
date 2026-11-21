// view-products.js — главный экран: запасы, сводка, «Обрати внимание», быстрое добавление.
import * as C from './core.js';
import * as St from './state.js';
import * as U from './ui.js';

const { esc, icon } = U;
const v = { filter: 'all', q: '', cat: null, showAllAttention: false, root: null };

export const ProductsView = {
  id: 'products',
  title: 'Мои продукты',
  mount(root) {
    v.root = root;
    root.innerHTML = `
    <section class="view">
      <header class="page-head">
        <div><h1 class="page-title">Мои продукты</h1><p class="page-sub" data-sub></p></div>
        <div class="head-actions">
          <button class="btn" data-act="cats">${icon('list')}Категории</button>
          <button class="btn btn-primary hide-sm" data-act="add">${icon('plus')}Добавить продукт</button>
        </div>
      </header>
      <div class="quick" data-quickwrap>
        <div class="quick-row">
          <label class="search" style="flex:1"><span class="sr-only">Быстро добавить продукт</span>${icon('bolt')}
            <input class="input" data-quick type="text" autocomplete="off" enterkeyhint="done" placeholder="Быстро добавить: «молоко 2 шт», «гречка увелка», «яйца 10»" aria-describedby="quick-hint"></label>
          <button class="btn btn-primary btn-lg" data-act="quick-add" aria-label="Добавить из строки">${icon('plus')}<span class="hide-sm">Добавить</span></button>
        </div>
        <div class="quick-pop" data-pop hidden role="listbox"></div>
        <p id="quick-hint" class="sr-only">Введите название и, при желании, количество. Enter — добавить, стрелки — выбрать товар из базы.</p>
      </div>
      <div class="ledger" data-ledger></div>
      <div data-attention></div>
      <div class="toolbar">
        <label class="search"><span class="sr-only">Найти в моих продуктах</span>${icon('search')}<input class="input" type="search" data-search placeholder="Найти в моих продуктах"></label>
        <div class="seg" role="group" aria-label="Фильтр по статусу" data-seg>
          <button type="button" data-f="all" class="on">Все</button><button type="button" data-f="low">Заканчивается</button><button type="button" data-f="out">Закончилось</button>
        </div>
        <label class="sr-only" for="psort">Сортировка</label>
        <select class="input" id="psort" data-sort style="width:auto;min-height:38px">
          <option value="category">По категориям</option><option value="name">По названию</option><option value="status">Сначала заканчивающиеся</option><option value="recent">Недавно изменённые</option>
        </select>
      </div>
      <div class="chips" data-chips></div>
      <div data-list></div>
    </section>`;
    root.querySelector('[data-sort]').value = St.S.settings.productSort || 'category';
    if (window.matchMedia('(max-width: 560px)').matches) root.querySelector('[data-quick]').placeholder = 'Быстро: «молоко 2 шт»';
    bind(root);
    this.update({});
  },
  update(detail) {
    if (!v.root) return;
    const s = St.stats();
    v.root.querySelector('[data-sub]').textContent = s.total
      ? `${s.total} ${U.plural(s.total, ['продукт', 'продукта', 'продуктов'])} дома, обновляется при каждом изменении`
      : 'Здесь будут все продукты, которые есть дома';
    renderLedger(s);
    renderAttention();
    renderChips();
    renderList(detail);
  },
};

function renderLedger(s) {
  const el = v.root.querySelector('[data-ledger]');
  el.innerHTML = `
    <button type="button" data-act="f-all"><b class="num">${s.total}</b><span>Всего продуктов</span></button>
    <button type="button" data-act="cats"><b class="num">${s.categories}</b><span>${U.plural(s.categories, ['Категория', 'Категории', 'Категорий'])}</span></button>
    <button type="button" data-act="f-low" class="${s.attention ? 'warn' : ''} ${v.filter === 'low' ? 'on' : ''}"><b class="num">${s.attention}</b><span>Заканчивается</span></button>
    <button type="button" data-act="go-shop" class="${s.toBuy ? 'alert' : ''}"><b class="num">${s.toBuy}</b><span>Нужно купить</span></button>`;
}

function renderAttention() {
  const el = v.root.querySelector('[data-attention]');
  const list = St.S.inventory.filter(it => C.status(it) !== 'ok')
    .sort((a, b) => (C.status(a) === 'out' ? 0 : 1) - (C.status(b) === 'out' ? 0 : 1) || a.name.localeCompare(b.name, 'ru'));
  if (!list.length) { el.innerHTML = ''; return; }
  const shown = v.showAllAttention ? list : list.slice(0, 4);
  const inList = new Set(St.S.shopping.filter(e => !e.bought).map(e => e.itemId));
  el.innerHTML = `<h2 class="section-title">Обрати внимание <small>${list.length} ${U.plural(list.length, ['позиция', 'позиции', 'позиций'])}</small></h2>
    <div class="attention">
      ${shown.map(it => {
        const st = C.status(it);
        const meta = st === 'out' ? `Закончилось${it.min ? `, минимум ${C.fmtUnits(it, it.min)}` : ''}` : `Осталось ${C.fmtUnits(it, it.qty)}, минимум ${C.fmtUnits(it, it.min)}`;
        const plus = it.perPack > 1 ? `+1 ${it.packName === 'упаковка' ? 'уп.' : it.packName}` : C.isLoose(it) ? `+${C.fmtMeasure(C.itemStep(it), it.unit)}` : `+1 ${C.unitWord(it.unit, 1)}`;
        return `<div class="att-row" data-id="${it.id}">
          <span class="att-name">${esc(it.name)} ${U.statusPill(it)}</span>
          <span class="att-actions">
            <button class="btn btn-sm" data-act="${it.perPack > 1 ? 'pack-inc' : 'inc'}">${esc(plus)}</button>
            ${inList.has(it.id) ? `<a class="btn btn-sm btn-quiet" href="#/shopping">${icon('check')}В списке</a>` : `<button class="btn btn-sm" data-act="to-list">${icon('cart')}В список</button>`}
          </span>
          <span class="att-meta">${esc(meta)}</span>
        </div>`;
      }).join('')}
      ${list.length > 4 ? `<button class="att-more" data-act="att-toggle">${v.showAllAttention ? 'Свернуть' : `Показать все ${list.length}`}</button>` : ''}
    </div>`;
}

function renderChips() {
  const el = v.root.querySelector('[data-chips]');
  const counts = new Map();
  for (const it of St.S.inventory) counts.set(it.category, (counts.get(it.category) || 0) + 1);
  const cats = St.sortedCategories().filter(c => counts.has(c.id));
  if (v.cat && !counts.has(v.cat)) v.cat = null;
  el.innerHTML = cats.length > 1 ? `<button class="chip ${!v.cat ? 'on' : ''}" data-cat="">Все категории</button>` +
    cats.map(c => `<button class="chip ${v.cat === c.id ? 'on' : ''}" data-cat="${esc(c.id)}">${esc(c.name)}<small>${counts.get(c.id)}</small></button>`).join('') : '';
}

function filtered() {
  const q = C.norm(v.q);
  return St.S.inventory.filter(it => {
    if (v.filter === 'low' && C.status(it) === 'ok') return false;
    if (v.filter === 'out' && C.status(it) !== 'out') return false;
    if (v.cat && it.category !== v.cat) return false;
    if (q && !C.norm(`${it.name} ${it.brand} ${it.key || ''}`).includes(q)) return false;
    return true;
  });
}

function rowHTML(it, showCat, detail) {
  const q = C.fmtQty(it);
  const pack = C.packLabel(it);
  const step = C.itemStep(it);
  const eatLabel = C.isLoose(it) ? `Съели ${C.fmtMeasure(step, it.unit)}` : 'Съели';
  const t = U.productTitle(it);
  return `<li class="row${detail.added === it.id ? ' is-new' : ''}" data-id="${it.id}">
    <div class="row-info">
      <div class="row-name"><button type="button" data-act="edit" title="Изменить">${esc(t.name)}</button>${t.brand ? `<span class="muted" style="font-weight:400">${esc(t.brand)}</span>` : ''}</div>
      <div class="row-meta"><span>${esc(pack)}</span>${showCat ? `<span>${esc(St.categoryName(it.category))}</span>` : ''}${U.statusPill(it)}</div>
      <div class="row-gauge">${U.gauge(it)}</div>
    </div>
    <div class="row-qty"><span class="q-main${detail.qty === it.id ? ' tick' : ''}">${esc(q.main)}</span>${q.sub ? `<span class="q-sub">${esc(q.sub)}</span>` : ''}</div>
    <div class="row-actions">
      <div class="stepper"><button type="button" data-act="dec" aria-label="Уменьшить на ${esc(C.fmtUnits(it, step))}" ${it.qty <= 0 ? 'disabled' : ''}>${icon('minus')}</button><span></span><button type="button" data-act="inc" aria-label="Увеличить на ${esc(C.fmtUnits(it, step))}">${icon('plus')}</button></div>
      <button type="button" class="btn btn-sm eat-btn" data-act="eat" title="Списать ${esc(C.fmtUnits(it, step))} и учесть в расходе" ${it.qty <= 0 ? 'disabled' : ''}>${esc(eatLabel)}</button>
      <span class="spacer"></span>
      <button type="button" class="icon-btn" data-act="menu" aria-label="Действия: ${esc(it.name)}">${icon('more')}</button>
    </div>
  </li>`;
}

function renderList(detail = {}) {
  const el = v.root.querySelector('[data-list]');
  if (!St.S.inventory.length) {
    el.innerHTML = `<div class="empty"><h3>Дома пока пусто</h3>
      <p>Добавьте продукты через строку быстрого ввода или поиск по базе — «Кладовая» будет следить за остатками, соберёт список покупок и подскажет, что приготовить.</p>
      <div class="btns"><button class="btn btn-primary" data-act="add">${icon('plus')}Добавить первый продукт</button><button class="btn" data-act="sample">Заполнить примером</button></div></div>`;
    return;
  }
  const items = filtered();
  if (!items.length) { el.innerHTML = `<div class="empty"><h3>Ничего не найдено</h3><p>Под выбранный фильтр не подходит ни один продукт.</p><div class="btns"><button class="btn" data-act="reset-f">Сбросить фильтры</button></div></div>`; return; }
  const sort = St.S.settings.productSort || 'category';
  const byName = (a, b) => a.name.localeCompare(b.name, 'ru');
  if (sort === 'category') {
    const order = new Map(St.sortedCategories().map((c, i) => [c.id, i]));
    const groups = new Map();
    for (const it of items) { if (!groups.has(it.category)) groups.set(it.category, []); groups.get(it.category).push(it); }
    const ids = [...groups.keys()].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
    el.innerHTML = ids.map(id => {
      const list = groups.get(id).sort(byName);
      return `<section class="cat-block"><div class="cat-head"><h3>${esc(St.categoryName(id))}</h3><span>${list.length}</span></div>
        <ul class="rows">${list.map(it => rowHTML(it, false, detail)).join('')}</ul></section>`;
    }).join('');
  } else {
    const rank = { out: 0, low: 1, ok: 2 };
    const sorted = [...items].sort(sort === 'name' ? byName : sort === 'recent' ? (a, b) => b.updatedAt - a.updatedAt : (a, b) => rank[C.status(a)] - rank[C.status(b)] || byName(a, b));
    el.innerHTML = `<ul class="rows" style="margin-top:10px">${sorted.map(it => rowHTML(it, true, detail)).join('')}</ul>`;
  }
  if (detail.added && !detail.sample) {
    const row = el.querySelector(`[data-id="${detail.added}"]`);
    if (row && !isInView(row)) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
function isInView(el) { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }

/* ---------- быстрый ввод ---------- */
let sg = null, focusIdx = -1, docBound = false;
function quickTargets(pop) { return [...pop.querySelectorAll('[data-sg], [data-pid]')]; }
function renderPop() {
  const input = v.root.querySelector('[data-quick]');
  const pop = v.root.querySelector('[data-pop]');
  const q = input.value.trim();
  if (!q) { pop.hidden = true; pop.innerHTML = ''; sg = null; return; }
  sg = U.suggestions(q, 6);
  focusIdx = -1;
  pop.innerHTML = (sg.corrected ? `<p class="muted" style="margin:4px 10px 6px;font-size:13px">Возможно, вы имели в виду «${esc(sg.corrected)}»</p>` : '') +
    U.suggestionsHTML(sg, { compact: true }) +
    `<div class="pop-foot"><span>Enter — добавить распознанное, выбор фасовки — товар из базы.</span><button type="button" class="btn btn-sm btn-quiet" data-act="manual-from-quick">${icon('edit')}Вручную</button></div>`;
  pop.hidden = false;
}
function closePop() { const pop = v.root?.querySelector('[data-pop]'); if (pop) { pop.hidden = true; } }
function quickCommitParsed() {
  const input = v.root.querySelector('[data-quick]');
  const parsed = C.parseQuick(input.value);
  if (!parsed) { input.focus(); return; }
  U.addParsed(parsed);
  input.value = ''; closePop();
}
function quickCommitProduct(pid) {
  const input = v.root.querySelector('[data-quick]');
  const prod = U.productById(pid); if (!prod) return;
  const f = St.itemFromProduct(prod);
  const parsed = C.parseQuick(input.value);
  const units = U.unitsFromParsed(f, parsed);
  U.commitAdd(f, units);
  input.value = ''; closePop();
}

/* ---------- категории ---------- */
export function categoriesSheet() {
  const render = (api) => {
    const counts = new Map(); for (const it of St.S.inventory) counts.set(it.category, (counts.get(it.category) || 0) + 1);
    const list = St.sortedCategories();
    api.setBody(`
      <p class="muted" style="margin:0">Переименуйте, переставьте или удалите категории. Продукты из удалённой категории переедут в «Прочее».</p>
      <div>${list.map((c, i) => `<div class="cat-edit" data-cid="${esc(c.id)}">
        <input class="input" value="${esc(c.name)}" data-name aria-label="Название категории">
        <button class="icon-btn sm" data-up ${i === 0 ? 'disabled' : ''} aria-label="Выше">${icon('up')}</button>
        <button class="icon-btn sm" data-down ${i === list.length - 1 ? 'disabled' : ''} aria-label="Ниже">${icon('down')}</button>
        ${c.id === 'other' ? '<span style="width:32px"></span>' : `<button class="icon-btn sm" data-del aria-label="Удалить ${esc(c.name)}" title="${counts.get(c.id) || 0} прод.">${icon('trash')}</button>`}
      </div>`).join('')}</div>
      <form data-addcat style="display:flex;gap:8px"><input class="input" name="n" placeholder="Новая категория, например «Детское питание»"><button class="btn btn-primary">${icon('plus')}Создать</button></form>`);
  };
  U.openSheet({
    title: 'Категории',
    onMount: api => {
      render(api);
      api.body.addEventListener('click', async e => {
        const row = e.target.closest('[data-cid]'); if (!row) return;
        const id = row.dataset.cid;
        if (e.target.closest('[data-up]')) { St.moveCategory(id, -1); render(api); }
        else if (e.target.closest('[data-down]')) { St.moveCategory(id, 1); render(api); }
        else if (e.target.closest('[data-del]')) {
          const name = St.categoryName(id);
          const n = St.S.inventory.filter(i => i.category === id).length;
          if (await U.confirmDialog(n ? `Удалить категорию «${name}»? ${n} ${U.plural(n, ['продукт переедет', 'продукта переедут', 'продуктов переедут'])} в «Прочее».` : `Удалить категорию «${name}»?`, { ok: 'Удалить', danger: true })) {
            St.deleteCategory(id); render(api); U.toast(`Категория «${name}» удалена`);
          }
        }
      });
      api.body.addEventListener('change', e => {
        const inp = e.target.closest('[data-name]'); if (!inp) return;
        const id = inp.closest('[data-cid]').dataset.cid;
        if (!inp.value.trim()) { inp.value = St.categoryName(id); return; }
        St.renameCategory(id, inp.value); U.toast('Категория переименована');
      });
      api.body.addEventListener('submit', e => {
        e.preventDefault();
        const n = e.target.elements.n.value.trim(); if (!n) return;
        const c = St.addCategory(n); render(api); if (c) U.toast(`Категория «${c.name}» создана`);
      });
    },
  });
}

/* ---------- события ---------- */
function bind(root) {
  const input = root.querySelector('[data-quick]');
  const pop = root.querySelector('[data-pop]');
  input.addEventListener('input', renderPop);
  input.addEventListener('focus', () => { if (input.value.trim()) renderPop(); });
  input.addEventListener('keydown', e => {
    const targets = pop.hidden ? [] : quickTargets(pop);
    if (e.key === 'ArrowDown' && targets.length) { e.preventDefault(); focusIdx = Math.min(targets.length - 1, focusIdx + 1); targets.forEach((t, i) => t.classList.toggle('on', i === focusIdx)); targets[focusIdx].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp' && targets.length) { e.preventDefault(); focusIdx = Math.max(0, focusIdx - 1); targets.forEach((t, i) => t.classList.toggle('on', i === focusIdx)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const t = focusIdx >= 0 ? targets[focusIdx] : null;
      if (t && t.dataset.pid) quickCommitProduct(t.dataset.pid); else quickCommitParsed();
    } else if (e.key === 'Escape') closePop();
  });
  pop.addEventListener('mousedown', e => e.preventDefault());
  pop.addEventListener('click', e => {
    if (e.target.closest('[data-sg="parsed"]')) { quickCommitParsed(); return; }
    const p = e.target.closest('[data-pid]'); if (p) { quickCommitProduct(p.dataset.pid); return; }
    if (e.target.closest('[data-act="manual-from-quick"]')) { const parsed = C.parseQuick(input.value); closePop(); U.editItemSheet(null, { name: parsed?.name || input.value }); input.value = ''; }
  });
  if (!docBound) { docBound = true; document.addEventListener('click', e => { if (v.root && !e.target.closest('[data-quickwrap]')) closePop(); }); }

  root.querySelector('[data-search]').addEventListener('input', e => { v.q = e.target.value; renderList(); });
  root.querySelector('[data-seg]').addEventListener('click', e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    setFilter(b.dataset.f);
  });
  root.querySelector('[data-sort]').addEventListener('change', e => { St.setSetting('productSort', e.target.value); });
  root.querySelector('[data-chips]').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; v.cat = b.dataset.cat || null; renderChips(); renderList(); });

  root.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    const id = a.closest('[data-id]')?.dataset.id;
    switch (act) {
      case 'add': U.openAddSheet(); break;
      case 'quick-add': if (input.value.trim()) quickCommitParsed(); else { input.focus(); U.toast('Введите название продукта, например «молоко 2 шт»'); } break;
      case 'cats': categoriesSheet(); break;
      case 'sample': St.loadSample(); window.scrollTo(0, 0); U.toast('Добавлен пример запасов — загляните в рецепты'); break;
      case 'f-all': v.cat = null; setFilter('all'); break;
      case 'f-low': setFilter(v.filter === 'low' ? 'all' : 'low'); break;
      case 'go-shop': location.hash = '#/shopping'; break;
      case 'reset-f': v.q = ''; v.cat = null; root.querySelector('[data-search]').value = ''; setFilter('all'); break;
      case 'att-toggle': v.showAllAttention = !v.showAllAttention; renderAttention(); break;
      case 'edit': U.editItemSheet(id); break;
      case 'menu': U.itemMenu(id); break;
      case 'to-list': U.addItemToShopping(id); break;
      case 'pack-inc': U.packChange(id, 1); break;
      case 'inc': { const it = St.getItem(id); St.changeQty(id, C.itemStep(it)); break; }
      case 'dec': { const it = St.getItem(id); St.changeQty(id, -C.itemStep(it)); break; }
      case 'eat': {
        const it = St.getItem(id); if (!it || it.qty <= 0) break;
        const snap = St.snapshot();
        const step = C.itemStep(it);
        const r = St.changeQty(id, -step, 'eat');
        const st = C.status(it);
        const tail = st === 'out' ? ' — закончилось, добавлено в список покупок' : st === 'low' ? ' — заканчивается' : '';
        U.undoToast(`${it.name}: осталось ${C.fmtUnits(it, it.qty)}${r.clamped ? '' : ''}${tail}`, snap);
        break;
      }
    }
  });
}
function setFilter(f) {
  v.filter = f;
  v.root.querySelectorAll('[data-seg] [data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === f));
  renderLedger(St.stats());
  renderList();
}
