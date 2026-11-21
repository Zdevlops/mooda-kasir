// Uji revisi struk (atas nama besar, nomor kecil, tanpa duplikat) + halaman Info.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const APP = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');
const PORT = 9337;
const PROFILE = path.join(process.env.TEMP, 'opencode', 'cdp-profile-struk');

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
  async click(sel) {
    await this.eval(`
      const n = document.querySelector(${JSON.stringify(sel)});
      if (!n) throw new Error('not found: ' + ${JSON.stringify(sel)});
      n.scrollIntoView({block:'center'}); n.click(); return true;
    `);
    await new Promise((r) => setTimeout(r, 160));
  }
  async setValue(sel, value) {
    await this.eval(`
      const n = document.querySelector(${JSON.stringify(sel)});
      if (!n) throw new Error('not found: ' + ${JSON.stringify(sel)});
      n.value = ${JSON.stringify(String(value))};
      n.dispatchEvent(new Event('input', {bubbles:true}));
      n.dispatchEvent(new Event('change', {bubbles:true}));
      return true;
    `);
    await new Promise((r) => setTimeout(r, 90));
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

    // --- Buat 1 transaksi Cash atas nama DIMAS ---
    await cdp.eval(`
      const card = [...document.querySelectorAll('#menu-grid .menu-card')]
        .find(c => c.querySelector('.menu-name').textContent === 'Takoyaki');
      card.click(); return true;
    `);
    await cdp.click('#btn-checkout');
    await cdp.click('.method[data-method="Cash"]');
    await cdp.setValue('#pay-received', '20000');
    await cdp.setValue('#pay-name', 'dimas');
    await cdp.click('#btn-pay-confirm');
    await new Promise((r) => setTimeout(r, 400));

    // --- Struk dari riwayat ---
    await cdp.click('.tab[data-view="rekap"]');
    await new Promise((r) => setTimeout(r, 300));
    await cdp.eval(`
      window.print = () => {};
      const btn = [...document.querySelectorAll('.trx-print')].find(b => /cetak/i.test(b.textContent));
      if (!btn) throw new Error('tombol cetak tidak ada');
      btn.click(); return true;
    `);
    await new Promise((r) => setTimeout(r, 400));

    const r = await cdp.eval(`
      const box = document.querySelector('#print-area .receipt');
      if (!box) return { missing: true };
      const label = box.querySelector('.r-nama-label');
      const isi = box.querySelector('.r-nama-isi');
      const noRow = box.querySelector('.r-meta-no');
      const nomor = box.querySelector('.r-nomor');
      const sum = [...box.querySelectorAll('.r-sum-row')].map(x => x.textContent.trim());
      const px = (n) => n ? parseFloat(getComputedStyle(n).fontSize) : 0;
      const out = {
        label: label ? label.textContent.trim() : '',
        isi: isi ? isi.textContent.trim() : '',
        namaPx: px(isi),
        nomorPx: px(nomor),
        nomorText: nomor ? nomor.textContent.trim() : '',
        noRowOk: !!noRow,
        sum,
        fullText: box.textContent,
        thanksCount: (box.textContent.match(/terima kasih/gi) || []).length
      };
      document.getElementById('print-area').click();
      return out;
    `);

    log(!r.missing && r.label.toLowerCase() === 'atas nama', 'Struk menampilkan label "Atas nama"', r.label);
    log(r.isi === 'DIMAS', 'Nama pelanggan jadi huruf besar', r.isi);
    log(r.namaPx > r.nomorPx, 'Nama lebih besar dari nomor pesanan', `${r.namaPx}px vs ${r.nomorPx}px`);
    log(/^#[A-Z0-9]+$/.test(r.nomorText), 'Nomor pesanan tetap ada', r.nomorText);
    log(!/tunai/i.test(r.fullText), 'Tidak ada kata "Tunai"', '-');
    log(/cash/i.test(r.fullText), 'Memakai "Cash"', '-');
    log(r.thanksCount === 1, 'Terima kasih tidak dobel', String(r.thanksCount));
    log(/terima kasih sudah mampir/i.test(r.fullText), 'Kalimat "Terima kasih sudah mampir"', '-');
    log(!/\btunai\b/i.test((r.sum || []).join(' | ')), 'Ringkasan bebas duplikat "Tunai"', (r.sum || []).join(' | '));
    log(!/es normal|gula normal|less ice|less sugar/i.test(r.fullText), 'Tidak ada varian es/gula di struk', '-');

    // --- Versi teks (dipakai printer Bluetooth) ---
    const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    log((src.match(/out\.push\('Terima kasih!'\)/g) || []).length === 0,
      'Teks struk tanpa "Terima kasih!" dobel', '-');
    log((src.match(/out\.push\(kv\('Tunai'/g) || []).length === 0,
      'Teks struk memakai Cash, bukan Tunai', '-');
    log((src.match(/ATAS NAMA: /g) || []).length === 2,
      'Teks struk mencetak ATAS NAMA di dua jalur', String((src.match(/ATAS NAMA: /g) || []).length));

    // --- Halaman Info ---
    await cdp.click('.tab[data-view="info"]');
    await new Promise((r) => setTimeout(r, 300));
    const info = await cdp.eval(`
      return {
        visible: document.getElementById('view-info').classList.contains('is-active'),
        hasBody: (document.getElementById('info-body').textContent || '').trim().length > 40,
        version: document.getElementById('info-version').textContent,
        headings: document.querySelectorAll('#info-body .info-h').length,
        lists: document.querySelectorAll('#info-body .info-list li').length,
        hasUrl: !!document.getElementById('info-url')
      };
    `);
    log(info.visible && info.hasBody, 'Halaman Info tampil berisi', JSON.stringify({ h: info.headings, li: info.lists }));
    log(/^Versi \d+\.\d+\.\d+$/.test(info.version), 'Versi aplikasi tampil', info.version);
    log(info.hasUrl, 'Kolom sumber info tersedia', '-');

    await cdp.click('#btn-info-refresh');
    await new Promise((r) => setTimeout(r, 300));
    const warn = await cdp.eval(`return document.getElementById('info-status').textContent;`);
    log(/isi dulu alamat/i.test(warn), 'Perbarui tanpa alamat memberi peringatan', warn);

    await cdp.setValue('#info-url', 'bukan-url');
    await cdp.click('#btn-info-refresh');
    await new Promise((r) => setTimeout(r, 300));
    const warn2 = await cdp.eval(`return document.getElementById('info-status').textContent;`);
    log(/harus diawali/i.test(warn2), 'Alamat tidak valid ditolak', warn2);

    log(consoleErrors.length === 0, 'Tidak ada error console', consoleErrors.join(' | ') || '-');
  } finally {
    try { ws && ws.close(); } catch { /* abaikan */ }
    chrome.kill();
  }

  const pass = results.filter((x) => x.ok).length;
  console.log(`\n${pass}/${results.length} tes lulus`);
  process.exit(pass === results.length ? 0 : 1);
})();
