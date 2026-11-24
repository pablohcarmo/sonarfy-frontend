import { describe, it, expect, vi } from 'vitest';
import { createHttpProfileAdapter, mapProfileReviews } from '../js/profile-http.js';
import { createProfileState } from '../js/profile-state.js';
import { stars, reviewsPanel } from '../js/profile-views.js';

const profileDto = (id = 1, handle = 'owner') => ({
    identity: { id, handle, displayName: handle === 'owner' ? 'Dono' : 'Terceiro', location: { city: 'SP', country: 'BR' } },
    viewer: { isSelf: id === 1, canEdit: id === 1, isFollowing: false },
    statistics: { followers: 2, following: 1 }
});

const reviewItem = (reviewId, rating = 8.5, reviewText = 'Ótimo álbum') => ({
    reviewId,
    album: {
        spotifyId: `sp-${reviewId}`,
        name: `Album ${reviewId}`,
        coverUrl: null,
        artist: { spotifyId: `ar-${reviewId}`, name: `Artist ${reviewId}` }
    },
    rating,
    reviewText,
    createdAt: '2026-11-23T16:00:00Z',
    updatedAt: '2026-11-23T16:00:00Z'
});

const json = value => new Response(JSON.stringify(value), { status: 200 });

function setup() {
    const fetcher = vi.fn();
    const expire = vi.fn();
    let token = 'access-token';
    const adapter = createHttpProfileAdapter({
        baseUrl: 'https://api.example.invalid/api',
        fetcher,
        expire,
        getToken: () => token,
        setToken: next => { token = next; }
    });
    return { adapter, fetcher, expire, changeToken: () => { token = 'other-token'; } };
}

describe('avaliações públicas por perfil', () => {
    // Remove @ do handle, codifica na URL, envia limit=20 e omite beforeId na primeira página.
    it('consulta a primeira página sem @ e sem beforeId e pagina com nextBeforeId', async () => {
        const { adapter, fetcher } = setup();
        fetcher
            .mockResolvedValueOnce(json({
                author: { id: 7, handle: 'music/fan', displayName: 'Music Fan', avatarUrl: null },
                items: [reviewItem(50, 8.5, 'Resenha 1')],
                nextBeforeId: 50
            }))
            .mockResolvedValueOnce(json({
                author: { id: 7, handle: 'music/fan', displayName: 'Music Fan', avatarUrl: null },
                items: [reviewItem(40, 0, null)],
                nextBeforeId: null
            }));

        const page1 = await adapter.loadReviews('@music/fan');
        expect(fetcher.mock.calls[0][0]).toBe(
            'https://api.example.invalid/api/profile/by-handle/music%2Ffan/reviews?limit=20'
        );
        expect(page1.items[0]).toMatchObject({
            id: '50',
            reviewId: 50,
            rating: 4.25,
            review: 'Resenha 1',
            socialAvailable: false
        });
        expect(page1.nextBeforeId).toBe(50);

        const page2 = await adapter.loadReviews('music/fan', { beforeId: page1.nextBeforeId });
        expect(fetcher.mock.calls[1][0]).toBe(
            'https://api.example.invalid/api/profile/by-handle/music%2Ffan/reviews?limit=20&beforeId=50'
        );
        expect(page2.items[0].rating).toBe(0);
        expect(page2.items[0].review).toBe('');
        expect(page2.nextBeforeId).toBeNull();
    });

    // Preserva precisão de 0.5 na escala 0-10 (quartos de estrela), escapa HTML e exibe ícones sociais sem contadores inventados.
    it('exibe quartos de estrela para rating/2, escapa resenha e oculta contadores sociais indisponíveis', () => {
        const starHtml = stars(4.25);
        expect(starHtml).toContain('aria-label="4.25 de 5 estrelas"');
        expect(starHtml).toContain('--star-fill:25%');

        const dto = mapProfileReviews({
            author: { id: 9, handle: 'terceiro', displayName: 'Terceiro', avatarUrl: null },
            items: [reviewItem(10, 9.5, '<script>alert(1)</script>')],
            nextBeforeId: null
        });
        const reviewsState = {
            handle: 'terceiro',
            items: dto.items,
            nextBeforeId: null,
            loading: false,
            loadingMore: false,
            error: null,
            loaded: true
        };
        const html = reviewsPanel(reviewsState, { handle: 'terceiro' });
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).not.toContain('data-delete-review');
        expect(html).not.toContain('data-edit-review');
        expect(html).toContain('activity-social is-unavailable');
        expect(html).toContain('data-like="10"');
        expect(html).toContain('aria-disabled="true"');
        expect(html).toContain('data-tooltip="Curtidas estarão disponíveis em breve"');
        expect(html).toContain('data-comments="10"');
        expect(html).toContain('data-tooltip="Comentários estarão disponíveis em breve"');
        expect(html).not.toMatch(/data-like="10"[^>]*>(?:(?!<\/button>).)*<span>\d+/);
    });

    // Descarta respostas atrasadas quando o usuário troca rapidamente de perfil.
    it('descarta resposta atrasada ao trocar de perfil ou sessão', async () => {
        let resolveFirst;
        const adapter = {
            loadReviews: vi.fn(() => new Promise(resolve => { resolveFirst = resolve; }))
        };
        const store = createProfileState(adapter);
        store.setData({ profile: { id: '2', handle: 'primeiro' }, session: { userId: '1' }, collection: [] });
        const pending = store.loadReviews({ reset: true });

        store.setData({ profile: { id: '3', handle: 'segundo' }, session: { userId: '1' }, collection: [] });
        resolveFirst({
            author: { id: 2, handle: 'primeiro', displayName: 'Primeiro', avatar: null },
            items: [mapProfileReviews({
                author: { id: 2, handle: 'primeiro', displayName: 'Primeiro' },
                items: [reviewItem(99, 8, 'Atrasada')],
                nextBeforeId: null
            }).items[0]],
            nextBeforeId: null
        });
        await pending;
        expect(store.state.reviews.items).toEqual([]);
        expect(store.state.reviews.handle).toBe('segundo');
    });

    // Mantém itens já carregados em falha de paginação e não oferece retry automático em 400.
    it('trata 400, 404, 401 e falha de rede sem mostrar lista vazia falsa', async () => {
        const { adapter, fetcher, expire } = setup();
        fetcher.mockResolvedValueOnce(new Response(null, { status: 400 }));
        await expect(adapter.loadReviews('other', { beforeId: -1 })).rejects.toMatchObject({
            status: 400,
            message: 'Parâmetros de paginação inválidos.'
        });

        fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
        await expect(adapter.loadReviews('missing')).rejects.toMatchObject({
            status: 404,
            message: 'Perfil indisponível.'
        });

        fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(new Response(null, { status: 401 }));
        await expect(adapter.loadReviews('other')).rejects.toMatchObject({ status: 401 });
        expect(expire).toHaveBeenCalledOnce();
    });

    // Mantém estado limpo em reload após invalidação (ex.: retorno via pageshow).
    it('recarrega a primeira página quando invalidado via loadReviews({ reset: true })', async () => {
        const { adapter, fetcher } = setup();
        const store = createProfileState(adapter);
        fetcher
            .mockResolvedValueOnce(json(profileDto(1, 'owner')))
            .mockResolvedValueOnce(json({
                author: { id: 1, handle: 'owner', displayName: 'Dono', avatarUrl: null },
                items: [reviewItem(77, 10, 'Excelente')],
                nextBeforeId: null
            }))
            .mockResolvedValueOnce(json({
                author: { id: 1, handle: 'owner', displayName: 'Dono', avatarUrl: null },
                items: [],
                nextBeforeId: null
            }));

        store.setData(await adapter.load(''));
        await store.loadReviews({ reset: true });
        expect(store.state.reviews.items).toHaveLength(1);

        await store.loadReviews({ reset: true });
        expect(store.state.reviews.items).toHaveLength(0);
    });
});
