// พิสูจน์ว่าโค้ดสร้าง HTML จาก data/site.json แล้วได้ตรงกับไฟล์จริงทุกตัวอักษร
// ถ้าไม่ตรง แปลว่าหน้า admin จะทำหน้าเว็บเพี้ยนตอนกดเผยแพร่ครั้งแรก
import { readFileSync, writeFileSync } from 'node:fs';
import { applyRegions, promoExpired } from '../admin/render.js';

const data = JSON.parse(readFileSync('data/site.json', 'utf8'));
const write = process.argv.includes('--write');
let bad = 0;

if (data.promo.enabled && promoExpired(data)) {
  console.log(`FAIL  data/site.json: ป้ายโปรหมดอายุ ${data.promo.until} แล้วแต่ยังเปิดอยู่ ปิด enabled หรือเลื่อน until ก่อน`);
  bad++;
}

// ช่วงราคาใน JSON-LD เคยเขียนมือไว้ ฿700-฿10,000 ทั้งที่ตารางบ้านขึ้นถึง 12,000
// ราคาที่ Google อ่านกับราคาที่ลูกค้าเห็นต้องเป็นตัวเลขชุดเดียวกันเสมอ
const amounts = [];
for (const t of data.tables) {
  for (const r of t.rows) {
    for (const key of ['a', 'b']) {
      const cell = r[key];
      if (!cell || cell.ask) continue;
      const n = Number(String(cell.now || '').replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) amounts.push(n);
    }
  }
}
const baht = (n) => '฿' + n.toLocaleString('en-US');
const wantRange = `"priceRange": "${baht(Math.min(...amounts))}-${baht(Math.max(...amounts))}"`;
const indexHtml = readFileSync('index.html', 'utf8');
if (!indexHtml.includes(wantRange)) {
  const found = (indexHtml.match(/"priceRange": "[^"]*"/) || ['ไม่มีเลย'])[0];
  console.log(`FAIL  index.html: priceRange ใน JSON-LD ไม่ตรงตารางราคา\n  ควรเป็น ${wantRange}\n  ตอนนี้ ${found}`);
  bad++;
}

for (const path of ['index.html', 'base.html']) {
  const cur = readFileSync(path, 'utf8');
  const out = applyRegions(cur, data);
  if (out === cur) {
    console.log(`ok    ${path}`);
  } else if (write) {
    writeFileSync(path, out);
    console.log(`wrote ${path}`);
  } else {
    bad++;
    const a = cur.split('\n'), b = out.split('\n');
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        console.log(`DIFF  ${path}:${i + 1}\n  file: ${JSON.stringify(a[i])}\n  gen : ${JSON.stringify(b[i])}`);
        break;
      }
    }
  }
}
process.exit(bad ? 1 : 0);
