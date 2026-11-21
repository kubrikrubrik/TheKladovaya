// core.js — логика «Кладовой» без привязки к интерфейсу.
// Нормализация текста, сопоставление продуктов с ингредиентами, единицы измерения,
// статусы запасов, рекомендации к покупке, подбор рецептов, план списания, быстрый ввод, поиск.

export const EPS = 1e-6;

/* ---------- Текст ---------- */

const STOP = new Set(['в', 'во', 'с', 'со', 'и', 'на', 'для', 'по', 'из', 'без', 'от', 'к', 'а', 'или', 'у', 'за', 'до', 'шт', 'г', 'гр', 'кг', 'мл', 'л']);

export function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`’()\[\]{}!?:;\/\\|+*#№]/g, ' ')
    .replace(/[^a-zа-я0-9%.,\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ENDINGS = ['иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'иях', 'ях', 'ах', 'ую', 'юю', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ой', 'ей', 'ий', 'ый', 'ом', 'ем', 'ам', 'ям', 'ов', 'ев', 'ия', 'ье', 'ья', 'ь', 'ы', 'и', 'а', 'я', 'о', 'е', 'у', 'ю', 'й'];

const STEM_FIX = { 'салями': 'салями', 'печенье': 'печенье', 'печенья': 'печенье', 'печеньем': 'печенье', 'печеньки': 'печенье', 'пюре': 'пюре', 'какао': 'какао', 'кофе': 'кофе', 'филе': 'филе', 'кешью': 'кешью', 'киви': 'киви', 'саше': 'саше', 'карри': 'карри', 'чили': 'чили', 'суши': 'суши', 'соба': 'соба', 'тофу': 'тофу', 'песто': 'песто', 'манго': 'манго', 'авокадо': 'авокадо' };

export function stem(w) {
  if (STEM_FIX[w]) return STEM_FIX[w];
  if (w.length <= 3 || /[0-9]/.test(w)) return w;
  for (const e of ENDINGS) {
    if (w.endsWith(e) && w.length - e.length >= 3) return w.slice(0, -e.length);
  }
  return w;
}

export function words(s) {
  return norm(s).replace(/[.,\-]/g, ' ').split(' ').filter(w => w && !STOP.has(w) && !/^\d+([.,]\d+)?%?$/.test(w));
}

const EN2RU = { q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з', '[': 'х', ']': 'ъ', a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д', ';': 'ж', "'": 'э', z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь', ',': 'б', '.': 'ю', '`': 'ё' };
export function fixLayout(s) {
  return String(s).toLowerCase().split('').map(ch => EN2RU[ch] ?? ch).join('');
}

export function damerau(a, b, max = 2) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  const d = Array.from({ length: la + 1 }, (_, i) => { const r = new Array(lb + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= lb; j++) d[0][j] = j;
  for (let i = 1; i <= la; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[la][lb];
}

/* ---------- Таксономия ингредиентов ---------- */

export function buildTaxonomy(list) {
  const byKey = new Map();
  const index = new Map(); // stem -> [{key, stems, depth, order}]
  list.forEach((it, order) => byKey.set(it.key, { ...it, order }));
  const depthOf = (k, seen = 0) => {
    const it = byKey.get(k);
    return it && it.parent && seen < 10 ? 1 + depthOf(it.parent, seen + 1) : 0;
  };
  for (const it of byKey.values()) {
    it.depth = depthOf(it.key);
    const phrases = [it.key, ...(it.synonyms || [])];
    for (const ph of phrases) {
      const stems = [...new Set(words(ph).map(stem))];
      if (!stems.length) continue;
      const entry = { key: it.key, stems, depth: it.depth, order: it.order };
      for (const s of stems) {
        if (!index.has(s)) index.set(s, []);
        index.get(s).push(entry);
      }
    }
  }
  const ancCache = new Map();
  function ancestors(k) {
    if (ancCache.has(k)) return ancCache.get(k);
    const out = [];
    let cur = byKey.get(k), guard = 0;
    while (cur && cur.parent && guard++ < 10) { out.push(cur.parent); cur = byKey.get(cur.parent); }
    ancCache.set(k, out);
    return out;
  }
  function match(text) {
    const toks = words(text).map(stem);
    if (!toks.length) return null;
    const set = new Set(toks);
    let best = null;
    const seen = new Set();
    for (const t of toks) {
      for (const e of index.get(t) || []) {
        if (seen.has(e)) continue;
        seen.add(e);
        if (!e.stems.every(s => set.has(s))) continue;
        const pos = toks.indexOf(e.stems[0]);
        if (!best || e.stems.length > best.stems.length ||
          (e.stems.length === best.stems.length && (e.depth > best.depth ||
            (e.depth === best.depth && (pos < best.pos || (pos === best.pos && e.order < best.order)))))) {
          best = { ...e, pos };
        }
      }
    }
    return best ? best.key : null;
  }
  const info = k => byKey.get(k) || null;
  const isA = (child, parent) => child === parent || ancestors(child).includes(parent);
  const label = k => k;
  return { byKey, match, ancestors, info, isA, label, list: [...byKey.values()] };
}

/* ---------- Единицы ---------- */

export const UNIT_FORMS = {
  'шт': ['шт', 'шт', 'шт'], 'г': ['г', 'г', 'г'], 'кг': ['кг', 'кг', 'кг'], 'мл': ['мл', 'мл', 'мл'], 'л': ['л', 'л', 'л'],
  'пакетик': ['пакетик', 'пакетика', 'пакетиков'], 'пакет': ['пакет', 'пакета', 'пакетов'],
  'упаковка': ['упаковка', 'упаковки', 'упаковок'], 'пачка': ['пачка', 'пачки', 'пачек'],
  'бутылка': ['бутылка', 'бутылки', 'бутылок'], 'банка': ['банка', 'банки', 'банок'],
  'коробка': ['коробка', 'коробки', 'коробок'], 'плитка': ['плитка', 'плитки', 'плиток'],
  'брикет': ['брикет', 'брикета', 'брикетов'], 'батон': ['батон', 'батона', 'батонов'],
  'буханка': ['буханка', 'буханки', 'буханок'], 'булка': ['булка', 'булки', 'булок'],
  'головка': ['головка', 'головки', 'головок'], 'кочан': ['кочан', 'кочана', 'кочанов'],
  'пучок': ['пучок', 'пучка', 'пучков'], 'порция': ['порция', 'порции', 'порций'],
  'капсула': ['капсула', 'капсулы', 'капсул'], 'саше': ['саше', 'саше', 'саше'],
  'стаканчик': ['стаканчик', 'стаканчика', 'стаканчиков'], 'бутылочка': ['бутылочка', 'бутылочки', 'бутылочек'],
  'баночка': ['баночка', 'баночки', 'баночек'], 'ломтик': ['ломтик', 'ломтика', 'ломтиков'],
  'лоток': ['лоток', 'лотка', 'лотков'], 'кусок': ['кусок', 'куска', 'кусков'],
  'тюбик': ['тюбик', 'тюбика', 'тюбиков'], 'брусок': ['брусок', 'бруска', 'брусков'],
  'сетка': ['сетка', 'сетки', 'сеток'], 'лист': ['лист', 'листа', 'листов'],
  'тушка': ['тушка', 'тушки', 'тушек'], 'штука': ['штука', 'штуки', 'штук'],
  'зубчик': ['зубчик', 'зубчика', 'зубчиков'], 'стакан': ['стакан', 'стакана', 'стаканов'],
  'ст. л.': ['ст. л.', 'ст. л.', 'ст. л.'], 'ч. л.': ['ч. л.', 'ч. л.', 'ч. л.'],
  'щепотка': ['щепотка', 'щепотки', 'щепоток'], 'веточка': ['веточка', 'веточки', 'веточек'],
  'долька': ['долька', 'дольки', 'долек'], 'кубик': ['кубик', 'кубика', 'кубиков'],
};
export const INNER_UNITS = ['шт', 'пакетик', 'упаковка', 'пачка', 'бутылка', 'банка', 'коробка', 'плитка', 'брикет', 'батон', 'буханка', 'булка', 'головка', 'кочан', 'пучок', 'порция', 'капсула', 'саше', 'стаканчик', 'бутылочка', 'баночка', 'лоток', 'кусок', 'тюбик', 'брусок', 'сетка', 'лист', 'тушка', 'пакет', 'г', 'мл'];
export const PACK_NAMES = ['упаковка', 'коробка', 'пачка', 'лоток', 'пакет', 'сетка', 'блок'];

export function pluralIdx(n) {
  if (Math.abs(n - Math.round(n)) > EPS) return 1;
  const a = Math.abs(Math.round(n)) % 100, b = a % 10;
  if (a > 10 && a < 20) return 2;
  if (b === 1) return 0;
  if (b >= 2 && b <= 4) return 1;
  return 2;
}
export function unitWord(unit, n) {
  const f = UNIT_FORMS[unit] || (unit === 'блок' ? ['блок', 'блока', 'блоков'] : null);
  return f ? f[pluralIdx(n)] : unit;
}
export function plural(n, forms) { return forms[pluralIdx(n)]; }

export function fmtNum(n, maxFrac = 2) {
  if (n == null || isNaN(n)) return '';
  const r = Math.round(n * 10 ** maxFrac) / 10 ** maxFrac;
  const s = Math.abs(r) >= 1000 && Number.isInteger(r) ? r.toLocaleString('ru-RU') : String(r).replace('.', ',');
  return s.replace(/ /g, ' ');
}

export function fmtMeasure(amount, measure) {
  if (measure === 'г') return amount >= 1000 ? `${fmtNum(amount / 1000, 2)} кг` : `${fmtNum(amount, 0)} г`;
  if (measure === 'мл') return amount >= 1000 ? `${fmtNum(amount / 1000, 2)} л` : `${fmtNum(amount, 0)} мл`;
  return `${fmtNum(amount)} шт`;
}

// Рецептурные единицы -> базовая мера
const RECIPE_UNITS = {
  'г': ['g', 1], 'гр': ['g', 1], 'кг': ['g', 1000], 'мг': ['g', 0.001],
  'мл': ['ml', 1], 'л': ['ml', 1000],
  'ст.л.': ['ml', 15], 'ст': ['ml', 15], 'ст. л.': ['ml', 15],
  'ч.л.': ['ml', 5], 'ч': ['ml', 5], 'ч. л.': ['ml', 5],
  'стакан': ['ml', 200], 'стак': ['ml', 200],
  'шт': ['pc', 1], 'зуб': ['g', 5], 'зубчик': ['g', 5], 'пучок': ['g', 30], 'пуч': ['g', 30],
  'щепотка': ['g', 1], 'щеп': ['g', 1], 'веточка': ['g', 2], 'ломтик': ['g', 20], 'долька': ['pc', 0.125],
  'банка': ['pc', 1], 'упаковка': ['pc', 1], 'пачка': ['pc', 1], 'лист': ['pc', 1], 'кубик': ['g', 10],
};
export const RECIPE_UNIT_LABEL = {
  'г': 'г', 'кг': 'кг', 'мл': 'мл', 'л': 'л', 'ст.л.': 'ст. л.', 'ч.л.': 'ч. л.', 'стакан': 'стакан',
  'шт': 'шт', 'зуб': 'зубчик', 'пучок': 'пучок', 'щепотка': 'щепотка', 'веточка': 'веточка',
  'ломтик': 'ломтик', 'долька': 'долька', 'банка': 'банка', 'упаковка': 'упаковка', 'пачка': 'пачка', 'лист': 'лист', 'кубик': 'кубик',
};
const M2RU = { g: 'г', ml: 'мл', pc: 'шт' };
const RU2M = { 'г': 'g', 'мл': 'ml', 'шт': 'pc' };

function convertMeasure(amount, from, to, keyInfo) {
  if (from === to) return amount;
  const d = keyInfo?.density || 1;
  const pw = keyInfo?.pieceWeight || 0;
  if (from === 'ml' && to === 'g') return amount * d;
  if (from === 'g' && to === 'ml') return amount / d;
  if (from === 'pc' && to === 'g') return pw ? amount * pw : null;
  if (from === 'g' && to === 'pc') return pw ? amount / pw : null;
  if (from === 'pc' && to === 'ml') return pw ? amount * pw / d : null;
  if (from === 'ml' && to === 'pc') return pw ? amount * d / pw : null;
  return null;
}

export function recipeNeed(qty, unit, keyInfo) {
  if (qty == null || !unit) return null;
  const u = RECIPE_UNITS[unit];
  if (!u) return null;
  return { amount: qty * u[1], m: u[0] };
}

/* ---------- Позиции запасов ---------- */
// item: { id, name, brand, category, key, unit, perPack, size, measure, qty, min, target, ... }
// qty — количество во «внутренних» единицах (unit). size+measure — содержимое одной единицы.

export function isLoose(item) { return item.unit === 'г' || item.unit === 'мл'; }

export function itemStep(item) {
  if (isLoose(item)) return item.step || 100;
  return 1;
}

export function itemMeasure(item) {
  if (isLoose(item)) return { m: RU2M[item.unit], per: 1 };
  if (item.measure && item.size > 0) return { m: RU2M[item.measure], per: +item.size };
  if (item.unit === 'шт' || item.unit === 'штука') return { m: 'pc', per: 1 };
  return null;
}

export function itemAmountIn(item, m, keyInfo) {
  const im = itemMeasure(item);
  if (!im) return null;
  const base = Math.max(0, +item.qty || 0) * im.per;
  return convertMeasure(base, im.m, m, keyInfo);
}

export function unitsFor(item, amount, m, keyInfo) {
  const im = itemMeasure(item);
  if (!im) return null;
  const inItemMeasure = convertMeasure(amount, m, im.m, keyInfo);
  if (inItemMeasure == null) return null;
  return inItemMeasure / im.per;
}

export function status(item) {
  const q = +item.qty || 0, min = +item.min || 0;
  if (q <= EPS) return 'out';
  if (min > 0 && q <= min + EPS) return 'low';
  return 'ok';
}
export const STATUS_LABEL = { ok: 'Достаточно', low: 'Заканчивается', out: 'Закончилось' };

export function fmtUnits(item, n) {
  if (isLoose(item)) return fmtMeasure(n, item.unit);
  return `${fmtNum(n)} ${unitWord(item.unit, n)}`;
}

function it_hasSize(item) { return item.size > 0 && item.measure && item.measure !== 'шт'; }
export function fmtQty(item) {
  const q = Math.max(0, +item.qty || 0);
  const per = +item.perPack || 1;
  const main = fmtUnits(item, q);
  let sub = '';
  if (!isLoose(item)) {
    const im = itemMeasure(item);
    const packWord = item.packName || 'упаковка';
    if (per > 1 && q > EPS) {
      const full = Math.floor(q / per + EPS);
      const rest = Math.round((q - full * per) * 100) / 100;
      const parts = [];
      if (full > 0) parts.push(`${full} ${unitWord(packWord, full)} по ${per}`);
      if (rest > EPS) parts.push(full > 0 ? `ещё ${fmtUnits(item, rest)}` : `начатая ${packWord}`);
      sub = parts.join(' и ');
    }
    if (im && im.m !== 'pc' && q > EPS && it_hasSize(item)) {
      const tot = fmtMeasure(q * im.per, M2RU[im.m]);
      sub = sub ? `${sub}, всего ${tot}` : (Math.abs(q - Math.round(q)) > EPS ? `≈ ${tot}` : `по ${fmtMeasure(im.per, M2RU[im.m])}`);
    }
  }
  return { main, sub };
}

export function packLabel(p) {
  // p: { unit, perPack, size, measure }
  const per = +p.perPack || 1;
  const size = p.size && p.measure && p.measure !== 'шт' ? fmtMeasure(+p.size, p.measure) : '';
  if (p.unit === 'г' || p.unit === 'мл') return per > 1 ? fmtMeasure(per, p.unit) : 'на вес';
  if (per > 1) return size ? `${per} ${unitWord(p.unit, per)} по ${size}` : `${per} ${unitWord(p.unit, per)}`;
  return size || unitWord(p.unit, 1);
}

// Рекомендация к покупке во внутренних единицах (и упаковках, если они есть)
export function recommend(item) {
  const q = Math.max(0, +item.qty || 0), min = +item.min || 0, target = +item.target || 0;
  const per = +item.perPack > 1 ? +item.perPack : 0;
  const step = itemStep(item);
  const goal = target > 0 ? Math.max(target, min) : min;
  let deficit = Math.max(0, goal - q);
  let units;
  if (per) {
    const packs = Math.max(1, Math.ceil((deficit - EPS) / per));
    units = packs * per;
    return { units, packs, deficit, toMin: Math.max(0, min - q), mode: 'pack' };
  }
  units = Math.max(step, Math.ceil((deficit - EPS) / step) * step);
  return { units, packs: 0, deficit, toMin: Math.max(0, min - q), mode: 'unit' };
}

/* ---------- Подбор рецептов ---------- */

export function buildStockIndex(inventory, tax) {
  const byKey = new Map();
  for (const it of inventory) {
    if (!it.key || !(+it.qty > EPS)) continue;
    const keys = [it.key, ...tax.ancestors(it.key)];
    for (const k of keys) {
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(it);
    }
  }
  return byKey;
}

function keyInfoOf(tax, key) {
  const i = tax.info(key);
  return i ? { density: i.density || 1, pieceWeight: i.pieceWeight || 0 } : { density: 1, pieceWeight: 0 };
}

export function fmtRecipeAmount(amount, unit) {
  const lbl = RECIPE_UNIT_LABEL[unit] || unit;
  if (['стакан', 'зуб', 'пучок', 'щепотка', 'веточка', 'ломтик', 'долька', 'банка', 'упаковка', 'пачка', 'лист', 'кубик'].includes(unit)) {
    const forms = UNIT_FORMS[lbl];
    return `${fmtNum(amount)} ${forms ? forms[pluralIdx(amount)] : lbl}`;
  }
  if (unit === 'г' && amount >= 1000) return `${fmtNum(amount / 1000)} кг`;
  if (unit === 'мл' && amount >= 1000) return `${fmtNum(amount / 1000)} л`;
  return `${fmtNum(amount)} ${lbl}`;
}

export function evaluateRecipe(recipe, ctx, mult = 1) {
  const { tax, stock, staples } = ctx;
  const rows = [];
  let required = 0, have = 0, short = 0;
  for (const ing of recipe.ingredients) {
    const keys = Array.isArray(ing.key) ? ing.key : (ing.key ? [ing.key] : []);
    const row = { ing, keys, state: 'missing', items: [], shortBy: null };
    const isStaple = keys.some(k => staples.has(k));
    let cands = [];
    for (const k of keys) for (const it of stock.get(k) || []) if (!cands.includes(it)) cands.push(it);
    row.items = cands;
    if (isStaple && !cands.length) { row.state = 'staple'; rows.push(row); continue; }
    if (!keys.length) { row.state = ing.optional ? 'optional' : 'staple'; rows.push(row); continue; }
    if (!cands.length) row.state = 'missing';
    else {
      const need = recipeNeed(ing.qty != null ? ing.qty * mult : null, ing.unit, keyInfoOf(tax, keys[0]));
      if (!need) row.state = 'have';
      else {
        let avail = 0, unknown = false;
        for (const it of cands) {
          const a = itemAmountIn(it, need.m, keyInfoOf(tax, it.key));
          if (a == null) { unknown = true; break; }
          avail += a;
        }
        if (unknown || avail + EPS >= need.amount * 0.999) row.state = 'have';
        else {
          row.state = 'short';
          const lack = need.amount - avail;
          const per = RECIPE_UNITS[ing.unit][1];
          row.shortBy = { amount: Math.ceil((lack / per) * 10) / 10, unit: ing.unit };
          row.avail = { amount: avail, m: need.m };
        }
      }
    }
    if (isStaple && row.state !== 'have') row.state = 'staple';
    if (ing.optional) { row.optional = true; rows.push(row); continue; }
    if (row.state === 'staple') { rows.push(row); continue; }
    required++;
    if (row.state === 'have') have++;
    else if (row.state === 'short') short++;
    rows.push(row);
  }
  const missing = required - have;
  const percent = required ? Math.round(100 * (have + short * 0.5) / required) : 100;
  return { rows, required, have, short, missing, percent, cookable: missing === 0 };
}

export function recipeStatusLabel(ev) {
  if (ev.missing === 0) return 'Можно приготовить';
  if (ev.missing === 1) return 'Не хватает 1 продукта';
  return `Не хватает ${ev.missing} ${plural(ev.missing, ['продукта', 'продуктов', 'продуктов'])}`;
}

// План списания после приготовления
export function cookPlan(recipe, ctx, mult = 1) {
  const ev = evaluateRecipe(recipe, ctx, mult);
  const plan = [];
  for (const row of ev.rows) {
    if (!row.items.length) continue;
    if (row.state === 'staple' && !row.items.length) continue;
    const ing = row.ing;
    const keyInfo = keyInfoOf(ctx.tax, row.keys[0]);
    const need = recipeNeed(ing.qty != null ? ing.qty * mult : null, ing.unit, keyInfo);
    // Порядок: точное совпадение ключа, начатые упаковки, меньший остаток
    const items = [...row.items].sort((a, b) => {
      const ea = row.keys.includes(a.key) ? 0 : 1, eb = row.keys.includes(b.key) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const fa = Math.abs(a.qty - Math.round(a.qty)) > EPS ? 0 : 1, fb = Math.abs(b.qty - Math.round(b.qty)) > EPS ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.qty - b.qty;
    });
    if (!need) {
      // Без количества («по вкусу») — ничего не списываем, но показываем
      plan.push({ ing, item: items[0], units: 0, note: 'по вкусу — не списывается', include: false, optional: !!ing.optional });
      continue;
    }
    let left = need.amount;
    for (const it of items) {
      if (left <= EPS) break;
      const ki = keyInfoOf(ctx.tax, it.key);
      const avail = itemAmountIn(it, need.m, ki);
      let units;
      if (avail == null) {
        // Неизвестный вес: списываем 1 единицу, если рецепт в штуках, иначе предлагаем 1 единицу
        units = need.m === 'pc' ? Math.min(it.qty, Math.ceil(left)) : Math.min(it.qty, 1);
        plan.push({ ing, item: it, units, note: 'количество не удалось пересчитать — проверьте', include: !ing.optional, optional: !!ing.optional });
        left = 0;
        break;
      }
      const take = Math.min(avail, left);
      units = unitsFor(it, take, need.m, ki);
      if (units == null) continue;
      units = Math.round(units * 100) / 100;
      if (units <= EPS) continue;
      plan.push({ ing, item: it, units, include: !ing.optional, optional: !!ing.optional });
      left -= take;
    }
    if (left > EPS * 10 && row.state !== 'staple') {
      const per = RECIPE_UNITS[ing.unit]?.[1] || 1;
      plan.push({ ing, item: null, units: 0, lack: { amount: Math.ceil(left / per * 10) / 10, unit: ing.unit }, include: false, optional: !!ing.optional });
    }
  }
  return { ev, plan };
}

/* ---------- Быстрый ввод: «Молоко 2 шт» ---------- */

const QUICK_UNIT = [
  [/^(шт|штук[аи]?|штуки)$/, 'шт'],
  [/^(уп|упак|упаковк[аиу]|упаковок|пач|пачк[аи]|пачек|кор|коробк[аи]|коробок)$/, 'уп'],
  [/^(пак|пакетик[аов]*|пакет[аов]*)$/, 'пак'],
  [/^(бут|бутыл|бутылк[аи]|бутылок)$/, 'бут'],
  [/^(бан|банк[аи]|банок)$/, 'бан'],
  [/^(кг|килограмм[аов]*|кило)$/, 'кг'],
  [/^(г|гр|грамм[аов]*)$/, 'г'],
  [/^(л|литр[аов]*)$/, 'л'],
  [/^(мл|миллилитр[аов]*)$/, 'мл'],
];
export function parseQuick(text) {
  let s = String(text || '').trim().replace(/ё/g, 'е');
  if (!s) return null;
  let qty = null, unit = null;
  const re = /(?:^|\s)[x×х]?\s*(\d+(?:[.,]\d+)?)\s*([a-zа-я]+\.?)?(?=\s|$)/gi;
  let m, found = null;
  while ((m = re.exec(s))) {
    const u = (m[2] || '').toLowerCase().replace(/\.$/, '');
    let mapped = null;
    for (const [rx, val] of QUICK_UNIT) if (rx.test(u)) { mapped = val; break; }
    if (u && !mapped) {
      // Число внутри названия («Молоко 3,2%») пропускаем, если за ним %
      continue;
    }
    found = { index: m.index, len: m[0].length, q: parseFloat(m[1].replace(',', '.')), u: mapped };
  }
  if (found && !/%/.test(s.slice(found.index + found.len, found.index + found.len + 1))) {
    qty = found.q; unit = found.u;
    s = (s.slice(0, found.index) + ' ' + s.slice(found.index + found.len)).replace(/\s+/g, ' ').trim();
  }
  // «пол-литра», «полкило»
  if (qty == null) {
    const half = s.match(/(?:^|\s)пол[\s-]?(литра|кило|килограмма)(?=\s|$)/i);
    if (half) { qty = half[1].startsWith('лит') ? 0.5 : 0.5; unit = half[1].startsWith('лит') ? 'л' : 'кг'; s = s.replace(half[0], ' ').trim(); }
  }
  const name = s.replace(/^[,.\s-]+|[,.\s-]+$/g, '');
  if (!name) return null;
  return { name: name.charAt(0).toUpperCase() + name.slice(1), qty, unit };
}

/* ---------- Поиск по базе продуктов ---------- */

export const BRAND_ALIASES = {
  'makfa': 'макфа', 'barilla': 'барилла', 'coca-cola': 'кока-кола кока кола кола', 'pepsi': 'пепси кола', 'fanta': 'фанта', 'sprite': 'спрайт',
  'nescafe': 'нескафе', 'jacobs': 'якобс', 'lipton': 'липтон', 'greenfield': 'гринфилд', 'heinz': 'хайнц', 'hochland': 'хохланд',
  'danone': 'данон', 'activia': 'активиа', 'alpen gold': 'альпен гольд', 'milka': 'милка', "lay's": 'лейс лейз', 'pringles': 'принглс',
  'president': 'президент', 'mistral': 'мистраль', 'heinz ': 'хайнц', 'calve': 'кальве', 'maggi': 'магги', 'knorr': 'кнорр',
  'kotanyi': 'котани', 'galbani': 'гальбани', 'violette': 'виолетта', 'ehrmann': 'эрманн', 'chudo': 'чудо', 'evervess': 'эвервесс',
  'rich': 'рич', 'j7': 'джей севен', 'kinder': 'киндер', 'oreo': 'орео', 'snickers': 'сникерс', 'twix': 'твикс', 'mars': 'марс',
  'bounty': 'баунти', 'nesquik': 'несквик', 'nestle': 'нестле', 'raffaello': 'рафаэлло', 'ritter sport': 'риттер спорт', 'tess': 'тесс',
  'ahmad tea': 'ахмад', 'richard': 'ричард', 'lavazza': 'лавацца', 'paulig': 'паулиг', 'carte noire': 'карт нуар', 'bonduelle': 'бондюэль',
  'hortex': 'хортекс', 'agroalliance': 'агро-альянс', 'monini': 'монини', 'borges': 'борхес', 'kikkoman': 'киккоман', 'sen soy': 'сэн сой',
  'aro': 'аро', 'fine life': 'файн лайф', 'horeca select': 'хорека', 'global village': 'глобал виллидж', 'baby': 'беби',
  'добрый': 'dobry cola', 'черноголовка': 'chernogolovka', 'bonaqua': 'бонаква', 'aqua minerale': 'аква минерале', 'святой источник': 'svyatoy',
  'jardin': 'жардин', 'nescafe gold': 'нескафе голд', 'barni': 'барни', 'jubilee': 'юбилейное', 'pikador': 'пикадор', 'hellmann': 'хелманс',
  'mr. ricco': 'мистер рикко', 'ryaba': 'ряба', 'lambert': 'ламбер', 'sveza': 'свеза', 'savushkin': 'савушкин', 'vkusvill': 'вкусвилл',
  'perekrestok': 'перекресток', 'pyaterochka': 'пятерочка', 'magnit': 'магнит', 'auchan': 'ашан', 'lenta': 'лента', 'metro': 'метро', 'okey': 'окей',
};

const LAT2RU = [['sch', 'щ'], ['sh', 'ш'], ['ch', 'ч'], ['zh', 'ж'], ['ts', 'ц'], ['ya', 'я'], ['yu', 'ю'], ['kh', 'х'], ['ee', 'и'], ['oo', 'у'], ['ph', 'ф'], ['a', 'а'], ['b', 'б'], ['c', 'к'], ['d', 'д'], ['e', 'е'], ['f', 'ф'], ['g', 'г'], ['h', 'х'], ['i', 'и'], ['j', 'дж'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['q', 'к'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['u', 'у'], ['v', 'в'], ['w', 'в'], ['x', 'кс'], ['y', 'й'], ['z', 'з']];
export function translit(word) {
  let out = '', i = 0;
  const w = word.toLowerCase();
  while (i < w.length) {
    const hit = LAT2RU.find(([l]) => w.startsWith(l, i));
    if (hit) { out += hit[1]; i += hit[0].length; } else { out += w[i]; i++; }
  }
  return out;
}

export function buildSearchIndex(products, tax) {
  return products.map(p => {
    const extra = [];
    const b = (p.brand || '').toLowerCase();
    for (const [k, v] of Object.entries(BRAND_ALIASES)) if (b && (b === k || b.includes(k) || k.includes(b) && b.length > 3)) extra.push(v);
    if (b) for (const [k, v] of Object.entries(BRAND_ALIASES)) if (v.split(' ').some(w => w === b)) extra.push(k);
    const keyInfo = p.key && tax ? tax.info(p.key) : null;
    const keyText = p.key ? [p.key, ...((keyInfo?.synonyms || []).slice(0, 6))].join(' ') : '';
    let primary = norm(`${p.name} ${p.brand || ''} ${extra.join(' ')}`).replace(/[.,]/g, ' ').split(/[\s\-]+/).filter(Boolean);
    primary = [...primary, ...primary.filter(t => /^[a-z]{3,}$/.test(t)).map(translit)];
    const secondary = norm(keyText).replace(/[.,]/g, ' ').split(/[\s\-]+/).filter(Boolean);
    return { p, primary, secondary, pstems: primary.map(stem), sstems: secondary.map(stem), nameN: norm(p.name) };
  });
}

function tokenScore(qt, toks, stems) {
  let best = 0, fuzzy = false, hit = null;
  const qs = stem(qt);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    let s = 0, fz = false;
    if (t === qt) s = 10;
    else if (t.startsWith(qt)) s = 8 - Math.min(2, (t.length - qt.length) / 6);
    else if (stems[i] === qs && qs.length >= 3) s = 7;
    else if (qt.length >= 3 && t.includes(qt)) s = 4.5;
    else if (qt.length >= 4) {
      const max = qt.length >= 7 ? 2 : 1;
      const cmp = t.length > qt.length + 1 ? t.slice(0, qt.length) : t;
      const d = damerau(qt, cmp, max);
      if (d <= max) { s = 4 - d; fz = true; }
      else if (qs.length >= 4 && damerau(qs, stems[i], max) <= max) { s = 3; fz = true; }
    }
    if (s > best) { best = s; fuzzy = fz; hit = t; }
  }
  return { s: best, fuzzy, hit };
}

export function searchProducts(index, query, limit = 40) {
  const run = (q) => {
    const qtoks = norm(q).replace(/[.,]/g, ' ').split(/[\s\-]+/).filter(t => t && !STOP.has(t));
    if (!qtoks.length) return { results: [], fuzzy: false, qtoks };
    const res = [];
    let anyFuzzy = false;
    for (const e of index) {
      let total = 0, fuzzy = false, ok = true;
      const hits = [];
      for (const qt of qtoks) {
        let r = tokenScore(qt, e.primary, e.pstems);
        if (r.s < 4) {
          const r2 = tokenScore(qt, e.secondary, e.sstems);
          if (r2.s > r.s) r = { ...r2, s: r2.s * 0.7 };
        }
        if (r.s <= 0) { ok = false; break; }
        total += r.s; if (r.fuzzy) fuzzy = true; hits.push(r.hit);
      }
      if (!ok) continue;
      if (e.nameN.startsWith(norm(qtoks[0]))) total += 3;
      if (e.p.source === 'user') total += 1;
      total -= e.nameN.length / 200;
      res.push({ p: e.p, score: total, fuzzy, hits });
      if (fuzzy) anyFuzzy = true;
    }
    res.sort((a, b) => b.score - a.score);
    return { results: res.slice(0, limit), fuzzy: anyFuzzy && res.length > 0 && res[0].fuzzy, qtoks, top: res[0] };
  };
  let out = run(query);
  let corrected = null;
  const hasLatin = /[a-z]/i.test(query);
  if (hasLatin && (!out.results.length || out.results[0].score < 8 * out.qtoks.length * 0.6)) {
    const fixed = fixLayout(query);
    const alt = run(fixed);
    if (alt.results.length && (!out.results.length || alt.results[0].score > out.results[0].score)) { out = alt; corrected = fixed; }
  }
  if (!corrected && out.fuzzy && out.top) corrected = out.top.hits.join(' ');
  return { results: out.results, corrected };
}

/* ---------- Прогноз расхода ---------- */
// history: [{t, itemId, units}]
export function consumptionRate(history, itemId, now = Date.now(), days = 28) {
  const from = now - days * 864e5;
  const ev = history.filter(h => h.itemId === itemId && h.t >= from && h.units > 0);
  if (ev.length < 2) return 0;
  const first = Math.min(...ev.map(h => h.t));
  const span = Math.max(7, (now - first) / 864e5);
  return ev.reduce((s, h) => s + h.units, 0) / span;
}

/* ---------- Мелочи ---------- */
export function uid(prefix = 'i') { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
export function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ---------- Разбор строки ингредиента («Молоко 200 мл», «Соль по вкусу») ---------- */
const LINE_UNITS = [
  [/^(г|гр|грамм[аов]*)$/, 'г'], [/^(кг|килограмм[аов]*)$/, 'кг'], [/^(мл|миллилитр[аов]*)$/, 'мл'], [/^(л|литр[аов]*)$/, 'л'],
  [/^(шт|штук[аи]?)$/, 'шт'], [/^(ст\.?л\.?|ст\.?|столов\S*)$/, 'ст.л.'], [/^(ч\.?л\.?|ч\.?|чайн\S*)$/, 'ч.л.'],
  [/^(стакан[аов]*|стак\.?)$/, 'стакан'], [/^(зуб\.?|зубчик[аов]*|зубч\.?)$/, 'зуб'], [/^(пуч\.?|пучок|пучка|пучков)$/, 'пучок'],
  [/^(щепотк[аи]|щеп\.?)$/, 'щепотка'], [/^(банк[аи]|банок)$/, 'банка'], [/^(упаковк[аи]|упак\.?|уп\.?)$/, 'упаковка'], [/^(пачк[аи]|пачек)$/, 'пачка'],
];
export function parseIngredientLine(line, tax) {
  let s = String(line || '').trim().replace(/^[-–•*\d.)\s]+(?=\D)/, '').trim();
  if (!s) return null;
  let optional = /по вкусу|для подачи|по желанию/i.test(s) || s.endsWith('*');
  s = s.replace(/\*$/, '').replace(/[—–-]?\s*(по вкусу|для подачи|по желанию)/ig, '').trim();
  let qty = null, unit = null, name = s;
  const m = s.match(/^(.*?)[\s,—–-]+(\d+(?:[.,]\d+)?(?:\/\d+)?)\s*([a-zа-яё.\s]{0,12})$/i);
  if (m) {
    const u = m[3].trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, '');
    let mapped = u ? null : 'шт';
    for (const [rx, val] of LINE_UNITS) if (rx.test(u)) { mapped = val; break; }
    if (mapped) {
      name = m[1].trim();
      qty = m[2].includes('/') ? (+m[2].split('/')[0] / +m[2].split('/')[1]) : parseFloat(m[2].replace(',', '.'));
      unit = mapped;
    }
  }
  name = name.replace(/[,:—–-]+$/, '').trim();
  const key = tax ? (tax.match(name) || null) : null;
  const ing = { name: name.charAt(0).toUpperCase() + name.slice(1) };
  if (key) ing.key = key;
  if (qty != null && !isNaN(qty)) { ing.qty = qty; ing.unit = unit; } else optional = true;
  if (optional) ing.optional = true;
  return ing;
}
