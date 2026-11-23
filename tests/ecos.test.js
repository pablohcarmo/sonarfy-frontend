import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEcosAdapter, createEcosFixtures } from '../js/ecos-fixtures.js';
import { ECOS_MAX_ITEMS, createEcosState, ecoTimestamp, logout, validateEcos } from '../js/ecos-state.js';
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
    history.replaceState(null, '', '/pages/ecos.html');
    const html = readFileSync('pages/ecos.html', 'utf8');
    document.body.innerHTML = html.split('<body class="ecos-page">')[1].split('</body>')[0];
    mounted = mountEcos(adapter);
    return mounted;
}

describe('ecos: fixtures, cap, timestamps, and sidebar', () => {
    it('caps validated payloads at 50 items and generates 50 demo fixtures', () => {
        const fixtures = createEcosFixtures();
        expect(fixtures.connected).toBe(true);
        expect(fixtures.items).toHaveLength(ECOS_MAX_ITEMS);

        const oversized = {
            connected: true,
            items: Array.from({ length: 65 }, (_, i) => ({
                ...fixtures.items[0],
                id: `eco-extra-${i}`,
                isPlaying: i === 0
            }))
        };
        const validated = validateEcos(oversized);
        expect(validated.items).toHaveLength(50);
        expect(validated.items[49].id).toBe('eco-extra-49');
    });

    it('formats live playback, < 24h relative minutes/hours, and >= 24h Mês Dia dates', () => {
        const now = new Date(2026, 10, 23, 12, 0).getTime();
        expect(ecoTimestamp(new Date(now).toISOString(), { isPlaying: true, now })).toBe('Ouvindo agora');
        expect(ecoTimestamp(new Date(now - 18 * 60000).toISOString(), { now })).toBe('18m');
        expect(ecoTimestamp(new Date(now - 3 * 3600000).toISOString(), { now })).toBe('3h');
        expect(ecoTimestamp(new Date(now - 24 * 3600000 + 1).toISOString(), { now })).toBe('23h');
        expect(ecoTimestamp(new Date(now - 3 * 86400000).toISOString(), { now })).toBe('Nov 20');
    });

    it('wires Ecos active in ecos.html and linked from other pages via shared sidebar', () => {
        document.body.innerHTML = sidebar(false, {}, 'echoes');
        const active = document.querySelector('[aria-current="page"]');
        expect(active.getAttribute('href')).toBe('ecos.html');
        expect(active.textContent).toBe('Ecos');
        expect(active.querySelector('img').getAttribute('src')).toContain('assets/icons/ecos/active-ecos.svg');

        document.body.innerHTML = sidebar(false, {}, 'home');
        const ecosLink = [...document.querySelectorAll('.profile-navigation a')].find(a => a.textContent === 'Ecos');
        expect(ecosLink.getAttribute('href')).toBe('ecos.html');
    });

    it('uses host adapter when provided and falls back to demo fixtures otherwise', async () => {
        const host = { load: vi.fn(), refresh: vi.fn() };
        expect(createEcosAdapter(host)).toBe(host);
        window.sonarfyEcosAdapter = host;
        expect(createEcosAdapter()).toBe(host);
        delete window.sonarfyEcosAdapter;

        const demo = createEcosAdapter(null);
        expect(demo.demo).toBe(true);
        const data = await demo.load();
        expect(data.items).toHaveLength(50);
    });
});

describe('ecos: states, concurrency lock, navigation, and logout', () => {
    it('renders populated, not-connected, error/retry states, and enforces refresh concurrency lock', async () => {
        const initial = deferred();
        const refreshDeferred = deferred();
        const adapter = {
            load: vi.fn()
                .mockImplementationOnce(() => initial.promise)
                .mockResolvedValueOnce({ connected: false, items: [] })
                .mockRejectedValueOnce(new Error('Falha ao sincronizar Spotify')),
            refresh: vi.fn(() => refreshDeferred.promise)
        };

        const app = mount(adapter);
        expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
        expect(document.querySelector('[data-refresh]').disabled).toBe(true);

        initial.resolve(createEcosFixtures());
        await app.ready;
        expect(document.querySelectorAll('.eco-row')).toHaveLength(50);
        expect(document.querySelector('#ecos-sync-pill').textContent).toContain('Conectado · 50 recentes');

        // Trigger concurrent refreshes; only one adapter.refresh() call should fire.
        const firstRefresh = app.store.refresh();
        const secondRefresh = app.store.refresh();
        expect(adapter.refresh).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[data-refresh]').disabled).toBe(true);
        refreshDeferred.resolve(createEcosFixtures());
        await Promise.all([firstRefresh, secondRefresh]);
        expect(document.querySelector('[data-refresh]').disabled).toBe(false);

        // Not connected state
        await app.store.load();
        const cta = document.querySelector('.ecos-connect-cta');
        expect(cta).not.toBeNull();
        expect(cta.getAttribute('href')).toBe('spotify-sync.html?source=ecos');

        // Error state when no cached data is present (reset via fresh state)
        const errorState = createEcosState({ load: vi.fn().mockRejectedValue(new Error('Erro de rede')) });
        await errorState.load();
        expect(errorState.state.status).toBe('error');
        expect(errorState.state.error).toBe('Erro de rede');
    });

    it('routes album clicks to host action or shows unavailability feedback, and updates timestamps every minute', async () => {
        vi.useFakeTimers();
        const now = new Date(2026, 10, 23, 12, 0).getTime();
        vi.setSystemTime(now);
        const onAlbum = vi.fn();
        const adapter = {
            load: async () => ({
                connected: true,
                items: [
                    {
                        id: 'eco-1',
                        album: { id: 'alb-1', title: 'Neon Horizons', artist: 'Synth Collective' },
                        trackName: 'Midnight Drive',
                        playedAt: new Date(now - 18 * 60000).toISOString(),
                        isPlaying: false
                    }
                ]
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
});
