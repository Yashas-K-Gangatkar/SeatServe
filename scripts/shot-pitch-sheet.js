// Screenshot the pitch sheet HTML to PNG preview (full page, 2x for crispness)
import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: 2,
  });
  await page.goto('file:///home/z/my-project/scripts/pitch-sheet.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600); // let Inter webfont settle
  await page.screenshot({ path: '/home/z/my-project/download/NotiFetch-Pitch-Sheet.png', fullPage: true });
  await browser.close();
  console.log('OK -> /home/z/my-project/download/NotiFetch-Pitch-Sheet.png');
})();
