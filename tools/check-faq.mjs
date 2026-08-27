// กันคำตอบใน FAQ กับใน JSON-LD หลุดจากกัน แก้ที่เดียวลืมอีกที่คือทางที่ผิดที่ง่ายที่สุด
import { readFileSync } from 'node:fs';

let bad = 0;
for (const path of ['index.html', 'base.html']) {
  const s = readFileSync(path, 'utf8');
  const blocks = [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
  const faq = blocks.find((d) => d['@type'] === 'FAQPage');
  const sec = s.match(/<section id="faq"[\s\S]*?<\/section>/);
  if (!faq || !sec) { console.log(`FAIL  ${path}: ไม่พบหมวด FAQ หรือบล็อก FAQPage`); bad++; continue; }

  const qs = [...sec[0].matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) => m[1].trim());
  const as = [...sec[0].matchAll(/<div class="faq-a">([\s\S]*?)<\/div>/g)].map((m) => m[1].trim());

  if (qs.length !== faq.mainEntity.length) {
    console.log(`FAIL  ${path}: หน้าเว็บมี ${qs.length} ข้อ แต่ JSON-LD มี ${faq.mainEntity.length} ข้อ`);
    bad++; continue;
  }
  let mismatched = 0;
  faq.mainEntity.forEach((it, i) => {
    if (it.name !== qs[i] || it.acceptedAnswer.text !== as[i]) {
      console.log(`FAIL  ${path} ข้อ ${i + 1}: ข้อความไม่ตรงกับ JSON-LD`);
      mismatched++;
    }
  });
  if (mismatched) bad++;
  else console.log(`ok    ${path} (${qs.length} คำถาม ตรงกับ JSON-LD)`);
}
process.exit(bad ? 1 : 0);
