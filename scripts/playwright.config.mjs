// npm run gate 的配置：CHROME_PATH 指向本机 Chrome/Chromium 时用它（Playwright 自带浏览器下载失败时用）
export default {
  testDir: 'tests',
  use: { launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } : {} },
};
