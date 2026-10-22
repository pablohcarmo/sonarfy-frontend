const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
    const output = process.env.OUTPUT_DIR || '.codex/shared-brand-qa';
    fs.mkdirSync(output, { recursive: true });
    const results = [];
    for (const name of ['edge', 'firefox']) {
        const browser = name === 'edge'
            ? await chromium.launch({ channel: 'msedge', headless: true })
            : await firefox.launch({ headless: true });
        try {
            for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
                const context = await browser.newContext({ viewport: { width, height: 1000 } });
                await context.addInitScript(theme => localStorage.setItem('sonarfy_theme', theme), theme);
                for (const route of ['index.html', 'pages/login.html', 'pages/register.html', 'pages/verify.html']) {
                    const page = await context.newPage();
                    const errors = [];
                    page.on('pageerror', error => errors.push(error.message));
                    await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:4173'}/${route}`);
                    await page.evaluate(() => document.fonts.ready);
                    const brand = page.locator('.site-header .brand');
                    assert(await brand.isVisible());
                    assert.equal(await brand.getAttribute('href'), route === 'index.html' ? 'index.html' : '../index.html');
                    const symbols = [];
                    for (const symbol of await page.locator('.brand-symbol:visible').all()) {
                        const style = await symbol.evaluate(el => {
                            const css = getComputedStyle(el);
                            return { width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, background: css.backgroundColor, color: css.color, radius: css.borderRadius };
                        });
                        assert.equal(style.width, width === 390 ? 24 : 32);
                        assert.equal(style.height, style.width);
                        assert.equal(style.background, 'rgb(39, 169, 245)');
                        assert.equal(style.color, 'rgb(26, 26, 26)');
                        assert.equal(style.radius, '50%');
                        symbols.push(style);
                    }
                    if (/register|verify/.test(route)) assert(symbols.length > 0);
                    else {
                        const svg = brand.locator('svg:visible');
                        assert.equal(await svg.count(), 1);
                        assert.equal((await svg.boundingBox()).width, width === 390 ? 95 : 118);
                        assert(await svg.locator('use').evaluate(el => el.getBBox().width > 0));
                    }
                    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
                    const key = `${name}-${width}-${theme}-${route.split('/').pop().replace('.html', '')}`;
                    await page.screenshot({ path: `${output}/${key}.png`, fullPage: true });
                    await page.locator('#theme-toggle').click();
                    assert.notEqual(await page.locator('html').getAttribute('data-theme'), theme);
                    assert.deepEqual(errors, []);
                    results.push({ key, browser: name, version: browser.version(), symbols });
                    await page.close();
                }
                await context.close();
            }
        } finally { await browser.close(); }
    }
    fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    console.log(`${results.length} shared-brand combinations passed.`);
})().catch(error => { console.error(error); process.exit(1); });
