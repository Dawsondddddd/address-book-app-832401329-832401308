/**
 * browser.mjs — 一个不依赖任何第三方包的 CDP 客户端
 *
 * 用途：在无头 Edge 中打开项目页面，执行真实点击 / 输入 / 截图 / 录屏，
 *      用于自动化验收和博客素材生成。
 *
 * 原理：Edge 以 --remote-debugging-port 启动后暴露 Chrome DevTools
 *      Protocol；Node 22+ 自带 WebSocket 与 fetch，因此无需 puppeteer。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Session {
  constructor(browser, sessionId) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.listeners = new Map();
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
    return this;
  }

  emit(method, params) {
    (this.listeners.get(method) || []).forEach((fn) => fn(params));
  }

  send(method, params = {}) {
    return this.browser.send(method, params, this.sessionId);
  }
}

export class Browser {
  constructor(proc, ws, profile) {
    this.proc = proc;
    this.ws = ws;
    this.profile = profile;
    this.id = 0;
    this.pending = new Map();
    this.sessions = new Map();
    this.browserSession = new Session(this, null);
    ws.addEventListener('message', (event) => this._onMessage(event));
  }

  send(method, params = {}, sessionId = null) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(payload));
    });
  }

  _onMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.id) {
      const hit = this.pending.get(msg.id);
      if (!hit) return;
      clearTimeout(hit.timer);
      this.pending.delete(msg.id);
      if (msg.error) hit.reject(new Error(msg.error.message));
      else hit.resolve(msg.result);
      return;
    }

    const session = msg.sessionId ? this.sessions.get(msg.sessionId) : this.browserSession;
    if (session) session.emit(msg.method, msg.params);
  }

  async newPage(url) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Session(this, sessionId);
    this.sessions.set(sessionId, page);

    page.on('Runtime.consoleAPICalled', (params) => {
      const line = params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
      if (params.type === 'error' || params.type === 'warning') console.log(`  [console.${params.type}]`, line);
    });
    page.on('Runtime.exceptionThrown', (params) => {
      const detail = params.exceptionDetails;
      console.log('  [page error]', detail.text, detail.exception?.description || '');
    });

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('DOM.enable');
    await page.send('Page.navigate', { url });
    await this.waitLoad(page);
    page.targetId = targetId;
    return page;
  }

  async waitLoad(page) {
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      page.on('Page.loadEventFired', finish);
      setTimeout(finish, 8000);
    });
    await sleep(300);
  }

  async setViewport(page, width, height, scale = 2) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: scale, mobile: false
    });
  }

  async screenshot(page, file, options = {}) {
    const { data } = await page.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      ...options
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    return file;
  }

  async evaluate(page, expression) {
    const { result, exceptionDetails } = await page.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.text + ' ' + (exceptionDetails.exception?.description || ''));
    }
    return result.value;
  }

  /** 简写，测试脚本里读页面状态用 */
  async js(page, expression) { return this.evaluate(page, expression); }

  async element(page, selector) {
    const { result, exceptionDetails } = await page.send('Runtime.evaluate', {
      expression: `document.querySelector(${JSON.stringify(selector)})`, returnByValue: false
    });
    if (exceptionDetails || !result.objectId) throw new Error('element not found: ' + selector);
    return result.objectId;
  }

  async click(page, selector) {
    await this.evaluate(page, `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('not found: ' + ${JSON.stringify(selector)});
      el.click();
    })()`);
  }

  async fill(page, selector, text) {
    await this.evaluate(page, `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('not found: ' + ${JSON.stringify(selector)});
      el.focus();
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    if (text) await page.send('Input.insertText', { text });
    await sleep(60);
  }

  async type(page, text, delay = 40) {
    for (const ch of text) {
      await page.send('Input.insertText', { text: ch });
      await sleep(delay);
    }
  }

  async upload(page, selector, files) {
    const objectId = await this.element(page, selector);
    await page.send('DOM.setFileInputFiles', { files, objectId });
    await sleep(500);
  }

  async setDownloadDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
    await this.send('Browser.setDownloadBehavior', {
      behavior: 'allow', downloadPath: path.resolve(dir), eventsEnabled: true
    });
  }

  async close() {
    try { this.ws.close(); } catch {}
    try { this.proc.kill(); } catch {}
    await sleep(300);
  }
}

export async function launch({ port = 9333, width = 1440, height = 900, headless = true } = {}) {
  const profile = path.join(process.env.TEMP || process.cwd(), 'clink-edge-' + Date.now());
  const args = [
    headless ? '--headless=new' : '--start-maximized',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--disable-gpu',
    'about:blank'
  ];

  const proc = spawn(EDGE, args, { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) { version = await res.json(); break; }
    } catch {}
    await sleep(250);
  }
  if (!version) {
    try { proc.kill(); } catch {}
    throw new Error('无法连接 Edge 调试端口 ' + port);
  }

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const browser = new Browser(proc, ws, profile);
  browser.version = version;
  return browser;
}
