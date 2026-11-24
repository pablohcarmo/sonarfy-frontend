import { validateReview } from './profile-utils.js';
import { clearAccessToken, logoutSession } from './auth-http.js';

// Valida a estrutura normalizada de uma página do feed único sem reordenar os itens.
export function validateFeedPage(data) {
    if (
        !Array.isArray(data?.items)
        || !Number.isSafeInteger(data.followingCount) || data.followingCount < 0
        || (data.nextCursor !== null && data.nextCursor !== undefined && (typeof data.nextCursor !== 'string' || !data.nextCursor))
    ) {
        throw new Error('Conteúdo do feed indisponível.');
    }
    for (const item of data.items) {
        if (
            !item?.id
            || !item.author?.handle || typeof item.author.displayName !== 'string'
            || !item.album?.id || typeof item.album.title !== 'string'
            || !Number.isFinite(Number(item.rating)) || Number(item.rating) < 0 || Number(item.rating) > 5
            || !Number.isFinite(new Date(item.createdAt).getTime())
        ) {
            throw new Error('Publicação inválida.');
        }
        validateReview(item.review);
    }
    return data;
}

// Gerencia o estado paginado do feed único com controle de geração, cancelamento e isolamento de sessão.
export function createFeedState(adapter) {
    const initialState = () => ({
        items: [],
        followingCount: null,
        nextCursor: null,
        loaded: false,
        loadingInitial: false,
        loadingMore: false,
        refreshing: false,
        error: null,
        viewer: null,
        session: null
    });
    const state = initialState();
    const listeners = new Set();
    let generation = 0;
    let sessionGeneration = 0;
    let activeController = null;
    const emit = () => listeners.forEach(fn => fn(state));
    const currentSessionKey = () => typeof adapter?.getSessionKey === 'function'
        ? adapter.getSessionKey()
        : (state.session?.userId ?? null);
    const abortActive = () => {
        if (activeController) {
            activeController.abort();
            activeController = null;
        }
    };
    const isAbortError = error => error?.name === 'AbortError' || error?.cause?.name === 'AbortError';

    return {
        state,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

        // Limpa itens, cursor, visitante e requisições pendentes ao encerrar ou trocar sessão.
        resetSession() {
            generation += 1;
            sessionGeneration += 1;
            abortActive();
            Object.assign(state, initialState());
            emit();
        },

        // Carrega os dados públicos do visitante sem bloquear nem misturar sessões.
        async loadViewer() {
            if (typeof adapter?.loadViewer !== 'function') return;
            const reqSessionGen = sessionGeneration;
            const reqSession = currentSessionKey();
            try {
                const info = await adapter.loadViewer();
                if (reqSessionGen !== sessionGeneration || currentSessionKey() !== reqSession || !info) return;
                state.viewer = info.viewer || null;
                state.session = info.session || null;
                emit();
            } catch {
                // Erro não fatal de metadados do visitante não impede a leitura do feed.
            }
        },

        // Carrega a primeira página ou reinicia a paginação substituindo a lista somente ao receber página válida.
        async loadInitial({ refresh = false } = {}) {
            generation += 1;
            abortActive();
            const reqGen = generation;
            const reqSession = currentSessionKey();
            const controller = new AbortController();
            activeController = controller;
            const keepExisting = Boolean(refresh && state.loaded);
            if (keepExisting) {
                state.refreshing = true;
                state.loadingMore = false;
                state.error = null;
            } else {
                state.items = [];
                state.followingCount = null;
                state.nextCursor = null;
                state.loaded = false;
                state.loadingInitial = true;
                state.loadingMore = false;
                state.refreshing = false;
                state.error = null;
            }
            emit();
            try {
                const page = validateFeedPage(await adapter.loadPage({ limit: 20, cursor: null, signal: controller.signal }));
                if (controller.signal.aborted || reqGen !== generation || currentSessionKey() !== reqSession) return;
                state.items = structuredClone(page.items);
                state.followingCount = page.followingCount;
                state.nextCursor = page.nextCursor ?? null;
                state.loaded = true;
                state.error = null;
            } catch (error) {
                if (isAbortError(error) || reqGen !== generation || currentSessionKey() !== reqSession) return;
                state.error = {
                    message: error?.message || 'Não foi possível carregar o feed. Tente novamente.',
                    status: error?.status ?? null,
                    scope: keepExisting ? 'refresh' : 'initial'
                };
            } finally {
                if (activeController === controller) activeController = null;
                if (reqGen === generation && currentSessionKey() === reqSession) {
                    state.loadingInitial = false;
                    state.refreshing = false;
                    emit();
                }
            }
        },

        // Carrega a próxima página enviando nextCursor intacto e preservando os cards em caso de falha.
        async loadMore() {
            if (state.loadingInitial || state.loadingMore || state.refreshing || state.nextCursor == null) return;
            const reqGen = generation;
            const reqSession = currentSessionKey();
            const cursor = state.nextCursor;
            const controller = new AbortController();
            activeController = controller;
            state.loadingMore = true;
            state.error = null;
            emit();
            try {
                const page = validateFeedPage(await adapter.loadPage({ limit: 20, cursor, signal: controller.signal }));
                if (controller.signal.aborted || reqGen !== generation || currentSessionKey() !== reqSession || state.nextCursor !== cursor) return;
                if (!page.items.length) {
                    state.nextCursor = null;
                    state.followingCount = page.followingCount;
                    state.error = null;
                    return;
                }
                const seen = new Set(state.items.map(item => String(item.reviewId ?? item.id)));
                const appended = page.items.filter(item => !seen.has(String(item.reviewId ?? item.id)));
                state.items = [...state.items, ...structuredClone(appended)];
                state.followingCount = page.followingCount;
                state.nextCursor = page.nextCursor ?? null;
                state.error = null;
            } catch (error) {
                if (isAbortError(error) || reqGen !== generation || currentSessionKey() !== reqSession || state.nextCursor !== cursor) return;
                state.error = {
                    message: error?.message || 'Não foi possível carregar mais avaliações. Tente novamente.',
                    status: error?.status ?? null,
                    scope: 'more'
                };
            } finally {
                if (activeController === controller) activeController = null;
                if (reqGen === generation && currentSessionKey() === reqSession) {
                    state.loadingMore = false;
                    emit();
                }
            }
        },

        // Invalida e recarrega o início do feed após mutações ou restauração do histórico.
        invalidate() {
            return this.loadInitial({ refresh: state.loaded });
        }
    };
}

// Revoke the server session via host hook or POST /api/auth/logout and clear local credentials.
export async function logout(adapter = {}, navigate = url => window.location.assign(url), options) {
    if (adapter?.actions?.logout) {
        clearAccessToken();
        try {
            await adapter.actions.logout();
        } finally {
            clearAccessToken();
        }
        return;
    }
    try {
        await logoutSession(options);
    } catch {
        // Local cleanup and redirect proceed even when remote revocation fails.
    } finally {
        clearAccessToken();
        navigate(adapter?.routes?.login || 'login.html');
    }
}
