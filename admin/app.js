import { applyRegions, renderTables, renderNotes, renderBanner, renderPromo, promoExpired } from './render.js';

// คลังที่ Cloudflare Pages ใช้ build เว็บจริง แก้ตรงนี้ที่เดียวถ้าย้ายคลัง
const REPO = { owner: 'zingstarengineering-stack', name: 'zingstar-engineering-site', branch: 'main' };
const DATA_FILE = 'data/site.json';
const PAGE_FILES = ['index.html', 'base.html'];
const TOKEN_KEY = 'zs_admin_token';
const API = 'https://api.github.com';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

let token = '';
let data = null;      // ที่กำลังแก้อยู่
let original = null;  // ที่ดึงมาจากเว็บ ใช้เทียบว่าแก้อะไรไปบ้าง
let headSha = '';     // commit ล่าสุดตอนที่โหลด กันสองคนแก้ชนกัน
let activeTab = 0;

// ---------- ตัวช่วยแปลงข้อความเป็น base64 ให้ GitHub รับได้ทั้งภาษาไทย ----------
const toB64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const fromB64 = (b64) => {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

// ---------- เรียก GitHub ----------
async function gh(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: 'Bearer ' + token,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers,
    },
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* ไม่ใช่ JSON ก็ปล่อย */ }
    throw new Error(httpMessage(res.status, detail));
  }
  return res.status === 204 ? null : res.json();
}

function httpMessage(status, detail) {
  if (status === 401) return 'รหัสเข้าใช้งานไม่ถูกต้องหรือหมดอายุแล้ว ต้องสร้างใหม่';
  if (status === 403) return 'รหัสนี้ไม่มีสิทธิ์แก้ไขคลังนี้ ตรวจว่าเลือก repository ถูกและให้สิทธิ์ Contents เป็น Read and write';
  if (status === 404) return 'หาไฟล์หรือคลังไม่เจอ อาจเป็นเพราะรหัสไม่ได้ให้สิทธิ์เข้าคลังนี้';
  if (status === 409) return 'มีคนอื่นแก้ไปก่อนหน้า กดปุ่มดึงของบนเว็บมาใหม่ก่อน';
  if (status === 422) return 'ข้อมูลที่ส่งไปไม่ถูกรูปแบบ' + (detail ? ' (' + detail + ')' : '');
  return 'ติดต่อ GitHub ไม่สำเร็จ (' + status + ')' + (detail ? ' ' + detail : '');
}

const repoPath = (p) => `/repos/${REPO.owner}/${REPO.name}${p}`;

async function readFile(path) {
  const j = await gh(repoPath(`/contents/${path}?ref=${REPO.branch}`));
  return fromB64(j.content);
}

async function readHead() {
  const j = await gh(repoPath(`/git/ref/heads/${REPO.branch}`));
  return j.object.sha;
}

// คลังนี้เปิดสาธารณะ อ่านได้โดยไม่ต้องมีรหัส ถ้าเช็คแค่ว่าอ่านไฟล์ได้
// รหัสมั่ว ๆ ก็ผ่านประตูเข้ามาได้ ต้องถาม GitHub ตรง ๆ ว่ารหัสนี้เขียนคลังนี้ได้จริงไหม
async function assertCanWrite() {
  const repo = await gh(repoPath(''));
  if (!repo.permissions || !repo.permissions.push) {
    throw new Error('รหัสนี้เข้าได้แต่ไม่มีสิทธิ์แก้ไขคลังนี้ ตรวจว่าตอนสร้างเลือก repository ถูกตัว และให้สิทธิ์ Contents เป็น Read and write');
  }
}

// ---------- โหลดข้อมูล ----------
async function load() {
  await assertCanWrite();
  headSha = await readHead();
  const raw = await readFile(DATA_FILE);
  original = JSON.parse(raw);
  data = JSON.parse(raw);
}

// ---------- หน้าเข้าสู่ระบบ ----------
async function signIn() {
  const val = $('token').value.trim();
  if (!val) return setMsg('gate-msg', 'ใส่รหัสเข้าใช้งานก่อน', 'err');
  token = val;
  setMsg('gate-msg', 'กำลังตรวจสอบ...', 'busy');
  $('signin').disabled = true;
  try {
    await load();
    sessionStorage.setItem(TOKEN_KEY, token);
    $('token').value = '';
    $('gate').hidden = true;
    $('app').hidden = false;
    $('signout').hidden = false;
    buildAll();
    setMsg('gate-msg', '');
  } catch (e) {
    token = '';
    setMsg('gate-msg', e.message, 'err');
  } finally {
    $('signin').disabled = false;
  }
}

function signOut() {
  sessionStorage.removeItem(TOKEN_KEY);
  token = '';
  data = original = null;
  $('app').hidden = true;
  $('signout').hidden = true;
  $('gate').hidden = false;
  setMsg('gate-msg', 'ออกจากระบบแล้ว');
}

function setMsg(id, text, kind) {
  const n = $(id);
  n.textContent = text || '';
  n.className = 'msg' + (kind ? ' ' + kind : '');
}

// ---------- สร้างหน้าจอแก้ไข ----------
function buildAll() {
  $('promo-on').checked = !!data.promo.enabled;
  $('promo-text').value = data.promo.text;
  $('promo-until').value = data.promo.until || '';
  $('banner-on').checked = !!data.banner.enabled;
  $('banner-lead').value = data.banner.lead;
  $('banner-rest').value = data.banner.rest;
  buildTabs();
  buildTables();
  buildNotes();
  refresh();
}

function buildTabs() {
  const box = $('tabs');
  box.textContent = '';
  data.tables.forEach((t, i) => {
    const b = el('button', null, t.tab);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(i === activeTab));
    b.addEventListener('click', () => { activeTab = i; buildTabs(); showTable(); });
    box.appendChild(b);
  });
}

function showTable() {
  document.querySelectorAll('#tables .grid').forEach((g, i) => {
    g.classList.toggle('on', i === activeTab);
  });
}

const HEADS = ['ขนาดพื้นที่', 'ครั้งที่ 1 ราคาเดิม', 'ครั้งที่ 1 ราคาที่คิดจริง', 'ครั้งที่ 2 ราคาเดิม', 'ครั้งที่ 2 ราคาที่คิดจริง', ''];

function buildTables() {
  const box = $('tables');
  box.textContent = '';
  data.tables.forEach((t, ti) => {
    const grid = el('div', 'grid' + (ti === activeTab ? ' on' : ''));

    const head = el('div', 'grid-head');
    HEADS.forEach((h) => head.appendChild(el('div', null, h)));
    grid.appendChild(head);

    t.rows.forEach((r, ri) => grid.appendChild(rowEditor(t, r, ri)));

    const foot = el('div', 'grid-foot');
    const add = el('button', 'btn btn-ghost', 'เพิ่มแถว');
    add.type = 'button';
    add.addEventListener('click', () => {
      t.rows.push({ size: '', a: { now: '' }, b: { now: '' } });
      buildTables(); refresh();
    });
    foot.appendChild(add);
    grid.appendChild(foot);

    box.appendChild(grid);
  });
}

function rowEditor(table, row, idx) {
  const wrap = el('div', 'grid-row');
  const isAsk = !!(row.a && row.a.ask);

  const put = (label, node) => {
    const cell = el('div');
    cell.appendChild(el('div', 'lbl', label));
    cell.appendChild(node);
    wrap.appendChild(cell);
    return cell;
  };

  const text = (val, onInput, ph) => {
    const i = document.createElement('input');
    i.type = 'text';
    i.value = val || '';
    if (ph) i.placeholder = ph;
    i.addEventListener('input', () => { onInput(i.value); refresh(); });
    return i;
  };

  put(HEADS[0], text(row.size, (v) => { row.size = v; }, 'เช่น 41 – 60 ตร.ม.'));

  if (isAsk) {
    const askCell = el('div');
    askCell.appendChild(el('div', 'lbl', 'ข้อความแทนราคา'));
    askCell.appendChild(text(row.a.ask, (v) => { row.a.ask = v; row.b.ask = v; }));
    askCell.className = 'span4';
    wrap.appendChild(askCell);
  } else {
    put(HEADS[1], text(row.a.was, (v) => { setPrice(row.a, 'was', v); }, 'ว่างได้'));

    const nowCell = el('div');
    nowCell.appendChild(el('div', 'lbl', HEADS[2]));
    const mini = el('div', 'mini');
    mini.appendChild(text(row.a.now, (v) => { row.a.now = v; }));
    if (table.id !== 'condo') {
      const lab = el('label', 'drone-lbl');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!row.a.drone;
      cb.addEventListener('change', () => {
        if (cb.checked) row.a.drone = true; else delete row.a.drone;
        refresh();
      });
      lab.appendChild(cb);
      lab.appendChild(el('span', null, 'โดรน'));
      mini.appendChild(lab);
    }
    nowCell.appendChild(mini);
    wrap.appendChild(nowCell);

    put(HEADS[3], text(row.b.was, (v) => { setPrice(row.b, 'was', v); }, 'ว่างได้'));
    put(HEADS[4], text(row.b.now, (v) => { row.b.now = v; }));
  }

  const acts = el('div', 'mini');
  acts.appendChild(iconBtn('ขึ้น', 'เลื่อนแถวขึ้น', () => move(table, idx, -1)));
  acts.appendChild(iconBtn('ลง', 'เลื่อนแถวลง', () => move(table, idx, 1)));
  acts.appendChild(iconBtn('ลบ', 'ลบแถวนี้', () => {
    if (!confirm('ลบแถว "' + (row.size || 'ไม่มีชื่อ') + '" ออกจากตาราง?')) return;
    table.rows.splice(idx, 1);
    buildTables(); refresh();
  }));
  wrap.appendChild(acts);

  return wrap;
}

function setPrice(cell, key, v) {
  if (v.trim()) cell[key] = v; else delete cell[key];
}

function iconBtn(label, title, fn) {
  const b = el('button', 'btn btn-x', label);
  b.type = 'button';
  b.title = title;
  b.addEventListener('click', fn);
  return b;
}

function move(table, idx, dir) {
  const to = idx + dir;
  if (to < 0 || to >= table.rows.length) return;
  const [r] = table.rows.splice(idx, 1);
  table.rows.splice(to, 0, r);
  buildTables(); refresh();
}

function buildNotes() {
  const box = $('notes');
  box.textContent = '';
  data.notes.forEach((n, i) => {
    const row = el('div', 'note-row');
    const ta = document.createElement('textarea');
    ta.rows = 2;
    ta.value = n;
    ta.addEventListener('input', () => { data.notes[i] = ta.value; refresh(); });
    row.appendChild(ta);
    row.appendChild(iconBtn('ลบ', 'ลบหมายเหตุนี้', () => {
      data.notes.splice(i, 1);
      buildNotes(); refresh();
    }));
    box.appendChild(row);
  });
}

// ---------- ตัวอย่าง + สรุปสิ่งที่แก้ ----------
function refresh() {
  data.promo.enabled = $('promo-on').checked;
  data.promo.text = $('promo-text').value;
  data.promo.until = $('promo-until').value;
  if (!data.promo.until) delete data.promo.until;
  setMsg('promo-warn', data.promo.enabled && promoExpired(data)
    ? 'โปรหมดอายุไปแล้วตั้งแต่ ' + data.promo.until + ' ป้ายไม่ขึ้นบนเว็บ ปิดสวิตช์หรือเลื่อนวันสุดท้ายออกไป'
    : '', 'err');
  data.banner.enabled = $('banner-on').checked;
  data.banner.lead = $('banner-lead').value;
  data.banner.rest = $('banner-rest').value;
  drawPreview();
  drawChanges();
}

function drawPreview() {
  const tabs = data.tables
    .map((t, i) => '<span class="' + (i === activeTab ? 'on' : '') + '">' + t.tab + '</span>')
    .join('');
  const panels = renderTables(data).replace(
    /class="panel( on)?" id="p-([a-z]+)"/g,
    (m, on, id) => {
      const i = data.tables.findIndex((t) => t.id === id);
      return 'class="panel' + (i === activeTab ? ' on' : '') + '" id="pv-' + id + '"';
    }
  );
  $('preview').innerHTML =
    renderPromo(data) +
    '<div class="pv-tabs">' + tabs + '</div>' +
    renderBanner(data) +
    panels +
    '<div class="notes"><ul>' + renderNotes(data) + '</ul></div>';
}

function drawChanges() {
  const box = $('changes');
  box.textContent = '';
  const list = diffSummary(original, data);
  if (!list.length) {
    box.appendChild(el('p', 'clean', 'ยังไม่ได้แก้อะไร ตรงกับที่อยู่บนเว็บตอนนี้'));
    $('publish').disabled = true;
    return;
  }
  $('publish').disabled = false;
  box.appendChild(el('p', null, 'สิ่งที่จะเปลี่ยนบนเว็บ'));
  const ul = el('ul');
  list.forEach((t) => ul.appendChild(el('li', null, t)));
  box.appendChild(ul);
}

function diffSummary(a, b) {
  const out = [];
  if (a.promo.enabled !== b.promo.enabled) {
    out.push(b.promo.enabled ? 'เปิดป้ายโปรโมชั่น' : 'ปิดป้ายโปรโมชั่น ป้ายจะหายจากเว็บ');
  }
  if (a.promo.text !== b.promo.text) out.push('แก้ข้อความป้ายโปรเป็น "' + b.promo.text + '"');
  if ((a.promo.until || '') !== (b.promo.until || '')) {
    out.push(b.promo.until ? 'ป้ายโปรใช้ได้ถึงวันที่ ' + b.promo.until : 'ป้ายโปรไม่มีวันหมด');
  }
  if (a.banner.enabled !== b.banner.enabled) {
    out.push(b.banner.enabled ? 'เปิดแถบข้อความใต้ปุ่มเลือกประเภท' : 'ปิดแถบข้อความใต้ปุ่มเลือกประเภท');
  }
  if (a.banner.lead !== b.banner.lead || a.banner.rest !== b.banner.rest) {
    out.push('แก้ข้อความแถบใต้ปุ่มเลือกประเภท');
  }
  b.tables.forEach((tb, i) => {
    const ta = a.tables[i];
    if (!ta) return;
    if (ta.rows.length !== tb.rows.length) {
      out.push('ตาราง' + tb.tab + ': จำนวนแถว ' + ta.rows.length + ' เป็น ' + tb.rows.length);
    }
    tb.rows.forEach((rb, ri) => {
      const ra = ta.rows[ri];
      if (!ra) return;
      if (JSON.stringify(ra) !== JSON.stringify(rb)) {
        out.push('ตาราง' + tb.tab + ': แก้แถว "' + (rb.size || 'ไม่มีชื่อ') + '"');
      }
    });
  });
  if (JSON.stringify(a.notes) !== JSON.stringify(b.notes)) out.push('แก้หมายเหตุใต้ตาราง');
  const blanks = [];
  b.tables.forEach((t) => t.rows.forEach((r) => {
    if (!r.size.trim()) blanks.push(t.tab + ': มีแถวที่ยังไม่ใส่ขนาดพื้นที่');
    else if (!r.a.ask && !String(r.a.now || '').trim()) blanks.push(t.tab + ' แถว "' + r.size + '": ยังไม่ใส่ราคาครั้งที่ 1');
  }));
  return out.concat([...new Set(blanks)].map((s) => 'ยังไม่ครบ — ' + s));
}

function hasBlank() {
  return data.tables.some((t) => t.rows.some(
    (r) => !r.size.trim() || (!r.a.ask && !String(r.a.now || '').trim())
  ));
}

// ---------- เผยแพร่ ----------
async function publish() {
  if (hasBlank()) {
    return setMsg('pub-msg', 'มีช่องที่ยังไม่ได้กรอก เติมให้ครบก่อนแล้วค่อยเผยแพร่', 'err');
  }
  $('publish').disabled = true;
  setMsg('pub-msg', 'กำลังเผยแพร่...', 'busy');
  try {
    const nowSha = await readHead();
    if (nowSha !== headSha) {
      throw new Error('มีการแก้ไขอื่นเข้ามาหลังจากที่คุณเปิดหน้านี้ กดปุ่มดึงของบนเว็บมาใหม่ก่อน แล้วแก้ซ้ำอีกครั้ง');
    }

    data.updatedAt = new Date().toISOString().slice(0, 10);
    const files = [{ path: DATA_FILE, content: JSON.stringify(data, null, 2) + '\n' }];
    for (const p of PAGE_FILES) {
      files.push({ path: p, content: applyRegions(await readFile(p), data) });
    }

    const blobs = [];
    for (const f of files) {
      const b = await gh(repoPath('/git/blobs'), {
        method: 'POST',
        body: JSON.stringify({ content: toB64(f.content), encoding: 'base64' }),
      });
      blobs.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha });
    }

    const base = await gh(repoPath('/git/commits/' + headSha));
    const tree = await gh(repoPath('/git/trees'), {
      method: 'POST',
      body: JSON.stringify({ base_tree: base.tree.sha, tree: blobs }),
    });

    const note = $('commit-msg').value.trim();
    const commit = await gh(repoPath('/git/commits'), {
      method: 'POST',
      body: JSON.stringify({
        message: 'แก้ค่าบริการจากหน้า admin' + (note ? '\n\n' + note : ''),
        tree: tree.sha,
        parents: [headSha],
      }),
    });

    await gh(repoPath(`/git/refs/heads/${REPO.branch}`), {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    });

    headSha = commit.sha;
    original = JSON.parse(JSON.stringify(data));
    $('commit-msg').value = '';
    drawChanges();
    setMsg('pub-msg', 'เผยแพร่แล้ว เว็บจะอัปเดตภายในประมาณ 1 นาที', 'ok');
  } catch (e) {
    setMsg('pub-msg', e.message, 'err');
  } finally {
    $('publish').disabled = false;
  }
}

async function reload() {
  if (!confirm('ทิ้งสิ่งที่แก้ค้างไว้ แล้วดึงของที่อยู่บนเว็บตอนนี้มาใหม่?')) return;
  setMsg('pub-msg', 'กำลังดึงข้อมูล...', 'busy');
  try {
    await load();
    buildAll();
    setMsg('pub-msg', 'ดึงข้อมูลล่าสุดมาแล้ว', 'ok');
  } catch (e) {
    setMsg('pub-msg', e.message, 'err');
  }
}

// ---------- ผูกปุ่ม ----------
$('signin').addEventListener('click', signIn);
$('token').addEventListener('keydown', (e) => { if (e.key === 'Enter') signIn(); });
$('signout').addEventListener('click', signOut);
$('publish').addEventListener('click', publish);
$('reload').addEventListener('click', reload);
$('preview-refresh').addEventListener('click', refresh);
$('note-add').addEventListener('click', () => { data.notes.push(''); buildNotes(); refresh(); });
['promo-on', 'promo-text', 'promo-until', 'banner-on', 'banner-lead', 'banner-rest']
  .forEach((id) => $(id).addEventListener('input', refresh));
$('promo-on').addEventListener('change', refresh);
$('banner-on').addEventListener('change', refresh);

window.addEventListener('beforeunload', (e) => {
  if (data && original && JSON.stringify(data) !== JSON.stringify(original)) e.preventDefault();
});

// เข้ามาใหม่ในแท็บเดิมที่ยังไม่ปิด ไม่ต้องกรอกรหัสซ้ำ
const saved = sessionStorage.getItem(TOKEN_KEY);
if (saved) {
  token = saved;
  load().then(() => {
    $('gate').hidden = true;
    $('app').hidden = false;
    $('signout').hidden = false;
    buildAll();
  }).catch(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    token = '';
  });
}
