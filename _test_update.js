// Uji pembaruan aplikasi: kartu di Info, banner, dan alur cek + pasang.
// Plugin native diganti tiruan supaya tidak butuh HP.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const PORT = 9349;
const PROFILE = path.join(process.env.TEMP, 'opencode', 'cdp-profile-update');

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

async function waitFor(fn, timeout = 15000, step = 150) {
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
      expression: `(async () => { ${expression} })()`, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  }
  async click(sel) {
    await this.eval(`
      const n = document.querySelector(${JSON.stringify(sel)});
      if (!n) throw new Error('not found: ' + ${JSON.stringify(sel)});
      n.scrollIntoView({block:'center'}); n.click(); return true;
    `);
    await new Promise((r) => setTimeout(r, 200));
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

    await waitFor(async () => cdp.eval('return !!document.getElementById("menu-grid")'), 15000);

    // --- 1. Kartu pembaruan ada di halaman Info ---
    await cdp.click('.tab[data-view="info"]');
    const kartu = await cdp.eval(`
      return {
        ada: !!document.getElementById('update-card'),
        versi: document.getElementById('update-version').textContent,
        bannerTutup: document.getElementById('update-banner').hidden,
        tombolPasangTutup: document.getElementById('btn-update-install').hidden
      };
    `);
    log(kartu.ada, 'Kartu "Pembaruan aplikasi" tampil di Info', '-');
    log(kartu.versi === 'Versi 3.2.0', 'Versi terpasang ditampilkan', kartu.versi);
    log(kartu.bannerTutup && kartu.tombolPasangTutup, 'Banner & tombol pasang tersembunyi saat belum ada rilis', '-');

    // --- 2. Di browser (tanpa plugin) jujur bilang tidak tersedia ---
    await cdp.click('#btn-update-check');
    const tanpaPlugin = await waitFor(async () => {
      const t = await cdp.eval('return document.getElementById("update-status").textContent');
      return /Android/i.test(t) ? t : null;
    }, 5000).catch(() => null);
    log(!!tanpaPlugin, 'Tanpa plugin: dijelaskan hanya untuk APK Android', tanpaPlugin || 'tidak muncul');

    // --- 3. Plugin tiruan: cek menemukan versi baru ---
    await cdp.eval(`
      window.__dipasang = false;
      window.Capacitor = { Plugins: { MoodaUpdater: {
        info: async () => ({ version: '3.2.0', code: 30200, canInstall: true }),
        check: async () => ({ available: true, version: 'v3.3.0', code: 30300, error: '' }),
        install: async () => { window.__dipasang = true; return { ok: true, needsPermission: false, error: '' }; }
      } } };
      return true;
    `);
    await cdp.click('#btn-update-check');

    const adaRilis = await waitFor(async () => cdp.eval(`
      const b = document.getElementById('update-banner');
      if (b.hidden) return null;
      return {
        status: document.getElementById('update-status').textContent,
        sub: document.getElementById('update-banner-sub').textContent,
        tombolPasangTutup: document.getElementById('btn-update-install').hidden
      };
    `), 8000).catch(() => null);
    log(!!adaRilis, 'Rilis baru memunculkan banner', adaRilis ? adaRilis.status : 'tidak muncul');
    log(!!adaRilis && /3\.3\.0/.test(adaRilis.sub), 'Banner menyebut nomor versi baru', adaRilis ? adaRilis.sub : '-');
    log(!!adaRilis && adaRilis.tombolPasangTutup === false, 'Tombol "Perbarui sekarang" muncul', '-');

    // --- 4. Tombol banner memanggil pasang ---
    await cdp.click('#btn-update-banner');
    const dipasang = await waitFor(async () => cdp.eval('return window.__dipasang === true'), 5000).catch(() => false);
    log(dipasang, 'Tekan Perbarui memanggil pemasang (plugin install)', String(dipasang));
    const sesudahPasang = await cdp.eval(`
      return {
        status: document.getElementById('update-status').textContent,
        bannerTutup: document.getElementById('update-banner').hidden
      };
    `);
    log(/selesai/i.test(sesudahPasang.status), 'Status memberi tahu unduhan selesai', sesudahPasang.status);
    log(sesudahPasang.bannerTutup, 'Banner ditutup setelah unduhan selesai', '-');

    // --- 5. Sudah versi terbaru ---
    await cdp.eval(`
      window.Capacitor.Plugins.MoodaUpdater.check = async () => ({ available: false, version: '', code: 0, error: '' });
      return true;
    `);
    await cdp.click('#btn-update-check');
    const terbaru = await waitFor(async () => {
      const t = await cdp.eval('return document.getElementById("update-status").textContent');
      return /versi terbaru/i.test(t) ? t : null;
    }, 5000).catch(() => null);
    log(!!terbaru, 'Bila tidak ada rilis: "Sudah versi terbaru"', terbaru || 'tidak muncul');

    // --- 6. Gangguan jaringan dilaporkan, bukan didiamkan ---
    await cdp.eval(`
      window.Capacitor.Plugins.MoodaUpdater.check = async () => ({ available: false, version: '', code: 0, error: 'HTTP 403' });
      return true;
    `);
    await cdp.click('#btn-update-check');
    const gagal = await waitFor(async () => {
      const t = await cdp.eval('return document.getElementById("update-status").textContent');
      return /HTTP 403/.test(t) ? t : null;
    }, 5000).catch(() => null);
    log(!!gagal, 'Gagal cek pembaruan dilaporkan ke pengguna', gagal || 'tidak muncul');

    const errors = consoleErrors.filter((e) => !/Failed to load resource|net::ERR/i.test(e));
    log(errors.length === 0, 'Tidak ada error console', errors.join(' | ') || '-');
  } finally {
    try { ws && ws.close(); } catch { /* abaikan */ }
    chrome.kill();
  }

  const pass = results.filter((x) => x.ok).length;
  console.log(`\n${pass}/${results.length} tes lulus`);
  process.exit(pass === results.length ? 0 : 1);
})();