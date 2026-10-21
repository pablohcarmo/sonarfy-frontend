const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
    const output = 'docs/confirmation-qa';
    fs.mkdirSync(output, { recursive: true });
    const results = [];
    for (const name of ['edge', 'firefox']) {
        const browser = name === 'edge'
            ? await chromium.launch({ channel: 'msedge', headless: true })
            : await firefox.launch({ headless: true });
        try {
            for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
                const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 956 : 960 }, deviceScaleFactor: 1 });
                const page = await context.newPage();
                const errors = [];
                let resendFails = false;
                page.on('pageerror', error => errors.push(error.message));
                await page.addInitScript(theme => {
                    localStorage.setItem('sonarfy_theme', theme);
                    window.sonarfyCitySearch = async () => [{ name: 'São Paulo', adminName1: 'São Paulo', countryName: 'Brasil' }];
                }, theme);
                await page.clock.install();
                await page.route('**/auth/register', route => route.fulfill({ status: 201, json: { email: 'usuario@exemplo.com', registrationToken: 'test-registration-token' } }));
                await page.route('**/auth/update-pending-email', route => {
                    assert.equal(route.request().headers().authorization, 'Bearer test-registration-token');
                    return route.fulfill({ status: 200, body: 'E-mail atualizado.' });
                });
                await page.route('**/auth/resend-activation-email?*', route => route.fulfill({ status: resendFails ? 500 : 200, body: resendFails ? 'unavailable' : 'Enviado.' }));
                await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:4173'}/pages/cadastro.html`);
                await page.evaluate(() => document.fonts.ready);
                for (const [id, value] of Object.entries({ nameField: 'Pablo', surnameField: 'Carmo', handleField: 'pablo', emailField: 'usuario@exemplo.com', passwordField: 'Senha@123', confirmPasswordField: 'Senha@123', birthDateField: '2000-01-01', cityField: 'São Paulo' })) {
                    await page.locator(`#${id}`).fill(value);
                }
                await page.locator('#citySuggestions .autocomplete-item').first().click();
                await page.locator('#termsAccepted').check();
                await page.locator('#registerForm button[type="submit"]').click();
                await page.locator('#pendingTitle').waitFor({ state: 'visible' });
                assert.equal(await page.locator('body').getAttribute('data-registration-step'), 'confirmation');
                assert.equal(await page.locator('.register-showcase').isVisible(), false);
                assert.equal(await page.locator('#btnResendPendingEmail').isDisabled(), true);
                assert.equal(await page.locator('#btnEditEmailIcon').isDisabled(), true);
                assert.equal(await page.locator('.site-header .back-link').isVisible(), true);
                await page.clock.fastForward(31000);
                assert.equal(await page.locator('#btnResendPendingEmail').isEnabled(), true);
                await page.screenshot({ path: `${output}/${name}-${width}-${theme}.png`, fullPage: true, animations: 'disabled' });
                const geometry = await page.evaluate(() => ({
                    viewport: innerWidth,
                    scrollWidth: document.documentElement.scrollWidth,
                    fontLoaded: document.fonts.check('15px Inter'),
                    card: document.querySelector('.confirmation-card').getBoundingClientRect().toJSON(),
                    assets: Array.from(document.images).filter(image => image.getBoundingClientRect().width > 0).map(image => ({ src: image.currentSrc.split('/').pop(), loaded: image.complete && image.naturalWidth > 0, width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height }))
                }));
                assert.equal(geometry.scrollWidth, width);
                assert.equal(geometry.card.width, width === 1440 ? 560 : 342);
                assert(geometry.assets.every(image => image.loaded));
                await page.locator('#btnEditEmailIcon').click();
                await page.locator('#newPendingEmailField').waitFor({ state: 'visible' });
                assert.equal(await page.locator('#newPendingEmailField').inputValue(), 'usuario@exemplo.com');
                await page.screenshot({ path: `${output}/${name}-${width}-${theme}-edit.png`, fullPage: true, animations: 'disabled' });
                await page.locator('#newPendingEmailField').fill('email.corrigido@exemplo.com');
                await page.locator('#btnSubmitEditEmail').click();
                await page.locator('#editEmailModal').waitFor({ state: 'hidden' });
                assert.equal(await page.locator('#pendingEmailDisplay').innerText(), 'email.corrigido@exemplo.com');
                assert.equal(await page.locator('#btnResendPendingEmail').isDisabled(), true);
                await page.clock.fastForward(31000);
                resendFails = true;
                await page.locator('#btnResendPendingEmail').click();
                await page.locator('#pendingErrorAlert').waitFor({ state: 'visible' });
                assert.equal(await page.locator('#btnResendPendingEmail').isEnabled(), true);
                resendFails = false;
                await page.locator('#btnResendPendingEmail').click();
                await page.locator('#pendingSuccessAlert').waitFor({ state: 'visible' });
                assert.equal(await page.locator('#btnResendPendingEmail').isDisabled(), true);
                await page.clock.fastForward(31000);
                await page.locator('#btnEditEmailIcon').click();
                const longEmail = `${'nome'.repeat(15)}@${'dominio'.repeat(8)}.com`;
                await page.locator('#newPendingEmailField').fill(longEmail);
                await page.locator('#btnSubmitEditEmail').click();
                await page.locator('#editEmailModal').waitFor({ state: 'hidden' });
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
                await page.locator('#theme-toggle').click();
                assert.notEqual(await page.locator('html').getAttribute('data-theme'), theme);
                await page.locator('#btnBackToForm').click();
                await page.locator('#registerForm').waitFor({ state: 'visible' });
                assert.equal(await page.evaluate(() => document.activeElement.id), 'nameField');
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
                assert.deepEqual(errors, []);
                results.push({ browser: name, version: browser.version(), width, theme, errors, geometry });
                await context.close();
            }
        } finally {
            await browser.close();
        }
    }
    fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results.map(({ geometry, ...result }) => ({ ...result, card: geometry.card })), null, 2));
})().catch(error => { console.error(error); process.exit(1); });
