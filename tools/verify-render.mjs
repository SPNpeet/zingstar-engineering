// พิสูจน์ว่าโค้ดสร้าง HTML จาก data/site.json แล้วได้ตรงกับไฟล์จริงทุกตัวอักษร
// ถ้าไม่ตรง แปลว่าหน้า admin จะทำหน้าเว็บเพี้ยนตอนกดเผยแพร่ครั้งแรก
import { readFileSync, writeFileSync } from 'node:fs';
import { applyRegions } from '../admin/render.js';

const data = JSON.parse(readFileSync('data/site.json', 'utf8'));
const write = process.argv.includes('--write');
let bad = 0;

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
