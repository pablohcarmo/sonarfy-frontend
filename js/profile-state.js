export function createProfileState(adapter) {
    const state = { data: null, tab: 'activities', sort: 'recent', collection: [], pending: new Set() };
    const listeners = new Set();
    const emit = () => listeners.forEach(listener => listener(state));
    return {
        state,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        setData(data) { state.data = data; state.collection = data.collection; emit(); },
        async mutate(key, operation, reconcile) {
            if (state.pending.has(key)) return;
            state.pending.add(key); emit();
            try { const result = await operation(); reconcile(result); }
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
            return this.mutate('follow', () => adapter.follow(!state.data.profile.isFollowing), result => Object.assign(state.data.profile, result));
        },
        async sort(sort) {
            if (state.pending.has('sort')) return;
            await this.mutate('sort', () => adapter.collection(sort), result => { state.collection = result; state.sort = sort; });
        }
    };
}
