// cdp.mjs — a dependency-free Chrome DevTools Protocol client.
//
// Node 24 ships a global WebSocket, so driving a real browser costs no package
// (site-reforge BYLAW B12). Written for bulk work: EVERY call carries its own
// timeout, because one unsettled await wedges a CDP session for the tab's life.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

export function findChrome() {
  for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c;
  throw new Error('no Chrome or Edge binary found');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForEndpoint(port, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('chrome devtools endpoint did not come up on port ' + port);
}

export async function launch({ port = 9222 + Math.floor(Math.random() * 500), headless = true } = {}) {
  const bin = findChrome();
  const userDir = path.join(os.tmpdir(), 'sr-cdp-' + process.pid + '-' + port);
  fs.mkdirSync(userDir, { recursive: true });
  const args = [
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + userDir,
    '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync',
    // A throttled tab reports no rAF and no scroll events, which reads as broken code.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--mute-audio',
    'about:blank',
  ];
  if (headless) args.unshift('--headless=new');
  const proc = spawn(bin, args, { stdio: 'ignore', detached: false });
  const wsUrl = await waitForEndpoint(port);
  return { proc, port, wsUrl, userDir };
}

export class Session {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }

  static async connect(wsUrl, timeout = 20000) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('ws connect timeout')), timeout);
      ws.onopen = () => { clearTimeout(t); res(); };
      ws.onerror = (e) => { clearTimeout(t); rej(new Error('ws error: ' + (e.message || 'unknown'))); };
    });
    const s = new Session(ws);
    ws.onmessage = (ev) => s._onMessage(String(ev.data));
    return s;
  }

  _onMessage(raw) {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.id != null && this.pending.has(msg.id)) {
      const { resolve, reject, timer } = this.pending.get(msg.id);
      clearTimeout(timer); this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.method + ' ' + JSON.stringify(msg.error)));
      else resolve(msg.result);
      return;
    }
    if (msg.method) {
      const hs = this.handlers.get(msg.method) || [];
      for (const h of hs) { try { h(msg.params); } catch { /* handler must not kill the pump */ } }
    }
  }

  // Every command is time-boxed. A CDP call that never settles is the single
  // failure mode that costs a whole run, so it is not possible to make one here.
  send(method, params = {}, sessionId, timeout = 30000) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP timeout after ' + timeout + 'ms: ' + method));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, method });
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
    return () => {
      const a = this.handlers.get(method) || [];
      const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
    };
  }

  once(method, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { off(); reject(new Error('event timeout: ' + method)); }, timeout);
      const off = this.on(method, (p) => { clearTimeout(t); off(); resolve(p); });
    });
  }

  close() { try { this.ws.close(); } catch { /* already gone */ } }
}

export { sleep };
