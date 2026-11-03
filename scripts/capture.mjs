// 用法：node capture.mjs <url> [输出目录]
// 输出：每个宽度一张首屏图 + 一张全页图
import { launch } from './lib/browser.mjs';
import { mkdir } from 'node:fs/promises';

const [, , url, outDir = './out'] = process.argv;
if (!url) { console.error('用法：node capture.mjs <url> [输出目录]'); process.exit(1); }

const widths = [
  { name: '375', width: 375, height: 812 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
];

await mkdir(outDir, { recursive: true });
const browser = await launch();
try {
  for (const w of widths) {
    const page = await browser.newPage({ viewport: { width: w.width, height: w.height } });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    // 慢慢滚到底，触发懒加载和滚动动画，再回到顶部
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 150));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outDir}/${w.name}-fold.png` });
    await page.screenshot({ path: `${outDir}/${w.name}-full.png`, fullPage: true });
    await page.close();
    console.log(`完成 ${w.name}px`);
  }
} finally {
  await browser.close();
}
