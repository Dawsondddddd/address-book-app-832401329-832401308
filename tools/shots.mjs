/**
 * shots.mjs — 博客配图：按固定状态截取界面截图
 * 运行：node tools/shots.mjs
 */
import { launch, sleep } from './browser.mjs';
import path from 'node:path';
import fs from 'node:fs';

const URL = process.env.APP_URL || 'http://127.0.0.1:8765/';
const OUT = path.resolve('shots');
fs.mkdirSync(OUT, { recursive: true });

const browser = await launch();
try {
  const page = await browser.newPage(URL);
  await browser.setViewport(page, 1440, 900, 2);
  await browser.setDownloadDir(path.resolve('tmp/downloads'));

  const reset = async () => {
    await browser.evaluate(page, `localStorage.removeItem('ab.contacts.v1'); location.reload()`);
    await sleep(600);
  };

  /* 1. 主界面（示例数据 + 收藏星标） */
  await reset();
  await browser.click(page, '#btnDemoEmpty');
  await sleep(3200); // 等 toast 消失
  await browser.screenshot(page, path.join(OUT, '01-overview.png'));
  console.log('01 overview ok');

  /* 2. 收藏视图 */
  await browser.click(page, '[data-view="favorite"]');
  await sleep(450);
  await browser.screenshot(page, path.join(OUT, '02-favorites.png'));
  console.log('02 favorites ok');

  /* 3. 编辑弹窗：多个联系方式 */
  await browser.click(page, '[data-view="all"]');
  await sleep(300);
  await browser.evaluate(page, `(() => {
    const card = [...document.querySelectorAll('.card')].find(c => c.querySelector('.card-name').textContent === '郑北');
    card.click();
  })()`);
  await sleep(500);
  await browser.screenshot(page, path.join(OUT, '03-methods.png'));
  console.log('03 methods ok');

  /* 4. 表单校验提示 */
  await browser.evaluate(page, `(() => {
    const rows = document.querySelectorAll('#methodRows .method-row');
    const last = rows[rows.length - 1];
    last.querySelector('.method-value').value = 'not-an-email';
    last.querySelector('.method-type').value = 'email';
    last.querySelector('.method-type').dispatchEvent(new Event('change', { bubbles: true }));
    last.querySelector('.method-value').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#btnSave').click();
  })()`);
  await sleep(400);
  await browser.screenshot(page, path.join(OUT, '04-validate.png'));
  console.log('04 validate ok');
  await browser.click(page, '#btnCancelModal');
  await sleep(300);

  /* 5. 导出成功提示 */
  await browser.click(page, '#btnExport');
  await sleep(700);
  await browser.screenshot(page, path.join(OUT, '05-export.png'));
  console.log('05 export ok');
  await sleep(2400);

  /* 6. 移动端（导入前，保持 10 位示例联系人） */
  await browser.setViewport(page, 390, 844, 2);
  await sleep(600);
  await browser.screenshot(page, path.join(OUT, '06-mobile.png'));
  console.log('06 mobile ok');
  await browser.setViewport(page, 1440, 900, 2);
  await sleep(500);

  /* 7. 导入结果 */
  await browser.upload(page, '#fileInput', [path.resolve('testdata/import-demo.xlsx')]);
  await sleep(1300);
  await browser.screenshot(page, path.join(OUT, '07-import.png'));
  console.log('07 import ok');
  await browser.click(page, '#btnImportDone');
  await sleep(300);

  /* 8. 搜索状态 */
  await browser.fill(page, '#searchInput', '厦大');
  await sleep(400);
  await browser.screenshot(page, path.join(OUT, '08-search.png'));
  console.log('08 search ok');
  await browser.fill(page, '#searchInput', '');
  await sleep(300);

  /* 9. 空状态 */
  await reset();
  await sleep(500);
  await browser.screenshot(page, path.join(OUT, '09-empty.png'));
  console.log('09 empty ok');
} finally {
  await browser.close();
}
