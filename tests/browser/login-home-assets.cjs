const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
    const output = process.env.OUTPUT_DIR || 'test-results/login-home-assets';
    fs.mkdirSync(output, { recursive: true });
    const results = [];
    for (const name of ['edge', 'firefox']) {
        const browser = name === 'edge'
            ? await chromium.launch({ channel: 'msedge', headless: true })
            : await firefox.launch({ headless: true });
        try {
            for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
                const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 918 : 904 } });
                await context.addInitScript(theme => localStorage.setItem('sonarfy_theme', theme), theme);
                for (const route of ['index.html', 'pages/login.html']) {
                    const page = await context.newPage();
                    const errors = [];
                    page.on('pageerror', error => errors.push(error.message));
                    page.on('response', response => { if (response.status() >= 400 && response.url().includes('/assets/')) errors.push(response.url()); });
                    await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:4173'}/${route}`);
                    await page.evaluate(() => document.fonts.ready);
                    await page.locator('html').evaluate((el, theme) => el.dataset.theme = theme, theme);
                    const key = `${name}-${width}-${theme}-${route.includes('login') ? 'login' : 'index'}`;
                    const geometry = await page.evaluate(() => ({
                        width: document.documentElement.scrollWidth,
                        fontLoaded: document.fonts.check('15px Inter'),
                        content: document.querySelector('.login-card, .hero-content').getBoundingClientRect().toJSON(),
                        assets: [...document.querySelectorAll('img, svg')].filter(el => el.getBoundingClientRect().width > 0).map(el => ({
                            src: el.currentSrc || el.querySelector('use')?.getAttribute('href'),
                            loaded: el.tagName !== 'IMG' || (el.complete && el.naturalWidth > 0),
                            bounds: el.getBoundingClientRect().toJSON(),
                            color: getComputedStyle(el).color
                        }))
                    }));
                    assert.equal(geometry.width, width);
                    assert(geometry.assets.every(asset => asset.loaded));
                    assert(geometry.fontLoaded);
                    await page.screenshot({ path: `${output}/${key}.png`, fullPage: true, animations: 'disabled' });
                    if (route.includes('login')) {
                        await page.locator('#passwordField').fill('Teste123!');
                        await page.locator('#btnTogglePassword').click();
                        assert.equal(await page.locator('#passwordField').getAttribute('type'), 'text');
                        assert.equal(await page.locator('#btnTogglePassword').getAttribute('aria-label'), 'Ocultar senha');
                        await page.locator('#rememberMeCheckbox').check();
                        assert(await page.locator('#rememberMeCheckbox').isChecked());
                        if (await page.locator('#loginForm .eye-off').count()) {
                            assert(await page.locator('#loginForm .eye-off').isVisible());
                            assert.equal(await page.locator('#loginForm .eye-open').isVisible(), false);
                            assert.equal(await page.locator('.checkbox-check').evaluate(el => getComputedStyle(el).visibility), 'visible');
                        }
                        await page.screenshot({ path: `${output}/${key}-states.png`, fullPage: true });
                        await page.locator('#btnTogglePassword').click();
                        assert.equal(await page.locator('#passwordField').getAttribute('type'), 'password');
                        await page.locator('#btnSubmitLogin').click();
                        assert.equal(await page.evaluate(() => document.activeElement.id), 'loginField');

                        // Verifica fluxo explícito de reativação de conta (POST /api/auth/reactivation) sem overflow.
                        let capturedHeaders = null;
                        await page.route('**/api/auth/reactivation', async route => {
                            capturedHeaders = route.request().headers();
                            await route.fulfill({ status: 204, body: '' });
                        });
                        await page.evaluate(() => localStorage.setItem('sonarfy_token', 'stale-token'));
                        await page.locator('#btnOpenReactivation').click();
                        assert.equal(await page.locator('#reactivationForm').isVisible(), true);
                        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
                        await page.locator('#reactivationLogin').fill('@usuario');
                        await page.locator('#reactivationPassword').fill('SenhaAtual123!');
                        await page.locator('#btnToggleReactivationPassword').click();
                        assert.equal(await page.locator('#reactivationPassword').getAttribute('type'), 'text');
                        await page.locator('#btnSubmitReactivation').click();
                        await page.locator('#successMessage').waitFor({ state: 'visible' });
                        assert.equal(capturedHeaders['x-sonarfy-csrf'], '1');
                        assert.equal(capturedHeaders.authorization, undefined);
                        assert.equal(await page.evaluate(() => localStorage.getItem('sonarfy_token')), null);
                        assert.equal(await page.locator('#reactivationForm').isVisible(), false);
                        assert.equal(await page.locator('#loginForm').isVisible(), true);
                        assert.equal(await page.locator('#passwordField').inputValue(), '');
                    } else {
                        await page.locator('a[href="#saiba-mais"]').click();
                        assert.equal(new URL(page.url()).hash, '#saiba-mais');
                        assert.equal(await page.locator('.header-login').getAttribute('href'), 'pages/login.html');
                        assert.deepEqual(await page.locator('a.button-primary').evaluateAll(links => links.map(link => link.getAttribute('href'))), ['pages/register.html', 'pages/register.html']);
                    }
                    await page.locator('#theme-toggle').click();
                    assert.notEqual(await page.locator('html').getAttribute('data-theme'), theme);
                    assert.deepEqual(errors, []);
                    for (const use of await page.locator('svg:visible use').all()) {
                        const painted = await use.evaluate(el => { const b = el.getBBox(); return b.width > 0 && b.height > 0; });
                        assert(painted, `Empty SVG: ${await use.getAttribute('href')}`);
                    }
                    results.push({ key, browser: name, version: browser.version(), theme, viewport: width, geometry });
                    await page.close();
                }
                await context.close();
            }
        } finally { await browser.close(); }
    }
    fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    console.log(`${results.length} page/browser/viewport/theme combinations passed.`);
})().catch(error => { console.error(error); process.exit(1); });
