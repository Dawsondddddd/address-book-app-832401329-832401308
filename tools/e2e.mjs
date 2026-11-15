/**
 * e2e.mjs — 端到端验收脚本
 *
 * 覆盖：示例数据、收藏切换、搜索、新建（多联系方式）、编辑、删除、
 *      Excel 导出（真实落盘）、导出文件回导、外部 Excel 导入、CSV 导入。
 * 运行：node tools/e2e.mjs
 */
import { launch } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.APP_URL || 'http://127.0.0.1:8765/';
const DOWNLOADS = path.resolve('tmp/downloads');
const TESTDATA = path.resolve('testdata');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, extra = '') {
  if (condition) {
    passed++;
    console.log('  ✓', name, extra);
  } else {
    failed++;
    failures.push(name);
    console.log('  ✗', name, extra);
  }
}

const browser = await launch();
try {
  const page = await browser.newPage(URL);
  await browser.setViewport(page, 1440, 900, 1);
  await browser.setDownloadDir(DOWNLOADS);
  fs.mkdirSync(DOWNLOADS, { recursive: true });
  fs.readdirSync(DOWNLOADS).forEach((f) => fs.rmSync(path.join(DOWNLOADS, f)));

  /* ---------- 1. 空状态 ---------- */
  await browser.evaluate(page, `localStorage.removeItem('ab.contacts.v1'); location.reload()`);
  await sleep(700);
  check('首次打开为空列表', (await browser.js(page, 'document.querySelectorAll(".card").length')) === 0);
  check('显示空状态提示', !(await browser.js(page, 'document.querySelector("#emptyState").hidden')));

  /* ---------- 2. 示例数据 ---------- */
  await browser.click(page, '#btnDemoEmpty');
  await sleep(400);
  const cards = await browser.js(page, 'document.querySelectorAll(".card").length');
  check('载入 10 位示例联系人', cards === 10, `实际 ${cards}`);
  check('统计同步更新', (await browser.js(page, 'document.querySelector("#statContacts").textContent')) === '10');

  /* ---------- 3. 收藏 ---------- */
  const favBefore = Number(await browser.js(page, 'document.querySelector("#statFav").textContent'));
  await browser.click(page, '.card:not(.is-fav) .card-star');
  await sleep(300);
  const favAfter = Number(await browser.js(page, 'document.querySelector("#statFav").textContent'));
  check('星标收藏 +1', favAfter === favBefore + 1, `${favBefore} -> ${favAfter}`);

  await browser.click(page, '[data-view="favorite"]');
  await sleep(300);
  const favCards = await browser.js(page, 'document.querySelectorAll(".card").length');
  check('收藏视图只显示收藏联系人', favCards === favAfter, `实际 ${favCards}`);
  await browser.click(page, '[data-view="all"]');
  await sleep(200);

  /* ---------- 4. 搜索 ---------- */
  await browser.fill(page, '#searchInput', '华为');
  await sleep(300);
  const searchCards = await browser.js(page, 'document.querySelectorAll(".card").length');
  check('按公司搜索命中 1 位', searchCards === 1, `实际 ${searchCards}`);
  await browser.fill(page, '#searchInput', '1380013');
  await sleep(300);
  check('按电话号码片段搜索', (await browser.js(page, 'document.querySelectorAll(".card").length')) >= 1);
  await browser.fill(page, '#searchInput', '');
  await sleep(300);

  /* ---------- 5. 新建联系人（多个联系方式） ---------- */
  await browser.click(page, '#btnAdd');
  await sleep(300);
  await browser.fill(page, '#fieldName', '测试同学');
  await browser.fill(page, '#fieldCompany', '软件工程 2026');
  await browser.fill(page, '#fieldPosition', '前端');
  await browser.fill(page, '#methodRows .method-row:nth-child(1) .method-value', '13800001111');
  await browser.click(page, '#btnAddMethod');
  await sleep(150);
  await browser.evaluate(page, `(() => {
    const rows = document.querySelectorAll('#methodRows .method-row');
    const row = rows[rows.length - 1];
    row.querySelector('.method-type').value = 'email';
    row.querySelector('.method-type').dispatchEvent(new Event('change', { bubbles: true }));
    row.querySelector('.method-value').value = 'test@fzu.edu.cn';
    row.querySelector('.method-value').dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.click(page, '#btnAddMethod');
  await sleep(150);
  await browser.evaluate(page, `(() => {
    const rows = document.querySelectorAll('#methodRows .method-row');
    const row = rows[rows.length - 1];
    row.querySelector('.method-type').value = 'wechat';
    row.querySelector('.method-type').dispatchEvent(new Event('change', { bubbles: true }));
    row.querySelector('.method-value').value = 'test_wx';
    row.querySelector('.method-value').dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await browser.click(page, '#btnSave');
  await sleep(400);
  check('新建后总数 +1', (await browser.js(page, 'document.querySelectorAll(".card").length')) === 11);
  const newCard = await browser.js(page, `(() => {
    const card = [...document.querySelectorAll('.card')].find(c => c.querySelector('.card-name').textContent === '测试同学');
    return card ? { methods: card.querySelectorAll('.method-item').length, tag: card.querySelector('.tag').textContent } : null;
  })()`);
  check('新联系人保留 3 个联系方式', newCard && newCard.methods === 3, JSON.stringify(newCard));

  /* ---------- 6. 校验：缺姓名时不允许保存 ---------- */
  await browser.click(page, '#btnAdd');
  await sleep(250);
  await browser.fill(page, '#methodRows .method-row:nth-child(1) .method-value', '13900002222');
  await browser.click(page, '#btnSave');
  await sleep(250);
  const errText = await browser.js(page, 'document.querySelector("#errName").textContent');
  const modalOpen = !(await browser.js(page, 'document.querySelector("#contactModal").hidden'));
  check('缺姓名被拦截并提示', errText.includes('姓名') && modalOpen, errText);
  await browser.click(page, '#btnCancelModal');
  await sleep(200);

  /* ---------- 7. 编辑 ---------- */
  await browser.evaluate(page, `(() => {
    const card = [...document.querySelectorAll('.card')].find(c => c.querySelector('.card-name').textContent === '测试同学');
    card.click();
  })()`);
  await sleep(350);
  const editMethods = await browser.js(page, 'document.querySelectorAll("#methodRows .method-row").length');
  check('编辑弹窗回填 3 条联系方式', editMethods === 3, `实际 ${editMethods}`);
  await browser.fill(page, '#fieldName', '测试同学二');
  await browser.click(page, '#btnSave');
  await sleep(400);
  check('修改姓名后重新渲染',
    (await browser.js(page, 'document.querySelector("#contactModal").hidden')) === true &&
    (await browser.js(page, `[...document.querySelectorAll('.card-name')].some(n => n.textContent === '测试同学二')`)) === true);

  /* ---------- 8. 删除 ---------- */
  await browser.evaluate(page, `(() => {
    const card = [...document.querySelectorAll('.card')].find(c => c.querySelector('.card-name').textContent === '测试同学二');
    card.querySelector('[data-act="del"]').click();
  })()`);
  await sleep(250);
  await browser.click(page, '#btnConfirmDelete');
  await sleep(350);
  check('删除后总数回到 10', (await browser.js(page, 'document.querySelectorAll(".card").length')) === 10);

  /* ---------- 9. 导出 Excel ---------- */
  await browser.click(page, '#btnExport');
  await sleep(1200);
  const files = fs.readdirSync(DOWNLOADS).filter((f) => f.endsWith('.xlsx'));
  check('导出生成 xlsx 文件', files.length === 1, files.join(','));
  const exported = files.length ? path.join(DOWNLOADS, files[0]) : null;
  if (exported) console.log('    导出文件:', exported, fs.statSync(exported).size, 'bytes');

  /* ---------- 10. 导出文件回导（应全部判重） ---------- */
  if (exported) {
    await browser.upload(page, '#fileInput', [exported]);
    await sleep(1200);
    const stats = await browser.js(page, `({
      ok: document.querySelector('#importOk').textContent,
      skip: document.querySelector('#importSkip').textContent,
      bad: document.querySelector('#importBad').textContent,
      open: !document.querySelector('#importModal').hidden
    })`);
    check('回导全部判重', stats.open && stats.ok === '0' && Number(stats.skip) === 10, JSON.stringify(stats));
    await browser.click(page, '#btnImportDone');
    await sleep(200);
  }

  /* ---------- 11. 外部 Excel 导入 ---------- */
  const importFile = path.join(TESTDATA, 'import-demo.xlsx');
  await browser.upload(page, '#fileInput', [importFile]);
  await sleep(1200);
  const imp = await browser.js(page, `({
    ok: document.querySelector('#importOk').textContent,
    skip: document.querySelector('#importSkip').textContent,
    bad: document.querySelector('#importBad').textContent,
    open: !document.querySelector('#importModal').hidden
  })`);
  check('外部 Excel 导入 2 位、跳过 1 位、异常 1 行',
    imp.open && imp.ok === '2' && imp.skip === '1' && imp.bad === '1', JSON.stringify(imp));
  await browser.click(page, '#btnImportDone');
  await sleep(250);
  check('导入后总数 12', (await browser.js(page, 'document.querySelectorAll(".card").length')) === 12);

  /* ---------- 12. CSV 导入（含引号内的逗号） ---------- */
  await browser.upload(page, '#fileInput', [path.join(TESTDATA, 'import-demo.csv')]);
  await sleep(900);
  const csv = await browser.js(page, `({
    ok: document.querySelector('#importOk').textContent,
    open: !document.querySelector('#importModal').hidden
  })`);
  check('CSV 导入成功（2 行）', csv.open && csv.ok === '2', JSON.stringify(csv));

  /* ---------- 13. 刷新后数据仍在 ---------- */
  await browser.click(page, '#btnImportDone');
  await browser.evaluate(page, 'location.reload()');
  await sleep(800);
  const persisted = await browser.js(page, 'document.querySelectorAll(".card").length');
  check('刷新后数据持久化', persisted === 14, `实际 ${persisted}`);

  await browser.screenshot(page, path.resolve('shots/e2e-final.png'));

  /* ---------- 14. 控制台无报错 ---------- */
  const errors = await browser.js(page, 'window.__errors || []');
  check('页面无脚本异常', Array.isArray(errors) && errors.length === 0);
} catch (err) {
  failed++;
  failures.push('运行异常');
  console.error('运行异常:', err);
} finally {
  await browser.close();
}

console.log(`\n结果：通过 ${passed} 项，失败 ${failed} 项`);
if (failed) {
  console.log('失败项：', failures.join('、'));
  process.exitCode = 1;
}
