import { validateReview } from './profile-utils.js';

export const feedTabs = ['following', 'for-you'];
export const normalizeTab = tab => feedTabs.includes(tab) ? tab : 'following';
export function validateFeed(data) {
    if (!Array.isArray(data?.publications) || !Number.isInteger(data.followingCount) || data.followingCount < 0) throw new Error('Conteúdo do feed indisponível.');
    for (const item of data.publications) {
        if (!item.id || !item.author?.handle || !item.author.displayName || !item.album?.id || !item.album.title || !Number.isFinite(new Date(item.createdAt).getTime())) throw new Error('Publicação inválida.');
        validateReview(item.review);
    }
    return data;
}

export function createFeedState(adapter) {
    const state = { tab: 'following', data: {}, loading: new Set(), errors: {}, pending: new Set() };
    const listeners = new Set();
    const reconciled = new Map();
    const emit = () => listeners.forEach(fn => fn(state));
    const overlay = data => data.publications.forEach(item => {
        if (reconciled.has(item.id)) Object.assign(item, reconciled.get(item.id));
    });
    return {
        state,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        async select(tab, retry = false) {
            state.tab = normalizeTab(tab);
            const key = state.tab;
            emit();
            if (state.loading.has(key) || (state.data[key] && !retry)) return;
            state.loading.add(key); delete state.errors[key]; emit();
            try {
                const data = structuredClone(validateFeed(await adapter.load(key)));
                overlay(data); state.data[key] = data;
            } catch (error) { state.errors[key] = error.message || 'Não foi possível carregar o feed.'; }
            finally { state.loading.delete(key); emit(); }
        },
        async like(id) {
            const data = state.data[state.tab];
            const item = data?.publications.find(item => item.id === id);
            if (!data?.session?.userId || !item) throw new Error('Entre na conta para curtir.');
            const key = `like:${id}`;
            if (state.pending.has(key)) return;
            state.pending.add(key); emit();
            try {
                const result = await adapter.like(id, !item.liked);
                if (typeof result?.liked !== 'boolean' || !Number.isFinite(result.likeCount) || result.likeCount < 0) throw new Error('Resposta de curtida inválida.');
                const values = { liked: result.liked, likeCount: result.likeCount };
                reconciled.set(id, values);
                Object.values(state.data).forEach(data => data.publications.filter(item => item.id === id).forEach(item => Object.assign(item, values)));
            } finally { state.pending.delete(key); emit(); }
        }
    };
}

export async function logout(adapter, navigate = url => window.location.assign(url)) {
    // Clear the frontend credential even when the host handles remote revocation.
    localStorage.removeItem('sonarfy_token');
    if (adapter.actions?.logout) await adapter.actions.logout();
    else navigate('login.html');
}
