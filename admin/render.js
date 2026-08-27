// สร้าง HTML ของส่วนค่าบริการจาก data/site.json
// ใช้ทั้งในหน้า admin ตอนกดเผยแพร่ และในสคริปต์ตรวจ tools/verify-render.mjs
// ผลลัพธ์ต้องตรงกับที่อยู่ใน index.html ทุกตัวอักษร ไม่งั้นการเผยแพร่ครั้งแรกจะทำหน้าเว็บเพี้ยน

const NL = '\n';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const DRONE = '<span class="drone">+ ฟรีบินโดรน</span>';

function cell(c) {
  if (!c) return '<td></td>';
  if (c.ask) return '<td><span class="ask">' + esc(c.ask) + '</span></td>';
  let out = '';
  if (c.was) out += '<span class="was">' + esc(c.was) + '</span>';
  out += '<span class="now">' + esc(c.now) + '</span>';
  if (c.drone) out += DRONE;
  return '<td>' + out + '</td>';
}

export function renderPromo(d) {
  const p = d.promo;
  if (!p || !p.enabled || !p.text.trim()) return '';
  return '      <span class="promo-pill">' + esc(p.text) + '</span>' + NL;
}

export function renderTabs(d) {
  return d.tables
    .map((t, i) =>
      '      <button class="tab' + (i === 0 ? ' on' : '') +
      '" data-p="' + esc(t.id) + '">' + esc(t.tab) + '</button>')
    .join(NL) + NL;
}

export function renderBanner(d) {
  const b = d.banner;
  if (!b || !b.enabled || !(b.lead + b.rest).trim()) return '';
  return [
    '    <div class="once-note rv">',
    '      <svg class="once-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.4 12.1 2.5 2.5 4.7-5.2"/></svg>',
    '      <span><b>' + esc(b.lead) + '</b> ' + esc(b.rest) + '</span>',
    '    </div>',
  ].join(NL) + NL;
}

export function renderTables(d) {
  return d.tables
    .map((t, i) => {
      const rows = t.rows
        .map((r) => '            <tr><td>' + esc(r.size) + '</td>' + cell(r.a) + cell(r.b) + '</tr>')
        .join(NL);
      return [
        '    <div class="panel' + (i === 0 ? ' on' : '') + '" id="p-' + esc(t.id) + '" data-label="' + esc(t.tab) + '">',
        '      <div class="tbl-wrap' + (i === 0 ? ' rv' : '') + '">',
        '        <table>',
        '          <thead><tr><th>' + esc(t.head) + '</th><th>ตรวจครั้งที่ 1</th><th>ตรวจครั้งที่ 2</th></tr></thead>',
        '          <tbody>',
        rows,
        '          </tbody>',
        '        </table>',
        '      </div>',
        '    </div>',
      ].join(NL);
    })
    .join(NL) + NL;
}

export function renderNotes(d) {
  return d.notes
    .filter((n) => n.trim())
    .map((n) => '        <li>' + esc(n) + '</li>')
    .join(NL) + NL;
}

// ลำดับต้องตรงกับลำดับในไฟล์ ไม่งั้นการหา index ครั้งถัดไปจะข้ามบล็อก
export const REGIONS = {
  PROMO: renderPromo,
  TABS: renderTabs,
  BANNER: renderBanner,
  TABLES: renderTables,
  NOTES: renderNotes,
};

// แทนที่เฉพาะเนื้อในระหว่าง <!--ZS:NAME--> กับ <!--/ZS:NAME--> ส่วนที่เหลือของไฟล์ไม่แตะ
export function applyRegions(html, data) {
  let out = html;
  for (const [name, fn] of Object.entries(REGIONS)) {
    const open = '<!--ZS:' + name + '-->' + NL;
    const close = '<!--/ZS:' + name + '-->';
    const a = out.indexOf(open);
    const b = a === -1 ? -1 : out.indexOf(close, a + open.length);
    if (a === -1 || b === -1) throw new Error('ไม่พบบล็อก ZS:' + name + ' ในไฟล์');
    out = out.slice(0, a + open.length) + fn(data) + out.slice(b);
  }
  return out;
}
