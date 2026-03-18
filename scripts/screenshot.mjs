import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://localhost:3000';
const output = process.argv[3] || 'screenshot.png';
const waitMs = parseInt(process.argv[4] || '4000', 10);
const action = process.argv[5] || 'none'; // 'none' | 'start_game' | 'options' | 'step2'

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
await new Promise(r => setTimeout(r, waitMs));

if (action === 'step2') {
  // Press Enter to go to step 2
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 2000));
}

if (action === 'start_game' || action === 'options') {
  // Press Enter to go to step 2, then Enter again to start game
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 1500));
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 3000));

  if (action === 'options') {
    // Escape any port approach, then open options
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 1000));
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 1000));
    await page.keyboard.press('Space');
    await new Promise(r => setTimeout(r, 1500));
  }
}

await page.screenshot({ path: output, fullPage: false });
console.log(`Screenshot saved: ${output}`);
await browser.close();
