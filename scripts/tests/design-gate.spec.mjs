// 用户明确要求时运行的工程检查（不计美学分、不触发评审循环）：示例图不上线 + axe（WCAG A/AA，含 2.2）+ 三个视口的视觉回归 + reduced-motion。
// 运行：BASE_URL=http://localhost:3000 npx playwright test
// 首次运行生成基准截图；确认设计变更后用 --update-snapshots 更新基准。
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PATHS = (process.env.PATHS || '/').split(',');
const VIEWPORTS = [
  { name: 'm375', width: 375, height: 812 },
  { name: 't768', width: 768, height: 1024 },
  { name: 'd1440', width: 1440, height: 900 },
];

for (const path of PATHS) {
  test(`上线页面不加载示例图：${path}`, async ({ page }) => {
    // 别人的图只能本地当示例。测预览/线上地址时，页面请求里不能出现示例图。
    const bad = [];
    page.on('request', r => { if (/\/_samples\/|\/sample-[\w-]+\.(png|jpe?g|webp|avif|gif)/i.test(r.url())) bad.push(r.url()); });
    await page.goto(BASE_URL + path, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 100)); } });
    expect(bad).toEqual([]);
  });

  test(`axe 无 critical/serious 违规：${path}`, async ({ page }) => {
    await page.goto(BASE_URL + path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const blocking = results.violations.filter(v => ['critical', 'serious'].includes(v.impact));
    expect(blocking.map(v => `${v.id}: ${v.help}`)).toEqual([]);
  });

  for (const vp of VIEWPORTS) {
    test(`视觉回归 ${vp.name}：${path}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(BASE_URL + path);
      const name = `${path.replace(/\W+/g, '_') || 'home'}-${vp.name}.png`;
      await expect(page).toHaveScreenshot(name, { fullPage: true, maxDiffPixelRatio: 0.01 });
    });
  }
}
