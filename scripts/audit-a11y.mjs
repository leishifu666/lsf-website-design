// 用法：node audit-a11y.mjs <url> [输出目录]
// 用 axe-core 扫描 WCAG 2.0/2.1 A 与 AA 规则，输出 a11y.json 并在终端打印摘要
import { launch } from './lib/browser.mjs';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const [, , url, outDir = './out'] = process.argv;
if (!url) { console.error('用法：node audit-a11y.mjs <url> [输出目录]'); process.exit(1); }

await mkdir(outDir, { recursive: true });
const browser = await launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); // @axe-core/playwright 要求用 newContext 建页面
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(v => ({
    rule: v.id, impact: v.impact, help: v.help, count: v.nodes.length,
    targets: v.nodes.slice(0, 5).map(n => n.target.join(' ')),
  }));
  await writeFile(`${outDir}/a11y.json`, JSON.stringify({ url, summary, full: results }, null, 2));
  console.table(summary.map(({ rule, impact, count }) => ({ rule, impact, count })));
  console.log(`已写入 ${outDir}/a11y.json（自动扫描只能发现部分问题，重要页面需手动复查）`);
} finally {
  await browser.close();
}
