import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEcosAdapter, createEcosFixtures } from '../js/ecos-fixtures.js';
import { createEcosState, ecoTimestamp, logout, validateEcos } from '../js/ecos-state.js';
import { sidebar } from '../js/profile-shell.js';
import { mountEcos } from '../js/ecos.js';

const deferred = () => {
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    return { promise, resolve, reject };
};

let mounted;
afterEach(() => {
    mounted?.destroy();
    mounted = null;
    document.body.innerHTML = '';
    localStorage.clear();
    vi.useRealTimers();
});

function mount(adapter) {
    history.replaceState(null, '', '/pages/echoes.html');
    const html = readFileSync('pages/echoes.html', 'utf8');
    document.body.innerHTML = html.split('<body class="ecos-page">')[1].split('</body>')[0];
    mounted = mountEcos(adapter);
    return mounted;
}

describe('ecos: fixtures, validation, timestamps, and sidebar', () => {
    it('validates grouped album summaries without fabricating missing fields', () => {
        const fixtures = createEcosFixtures();
        expect(fixtures.connected).toBe(true);
        expect(fixtures.items.length).toBeGreaterThan(0);
        const validated = validateEcos(fixtures);
        expect(validated.items[0].album.spotifyId).toBe('album-bad');
        expect(validated.items[0].listenCount).toBe(3);
    });

    it('formats live playback, < 24h relative minutes/hours, and >= 24h Mês Dia dates', () => {
        const now = new Date(2026, 10, 23, 12, 0).getTime();
        expect(ecoTimestamp(new Date(now).toISOString(), { isPlaying: true, now })).toBe('Ouvindo agora');
        expect(ecoTimestamp(new Date(now - 18 * 60000).toISOString(), { now })).toBe('18m');
        expect(ecoTimestamp(new Date(now - 3 * 3600000).toISOString(), { now })).toBe('3h');
        expect(ecoTimestamp(new Date(now - 24 * 3600000 + 1).toISOString(), { now })).toBe('23h');
        expect(ecoTimestamp(new Date(now - 3 * 86400000).toISOString(), { now })).toBe('Nov 20');
    });

    it('wires Ecos active in echoes.html and linked from other pages via shared sidebar', () => {
        document.body.innerHTML = sidebar(false, {}, 'echoes');
        const active = document.querySelector('[aria-current="page"]');
        expect(active.getAttribute('href')).toBe('echoes.html');
        expect(active.textContent).toBe('Ecos');
        expect(active.querySelector('img').getAttribute('src')).toContain('assets/icons/ecos/active-ecos.svg');

        document.body.innerHTML = sidebar(false, {}, 'home');
        const ecosLink = [...document.querySelectorAll('.profile-navigation a')].find(a => a.textContent === 'Ecos');
        expect(ecosLink.getAttribute('href')).toBe('echoes.html');
    });

    it('uses host adapter when provided and falls back to demo fixtures otherwise', async () => {
        const host = { load: vi.fn(), sync: vi.fn() };
        expect(createEcosAdapter(host)).toBe(host);
        window.sonarfyEcosAdapter = host;
        expect(createEcosAdapter()).toBe(host);
        delete window.sonarfyEcosAdapter;

        const demo = createEcosAdapter(null);
        expect(demo.demo).toBe(true);
        const data = await demo.load();
        expect(data.items.length).toBe(4);
        const listens = await demo.loadAlbumListens('album-bad');
        expect(listens.items).toHaveLength(3);
    });
});

describe('ecos: states, concurrency lock, navigation, and logout', () => {
    it('renders populated, not-connected, error/retry states, and enforces sync concurrency lock', async () => {
        const initial = deferred();
        const refreshDeferred = deferred();
        const adapter = {
            load: vi.fn()
                .mockImplementationOnce(() => initial.promise)
                .mockResolvedValueOnce({ connected: false, items: [] })
                .mockResolvedValueOnce({ connected: false, items: [] }),
            refresh: vi.fn(() => refreshDeferred.promise)
        };

        const app = mount(adapter);
        expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
        expect(document.querySelector('[data-refresh]').disabled).toBe(true);

        initial.resolve(createEcosFixtures());
        await app.ready;
        expect(document.querySelectorAll('.eco-row')).toHaveLength(4);
        expect(document.querySelector('#ecos-sync-pill').textContent).toContain('Conectado · Sincronizar');
        expect(document.querySelector('#ecos-content').textContent).not.toContain('♪');
        expect(document.querySelector('.eco-row [data-toggle-album]').getAttribute('aria-expanded')).toBe('false');
        expect(document.querySelector('.eco-details-panel')).toBeNull();

        // Trigger concurrent refreshes; only one adapter.refresh() call should fire.
        const firstRefresh = app.store.refresh();
        const secondRefresh = app.store.refresh();
        expect(adapter.refresh).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[data-refresh]').disabled).toBe(true);
        refreshDeferred.resolve(createEcosFixtures());
        await Promise.all([firstRefresh, secondRefresh]);
        expect(document.querySelector('[data-refresh]').disabled).toBe(false);

        // Not connected empty state
        await app.store.load();
        const pillText = document.querySelector('#ecos-sync-pill').textContent;
        expect(pillText).toBe('Desconectado');
        expect(pillText).not.toContain('Conectado');
        expect(document.querySelector('#ecos-sync-pill [data-refresh]')).toBeNull();
        expect(document.querySelector('.ecos-empty-logo').getAttribute('src')).toContain('assets/icons/spotify-sync/spotify.svg');
        expect(document.querySelector('.ecos-cta-icon').getAttribute('src')).toContain('assets/icons/spotify-sync/spotify-button.svg');
        const cta = document.querySelector('.ecos-connect-cta');
        expect(cta).not.toBeNull();
        expect(cta.getAttribute('href')).toBe('spotify-sync.html?source=echoes');

        // Error state when no cached data is present
        const errorState = createEcosState({ load: vi.fn().mockRejectedValue(new Error('Erro de rede')) });
        await errorState.load();
        expect(errorState.state.status).toBe('error');
        expect(errorState.state.error).toBe('Erro de rede');
    });

    it('routes album clicks to host action and updates timestamps every minute', async () => {
        vi.useFakeTimers();
        const now = new Date(2026, 10, 23, 12, 0).getTime();
        vi.setSystemTime(now);
        const onAlbum = vi.fn();
        const adapter = {
            load: async () => ({
                connected: true,
                items: [
                    {
                        album: { spotifyId: 'alb-1', name: 'Neon Horizons', coverUrl: null },
                        lastPlayedAt: new Date(now - 18 * 60000).toISOString(),
                        listenCount: 1
                    }
                ],
                nextCursor: null,
                sync: {}
            }),
            actions: { album: onAlbum }
        };

        const app = mount(adapter);
        await app.ready;
        const rateBtn = document.querySelector('.eco-rate-btn');
        rateBtn.click();
        expect(onAlbum).toHaveBeenCalledExactlyOnceWith('alb-1');

        vi.advanceTimersByTime(60000);
        expect(document.querySelector('time.eco-time').textContent).toBe('19m');
        expect(document.querySelector('.eco-rate-btn')).toBe(rateBtn);
    });

    it('removes sonarfy_token on logout even if remote revocation fails', async () => {
        localStorage.setItem('sonarfy_token', 'jwt-demo-token');
        const navigate = vi.fn();
        const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
        await logout({ routes: { login: 'login.html' } }, navigate, { fetchImpl: fetchMock });
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(navigate).toHaveBeenCalledWith('login.html');
    });

    it('preserves rated/reviewId, renders Avaliar vs Avaliado, and revalidates on pageshow without sync', async () => {
        const validated = validateEcos({
            connected: true,
            items: [
                { album: { spotifyId: 'a1', name: 'Album One' }, lastPlayedAt: '2026-11-23T12:00:00Z', listenCount: 1, rated: true, reviewId: 42 },
                { album: { spotifyId: 'a2', name: 'Album Two' }, lastPlayedAt: '2026-11-23T11:00:00Z', listenCount: 2 }
            ]
        });
        expect(validated.items[0]).toMatchObject({ rated: true, reviewId: 42 });
        expect(validated.items[1]).toMatchObject({ rated: false, reviewId: null });

        const syncSpy = vi.fn();
        const onAlbum = vi.fn();
        let phase = 'initial';
        const loadSpy = vi.fn(async () => ({
            connected: true,
            items: [
                {
                    album: { spotifyId: 'alb-1', name: 'Neon Horizons', coverUrl: null },
                    lastPlayedAt: '2026-11-23T12:00:00Z',
                    listenCount: 1,
                    rated: phase === 'published' || phase === 'edited',
                    reviewId: phase === 'published' || phase === 'edited' ? 77 : null
                }
            ],
            nextCursor: null,
            sync: {}
        }));

        const app = mount({ load: loadSpy, sync: syncSpy, actions: { album: onAlbum } });
        await app.ready;
        expect(document.querySelector('.eco-rate-label').textContent).toBe('Avaliar');
        expect(document.querySelector('.eco-rate-btn').classList.contains('is-rated')).toBe(false);

        phase = 'published';
        window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
        await vi.waitFor(() => {
            expect(document.querySelector('.eco-rate-label').textContent).toBe('Avaliado');
        });
        expect(document.querySelector('.eco-rate-btn').classList.contains('is-rated')).toBe(true);
        expect(document.querySelector('.eco-rate-btn').getAttribute('aria-label')).toBe('Editar avaliação de Neon Horizons');
        expect(syncSpy).not.toHaveBeenCalled();

        document.querySelector('.eco-rate-btn').click();
        expect(onAlbum).toHaveBeenCalledWith('alb-1');

        phase = 'deleted';
        window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
        await vi.waitFor(() => {
            expect(document.querySelector('.eco-rate-label').textContent).toBe('Avaliar');
        });

        app.destroy();
        const callsBeforeDestroy = loadSpy.mock.calls.length;
        window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
        expect(loadSpy).toHaveBeenCalledTimes(callsBeforeDestroy);
    });
});
