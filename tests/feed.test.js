import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createFeedAdapter, createFeedFixtures } from '../js/feed-fixtures.js';
import { createFeedState, logout, validateFeedPage } from '../js/feed-state.js';
import { activityCard } from '../js/profile-views.js';
import { timestamp } from '../js/profile-utils.js';
import { sidebar } from '../js/profile-shell.js';
import { mountFeed } from '../js/feed.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let mounted;

afterEach(() => {
    mounted?.destroy();
    mounted = null;
    document.body.innerHTML = '';
    localStorage.clear();
    delete globalThis.sonarfyFeedAdapter;
    vi.useRealTimers();
});

function mount(adapter, query = '') {
    history.replaceState(null, '', `/pages/feed.html${query}`);
    const html = readFileSync('pages/feed.html', 'utf8');
    document.body.innerHTML = html.split('<body class="feed-page">')[1].split('</body>')[0];
    mounted = mountFeed(adapter);
    return mounted;
}

function makeItem(id, overrides = {}) {
    return {
        id: String(id),
        reviewId: id,
        author: { id: '7', handle: 'marina_som', displayName: 'Marina Costa', avatar: null },
        album: { id: `sp-alb-${id}`, spotifyId: `sp-alb-${id}`, title: `Album ${id}`, artist: 'Artista', artistSpotifyId: `sp-art-${id}`, cover: null, mark: 'AL' },
        rating: 4.25,
        review: `Resenha ${id}`,
        createdAt: '2026-11-24T10:00:00Z',
        updatedAt: '2026-11-24T10:00:00Z',
        ...overrides
    };
}

describe('feed: regras compartilhadas, renderização e segurança', () => {
    // Valida limite exato de 24h na formatação de data relativa/absoluta.
    it('uses actual publication dates at the exact 24h boundary', () => {
        const now = new Date(2026, 9, 26, 12).getTime();
        expect(timestamp(now - 24 * 3600000 + 1, now)).toBe('23h');
        expect(timestamp(now - 24 * 3600000, now)).toBe('Out 25');
        expect(timestamp(new Date(2026, 5, 15), now)).toBe('Jun 15');
    });

    // Garante validação de 255 pontos de código Unicode, escape de HTML, ações sociais indisponíveis sem contadores fictícios e rotas reais.
    it('escapes review HTML, preserves quarter/zero stars, links only real routes, and renders unavailable social controls', () => {
        const item = makeItem(99, { rating: 0.25, review: '<script>alert(1)</script> & "texto"' });
        document.body.innerHTML = activityCard(item, undefined, { socialUnavailable: true, interactiveAlbum: false });
        expect(document.querySelector('.activity-review').textContent).toBe('<script>alert(1)</script> & "texto"');
        expect(document.querySelector('script')).toBeNull();
        expect(document.querySelector('.activity-social.is-unavailable')).not.toBeNull();
        expect(document.querySelector('[data-like]').getAttribute('aria-disabled')).toBe('true');
        expect(document.querySelector('[data-comments]').getAttribute('aria-disabled')).toBe('true');
        expect(document.querySelectorAll('.activity-social button > span:not(.profile-icon)')).toHaveLength(0);
        expect(document.querySelector('[data-album], [data-edit-review], [data-delete-review]')).toBeNull();
        expect(document.querySelector('.profile-stars').getAttribute('aria-label')).toBe('0.25 de 5 estrelas');
        const links = [...document.querySelectorAll('a')];
        expect(links).toHaveLength(4);
        expect(links.slice(0, 3).every(a => new URL(a.href).searchParams.get('handle') === 'marina_som')).toBe(true);
        expect(links[3].href).toBe('https://open.spotify.com/album/sp-alb-99');

        const ratingOnly = makeItem(100, { rating: 0, review: '' });
        document.body.innerHTML = activityCard(ratingOnly, undefined, { socialUnavailable: true, interactiveAlbum: false });
        expect(document.querySelector('.activity-review')).toBeNull();
        expect(document.querySelector('.profile-stars').getAttribute('aria-label')).toBe('0 de 5 estrelas');
    });

    // Garante que o fluxo padrão usa adapter HTTP real e só entra em demonstração com ?demo=true ou override explícito.
    it('defaults to HTTP adapter without silent fixture fallback and isolates explicit ?demo=true mode', () => {
        history.replaceState(null, '', '/pages/feed.html');
        expect(createFeedAdapter().demo).toBe(false);
        history.replaceState(null, '', '/pages/feed.html?demo=true');
        expect(createFeedAdapter().demo).toBe(true);
        const host = { loadPage: vi.fn() };
        globalThis.sonarfyFeedAdapter = host;
        expect(createFeedAdapter()).toBe(host);
    });

    // Verifica limite de 255 pontos de código na validação da página e navegação do sidebar compartilhado.
    it('validates 255 code points and keeps Home active in the shared sidebar', () => {
        const page = { items: [makeItem(1, { review: '𝄞'.repeat(255) })], followingCount: 0, nextCursor: null };
        expect(validateFeedPage(page)).toBe(page);
        page.items[0].review += 'a';
        expect(() => validateFeedPage(page)).toThrow('255');
        document.body.innerHTML = sidebar(false, {}, 'home');
        expect(document.querySelector('[aria-current="page"]').getAttribute('href')).toBe('feed.html');
    });
});

describe('feed: paginação por cursor, concorrência e isolamento de sessão', () => {
    // Valida carregamento inicial, adicional, prevenção de duplicatas concorrentes, retry preservando cards e fim da lista.
    it('paginates with intact cursor, blocks concurrent loadMore, preserves items on retry, and ends cleanly', async () => {
        const page2 = deferred();
        const adapter = {
            getSessionKey: () => 'tok-a',
            loadPage: vi.fn()
                .mockResolvedValueOnce({ items: [makeItem(30), makeItem(20)], followingCount: 1, nextCursor: 'cur-1' })
                .mockImplementationOnce(() => page2.promise)
                .mockResolvedValueOnce({ items: [makeItem(10)], followingCount: 1, nextCursor: 'cur-2' })
                .mockResolvedValueOnce({ items: [], followingCount: 1, nextCursor: null })
        };
        const store = createFeedState(adapter);
        await store.loadInitial();
        expect(store.state.items.map(i => i.reviewId)).toEqual([30, 20]);
        expect(store.state.nextCursor).toBe('cur-1');

        const firstMore = store.loadMore();
        const duplicateMore = store.loadMore();
        expect(adapter.loadPage).toHaveBeenCalledTimes(2);
        expect(adapter.loadPage.mock.calls[1][0].cursor).toBe('cur-1');

        page2.reject(new Error('Falha temporária'));
        await Promise.all([firstMore, duplicateMore]);
        expect(store.state.items.map(i => i.reviewId)).toEqual([30, 20]);
        expect(store.state.nextCursor).toBe('cur-1');
        expect(store.state.error).toMatchObject({ message: 'Falha temporária', scope: 'more' });

        await store.loadMore();
        expect(store.state.items.map(i => i.reviewId)).toEqual([30, 20, 10]);
        expect(store.state.nextCursor).toBe('cur-2');

        await store.loadMore();
        expect(store.state.items.map(i => i.reviewId)).toEqual([30, 20, 10]);
        expect(store.state.nextCursor).toBeNull();
    });

    // Descarta respostas atrasadas de outra geração ou outra sessão e cancela requisições anteriores.
    it('discards stale responses from previous generation or switched session and resets cleanly', async () => {
        let token = 'session-1';
        const slow = deferred();
        const signals = [];
        const adapter = {
            getSessionKey: () => token,
            loadPage: vi.fn(({ signal }) => {
                signals.push(signal);
                return signals.length === 1 ? slow.promise : Promise.resolve({ items: [makeItem(50)], followingCount: 0, nextCursor: null });
            })
        };
        const store = createFeedState(adapter);
        const firstLoad = store.loadInitial();
        const refreshLoad = store.loadInitial({ refresh: true });
        expect(signals[0].aborted).toBe(true);
        await refreshLoad;
        slow.resolve({ items: [makeItem(1)], followingCount: 9, nextCursor: 'old' });
        await firstLoad;
        expect(store.state.items.map(i => i.reviewId)).toEqual([50]);
        expect(store.state.nextCursor).toBeNull();

        token = 'session-2';
        store.resetSession();
        expect(store.state.items).toEqual([]);
        expect(store.state.nextCursor).toBeNull();
        expect(store.state.loaded).toBe(false);
    });
});

describe('feed: integração DOM, estados vazios, erros, invalidação e ações próprias', () => {
    // Verifica ausência de abas, renderização de avaliações próprias com followingCount=0 e estados vazios distintos.
    it('renders single feed without tabs, displays own reviews with followingCount=0, and differentiates empty states', async () => {
        const ownFeed = mount({
            getSessionKey: () => 'tok',
            loadViewer: async () => ({ session: { userId: '7' }, viewer: { id: '7', handle: 'marina_som', displayName: 'Marina Costa', avatar: null } }),
            loadPage: async () => ({ items: [makeItem(77, { review: '' })], followingCount: 0, nextCursor: null }),
            updateReview: vi.fn(),
            deleteReview: vi.fn()
        });
        await ownFeed.ready;
        expect(document.querySelector('[role="tab"]')).toBeNull();
        expect(document.querySelector('#feed-refresh')).toBeNull();
        expect(document.querySelectorAll('.activity-card')).toHaveLength(1);
        expect(document.querySelector('.activity-social.is-unavailable [data-like="77"][aria-disabled="true"]')).not.toBeNull();
        expect(document.querySelector('.activity-social.is-unavailable [data-comments="77"][aria-disabled="true"]')).not.toBeNull();
        expect(document.querySelector('[data-edit-review], [data-delete-review]')).toBeNull();
        ownFeed.destroy();

        const emptyZero = mount({
            loadPage: async () => ({ items: [], followingCount: 0, nextCursor: null })
        });
        await emptyZero.ready;
        expect(document.querySelector('.feed-empty h2').textContent).toContain('silencioso');
        expect(document.querySelector('.feed-empty a[href="album-review.html"]')).not.toBeNull();
        expect(document.querySelector('.feed-empty a[href="profile.html"]')).not.toBeNull();
        emptyZero.destroy();

        const emptyFollowing = mount({
            loadPage: async () => ({ items: [], followingCount: 3, nextCursor: null })
        });
        await emptyFollowing.ready;
        expect(document.querySelector('.feed-empty h2').textContent).toContain('Ainda não há avaliações');
    });

    // Confirma erro inicial sem fallback para fixtures, erro 400 de cursor com reinício, e invalidação por pageshow/storage.
    it('shows initial error without fixture fallback, restarts on 400 cursor error, and reloads on pageshow/storage', async () => {
        const badCursorError = Object.assign(new Error('Cursor inválido'), { status: 400 });
        const adapter = {
            getSessionKey: () => 'tok-1',
            loadPage: vi.fn()
                .mockRejectedValueOnce(new Error('Servidor indisponível'))
                .mockResolvedValueOnce({ items: [makeItem(20)], followingCount: 1, nextCursor: 'cur-bad' })
                .mockRejectedValueOnce(badCursorError)
                .mockResolvedValueOnce({ items: [makeItem(25)], followingCount: 1, nextCursor: null })
                .mockResolvedValueOnce({ items: [makeItem(30)], followingCount: 2, nextCursor: null })
                .mockResolvedValueOnce({ items: [makeItem(35)], followingCount: 2, nextCursor: null })
        };
        const app = mount(adapter);
        await app.ready;
        expect(document.querySelectorAll('.activity-card')).toHaveLength(0);
        expect(document.querySelector('[role="alert"] p').textContent).toBe('Servidor indisponível');

        document.querySelector('[data-feed-retry]').click();
        await vi.waitFor(() => expect(document.querySelectorAll('.activity-card')).toHaveLength(1));

        document.querySelector('[data-feed-load-more]').click();
        await vi.waitFor(() => expect(document.querySelector('[data-feed-restart]')).not.toBeNull());
        expect(document.querySelectorAll('.activity-card')).toHaveLength(1);

        document.querySelector('[data-feed-restart]').click();
        await vi.waitFor(() => expect(document.querySelector('[data-publication="25"]')).not.toBeNull());

        window.dispatchEvent(new StorageEvent('storage', { key: 'sonarfy_following_dirty', newValue: '123' }));
        await vi.waitFor(() => expect(document.querySelector('[data-publication="30"]')).not.toBeNull());

        const pageShow = new Event('pageshow');
        Object.defineProperty(pageShow, 'persisted', { value: true });
        window.dispatchEvent(pageShow);
        await vi.waitFor(() => expect(document.querySelector('[data-publication="35"]')).not.toBeNull());

        adapter.loadPage.mockResolvedValueOnce({ items: [makeItem(40)], followingCount: 2, nextCursor: null });
        document.querySelector('.profile-global-header a.brand').click();
        await vi.waitFor(() => expect(document.querySelector('[data-publication="40"]')).not.toBeNull());
    });

    // Verifica atualização de relógio sem reconstruir controles e limpeza de token/estado no logout.
    it('updates relative timestamps in place and clears token on logout', async () => {
        vi.useFakeTimers();
        const now = new Date(2026, 9, 26, 12).getTime();
        vi.setSystemTime(now);
        const item = makeItem(1, { createdAt: new Date(now - 24 * 3600000 + 30000).toISOString() });
        const app = mount({ loadPage: async () => ({ items: [item], followingCount: 1, nextCursor: null }) });
        await app.ready;
        const card = document.querySelector('.activity-card');
        expect(document.querySelector('time').textContent).toBe('23h');
        await vi.advanceTimersByTimeAsync(60000);
        expect(document.querySelector('time').textContent).toBe('Out 25');
        expect(document.querySelector('.activity-card')).toBe(card);

        const navigate = vi.fn();
        localStorage.setItem('sonarfy_token', 'tok-real');
        await logout({}, navigate);
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
        expect(navigate).toHaveBeenCalledWith('login.html');
    });
});
