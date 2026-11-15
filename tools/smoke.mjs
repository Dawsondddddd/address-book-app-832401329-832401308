/**
 * smoke.mjs — 冒烟测试：页面能否正常加载、示例数据能否渲染、有没有 JS 报错
 */
import { launch } from './browser.mjs';
import path from 'node:path';

const URL = process.env.APP_URL || 'http://127.0.0.1:8765/';
const OUT = path.resolve('shots');

const browser = await launch();
try {
  const page = await browser.newPage(URL);
  await browser.setViewport(page, 1440, 900, 2);
  await browser.evaluate(page, 'localStorage.clear(); location.reload()');
  await new Promise((r) => setTimeout(r, 800));

  const title = await browser.evaluate(page, 'document.title');
  const cards0 = await browser.evaluate(page, 'document.querySelectorAll(".card").length');
  console.log('title:', title, '初始卡片:', cards0);

  await browser.click(page, '#btnDemoEmpty');
  await new Promise((r) => setTimeout(r, 500));
  const cards = await browser.evaluate(page, 'document.querySelectorAll(".card").length');
  const stat = await browser.evaluate(page, 'document.querySelector("#statContacts").textContent');
  const favs = await browser.evaluate(page, 'document.querySelectorAll(".card.is-fav").length');
  console.log('载入示例后卡片:', cards, '统计:', stat, '收藏卡片:', favs);

  await browser.screenshot(page, path.join(OUT, 'smoke-list.png'));
  console.log('screenshot ok');
} finally {
  await browser.close();
}
