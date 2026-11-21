// view-recipes.js — библиотека рецептов, подбор по запасам, страница рецепта, «Я приготовил», свои рецепты.
import * as C from './core.js';
import * as St from './state.js';
import * as U from './ui.js';

const { esc, icon } = U;
const PAGE = 36;
const v = {
  root: null, q: '', cat: '', sort: 'match', limit: PAGE, showFilters: false,
  f: { time: '', diff: '', kcal: '', type: '', main: '', only: '' },
};

function statusClass(ev) { return ev.missing === 0 ? 's-ok' : ev.missing === 1 ? 's-one' : 's-many'; }

function cardHTML(r, ev) {
  const badge = r.custom ? 'Мой рецепт' : '';
  return `<a class="rcard" href="#/recipe/${esc(r.id)}">
    ${U.cover(r, { badge })}
    <h4>${esc(r.title)}</h4>
    <div class="r-meta"><span>${icon('clock')}${esc(U.fmtTime(r.time))}</span><span>${esc(U.DIFF[r.difficulty] || '')}</span>${r.kcal ? `<span>≈ ${r.kcal} ккал</span>` : ''}</div>
    <div class="match ${ev.missing === 0 ? 'full' : ''}" title="Совпадение с домашними запасами"><span class="bar"><i style="width:${ev.percent}%"></i></span><b>${ev.percent}%</b></div>
    <div class="r-status ${statusClass(ev)}">${esc(C.recipeStatusLabel(ev))}</div>
  </a>`;
}

function matchSort(evs) {
  return (a, b) => {
    const ea = evs.get(a.id), eb = evs.get(b.id);
    return (ea.missing === 0 ? 0 : 1) - (eb.missing === 0 ? 0 : 1) || ea.missing - eb.missing || eb.percent - ea.percent || a.time - b.time || a.title.localeCompare(b.title, 'ru');
  };
}

function filteredRecipes(evs) {
  const q = C.norm(v.q);
  const f = v.f;
  return St.allRecipes().filter(r => {
    if (v.cat && !(r.categories || []).includes(v.cat)) return false;
    if (q) {
      const hay = C.norm(r.title + ' ' + r.ingredients.map(i => i.name).join(' '));
      if (!q.split(' ').every(w => hay.includes(w))) return false;
    }
    if (f.time && r.time > +f.time) return false;
    if (f.diff && r.difficulty !== +f.diff) return false;
    if (f.kcal) {
      if (!r.kcal) return false;
      if (f.kcal === 'lt300' && r.kcal >= 300) return false;
      if (f.kcal === '300-600' && (r.kcal < 300 || r.kcal > 600)) return false;
      if (f.kcal === 'gt600' && r.kcal <= 600) return false;
    }
    if (f.type && r.type !== f.type) return false;
    if (f.main && r.main !== f.main) return false;
    const ev = evs.get(r.id);
    if (f.only === 'cook' && ev.missing > 0) return false;
    if (f.only === 'one' && ev.missing > 1) return false;
    return true;
  });
}

export const RecipesView = {
  id: 'recipes',
  title: 'Рецепты',
  mount(root) {
    v.root = root;
    const all = St.allRecipes();
    const types = [...new Set(all.map(r => r.type))].sort((a, b) => a.localeCompare(b, 'ru'));
    const mains = [...new Set(all.map(r => r.main))].sort((a, b) => a.localeCompare(b, 'ru'));
    root.innerHTML = `
    <section class="view">
      <header class="page-head">
        <div><h1 class="page-title">Рецепты</h1><p class="page-sub" data-sub></p></div>
        <div class="head-actions"><button class="btn" data-act="new">${icon('edit')}Свой рецепт</button></div>
      </header>
      <div data-rails></div>
      <h2 class="section-title" data-libtitle>Вся библиотека</h2>
      <div class="toolbar">
        <label class="search"><span class="sr-only">Поиск рецептов</span>${icon('search')}<input class="input" type="search" data-q placeholder="Блюдо или продукт: «гречка», «суп с курицей»" value="${esc(v.q)}"></label>
        <button class="btn" data-act="filters" aria-expanded="${v.showFilters}">${icon('filter')}Фильтры<span data-fcount></span></button>
        <label class="sr-only" for="rsort">Сортировка</label>
        <select class="input" id="rsort" data-sort style="width:auto;min-height:40px">
          <option value="match">По совпадению с запасами</option><option value="time">Сначала быстрые</option><option value="kcal">По калорийности</option><option value="title">По названию</option>
        </select>
      </div>
      <div class="chips" data-cats>
        <button class="chip ${!v.cat ? 'on' : ''}" data-cat="">Все</button>
        ${St.S.recipeCategories.map(c => `<button class="chip ${v.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>
      <div class="filters-panel" data-panel ${v.showFilters ? '' : 'hidden'}>
        <label class="field"><span>Время приготовления</span><select class="input" data-f="time"><option value="">Любое</option><option value="15">До 15 минут</option><option value="30">До 30 минут</option><option value="60">До 1 часа</option><option value="120">До 2 часов</option></select></label>
        <label class="field"><span>Сложность</span><select class="input" data-f="diff"><option value="">Любая</option><option value="1">Легко</option><option value="2">Средне</option><option value="3">Сложно</option></select></label>
        <label class="field"><span>Калорийность порции</span><select class="input" data-f="kcal"><option value="">Любая</option><option value="lt300">До 300 ккал</option><option value="300-600">300–600 ккал</option><option value="gt600">Больше 600 ккал</option></select></label>
        <label class="field"><span>Тип блюда</span><select class="input" data-f="type"><option value="">Любой</option>${types.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
        <label class="field"><span>Основной ингредиент</span><select class="input" data-f="main"><option value="">Любой</option>${mains.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
        <label class="field"><span>По запасам</span><select class="input" data-f="only"><option value="">Все рецепты</option><option value="cook">Только можно приготовить</option><option value="one">Не хватает не больше одного</option></select></label>
        <div class="actions"><button class="btn btn-sm" data-act="reset">Сбросить фильтры</button></div>
      </div>
      <div class="result-line" data-resline></div>
      <div class="rgrid" data-grid></div>
      <div class="more" data-more></div>
    </section>`;
    for (const [k, val] of Object.entries(v.f)) { const el = root.querySelector(`[data-f="${k}"]`); if (el) el.value = val; }
    root.querySelector('[data-sort]').value = v.sort;
    bindList(root);
    this.update({});
  },
  update() {
    if (!v.root) return;
    const evs = St.evaluateAll();
    const all = St.allRecipes();
    const cookable = all.filter(r => evs.get(r.id).missing === 0);
    const one = all.filter(r => evs.get(r.id).missing === 1);
    v.root.querySelector('[data-sub]').textContent = `${all.length} ${U.plural(all.length, ['рецепт', 'рецепта', 'рецептов'])}${St.S.inventory.length ? `, из имеющихся продуктов можно приготовить ${cookable.length}` : ''}`;
    renderRails(cookable, one, evs);
    renderGrid(evs);
  },
};

function renderRails(cookable, one, evs) {
  const el = v.root.querySelector('[data-rails]');
  if (!St.S.inventory.length) {
    el.innerHTML = `<div class="empty"><h3>Подбор по вашим продуктам</h3><p>Как только в «Моих продуктах» появятся запасы, здесь будут блюда, которые можно приготовить прямо сейчас, и те, где не хватает одного продукта.</p>
      <div class="btns"><a class="btn btn-primary" href="#/products">${icon('box')}Перейти к продуктам</a><button class="btn" data-act="sample">Заполнить примером</button></div></div>`;
    return;
  }
  const sorter = matchSort(evs);
  cookable.sort((a, b) => sorter(a, b));
  one.sort((a, b) => sorter(a, b));
  el.innerHTML = `
    <h2 class="section-title" style="margin-top:0">Можно приготовить сейчас <small>${cookable.length}</small></h2>
    ${cookable.length ? `<div class="rail">${cookable.slice(0, 24).map(r => cardHTML(r, evs.get(r.id))).join('')}</div>${cookable.length > 24 ? `<button class="btn btn-sm" data-act="show-cook">Показать все ${cookable.length}</button>` : ''}`
      : `<p class="muted" style="margin:0 0 8px">Из того, что есть дома, полностью не собирается ни одно блюдо. Посмотрите варианты ниже — где не хватает одного продукта.</p>`}
    ${one.length ? `<h2 class="section-title">Не хватает одного продукта <small>${one.length}</small></h2><div class="rail">${one.slice(0, 24).map(r => cardHTML(r, evs.get(r.id))).join('')}</div>` : ''}`;
}

function renderGrid(evs) {
  const list = filteredRecipes(evs);
  const sorters = {
    match: matchSort(evs),
    time: (a, b) => a.time - b.time || matchSort(evs)(a, b),
    kcal: (a, b) => (a.kcal || 9999) - (b.kcal || 9999),
    title: (a, b) => a.title.localeCompare(b.title, 'ru'),
  };
  // Блюда, которые можно приготовить полностью, всегда выше остальных — при любой сортировке
  const base = sorters[v.sort] || sorters.match;
  list.sort((a, b) => (evs.get(a.id).missing === 0 ? 0 : 1) - (evs.get(b.id).missing === 0 ? 0 : 1) || base(a, b));
  const n = Object.values(v.f).filter(Boolean).length;
  v.root.querySelector('[data-fcount]').textContent = n ? ` · ${n}` : '';
  v.root.querySelector("[data-resline]").innerHTML = `<span>Найдено ${list.length} ${U.plural(list.length, ['рецепт', 'рецепта', 'рецептов'])}${v.cat ? ` в разделе «${esc(v.cat)}»` : ''}</span>${n || v.q || v.cat ? `<button class="btn btn-sm btn-quiet" data-act="reset-all">Показать все рецепты</button>` : ''}`;
  const grid = v.root.querySelector('[data-grid]');
  if (!list.length) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Ничего не нашлось</h3><p>Попробуйте убрать часть фильтров или изменить запрос.</p></div>`; v.root.querySelector('[data-more]').innerHTML = ''; return; }
  grid.innerHTML = list.slice(0, v.limit).map(r => cardHTML(r, evs.get(r.id))).join('');
  v.root.querySelector('[data-more]').innerHTML = list.length > v.limit ? `<button class="btn" data-act="more">Показать ещё ${Math.min(PAGE, list.length - v.limit)} из ${list.length - v.limit}</button>` : '';
}

function bindList(root) {
  let t;
  root.querySelector('[data-q]').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { v.q = e.target.value; v.limit = PAGE; renderGrid(St.evaluateAll()); }, 120); });
  root.querySelector('[data-sort]').addEventListener('change', e => { v.sort = e.target.value; renderGrid(St.evaluateAll()); });
  root.querySelector('[data-panel]').addEventListener('change', e => { const s = e.target.closest('[data-f]'); if (!s) return; v.f[s.dataset.f] = s.value; v.limit = PAGE; renderGrid(St.evaluateAll()); });
  root.querySelector('[data-cats]').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    v.cat = b.dataset.cat; v.limit = PAGE;
    root.querySelectorAll('[data-cats] .chip').forEach(c => c.classList.toggle('on', c.dataset.cat === v.cat));
    renderGrid(St.evaluateAll());
  });
  root.addEventListener('click', e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'filters': v.showFilters = !v.showFilters; root.querySelector('[data-panel]').hidden = !v.showFilters; a.setAttribute('aria-expanded', v.showFilters); break;
      case 'reset': case 'reset-all':
        v.f = { time: '', diff: '', kcal: '', type: '', main: '', only: '' };
        root.querySelectorAll('[data-f]').forEach(s => { s.value = ''; });
        if (a.dataset.act === 'reset-all') { v.q = ''; v.cat = ''; root.querySelector('[data-q]').value = ''; root.querySelectorAll('[data-cats] .chip').forEach(c => c.classList.toggle('on', c.dataset.cat === '')); }
        v.limit = PAGE; renderGrid(St.evaluateAll()); break;
      case 'more': v.limit += PAGE; renderGrid(St.evaluateAll()); break;
      case 'show-cook':
        v.f.only = 'cook'; root.querySelector('[data-f="only"]').value = 'cook'; v.showFilters = true; root.querySelector('[data-panel]').hidden = false;
        renderGrid(St.evaluateAll()); root.querySelector('[data-libtitle]').scrollIntoView({ behavior: 'smooth' }); break;
      case 'new': recipeEditor(); break;
      case 'sample': St.loadSample(); U.toast('Добавлен пример запасов'); break;
    }
  });
}

/* ================= Страница рецепта ================= */
const d = { root: null, id: null, servings: null };

function ingLabelAmount(ing, mult) {
  if (ing.qty == null) return 'по вкусу';
  const q = ing.qty * mult;
  const nice = ['шт', 'зуб', 'банка', 'упаковка', 'пачка', 'лист'].includes(ing.unit) ? Math.round(q * 2) / 2 || q : q < 10 ? Math.round(q * 10) / 10 : Math.round(q);
  return C.fmtRecipeAmount(nice, ing.unit);
}

function rowInfo(row) {
  const items = row.items;
  const itemsText = items.slice(0, 2).map(it => `${it.name} (${C.fmtUnits(it, it.qty)})`).join('; ');
  switch (row.state) {
    case 'have': return { cls: 'have', note: items.length ? `Есть: ${itemsText}` : 'Есть' };
    case 'short': return { cls: 'short', note: `Не хватает ${C.fmtRecipeAmount(row.shortBy.amount, row.shortBy.unit)}${items.length ? `. Дома: ${itemsText}` : ''}`, btn: 'Докупить' };
    case 'missing': return row.optional ? { cls: 'optional', note: 'По желанию, дома нет' } : { cls: 'missing', note: 'Нет дома', btn: 'В список покупок' };
    case 'staple': return { cls: 'staple', note: 'Обычно есть дома' };
    default: return { cls: 'optional', note: items.length ? `По желанию. Есть: ${itemsText}` : 'По желанию' };
  }
}

export const RecipeView = {
  id: 'recipe',
  title: 'Рецепт',
  mount(root, params) {
    d.root = root; d.id = params[0];
    const r = St.getRecipe(d.id);
    if (!r) {
      root.innerHTML = `<section class="view"><div class="empty"><h3>Рецепт не найден</h3><p>Возможно, он был удалён.</p><div class="btns"><a class="btn btn-primary" href="#/recipes">К рецептам</a></div></div></section>`;
      return;
    }
    document.title = `${r.title} — Кладовая`;
    d.servings = r.servings;
    root.innerHTML = `<section class="view recipe-page" data-recipe></section>`;
    bindDetail(root);
    this.update({});
    window.scrollTo(0, 0);
  },
  update() {
    const r = St.getRecipe(d.id); if (!r || !d.root) return;
    const mult = d.servings / r.servings;
    const ev = St.evaluate(r, mult);
    const cooked = St.S.cooked[r.id];
    const missingRows = ev.rows.filter(x => !x.optional && (x.state === 'missing' || x.state === 'short'));
    const el = d.root.querySelector('[data-recipe]');
    el.innerHTML = `
      <button class="btn btn-quiet r-back" data-act="back">${icon('back')}Рецепты</button>
      <div class="r-hero">
        ${U.cover(r)}
        <div>
          <h1>${esc(r.title)}</h1>
          <p class="r-desc">${esc(r.description || '')}</p>
          <div class="r-facts">
            <div><b>${esc(U.fmtTime(r.time))}</b><span>Время</span></div>
            <div><b class="serv"><button data-act="serv-dec" aria-label="Меньше порций">${icon('minus')}</button><span class="num" style="min-width:24px;text-align:center">${d.servings}</span><button data-act="serv-inc" aria-label="Больше порций">${icon('plus')}</button></b><span>${U.plural(d.servings, ['Порция', 'Порции', 'Порций'])}</span></div>
            <div><b>${esc(U.DIFF[r.difficulty] || '')}</b><span>Сложность</span></div>
            ${r.kcal ? `<div><b>≈ ${r.kcal}</b><span>ккал на порцию</span></div>` : ''}
          </div>
          <p class="muted" style="font-size:13px;margin:10px 0 0">${esc((r.categories || []).slice(0, 5).join(', '))}${cooked ? `. Готовили ${cooked.count} ${U.plural(cooked.count, ['раз', 'раза', 'раз'])}, последний — ${U.fmtDate(cooked.last)}` : ''}${r.custom ? '. Ваш рецепт' : ''}</p>
        </div>
      </div>
      <div class="r-summary ${ev.missing === 0 ? 'ok' : 'miss'}">
        <p>${ev.missing === 0
          ? (St.S.inventory.length ? `<b>Можно приготовить.</b> Все обязательные продукты есть дома в нужном количестве.` : 'Добавьте продукты в запасы, чтобы проверить, хватает ли всего.')
          : `<b>${esc(C.recipeStatusLabel(ev))}:</b> ${esc(missingRows.map(x => x.ing.name.toLowerCase()).join(', '))}. Совпадение с запасами ${ev.percent}%.`}</p>
        ${missingRows.length ? `<button class="btn btn-sm" data-act="add-missing">${icon('cart')}Добавить недостающее в список</button>` : ''}
      </div>
      <div class="r-cook-bar">
        <button class="btn btn-primary btn-lg" data-act="cook">${icon('chef')}Я приготовил это блюдо</button>
        ${r.custom ? `<button class="btn" data-act="edit">${icon('edit')}Изменить</button><button class="btn btn-danger" data-act="delete">${icon('trash')}Удалить</button>` : ''}
      </div>
      <div class="r-cols">
        <div>
          <h2 class="r-h2">Ингредиенты <span class="muted" style="font:400 14px var(--font)">на ${d.servings} ${U.plural(d.servings, ['порцию', 'порции', 'порций'])}</span></h2>
          <ul class="ing-list">
            ${ev.rows.map((row, i) => {
              const info = rowInfo(row);
              return `<li class="ing ${info.cls}" data-i="${i}">
                <span class="mark">${info.cls === 'have' ? icon('check') : info.cls === 'short' ? icon('minus') : ''}</span>
                <span class="ing-name">${esc(row.ing.name)}${row.ing.note ? ` <span class="muted" style="font-weight:400">(${esc(row.ing.note)})</span>` : ''}</span>
                <span class="ing-amt">${esc(ingLabelAmount(row.ing, mult))}</span>
                <span class="ing-note">${esc(info.note)}${info.btn ? ` <button class="btn btn-sm" data-act="need" data-i="${i}">${icon('cart')}${esc(info.btn)}</button>` : ''}</span>
              </li>`;
            }).join('')}
          </ul>
        </div>
        <div>
          <h2 class="r-h2">Приготовление</h2>
          <ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        </div>
      </div>`;
  },
};

function bindDetail(root) {
  root.addEventListener('click', async e => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const r = St.getRecipe(d.id); if (!r) return;
    const mult = d.servings / r.servings;
    switch (a.dataset.act) {
      case 'back': if ((sessionStorage.getItem('k-prevRoute') || '').startsWith('#/recipes')) history.back(); else location.hash = '#/recipes'; break;
      case 'serv-inc': d.servings = Math.min(40, d.servings + 1); RecipeView.update(); break;
      case 'serv-dec': d.servings = Math.max(1, d.servings - 1); RecipeView.update(); break;
      case 'need': {
        const ev = St.evaluate(r, mult);
        const row = ev.rows[+a.dataset.i];
        const res = St.addRecipeNeedToShopping(row, mult);
        if (res) U.toast(res.merged ? `${res.entry.name}: количество в списке увеличено` : `${res.entry.name} — в списке покупок`, { action: { label: 'Открыть список', fn: () => { location.hash = '#/shopping'; } } });
        break;
      }
      case 'add-missing': {
        const ev = St.evaluate(r, mult);
        let n = 0;
        for (const row of ev.rows) if (!row.optional && (row.state === 'missing' || row.state === 'short')) { if (St.addRecipeNeedToShopping(row, mult)) n++; }
        U.toast(`Добавлено в список покупок: ${n}`, { action: { label: 'Открыть список', fn: () => { location.hash = '#/shopping'; } } });
        break;
      }
      case 'cook': cookSheet(r, mult); break;
      case 'edit': recipeEditor(r); break;
      case 'delete':
        if (await U.confirmDialog(`Удалить рецепт «${r.title}»?`, { ok: 'Удалить', danger: true })) { St.deleteCustomRecipe(r.id); U.toast('Рецепт удалён'); location.hash = '#/recipes'; }
        break;
    }
  });
}

/* ---------- «Я приготовил это блюдо»: предварительный список списания ---------- */
function cookSheet(recipe, mult) {
  const { plan } = St.planCooking(recipe, mult);
  const rows = plan.map(p => ({ ...p }));
  const deduct = rows.filter(p => p.item && p.units > 0);
  const lacks = rows.filter(p => p.lack);
  const body = !St.S.inventory.length
    ? `<p>В запасах пока нет продуктов — списывать нечего. Блюдо будет отмечено как приготовленное.</p>`
    : `<p class="muted" style="margin:0">Проверьте, что спишется из запасов. Снимите галочку, если продукт брали не из дома или использовали меньше.</p>
      <div>${rows.map((p, i) => {
        if (p.lack) return `<div class="plan-row lack"><span></span><span class="p-name">${esc(p.ing.name)}</span><span class="p-amt">—</span><span class="p-meta">Не хватает ${esc(C.fmtRecipeAmount(p.lack.amount, p.lack.unit))}: спишется только то, что есть</span></div>`;
        if (!p.item || !(p.units > 0)) return '';
        const im = C.itemMeasure(p.item);
        const eq = im && im.m !== 'pc' && !C.isLoose(p.item) ? ` (≈ ${C.fmtMeasure(p.units * im.per, im.m === 'g' ? 'г' : 'мл')})` : '';
        const left = Math.max(0, p.item.qty - p.units);
        return `<label class="plan-row"><input type="checkbox" data-i="${i}" ${p.include ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--spruce)">
          <span class="p-name">${esc(p.item.name)}${p.optional ? ' <span class="muted" style="font-weight:400">по желанию</span>' : ''}</span>
          <span class="p-amt">−${esc(C.fmtUnits(p.item, p.units))}${esc(eq)}</span>
          <span class="p-meta">${esc(p.ing.name)}: останется ${esc(C.fmtUnits(p.item, left))}${p.note ? '. ' + esc(p.note) : ''}</span></label>`;
      }).join('')}</div>
      ${!deduct.length ? '<p class="muted">Для этого рецепта в запасах ничего не найдено.</p>' : ''}
      ${lacks.length ? `<div class="notice warn">Некоторых продуктов не хватает. Остатки станут нулевыми, а сами продукты попадут в список покупок.</div>` : ''}`;
  U.openSheet({
    title: 'Списать продукты',
    wide: true,
    body,
    foot: `<button class="btn" data-close>Отмена</button><button class="btn btn-primary" data-ok>${icon('check')}Подтвердить списание</button>`,
    onMount: api => {
      api.body.addEventListener('change', e => { const c = e.target.closest('[data-i]'); if (c) rows[+c.dataset.i].include = c.checked; });
      api.foot.querySelector('[data-ok]').addEventListener('click', () => {
        const snap = St.snapshot();
        const n = St.applyCooking(recipe, rows);
        api.close();
        U.undoToast(n ? `Готово! Списано продуктов: ${n}. Остатки и список покупок обновлены` : 'Блюдо отмечено как приготовленное', snap);
      });
    },
  });
}

/* ---------- свой рецепт ---------- */
const TYPES = ['Завтрак', 'Каша', 'Суп', 'Салат', 'Горячее', 'Паста', 'Гарнир', 'Закуска', 'Выпечка', 'Десерт', 'Напиток', 'Соус', 'Заготовка'];
const TYPE_CATS = { 'Суп': ['Супы', 'Обеды'], 'Салат': ['Салаты'], 'Горячее': ['Горячие блюда', 'Обеды', 'Ужины'], 'Паста': ['Горячие блюда', 'Обеды', 'Ужины'], 'Гарнир': ['Гарниры'], 'Выпечка': ['Выпечка'], 'Десерт': ['Десерты'], 'Закуска': ['Закуски'], 'Завтрак': ['Завтраки'], 'Каша': ['Завтраки'], 'Напиток': ['Напитки'], 'Соус': ['Соусы и заготовки'], 'Заготовка': ['Соусы и заготовки'] };

function computeKcal(ings, servings) {
  let kcal = 0, known = 0, total = 0;
  for (const ing of ings) {
    if (ing.optional || ing.qty == null || !ing.key) continue;
    total++;
    const info = St.S.tax.info(ing.key); if (!info) continue;
    const need = C.recipeNeed(ing.qty, ing.unit, { density: info.density || 1, pieceWeight: info.pieceWeight || 0 });
    if (!need) continue;
    const g = need.m === 'g' ? need.amount : need.m === 'ml' ? need.amount * (info.density || 1) : info.pieceWeight ? need.amount * info.pieceWeight : null;
    if (g == null) continue;
    known++; kcal += g * info.kcal / 100;
  }
  return total && known / total >= 0.7 ? Math.round(kcal / Math.max(1, servings) / 5) * 5 : null;
}

export function recipeEditor(existing = null) {
  const r = existing || { title: '', type: 'Горячее', time: 30, difficulty: 1, servings: 4, description: '', ingredients: [], steps: [], categories: [] };
  const ingText = r.ingredients.map(i => `${i.name}${i.qty != null ? ` ${C.fmtNum(i.qty)} ${C.RECIPE_UNIT_LABEL[i.unit] || i.unit}` : ' по вкусу'}`).join('\n');
  const cats = St.S.recipeCategories;
  U.openSheet({
    title: existing ? 'Изменить рецепт' : 'Свой рецепт',
    wide: true,
    body: `
      <label class="field"><span>Название</span><input class="input" data-f="title" value="${esc(r.title)}" placeholder="Например, Бабушкины сырники"></label>
      <div class="grid-3">
        <label class="field"><span>Тип блюда</span><select class="input" data-f="type">${TYPES.map(t => `<option${t === r.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field"><span>Время, минут</span><input class="input" type="number" min="1" data-f="time" value="${r.time}"></label>
        <label class="field"><span>Порций</span><input class="input" type="number" min="1" data-f="servings" value="${r.servings}"></label>
      </div>
      <div class="grid-2">
        <label class="field"><span>Сложность</span><select class="input" data-f="difficulty"><option value="1"${r.difficulty === 1 ? ' selected' : ''}>Легко</option><option value="2"${r.difficulty === 2 ? ' selected' : ''}>Средне</option><option value="3"${r.difficulty === 3 ? ' selected' : ''}>Сложно</option></select></label>
        <label class="field"><span>Фото блюда <span class="muted">— ссылка или имя файла в папке сайта</span></span><input class="input" data-f="image" value="${esc(r.image || '')}" placeholder="syrniki.jpg"></label>
      </div>
      <label class="field"><span>Описание</span><input class="input" data-f="description" value="${esc(r.description || '')}" placeholder="Пара слов о блюде"></label>
      <div class="field"><span class="field-label">Разделы</span><div class="chips" style="flex-wrap:wrap">${cats.map(c => `<label class="chip"><input type="checkbox" value="${esc(c)}" data-cat ${(r.categories || []).includes(c) ? 'checked' : ''} style="margin-right:6px;accent-color:var(--spruce)">${esc(c)}</label>`).join('')}</div></div>
      <label class="field"><span>Ингредиенты — по одному в строке</span><textarea class="input" data-f="ings" rows="7" placeholder="Творог 500 г&#10;Яйца 1 шт&#10;Мука 4 ст. л.&#10;Соль по вкусу">${esc(ingText)}</textarea><small>Формат: название, количество, единица (г, кг, мл, л, шт, ст. л., ч. л., стакан, зубчик, пучок). «По вкусу» — необязательный ингредиент.</small></label>
      <div class="preview" data-prev></div>
      <label class="field"><span>Шаги — по одному в строке</span><textarea class="input" data-f="steps" rows="6" placeholder="Разомните творог&#10;Добавьте яйцо и муку">${esc(r.steps.join('\n'))}</textarea></label>`,
    foot: `<button class="btn" data-close>Отмена</button><button class="btn btn-primary" data-save>${icon('check')}Сохранить рецепт</button>`,
    onMount: api => {
      const f = n => api.body.querySelector(`[data-f="${n}"]`);
      const parse = () => f('ings').value.split('\n').map(l => C.parseIngredientLine(l, St.S.tax)).filter(Boolean);
      const prev = () => {
        const ings = parse();
        api.body.querySelector('[data-prev]').innerHTML = ings.length
          ? ings.map(i => `${i.key ? '<b>✓</b>' : '<span style="color:var(--berry)">?</span>'} ${esc(i.name)}${i.qty != null ? ` — ${esc(C.fmtRecipeAmount(i.qty, i.unit))}` : ' — по вкусу'}${i.key ? ` <span class="muted">(${esc(i.key)})</span>` : ' <span class="muted">(не связан с запасами)</span>'}`).join('<br>')
          : 'Здесь появится разбор ингредиентов: что связано с вашими запасами.';
      };
      f('ings').addEventListener('input', prev); prev();
      api.foot.querySelector('[data-save]').addEventListener('click', () => {
        const title = f('title').value.trim();
        const ingredients = parse();
        const steps = f('steps').value.split('\n').map(s => s.trim()).filter(Boolean);
        if (!title) { U.toast('Введите название рецепта'); f('title').focus(); return; }
        if (!ingredients.length) { U.toast('Добавьте хотя бы один ингредиент'); f('ings').focus(); return; }
        if (!steps.length) { U.toast('Опишите хотя бы один шаг'); f('steps').focus(); return; }
        const type = f('type').value, time = Math.max(1, +f('time').value || 30), servings = Math.max(1, +f('servings').value || 1);
        const chosen = [...api.body.querySelectorAll('[data-cat]:checked')].map(c => c.value);
        const catsSet = new Set([...(TYPE_CATS[type] || []), ...chosen]);
        if (time <= 30) catsSet.add('Быстрые блюда');
        const mainIng = ingredients.find(i => i.key && !St.S.settings.staples.includes(i.key));
        const saved = St.saveCustomRecipe({
          id: existing?.id, title, type, time, servings, difficulty: +f('difficulty').value, description: f('description').value.trim(),
          image: f('image').value.trim() || undefined, ingredients, steps, categories: [...catsSet], main: 'Другое', mainKey: mainIng?.key || null,
          kcal: computeKcal(ingredients, servings),
        });
        api.close();
        U.toast(existing ? 'Рецепт сохранён' : 'Рецепт добавлен в библиотеку');
        location.hash = `#/recipe/${saved.id}`;
      });
    },
  });
}
