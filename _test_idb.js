// Uji IndexedDB: migrasi data lama + kapasitas di atas batas localStorage.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const PORT = 9339;
const PROFILE = path.join(process.env.TEMP, 'opencode', 'cdp-profile-idb');

const results = [];
const log = (ok, name, detail) => {
  results.push({ ok, name, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
};

const getJSON = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let b = '';
    res.on('data', (c) => (b += c));
    res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
  }).on('error', reject);
});

async function waitFor(fn, timeout = 15000, step = 200) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error('timeout');
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(() => { ${expression} })()`, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  }
  readState() {
    return this.eval(`
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('mooda-db', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('kv')) { resolve(null); return; }
          const tx = db.transaction('kv', 'readonly');
          const g = tx.objectStore('kv').get('state');
          g.onsuccess = () => resolve(g.result || null);
          g.onerror = () => reject(g.error);
        };
      });
    `);
  }
}

(async () => {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--allow-file-access-from-files', '--window-size=1280,900', APP
  ], { stdio: 'ignore' });

  let ws;
  try {
    const target = await waitFor(async () => {
      const list = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
      return list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    }, 20000);

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const cdp = new CDP(ws);
    await cdp.send('Runtime.enable');

    const consoleErrors = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        consoleErrors.push(m.params.args.map((a) => a.value || a.description).join(' '));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        consoleErrors.push('EXCEPTION ' + (m.params.exceptionDetails.text || ''));
      }
    });

    await waitFor(async () => cdp.eval('return !!document.querySelector("#menu-grid .menu-card")'), 15000);

    // 1. Database terbentuk & dipakai
    await waitFor(async () => cdp.eval('return !!window.__moodaReady'), 15000);
    const awal = await cdp.eval(`
      return new Promise((resolve) => {
        const q = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);
        q.then((list) => resolve(list.map((d) => d.name))).catch(() => resolve([]));
      });
    `);
    log(Array.isArray(awal) && awal.includes('mooda-db'), 'IndexedDB dibuka aplikasi', JSON.stringify(awal));

    // 2. Migrasi dari localStorage: kosongkan state, isi data lama, muat ulang.
    await cdp.eval(`
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('mooda-db', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').delete('state');
          tx.objectStore('kv').delete('uji-besar');
          tx.oncomplete = () => {
            db.close();
            const lama = {
              version: 4,
              prices: { takoyaki: 17500 },
              orders: [{
                id: 'TRX-LAMA001', at: new Date().toISOString(), method: 'Cash', methodLabel: 'Cash',
                received: 20000, change: 2500, customer: 'Bos Dims', total: 17500, printed: false,
                lines: [{ id: 'takoyaki', name: 'Takoyaki', ice: null, sugar: null, variant: '', qty: 1, price: 17500, subtotal: 17500 }]
              }],
              images: {},
              settings: { receiptName: 'MoodA' }
            };
            localStorage.setItem('mooda.v1', JSON.stringify(lama));
            resolve(true);
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    `);
    log(true, 'Data lama disiapkan di localStorage', '-');

    await cdp.send('Page.navigate', { url: APP });
    await new Promise((r) => setTimeout(r, 1200));
    await waitFor(async () => cdp.eval('return !!document.querySelector("#menu-grid .menu-card")'), 20000);
    log(true, 'Halaman dimuat ulang untuk migrasi', '-');
    const after = await waitFor(async () => {
      const s = await cdp.readState();
      return s && s.orders.length ? s : null;
    }, 8000).catch(() => null);
    log(!!after && after.orders.length === 1 && after.orders[0].id === 'TRX-LAMA001',
      'Transaksi lama pindah ke IndexedDB', after ? String(after.orders.length) : 'gagal');
    log(!!after && after.prices.takoyaki === 17500, 'Harga lama ikut pindah', after ? String(after.prices.takoyaki) : '-');

    // 3. Kapasitas: simpan 8 MB (localStorage cuma ~5 MB)
    const big = await cdp.eval(`
      return new Promise((resolve) => {
        const blob = 'data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024);
        const req = indexedDB.open('mooda-db', 1);
        req.onerror = () => resolve({ ok: false, err: 'buka gagal' });
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ images: { besar: blob } }, 'uji-besar');
          tx.oncomplete = () => { db.close(); resolve({ ok: true }); };
          tx.onerror = () => { db.close(); resolve({ ok: false, err: String(tx.error) }); };
          tx.onabort = () => { db.close(); resolve({ ok: false, err: 'abort' }); };
        };
        req.onblocked = () => resolve({ ok: false, err: 'blocked' });
      });
    `);
    log(big.ok, 'IndexedDB menampung data 8 MB', big.ok ? 'tersimpan' : (big.err || '-'));

    log(consoleErrors.length === 0, 'Tidak ada error console', consoleErrors.join(' | ') || '-');
  } finally {
    try { ws && ws.close(); } catch { /* abaikan */ }
    chrome.kill();
  }

  const pass = results.filter((x) => x.ok).length;
  console.log(`\n${pass}/${results.length} tes lulus`);
  process.exit(pass === results.length ? 0 : 1);
})();
