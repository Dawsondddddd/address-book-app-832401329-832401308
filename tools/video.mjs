/**
 * video.mjs — 录制演示视频
 *
 * 思路：用 CDP 的 Page.startScreencast 抓取页面变化的 JPEG 帧，
 *      按帧间隔生成 ffmpeg concat 时间轴，再编码为 H.264 MP4。
 * 输出：video/frames/*.jpg、video/list.txt、video/clink-demo.mp4
 */
import { launch, sleep } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.APP_URL || 'http://127.0.0.1:8765/';
const OUT = path.resolve('video');
const FRAMES = path.join(OUT, 'frames');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const browser = await launch({ width: 1440, height: 900 });
const frames = [];

try {
  const page = await browser.newPage(URL);
  await browser.setViewport(page, 1440, 900, 1);

  /* 准备演示数据：清空后载入 10 位示例联系人，并等 toast 消失 */
  await browser.evaluate(page, `localStorage.removeItem('ab.contacts.v1'); location.reload()`);
  await sleep(800);
  await browser.click(page, '#btnDemoEmpty');
  await sleep(2600);

  page.on('Page.screencastFrame', async (params) => {
    const index = frames.length;
    const file = path.join(FRAMES, `f${String(index).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(params.data, 'base64'));
    frames.push({ file, ts: params.metadata.timestamp });
    try {
      await page.send('Page.screencastFrameAck', { sessionId: params.sessionId });
    } catch {}
  });

  await page.send('Page.startScreencast', {
    format: 'jpeg', quality: 82, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1
  });

  const pause = (ms) => sleep(ms);
  const setValue = (selector, value) => browser.evaluate(page, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    el.focus();
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const setMethod = (rowIndex, type, value) => browser.evaluate(page, `(() => {
    const row = document.querySelectorAll('#methodRows .method-row')[${rowIndex}];
    const select = row.querySelector('.method-type');
    select.value = ${JSON.stringify(type)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const input = row.querySelector('.method-value');
    input.value = ${JSON.stringify(value)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);

  await pause(1200);

  /* 1. 搜索 */
  await browser.evaluate(page, `document.querySelector('#searchInput').focus()`);
  await browser.type(page, '华为', 130);
  await pause(1100);
  await setValue('#searchInput', '');
  await pause(800);

  /* 2. 收藏一位联系人 */
  await browser.evaluate(page, `(() => {
    const card = [...document.querySelectorAll('.card')].find(c => c.querySelector('.card-name').textContent === '顾清和');
    card.querySelector('[data-act="star"]').click();
  })()`);
  await pause(1500);

  /* 3. 收藏视图 */
  await browser.click(page, '[data-view="favorite"]');
  await pause(1400);

  /* 4. 回到全部，新建联系人 */
  await browser.click(page, '[data-view="all"]');
  await pause(700);
  await browser.click(page, '#btnAdd');
  await pause(900);
  await browser.evaluate(page, `document.querySelector('#fieldName').focus()`);
  await browser.type(page, '林一诺', 150);
  await setValue('#fieldCompany', '福州市软件园');
  await setValue('#fieldPosition', '交互设计师');
  await pause(500);

  await setMethod(0, 'mobile', '138 1234 5678');
  await pause(350);
  await browser.click(page, '#btnAddMethod');
  await pause(350);
  await setMethod(1, 'email', 'yinuo.lin@example.com');
  await pause(300);
  await browser.click(page, '#btnAddMethod');
  await pause(350);
  await setMethod(2, 'wechat', 'yinuo_design');
  await pause(700);

  await browser.click(page, '#btnSave');
  await pause(1500);

  /* 5. 导出 Excel */
  await browser.click(page, '#btnExport');
  await pause(1900);

  /* 6. 导入 Excel */
  await browser.upload(page, '#fileInput', [path.resolve('testdata/import-demo.xlsx')]);
  await pause(2000);
  await browser.click(page, '#btnImportDone');
  await pause(900);

  /* 7. 打开新联系人详情，展示多联系方式 */
  await browser.evaluate(page, `(() => {
    const card = [...document.querySelectorAll('.card')].find(c => c.querySelector('.card-name').textContent === '林一诺');
    if (card) card.click();
  })()`);
  await pause(1600);
  await browser.click(page, '#btnCancelModal');
  await pause(1000);

  /* 8. 按姓名排序，收尾 */
  await browser.evaluate(page, `(() => {
    const sel = document.querySelector('#sortSelect');
    sel.value = 'name';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await pause(1800);

  await page.send('Page.stopScreencast');
  await pause(300);

  /* 生成 ffmpeg concat 时间轴 */
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const next = frames[i + 1];
    const duration = next ? Math.min(2, Math.max(0.033, next.ts - frames[i].ts)) : 1.2;
    lines.push(`file '${frames[i].file.replace(/\\/g, '/')}'`);
    lines.push(`duration ${duration.toFixed(3)}`);
  }
  if (frames.length) lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, '/')}'`);
  fs.writeFileSync(path.join(OUT, 'list.txt'), lines.join('\n'), 'utf8');

  const seconds = frames.length ? (frames[frames.length - 1].ts - frames[0].ts) : 0;
  console.log(`采集 ${frames.length} 帧，时长约 ${seconds.toFixed(1)} 秒`);
  console.log('时间轴:', path.join(OUT, 'list.txt'));
} finally {
  await browser.close();
}
