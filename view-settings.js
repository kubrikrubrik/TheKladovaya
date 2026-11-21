// view-settings.js — резервные копии, хранение данных, «всегда есть дома», категории, сброс.
import * as St from './state.js';
import * as U from './ui.js';
import { categoriesSheet } from './view-products.js';

const { esc, icon } = U;
const v = { root: null };

export const SettingsView = {
  id: 'settings',
  title: 'Настройки',
  mount(root) {
    v.root = root;
    root.innerHTML = `<section class="view"><header class="page-head"><div><h1 class="page-title">Настройки и резервные копии</h1><p class="page-sub">Данные хранятся в этом браузере на этом устройстве</p></div></header><div class="settings-grid" data-body></div></section>`;
    bind(root);
    this.update();
  },
  update() {
    if (!v.root) return;
    const s = St.S.settings;
    const last = s.lastBackup ? U.fmtDate(s.lastBackup) : null;
    const daysSince = s.lastBackup ? Math.floor((Date.now() - s.lastBackup) / 864e5) : null;
    const staples = s.staples || [];
    const keys = St.S.ingredients.map(i => i.key).sort((a, b) => a.localeCompare(b, 'ru'));
    v.root.querySelector('[data-body]').innerHTML = `
      <section class="panel">
        <h3>Резервная копия</h3>
        <p>Сохраните все данные — продукты, остатки, категории, список покупок, свои рецепты, свои товары, историю расхода и настройки — в один JSON-файл. Из него же можно восстановиться на этом или другом устройстве.</p>
        ${last ? `<p class="muted" style="font-size:13.5px">Последняя копия: ${esc(last)}${daysSince >= 14 ? ' — пора сделать новую' : ''}.</p>` : '<p class="muted" style="font-size:13.5px">Копий ещё не было.</p>'}
        <div class="btns"><button class="btn btn-primary" data-act="export">${icon('download')}Скачать резервную копию</button><button class="btn" data-act="import">${icon('upload')}Восстановить из файла</button></div>
      </section>
      <section class="panel">
        <h3>Где хранятся данные</h3>
        <p>Сайт работает без сервера: всё сохраняется в браузере (${St.S.storageMode === 'idb' ? 'IndexedDB' : 'localStorage — IndexedDB недоступен'}) и переживает перезагрузку страницы. Но данные не синхронизируются между устройствами и браузерами: на телефоне и на ноутбуке будут разные запасы. Очистка данных сайта в браузере удалит и их — поэтому делайте резервные копии.</p>
        <p>Чтобы перенести данные на другое устройство, скачайте копию здесь и восстановите её там. Как добавить настоящую синхронизацию — описано в README.md в разделе «Синхронизация».</p>
        <dl class="kv"><dt>Продуктов дома</dt><dd>${St.S.inventory.length}</dd><dt>В списке покупок</dt><dd>${St.S.shopping.length}</dd><dt>Своих рецептов</dt><dd>${St.S.customRecipes.length}</dd><dt>Своих товаров в базе</dt><dd>${St.S.userProducts.length}</dd><dt>Записей о расходе</dt><dd>${St.S.history.length}</dd></dl>
      </section>
      <section class="panel">
        <h3>Всегда есть дома</h3>
        <p>Эти продукты не считаются недостающими в рецептах и не списываются после готовки. Например, вода, соль и перец.</p>
        <div class="tagset">${staples.map(k => `<span class="tag-x">${esc(k)}<button data-unstaple="${esc(k)}" aria-label="Убрать ${esc(k)}">${icon('close')}</button></span>`).join('') || '<span class="muted">Список пуст</span>'}</div>
        <form data-staple style="display:flex;gap:8px;max-width:460px"><input class="input" name="k" list="staple-keys" placeholder="Например: сахар" aria-label="Добавить продукт"><datalist id="staple-keys">${keys.map(k => `<option value="${esc(k)}">`).join('')}</datalist><button class="btn">${icon('plus')}Добавить</button></form>
      </section>
      <section class="panel">
        <h3>Категории продуктов</h3>
        <p>Создавайте свои категории, переименовывайте и удаляйте существующие. Сейчас категорий: ${St.S.categories.length}.</p>
        <div class="btns"><button class="btn" data-act="cats">${icon('list')}Управлять категориями</button></div>
      </section>
      <section class="panel">
        <h3>Пример и сброс</h3>
        <p>Пример добавит в запасы около двадцати распространённых продуктов, чтобы посмотреть, как работают списки и подбор рецептов. Сброс удалит все ваши данные с этого устройства без возможности восстановления — сначала сделайте копию.</p>
        <div class="btns"><button class="btn" data-act="sample">Добавить пример запасов</button><button class="btn btn-danger" data-act="reset">${icon('trash')}Удалить все данные</button></div>
      </section>
      <section class="panel">
        <h3>О приложении</h3>
        <dl class="kv"><dt>Версия</dt><dd>${St.APP_VERSION}</dd><dt>Рецептов в библиотеке</dt><dd>${St.S.recipes.length}</dd><dt>Справочная база</dt><dd>${St.S.productsMeta.count} товаров</dd><dt>Ингредиентов в словаре</dt><dd>${St.S.ingredients.length}</dd></dl>
        <p class="muted" style="font-size:13px;margin:12px 0 0">${esc(St.S.productsMeta.note || '')}</p>
      </section>`;
  },
};

function bind(root) {
  root.addEventListener('submit', e => {
    if (!e.target.matches('[data-staple]')) return;
    e.preventDefault();
    const k = e.target.elements.k.value.trim().toLowerCase();
    if (!k) return;
    const key = St.S.tax.info(k) ? k : St.S.tax.match(k);
    if (!key) { U.toast('Не нашёл такой продукт в словаре ингредиентов'); return; }
    const list = new Set(St.S.settings.staples || []); list.add(key);
    St.setSetting('staples', [...list]); U.toast(`«${key}» теперь считается всегда имеющимся`);
  });
  root.addEventListener('click', async e => {
    const un = e.target.closest('[data-unstaple]');
    if (un) { St.setSetting('staples', (St.S.settings.staples || []).filter(x => x !== un.dataset.unstaple)); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    switch (a.dataset.act) {
      case 'export': {
        const data = St.exportData();
        const d = new Date();
        const name = `kladovaya-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
        U.downloadFile(name, JSON.stringify(data, null, 1));
        U.toast(`Копия сохранена: ${name}`);
        break;
      }
      case 'import': {
        const file = await U.pickFile('.json,application/json');
        if (!file) break;
        let obj;
        try { obj = JSON.parse(await file.text()); } catch { U.toast('Файл не похож на JSON'); break; }
        if (!obj || obj.app !== 'kladovaya') { U.toast('Это не резервная копия «Кладовой»'); break; }
        const n = obj.data?.inventory?.length || 0;
        U.actionMenu(`Копия от ${obj.exportedAt ? U.fmtDate(obj.exportedAt) : '—'}: ${n} ${U.plural(n, ['продукт', 'продукта', 'продуктов'])}`, [
          { label: 'Заменить текущие данные копией', icon: 'refresh', fn: async () => { try { await St.importData(obj, 'replace'); U.toast('Данные восстановлены из копии'); } catch (err) { U.toast(err.message); } } },
          { label: 'Объединить с текущими данными', icon: 'merge', fn: async () => { try { await St.importData(obj, 'merge'); U.toast('Данные объединены'); } catch (err) { U.toast(err.message); } } },
        ]);
        break;
      }
      case 'cats': categoriesSheet(); break;
      case 'sample': St.loadSample(); U.toast('Пример добавлен в «Мои продукты»'); break;
      case 'reset':
        if (await U.confirmDialog('Удалить все продукты, список покупок, свои рецепты, записи и настройки с этого устройства? Это нельзя отменить.', { ok: 'Удалить всё', danger: true, title: 'Удалить все данные' })) {
          await St.resetAll(); U.toast('Все данные удалены');
        }
        break;
    }
  });
}
