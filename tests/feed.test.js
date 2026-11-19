import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createFeedAdapter, createFeedFixtures } from '../js/feed-fixtures.js';
import { createFeedState, logout, validateFeed } from '../js/feed-state.js';
import { activityCard } from '../js/profile-views.js';
import { timestamp } from '../js/profile-utils.js';
import { sidebar } from '../js/profile-shell.js';
import { mountFeed } from '../js/feed.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let mounted;
afterEach(() => { mounted?.destroy(); mounted = null; document.body.innerHTML = ''; vi.useRealTimers(); });
function mount(adapter, query = '') {
    history.replaceState(null, '', `/pages/feed.html${query}`);
    const html = readFileSync('pages/feed.html', 'utf8');
    document.body.innerHTML = html.split('<body class="feed-page">')[1].split('</body>')[0];
    mounted = mountFeed(adapter); return mounted;
}

describe('feed: shared publication rules', () => {
    it('uses actual publication dates at the exact 24h boundary', () => {
        const now = new Date(2026, 9, 26, 12).getTime();
        expect(timestamp(now - 24 * 3600000 + 1, now)).toBe('23h');
        expect(timestamp(now - 24 * 3600000, now)).toBe('Out 25');
        expect(timestamp(new Date(2026, 5, 15), now)).toBe('Jun 15');
        expect(timestamp(now - 3 * 3600000, now)).toBe('3h');
    });
    it('accepts 255 Unicode code points, rejects 256 without truncation', () => {
        const data = createFeedFixtures(); const item = data.publications[0];
        item.review = '𝄞'.repeat(255);
        expect(validateFeed(data)).toBe(data);
        document.body.innerHTML = activityCard(item);
        expect(Array.from(document.querySelector('.activity-review').textContent)).toHaveLength(255);
        item.review += 'a';
        expect(() => validateFeed(data)).toThrow('255');
        expect(() => activityCard(item)).toThrow('255');
    });
    it('links avatar, display name and handle to the author profile; hides rating-only review and zero counters', () => {
        const item = createFeedFixtures().publications[1]; item.likeCount = 0; item.commentCount = 0;
        document.body.innerHTML = activityCard(item);
        const links = [...document.querySelectorAll('a')];
        expect(links).toHaveLength(3);
        links.forEach(link => expect(new URL(link.href).searchParams.get('handle')).toBe(item.author.handle));
        expect(document.querySelector('.activity-review')).toBeNull();
        expect(document.querySelectorAll('.activity-social button > span:not(.profile-icon)')).toHaveLength(0);
        expect(document.querySelector('.profile-stars').getAttribute('aria-label')).toBe('4 de 5 estrelas');
    });
    it('reuses explicit demo fixtures or the provided host adapter', async () => {
        const host = { load: vi.fn() };
        expect(createFeedAdapter(host)).toBe(host);
        window.sonarfyFeedAdapter = host;
        expect(createFeedAdapter()).toBe(host); delete window.sonarfyFeedAdapter;
        const adapter = createFeedAdapter(null); expect(adapter.demo).toBe(true);
        const data = await adapter.load('following');
        expect(data.publications).toHaveLength(4);
        expect(validateFeed(data)).toBe(data);
        await adapter.like(data.publications[0].id, false);
        expect((await adapter.load('for-you')).publications.find(x => x.id === data.publications[0].id)).toMatchObject({ liked: false, likeCount: 23 });
    });
    it('sets Home active and routes both pages through the shared sidebar', () => {
        document.body.innerHTML = sidebar(false, {}, 'home');
        expect(document.querySelector('[aria-current="page"]').getAttribute('href')).toBe('feed.html');
        expect(document.querySelectorAll('.profile-navigation > *')).toHaveLength(7);
        document.body.innerHTML = sidebar(true);
        expect(document.querySelector('[aria-current="page"]').textContent).toBe('Perfil');
        expect(document.querySelector('.profile-navigation a').getAttribute('href')).toBe('feed.html');
    });
});

describe('feed: asynchronous state and reconciliation', () => {
    it('blocks concurrent likes across tabs and reconciles authoritative counts everywhere', async () => {
        const pending = deferred(); const adapter = { load: async () => createFeedFixtures(), like: vi.fn(() => pending.promise) };
        const store = createFeedState(adapter); await store.select('following'); await store.select('for-you');
        const item = store.state.data['for-you'].publications[0];
        const mutation = store.like(item.id); await store.select('following'); await store.like(item.id);
        expect(adapter.like).toHaveBeenCalledExactlyOnceWith(item.id, false);
        expect(item.likeCount).toBe(24);
        pending.resolve({ liked: false, likeCount: 107 }); await mutation;
        for (const data of Object.values(store.state.data)) expect(data.publications[0]).toMatchObject({ liked: false, likeCount: 107 });
        expect(store.state.pending.size).toBe(0);
    });
    it('overlays confirmed likes on a late stale tab load', async () => {
        const late = deferred(); const store = createFeedState({ load: tab => tab === 'following' ? createFeedFixtures() : late.promise, like: async () => ({ liked: false, likeCount: 80 }) });
        await store.select('following'); const loading = store.select('for-you'); await store.select('following');
        await store.like('community-0'); late.resolve(createFeedFixtures()); await loading;
        expect(store.state.tab).toBe('following');
        expect(store.state.data['for-you'].publications[0]).toMatchObject({ liked: false, likeCount: 80 });
    });
    it('preserves state on failed or malformed responses and permits retry', async () => {
        const adapter = { load: async () => createFeedFixtures(), like: vi.fn().mockRejectedValueOnce(new Error('Rede')).mockResolvedValueOnce({ liked: false, likeCount: NaN }).mockResolvedValue({ liked: false, likeCount: 12 }) };
        const store = createFeedState(adapter); await store.select('following');
        await expect(store.like('community-0')).rejects.toThrow('Rede');
        await expect(store.like('community-0')).rejects.toThrow('inválida');
        expect(store.state.data.following.publications[0]).toMatchObject({ liked: true, likeCount: 24 });
        expect(store.state.pending.size).toBe(0);
        await store.like('community-0'); expect(store.state.data.following.publications[0].likeCount).toBe(12);
    });
    it('rejects likes without session and preserves cached data after load failure', async () => {
        const adapter = { load: vi.fn().mockResolvedValue({ ...createFeedFixtures(), session: null }), like: vi.fn() };
        const store = createFeedState(adapter); await store.select('following');
        await expect(store.like('community-0')).rejects.toThrow('Entre'); expect(adapter.like).not.toHaveBeenCalled();
        const data = store.state.data.following; adapter.load.mockRejectedValue(new Error('Rede'));
        await store.select('following', true);
        expect(store.state.data.following).toBe(data); expect(store.state.errors.following).toBe('Rede');
    });
});

describe('feed: DOM integration', () => {
    it('refreshes timestamps as the real clock crosses 24h without replacing controls', async () => {
        vi.useFakeTimers();
        const now = new Date(2026, 9, 26, 12).getTime(); vi.setSystemTime(now);
        const data = createFeedFixtures(now); data.publications[0].createdAt = new Date(now - 24 * 3600000 + 30000).toISOString();
        const app = mount({ load: async () => data }); await app.ready;
        const control = document.querySelector('[data-like]');
        expect(document.querySelector('time').textContent).toBe('23h');
        await vi.advanceTimersByTimeAsync(60000);
        expect(document.querySelector('time').textContent).toBe('Out 25');
        expect(document.querySelector('[data-like]')).toBe(control);
    });
    it('switches tabs using keyboard, query string and history; preserves unrelated URL parameters', async () => {
        const adapter = { load: vi.fn(async () => createFeedFixtures()) }; const app = mount(adapter, '?source=demo&tab=for-you'); await app.ready;
        expect(document.querySelector('#tab-for-you').getAttribute('aria-selected')).toBe('true');
        document.querySelector('#tab-for-you').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
        await vi.waitFor(() => expect(document.querySelector('#panel-following .activity-card')).not.toBeNull());
        expect(location.search).toBe('?source=demo&tab=following'); expect(document.activeElement.id).toBe('tab-following');
        history.replaceState(null, '', '?tab=for-you'); window.dispatchEvent(new PopStateEvent('popstate'));
        expect(document.querySelector('#panel-following').hidden).toBe(true);
        expect(adapter.load).toHaveBeenCalledTimes(2);
    });
    it('shows skeleton while loading and a following-zero empty state with discovery action', async () => {
        const load = deferred(); const app = mount({ load: () => load.promise });
        expect(document.querySelector('#panel-following').getAttribute('aria-busy')).toBe('true');
        expect(document.querySelectorAll('.skeleton-avatar')).toHaveLength(3);
        load.resolve({ ...createFeedFixtures(), followingCount: 0 }); await app.ready;
        expect(document.querySelector('.feed-empty h2').textContent).toBe('Seu feed ainda está silencioso');
        expect(document.querySelector('#quick-review').hidden).toBe(true);
        expect(document.querySelectorAll('.activity-card')).toHaveLength(0);
        document.querySelector('[data-explore]').click();
        expect(location.search).toBe('?tab=for-you');
    });
    it('shows retry after load failure and restores publications', async () => {
        const app = mount({ load: vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(createFeedFixtures()) }); await app.ready;
        expect(document.querySelector('[role="alert"]').textContent).toBe('Offline');
        document.querySelector('[data-retry]').click();
        await vi.waitFor(() => expect(document.querySelectorAll('.activity-card')).toHaveLength(4));
    });
    it('clears sonarfy_token before default navigation and custom remote logout, including failure', async () => {
        const navigate = vi.fn(); localStorage.setItem('sonarfy_token', 'demo');
        await logout({}, navigate); expect(localStorage.getItem('sonarfy_token')).toBeNull(); expect(navigate).toHaveBeenCalledWith('login.html');
        localStorage.setItem('sonarfy_token', 'demo');
        await expect(logout({ actions: { logout: async () => { expect(localStorage.getItem('sonarfy_token')).toBeNull(); throw new Error('Remote'); } } }, navigate)).rejects.toThrow('Remote');
        expect(localStorage.getItem('sonarfy_token')).toBeNull();
    });
});
