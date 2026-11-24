const createEmptyReviewsState = (handle = null) => ({
    handle,
    items: [],
    nextBeforeId: null,
    loading: false,
    loadingMore: false,
    error: null,
    loaded: false
});

const createEmptyCollectionState = (handle = null, sort = 'recent', writtenOnly = false) => ({
    handle,
    sort,
    writtenOnly,
    items: [],
    totalReviews: null,
    matchingReviews: null,
    nextCursor: null,
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
        reviews: createEmptyReviewsState(),
        collectionState: createEmptyCollectionState()
    };
    let reviewsRequestSeq = 0;
    let collectionRequestSeq = 0;
    const listeners = new Set();
    const emit = () => listeners.forEach(listener => listener(state));
    return {
        state,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        setData(data) {
            reviewsRequestSeq += 1;
            collectionRequestSeq += 1;
            state.data = data;
            state.collection = data.collection;
            state.reviews = createEmptyReviewsState(data?.profile?.handle || null);
            state.collectionState = createEmptyCollectionState(data?.profile?.handle || null, 'recent', false);
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
        // Carrega a coleção pública paginada com ordenação, filtro independente e proteção contra respostas atrasadas.
        async loadCollection({ reset = false, sort, writtenOnly } = {}) {
            if (typeof adapter?.loadCollection !== 'function' || !state.data?.profile?.handle) return;
            const current = state.collectionState;
            let nextSort = current.sort;
            let nextWrittenOnly = current.writtenOnly;
            if (sort === 'written') {
                nextSort = 'recent';
                nextWrittenOnly = true;
            } else {
                if (['recent', 'oldest', 'highest', 'lowest'].includes(sort)) nextSort = sort;
                if (typeof writtenOnly === 'boolean') nextWrittenOnly = writtenOnly;
            }
            if (!reset && (current.loading || current.loadingMore || current.nextCursor == null)) return;
            const requestId = ++collectionRequestSeq;
            const activeData = state.data;
            const targetHandle = activeData.profile.handle;
            const sessionUserId = activeData.session?.userId ?? null;
            const cursor = reset ? null : current.nextCursor;
            if (reset) {
                state.collectionState = {
                    ...createEmptyCollectionState(targetHandle, nextSort, nextWrittenOnly),
                    loading: true
                };
            } else {
                state.collectionState = {
                    ...current,
                    loadingMore: true,
                    error: null
                };
            }
            emit();
            const isStale = () => requestId !== collectionRequestSeq
                || state.data !== activeData
                || state.data?.profile?.handle !== targetHandle
                || (state.data?.session?.userId ?? null) !== sessionUserId;
            try {
                const page = await adapter.loadCollection(targetHandle, {
                    limit: 20,
                    sort: nextSort,
                    writtenOnly: nextWrittenOnly,
                    cursor
                });
                if (isStale()) return;
                if (state.data?.profile && Number.isSafeInteger(page.totalReviews)) {
                    state.data.profile.ratedCount = page.totalReviews;
                }
                const existing = reset ? [] : state.collectionState.items;
                const seen = new Set(existing.map(item => String(item.reviewId ?? item.id)));
                const appended = page.items.filter(item => !seen.has(String(item.reviewId ?? item.id)));
                state.collectionState = {
                    handle: targetHandle,
                    sort: nextSort,
                    writtenOnly: nextWrittenOnly,
                    items: reset ? page.items : [...existing, ...appended],
                    totalReviews: page.totalReviews,
                    matchingReviews: page.matchingReviews,
                    nextCursor: page.nextCursor ?? null,
                    loading: false,
                    loadingMore: false,
                    error: null,
                    loaded: true
                };
            } catch (error) {
                if (isStale()) return;
                state.collectionState = {
                    ...state.collectionState,
                    loading: false,
                    loadingMore: false,
                    error: {
                        message: error?.message || 'Não foi possível carregar a coleção. Tente novamente.',
                        status: error?.status ?? null
                    }
                };
                if (error?.status === 401) throw error;
            } finally {
                if (!isStale()) emit();
            }
        },
        // Reinicia a coleção ao alterar ordenação ou filtro de resenha escrita.
        setCollectionFilter({ sort, writtenOnly } = {}) {
            return this.loadCollection({ reset: true, sort, writtenOnly });
        },
        // Invalida páginas e totais de avaliações e coleção após mutações ou restauração do histórico.
        async invalidateReviewsAndCollection() {
            const tasks = [];
            if (typeof adapter?.loadReviews === 'function') tasks.push(this.loadReviews({ reset: true }));
            if (typeof adapter?.loadCollection === 'function') tasks.push(this.loadCollection({ reset: true }));
            if (tasks.length) await Promise.all(tasks);
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
