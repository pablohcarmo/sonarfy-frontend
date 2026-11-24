const { chromium, firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'test-results/ecos');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, bytes) => {
        res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
        res.end(error ? 'Not found' : bytes);
    });
});

async function noOverflow(page, width) {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, 'No horizontal overflow');
}

async function loadedAssets(page) {
    await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    const images = await page.locator('img').evaluateAll(images => images.map(img => ({
        src: img.src,
        width: img.getBoundingClientRect().width,
        height: img.getBoundingClientRect().height,
        loaded: img.complete && img.naturalWidth > 0
    })));
    assert(images.every(img => img.loaded), 'All img assets loaded');
    for (const href of await page.locator('svg use').evaluateAll(nodes => nodes.map(node => node.getAttribute('href').split('#')[0]))) {
        const response = await page.request.get(new URL(href, page.url()).href);
        assert(response.ok(), `SVG sprite ${href} ok`);
        assert((await response.body()).length > 0, `SVG sprite ${href} non-empty`);
    }
    return images;
}

async function visibleFocus(page) {
    const focus = await page.evaluate(() => {
        const el = document.activeElement;
        const css = getComputedStyle(el);
        return { visible: el.matches(':focus-visible'), style: css.outlineStyle, width: parseFloat(css.outlineWidth) };
    });
    assert(focus.visible && focus.style !== 'none' && focus.width >= 2, JSON.stringify(focus));
}

(async () => {
    fs.mkdirSync(output, { recursive: true });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const results = [];

    for (const name of ['edge', 'firefox']) {
        const browser = name === 'edge'
            ? await chromium.launch({ channel: 'msedge', headless: true })
            : await firefox.launch({ headless: true });
        try {
            for (const width of [1440, 390]) {
                for (const theme of ['light', 'dark']) {
                    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
                    const page = await context.newPage();
                    const errors = [];
                    page.on('pageerror', error => errors.push(error.message));

                    await page.addInitScript(theme => {
                        localStorage.setItem('sonarfy_theme', theme);
                        const scenario = new URL(location.href).searchParams.get('scenario');
                        if (!scenario) return;
                        let failedOnce = false;
                        window.sonarfyEcosAdapter = {
                            async load() {
                                const { createEcosFixtures } = await import('/js/ecos-fixtures.js');
                                if (scenario === 'loading') await new Promise(resolve => { window.releaseEcos = resolve; });
                                if (scenario === 'empty') return { connected: false, items: [] };
                                if (scenario === 'error' && !failedOnce) {
                                    failedOnce = true;
                                    throw new Error('Falha de conexão simulada');
                                }
                                return createEcosFixtures();
                            },
                            async loadAlbumListens(spotifyId) {
                                const { createEcosFixtures } = await import('/js/ecos-fixtures.js');
                                const fixtures = createEcosFixtures();
                                return { items: fixtures.listensByAlbum[spotifyId] || [], nextCursor: null, sync: fixtures.sync };
                            },
                            async refresh() {
                                const { createEcosFixtures } = await import('/js/ecos-fixtures.js');
                                return createEcosFixtures();
                            }
                        };
                    }, theme);

                    const prefix = `${name}-${width}-${theme}`;
                    await page.goto(`${base}/pages/echoes.html?demo=true`);
                    await page.locator('.eco-row').first().waitFor();
                    await page.evaluate(() => document.fonts.ready);

                    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
                    assert.equal(await page.locator('.eco-row').count(), 4);
                    assert.equal((await page.locator('.site-header').boundingBox()).height, width === 1440 ? 88 : 80);
                    assert.equal((await page.locator('.eco-row').first().boundingBox()).width, width === 1440 ? 1080 : 358);
                    assert.equal((await page.locator('.eco-cover').first().boundingBox()).width, width === 1440 ? 64 : 52);
                    assert.equal(await page.locator('.profile-sidebar [aria-current="page"]').textContent(), 'Ecos');
                    assert.equal(await page.locator('.profile-sidebar .profile-navigation > *').count(), 7);
                    assert(await page.locator('.profile-footer').evaluate(el => el === document.body.lastElementChild && el.getBoundingClientRect().top >= document.querySelector('.ecos-list').getBoundingClientRect().bottom));

                    await loadedAssets(page);
                    await noOverflow(page, width);
                    await page.screenshot({ path: `${output}/${prefix}-populated.png`, fullPage: false });

                    // Keyboard focus, accordion expand/collapse, lazy listen loading, absence of "♪", and album unavailability feedback
                    await page.keyboard.press('Tab');
                    await visibleFocus(page);
                    assert.equal(await page.locator('.eco-row [data-toggle-album]').first().getAttribute('aria-expanded'), 'false');
                    assert.equal(await page.locator('.eco-details-panel').count(), 0);
                    assert.equal((await page.locator('#ecos-content').textContent()).includes('♪'), false);
                    await page.locator('.eco-row [data-toggle-album]').first().focus();
                    await page.keyboard.press('Enter');
                    await page.locator('.eco-row .eco-tracks').first().waitFor();
                    assert.equal(await page.locator('.eco-row [data-toggle-album]').first().getAttribute('aria-expanded'), 'true');
                    await page.keyboard.press('Enter');
                    assert.equal(await page.locator('.eco-row [data-toggle-album]').first().getAttribute('aria-expanded'), 'false');
                    assert.equal(await page.locator('.eco-row[data-album-id="album-bad"] .eco-rate-label').textContent(), 'Avaliar');
                    assert.equal(await page.locator('.eco-row[data-album-id="album-solaris"] .eco-rate-label').textContent(), 'Avaliado');
                    assert.equal(await page.locator('.eco-row[data-album-id="album-solaris"] .eco-rate-btn').evaluate(el => el.classList.contains('is-rated')), true);
                    await page.locator('.eco-rate-btn').first().click();
                    await page.waitForURL(/\/pages\/album-review\.html\?/);
                    assert.match(page.url(), /id=album-bad/);
                    await page.goBack();
                    await page.waitForSelector('.eco-row');

                    // Clicking "Ver álbum" or the album cover navigates to Album Page without toggling tracks
                    assert.match(await page.locator('.eco-row .eco-cover-link').first().getAttribute('href'), /^album\.html\?demo=true&albumId=album-bad/);
                    await page.locator('.eco-row .eco-album-link').first().click();
                    await page.waitForURL(/\/pages\/album\.html\?/);
                    assert.match(page.url(), /albumId=album-bad/);
                    await page.goBack();
                    await page.waitForSelector('.eco-row');

                    // Mobile drawer focus containment and Escape
                    if (width === 390) {
                        await page.locator('#open-menu').click();
                        assert.equal((await page.locator('#profile-drawer').boundingBox()).width, 296);
                        assert.equal(await page.locator('#profile-drawer [aria-current="page"]').textContent(), 'Ecos');
                        await page.screenshot({ path: `${output}/${prefix}-drawer.png`, fullPage: false });
                        await page.keyboard.press('Escape');
                        assert.equal(await page.locator('#profile-drawer').evaluate(d => d.open), false);
                    }

                    // Loading skeleton + reduced-motion
                    await page.goto(`${base}/pages/echoes.html?scenario=loading`);
                    await page.locator('.ecos-skeleton-list').waitFor();
                    assert.equal(await page.locator('.ecos-skeleton-list').getAttribute('aria-busy'), 'true');
                    assert.equal(await page.locator('.ecos-skeleton-block').first().evaluate(el => getComputedStyle(el).animationName), 'none');
                    await noOverflow(page, width);
                    await page.evaluate(() => window.releaseEcos());
                    await page.locator('.eco-row').first().waitFor();

                    // Empty / Spotify Not Connected state
                    await page.goto(`${base}/pages/echoes.html?scenario=empty`);
                    await page.locator('.ecos-empty').waitFor();
                    assert.equal(await page.locator('#ecos-sync-pill').textContent(), 'Desconectado');
                    assert.equal(await page.locator('#ecos-sync-pill [data-refresh]').count(), 0);
                    assert.equal(await page.locator('.ecos-empty-logo').getAttribute('src'), '../assets/icons/spotify-sync/spotify.svg');
                    assert.equal(await page.locator('.ecos-cta-icon').getAttribute('src'), '../assets/icons/spotify-sync/spotify-button.svg');
                    assert.equal(await page.locator('.ecos-connect-cta').getAttribute('href'), 'spotify-sync.html?source=echoes');
                    await loadedAssets(page);
                    await noOverflow(page, width);
                    await page.screenshot({ path: `${output}/${prefix}-empty.png`, fullPage: false });

                    // Error + Retry state
                    await page.goto(`${base}/pages/echoes.html?scenario=error`);
                    await page.locator('.ecos-error-card').waitFor();
                    await noOverflow(page, width);
                    await page.locator('[data-retry]').click();
                    await page.locator('.eco-row').first().waitFor();

                    // Logout credential removal
                    await page.evaluate(() => localStorage.setItem('sonarfy_token', 'jwt-browser-test'));
                    if (width === 390) {
                        await page.locator('#open-menu').click();
                        await page.locator('#profile-drawer a[href^="logout.html"]').click();
                    } else {
                        await page.locator('.profile-sidebar a[href^="logout.html"]').click();
                    }
                    await page.waitForURL('**/logout.html*');

                    assert.deepEqual(errors, []);
                    results.push({ browser: name, width, theme, status: 'passed' });
                    await context.close();
                }
            }
        } finally {
            await browser.close();
        }
    }

    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
    console.log(JSON.stringify({ passed: results.length, results }, null, 2));
    server.close();
})();
