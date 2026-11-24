const createEmptyReviewsState = (handle = null) => ({
    handle,
    items: [],
    nextBeforeId: null,
    loading: false,
    loadingMore: false,
    error: null,
    loaded: false
});

export function createProfileState(adapter) {
    const state = {
        data: null,
        tab: 'activities',
        sort: 'recent',
        collection: [],
        pending: new Set(),
        reviews: createEmptyReviewsState()
    };
    let reviewsRequestSeq = 0;
    const listeners = new Set();
    const emit = () => listeners.forEach(listener => listener(state));
    return {
        state,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        setData(data) {
            reviewsRequestSeq += 1;
            state.data = data;
            state.collection = data.collection;
            state.reviews = createEmptyReviewsState(data?.profile?.handle || null);
            emit();
        },
        async loadReviews({ reset = false } = {}) {
            if (typeof adapter?.loadReviews !== 'function' || !state.data?.profile?.handle) return;
            if (!reset && (state.reviews.loading || state.reviews.loadingMore || state.reviews.nextBeforeId == null)) return;
            const requestId = ++reviewsRequestSeq;
            const activeData = state.data;
            const targetHandle = activeData.profile.handle;
            const sessionUserId = activeData.session?.userId ?? null;
            const beforeId = reset ? null : state.reviews.nextBeforeId;
            if (reset) {
                state.reviews = {
                    ...createEmptyReviewsState(targetHandle),
                    loading: true
                };
            } else {
                state.reviews = {
                    ...state.reviews,
                    loadingMore: true,
                    error: null
                };
            }
            emit();
            const isStale = () => requestId !== reviewsRequestSeq
                || state.data !== activeData
                || state.data?.profile?.handle !== targetHandle
                || (state.data?.session?.userId ?? null) !== sessionUserId;
            try {
                const page = await adapter.loadReviews(targetHandle, { limit: 20, beforeId });
                if (isStale()) return;
                const existing = reset ? [] : state.reviews.items;
                const seen = new Set(existing.map(item => item.id));
                const appended = page.items.filter(item => !seen.has(item.id));
                state.reviews = {
                    handle: targetHandle,
                    items: reset ? page.items : [...existing, ...appended],
                    nextBeforeId: page.nextBeforeId ?? null,
                    loading: false,
                    loadingMore: false,
                    error: null,
                    loaded: true
                };
            } catch (error) {
                if (isStale()) return;
                state.reviews = {
                    ...state.reviews,
                    loading: false,
                    loadingMore: false,
                    error: {
                        message: error?.message || 'Não foi possível carregar as avaliações. Tente novamente.',
                        status: error?.status ?? null
                    }
                };
                if (error?.status === 401) throw error;
            } finally {
                if (!isStale()) emit();
            }
        },
        async mutate(key, operation, reconcile) {
            if (state.pending.has(key)) return;
            state.pending.add(key); emit();
            const data = state.data;
            try { const result = await operation(); if (state.data === data) reconcile(result); }
            finally { state.pending.delete(key); emit(); }
        },
        like(id) {
            const item = [...state.data.activities, ...state.data.replies, ...state.collection].find(item => item.id === id);
            if (!state.data.session?.userId || !item) return Promise.reject(new Error('Entre na conta para curtir.'));
            return this.mutate(`like:${id}`, () => adapter.like(id, !item.liked), result => {
                for (const list of [state.data.activities, state.data.replies, state.data.collection, state.collection]) {
                    list.filter(entry => entry.id === id).forEach(entry => Object.assign(entry, { liked: Boolean(result.liked), likeCount: Math.max(0, Number(result.likeCount) || 0) }));
                }
            });
        },
        follow() {
            if (!state.data.session?.userId) return Promise.reject(new Error('Entre na conta para seguir.'));
            const profile = state.data.profile;
            return this.mutate('follow', async () => {
                try { return await adapter.follow(!profile.isFollowing); }
                catch (error) { if (error.reconcileRequired) profile.followUncertain = true; throw error; }
            }, result => Object.assign(profile, result));
        },
        async sort(sort) {
            if (state.pending.has('sort')) return;
            await this.mutate('sort', () => adapter.collection(sort), result => { state.collection = result; state.sort = sort; });
        }
    };
}
