const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

(async () => {
    for (const name of ['edge', 'firefox']) {
        const browser = name === 'edge' ? await chromium.launch({ channel: 'msedge', headless: true }) : await firefox.launch({ headless: true });
        try {
            for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
                const page = await browser.newPage({ viewport: { width, height: 960 } });
                const errors = [];
                const apiCalls = [];
                page.on('pageerror', error => errors.push(error.message));
                await page.addInitScript(theme => localStorage.setItem('sonarfy_theme', theme), theme);
                await page.route('**/auth/**', route => { apiCalls.push(route.request().url()); return route.abort(); });
                await page.clock.install();
                await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:4173'}/preview/confirmation.html`);
                await page.locator('#pendingTitle').waitFor({ state: 'visible' });
                await page.getByRole('button', { name: 'Ocultar aviso' }).click();
                assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
                await page.locator('#btnEditEmailIcon').click();
                await page.locator('#newPendingEmailField').fill('previa@exemplo.com');
                await page.locator('#btnSubmitEditEmail').click();
                assert.equal(await page.locator('#pendingEmailDisplay').innerText(), 'previa@exemplo.com');
                await page.locator('#btnResendPendingEmail').click();
                assert.equal(await page.locator('#btnResendPendingEmail').isDisabled(), true);
                assert.match(await page.locator('#pendingSuccessAlert').innerText(), /Nenhum e-mail foi enviado/);
                await page.clock.fastForward(31000);
                assert.equal(await page.locator('#btnResendPendingEmail').isEnabled(), true);
                await page.locator('#theme-toggle').click();
                assert.notEqual(await page.locator('html').getAttribute('data-theme'), theme);
                assert.deepEqual(apiCalls, []);
                assert.deepEqual(errors, []);
                console.log(`${name} ${width}px ${theme}: OK, sem chamadas à API`);
                await page.close();
            }
        } finally { await browser.close(); }
    }
})().catch(error => { console.error(error); process.exit(1); });
