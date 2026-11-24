import { describe, it, expect, vi } from 'vitest';
import { createHttpProfileAdapter, mapProfileCollection } from '../js/profile-http.js';
import { createProfileState } from '../js/profile-state.js';
import { createDialogs } from '../js/profile-dialogs.js';
import { collectionPanel, albumDetails, stars } from '../js/profile-views.js';
import { collectionSortOptions, albumURL } from '../js/profile-utils.js';

const profileDto = (id = 1, handle = 'owner') => ({
    identity: { id, handle, displayName: handle === 'owner' ? 'Dono' : 'Terceiro', location: { city: 'SP', country: 'BR' } },
    viewer: { isSelf: id === 1, canEdit: id === 1, isFollowing: false },
    statistics: { followers: 2, following: 1 }
});

const collectionItem = (reviewId, rating = 8.5, reviewText = 'Ótimo álbum') => ({
    reviewId,
    album: {
        spotifyId: `sp-${reviewId}`,
        name: `Album ${reviewId}`,
        coverUrl: `https://cdn.example/cover-${reviewId}.jpg`,
        artist: { spotifyId: `ar-${reviewId}`, name: `Artist ${reviewId}` }
    },
    rating,
    reviewText,
    createdAt: '2026-11-23T16:00:00Z',
    updatedAt: '2026-11-23T17:00:00Z'
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

describe('coleção pública do perfil', () => {
    // Mapeia campos públicos, preserva ordem do servidor, nota 0/10/quartos e omite dados sociais fabricados.
    it('mapeia resposta completa, preserva notas zero/dez/intermediárias e não fabrica contadores sociais', () => {
        const dto = mapProfileCollection({
            author: { id: 7, handle: 'musicfan', displayName: 'Music Fan', avatarUrl: null },
            items: [
                collectionItem(10, 0, null),
                collectionItem(20, 0.5, 'Quarto de estrela'),
                collectionItem(30, 8.5, '<script>alert(1)</script>'),
                collectionItem(40, 10, 'Nota máxima')
            ],
            totalReviews: 12,
            matchingReviews: 4,
            nextCursor: 'opaque.cursor.v1'
        });

        expect(dto.author).toEqual({ id: '7', handle: 'musicfan', displayName: 'Music Fan', avatar: null });
        expect(dto.totalReviews).toBe(12);
        expect(dto.matchingReviews).toBe(4);
        expect(dto.nextCursor).toBe('opaque.cursor.v1');
        expect(dto.items.map(i => i.reviewId)).toEqual([10, 20, 30, 40]);
        expect(dto.items[0]).toMatchObject({
            id: '10',
            reviewId: 10,
            rating: 0,
            review: '',
            liked: false,
            likeCount: 0,
            commentCount: 0,
            socialAvailable: false,
            album: {
                id: 'sp-10',
                spotifyId: 'sp-10',
                title: 'Album 10',
                artist: 'Artist 10',
                cover: 'https://cdn.example/cover-10.jpg'
            }
        });
        expect(dto.items[1].rating).toBe(0.25);
        expect(dto.items[2].rating).toBe(4.25);
        expect(dto.items[3].rating).toBe(5);
        expect(stars(dto.items[0].rating)).toContain('aria-label="0 de 5 estrelas"');
        expect(stars(dto.items[1].rating)).toContain('--star-fill:25%');
        expect(collectionSortOptions.find(([k]) => k === 'lowest')[1]).not.toContain('1 ★');
    });

    // Envia handle sem @, ordenação e filtro independentes e cursor opaco intacto; usa cache no-store.
    it('envia parâmetros de ordenação, filtro writtenOnly e cursor opaco intacto na URL', async () => {
        const { adapter, fetcher } = setup();
        fetcher
            .mockResolvedValueOnce(json({
                author: { id: 7, handle: 'music/fan', displayName: 'Music Fan', avatarUrl: null },
                items: [collectionItem(50, 9.0, 'Primeira')],
                totalReviews: 12,
                matchingReviews: 4,
                nextCursor: 'cursor+abc/def=='
            }))
            .mockResolvedValueOnce(json({
                author: { id: 7, handle: 'music/fan', displayName: 'Music Fan', avatarUrl: null },
                items: [collectionItem(40, 8.0, 'Segunda')],
                totalReviews: 12,
                matchingReviews: 4,
                nextCursor: null
            }));

        const page1 = await adapter.loadCollection('@music/fan', { sort: 'highest', writtenOnly: true });
        expect(fetcher.mock.calls[0][0]).toBe(
            'https://api.example.invalid/api/profile/by-handle/music%2Ffan/collection?limit=20&sort=highest&writtenOnly=true'
        );
        expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: 'no-store', credentials: 'omit' });

        const page2 = await adapter.loadCollection('music/fan', { sort: 'highest', writtenOnly: true, cursor: page1.nextCursor });
        expect(fetcher.mock.calls[1][0]).toBe(
            'https://api.example.invalid/api/profile/by-handle/music%2Ffan/collection?limit=20&sort=highest&writtenOnly=true&cursor=cursor%2Babc%2Fdef%3D%3D'
        );
        expect(page2.nextCursor).toBeNull();
    });

    // Mapeia opção legada written para sort=recent e writtenOnly=true e suporta todas as ordenações.
    it.each([
        ['recent', false, 'recent', 'false'],
        ['oldest', false, 'oldest', 'false'],
        ['highest', true, 'highest', 'true'],
        ['lowest', true, 'lowest', 'true'],
        ['written', false, 'recent', 'true']
    ])('traduz sort=%s writtenOnly=%s para sort=%s&writtenOnly=%s', async (sort, writtenOnly, expectedSort, expectedWritten) => {
        const { adapter, fetcher } = setup();
        fetcher.mockResolvedValueOnce(json({
            author: { id: 1, handle: 'owner', displayName: 'Dono', avatarUrl: null },
            items: [],
            totalReviews: 0,
            matchingReviews: 0,
            nextCursor: null
        }));
        await adapter.loadCollection('owner', { sort, writtenOnly });
        const url = new URL(fetcher.mock.calls[0][0]);
        expect(url.searchParams.get('sort')).toBe(expectedSort);
        expect(url.searchParams.get('writtenOnly')).toBe(expectedWritten);
    });

    // Distingue totalReviews de matchingReviews, coleção vazia de filtro sem resultados e escapa HTML.
    it('exibe totalReviews, matchingReviews separados, estado vazio vs filtro sem resultados e escape seguro', () => {
        const dto = mapProfileCollection({
            author: { id: 9, handle: 'terceiro', displayName: 'Terceiro', avatarUrl: null },
            items: [collectionItem(10, 9.5, '<img src=x onerror=alert(1)>')],
            totalReviews: 12,
            matchingReviews: 1,
            nextCursor: 'next-1'
        });
        const html = collectionPanel({
            handle: 'terceiro',
            sort: 'highest',
            writtenOnly: true,
            items: dto.items,
            totalReviews: dto.totalReviews,
            matchingReviews: dto.matchingReviews,
            nextCursor: dto.nextCursor,
            loading: false,
            loadingMore: false,
            error: null,
            loaded: true
        }, { handle: 'terceiro' });

        expect(html).toContain('12 álbuns avaliados');
        expect(html).toContain('1 com resenha');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('data-load-more-collection');

        const filteredEmpty = collectionPanel({
            handle: 'terceiro',
            sort: 'recent',
            writtenOnly: true,
            items: [],
            totalReviews: 5,
            matchingReviews: 0,
            nextCursor: null,
            loading: false,
            loadingMore: false,
            error: null,
            loaded: true
        }, { handle: 'terceiro' });
        expect(filteredEmpty).toContain('5 álbuns avaliados');
        expect(filteredEmpty).toContain('0 com resenha');
        expect(filteredEmpty).toContain('Nenhuma resenha escrita encontrada');

        const trulyEmpty = collectionPanel({
            handle: 'terceiro',
            sort: 'recent',
            writtenOnly: false,
            items: [],
            totalReviews: 0,
            matchingReviews: 0,
            nextCursor: null,
            loading: false,
            loadingMore: false,
            error: null,
            loaded: true
        }, { handle: 'terceiro' });
        expect(trulyEmpty).toContain('Nenhuma avaliação na coleção ainda');
    });

    // Preserva itens já carregados em falha ao carregar mais, deduplica por reviewId e impede requisições duplicadas.
    it('deduplica por reviewId, evita paginação duplicada e preserva itens em falha de carregar mais', async () => {
        let resolvePage2;
        const adapter = {
            loadCollection: vi.fn()
                .mockResolvedValueOnce(mapProfileCollection({
                    author: { id: 1, handle: 'owner', displayName: 'Dono' },
                    items: [collectionItem(10, 8), collectionItem(20, 6)],
                    totalReviews: 3,
                    matchingReviews: 3,
                    nextCursor: 'c1'
                }))
                .mockImplementationOnce(() => new Promise(resolve => { resolvePage2 = resolve; }))
                .mockRejectedValueOnce(Object.assign(new Error('Falha de conexão'), { status: null }))
        };
        const store = createProfileState(adapter);
        store.setData({ profile: { id: '1', handle: 'owner' }, session: { userId: '1' }, collection: [] });
        await store.loadCollection({ reset: true });

        const p1 = store.loadCollection({ reset: false });
        const p2 = store.loadCollection({ reset: false });
        expect(adapter.loadCollection).toHaveBeenCalledTimes(2);
        resolvePage2(mapProfileCollection({
            author: { id: 1, handle: 'owner', displayName: 'Dono' },
            items: [collectionItem(20, 6), collectionItem(30, 4)],
            totalReviews: 3,
            matchingReviews: 3,
            nextCursor: 'c2'
        }));
        await Promise.all([p1, p2]);
        expect(store.state.collectionState.items.map(i => i.reviewId)).toEqual([10, 20, 30]);
        expect(store.state.data.profile.ratedCount).toBe(3);

        await store.loadCollection({ reset: false });
        expect(store.state.collectionState.items.map(i => i.reviewId)).toEqual([10, 20, 30]);
        expect(store.state.collectionState.nextCursor).toBe('c2');
        expect(store.state.collectionState.error?.message).toBe('Falha de conexão');
    });

    // Descarta respostas atrasadas ao trocar perfil, ordenação/filtro ou sessão e limpa estado.
    it('descarta resposta atrasada ao trocar perfil, filtro ou sessão', async () => {
        let resolveSlow;
        const adapter = {
            loadCollection: vi.fn()
                .mockImplementationOnce(() => new Promise(resolve => { resolveSlow = resolve; }))
                .mockResolvedValueOnce(mapProfileCollection({
                    author: { id: 2, handle: 'primeiro', displayName: 'Primeiro' },
                    items: [collectionItem(99, 10, 'Atual')],
                    totalReviews: 1,
                    matchingReviews: 1,
                    nextCursor: null
                }))
        };
        const store = createProfileState(adapter);
        store.setData({ profile: { id: '2', handle: 'primeiro' }, session: { userId: '1' }, collection: [] });
        const slow = store.loadCollection({ reset: true });
        await store.setCollectionFilter({ sort: 'highest', writtenOnly: true });

        resolveSlow(mapProfileCollection({
            author: { id: 2, handle: 'primeiro', displayName: 'Primeiro' },
            items: [collectionItem(1, 2, 'Atrasada')],
            totalReviews: 1,
            matchingReviews: 0,
            nextCursor: 'stale'
        }));
        await slow;

        expect(store.state.collectionState.items.map(i => i.reviewId)).toEqual([99]);
        expect(store.state.collectionState.sort).toBe('highest');
        expect(store.state.collectionState.writtenOnly).toBe(true);

        store.setData({ profile: { id: '3', handle: 'outro' }, session: { userId: '99' }, collection: [] });
        expect(store.state.collectionState.items).toEqual([]);
        expect(store.state.collectionState.nextCursor).toBeNull();
        expect(store.state.collectionState.totalReviews).toBeNull();
    });

    // Trata 400, 401 com refresh/expire e 404; invalida coleção e avaliações após exclusão (204 e 404).
    it('trata 400, 401, 404 e invalida coleção após exclusão de avaliação própria', async () => {
        const { adapter, fetcher, expire } = setup();
        const store = createProfileState(adapter);

        fetcher.mockResolvedValueOnce(new Response(null, { status: 400 }));
        await expect(adapter.loadCollection('owner', { cursor: 'bad' })).rejects.toMatchObject({
            status: 400,
            message: 'Parâmetros de coleção inválidos.'
        });

        fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
        await expect(adapter.loadCollection('missing')).rejects.toMatchObject({
            status: 404,
            message: 'Perfil indisponível.'
        });

        fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(new Response(null, { status: 401 }));
        await expect(adapter.loadCollection('owner')).rejects.toMatchObject({ status: 401 });
        expect(expire).toHaveBeenCalledOnce();

        fetcher
            .mockResolvedValueOnce(json(profileDto(1, 'owner')))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(json({ author: { id: 1, handle: 'owner', displayName: 'Dono' }, items: [], nextBeforeId: null }))
            .mockResolvedValueOnce(json({ author: { id: 1, handle: 'owner', displayName: 'Dono' }, items: [], totalReviews: 0, matchingReviews: 0, nextCursor: null }));

        store.setData(await adapter.load(''));
        await adapter.deleteReview(77);
        await store.invalidateReviewsAndCollection();
        expect(store.state.collectionState.totalReviews).toBe(0);
        expect(store.state.collectionState.items).toEqual([]);
    });

    // Renderiza botões somente-ícone (editar e lixeira) no diálogo próprio, abre modal de edição in-place e oculta para terceiros.
    it('renderiza botões somente-ícone no modal próprio, edita avaliação in-place sem redirecionar e oculta para terceiros', async () => {
        document.body.innerHTML = '<dialog id="profile-dialog"></dialog>';
        const dialog = document.getElementById('profile-dialog');
        dialog.showModal = vi.fn(() => dialog.setAttribute('open', ''));
        dialog.close = vi.fn(() => dialog.removeAttribute('open'));

        const adapter = {
            demo: false,
            updateReview: vi.fn().mockResolvedValue({ reviewId: 101, rating: 4.75, review: 'Texto editado' }),
            deleteReview: vi.fn(),
            loadCollection: vi.fn().mockResolvedValue(mapProfileCollection({
                author: { id: 7, handle: 'musicfan', displayName: 'Music Fan' },
                items: [collectionItem(101, 9.5, 'Texto editado')],
                totalReviews: 1,
                matchingReviews: 1,
                nextCursor: null
            }))
        };
        const store = createProfileState(adapter);
        store.setData({ profile: { id: '7', handle: 'musicfan' }, session: { userId: '7' }, collection: [] });
        const notify = vi.fn();
        const dialogs = createDialogs({ adapter, store, notify, onSaved: vi.fn() });

        const ownDto = mapProfileCollection({
            author: { id: 7, handle: 'musicfan', displayName: 'Music Fan' },
            items: [collectionItem(101, 8.5, 'Resenha original')],
            totalReviews: 1,
            matchingReviews: 1,
            nextCursor: null
        });
        dialogs.review(ownDto.items[0]);

        const editBtn = dialog.querySelector('[data-edit-review="101"]');
        const deleteBtn = dialog.querySelector('[data-delete-review="101"]');
        expect(editBtn).not.toBeNull();
        expect(editBtn.tagName).toBe('BUTTON');
        expect(deleteBtn).not.toBeNull();
        expect(editBtn.getAttribute('aria-label')).toBe('Editar avaliação');
        expect(deleteBtn.getAttribute('aria-label')).toBe('Excluir avaliação');
        expect(editBtn.textContent.trim()).toBe('');
        expect(deleteBtn.textContent.trim()).toBe('');
        expect(editBtn.querySelector('img[src*="edit-light.svg"]')).not.toBeNull();
        expect(deleteBtn.querySelector('img[src*="trash-light.svg"]')).not.toBeNull();
        expect(deleteBtn.querySelector('img[src*="trash-dark.svg"]')).not.toBeNull();
        expect(dialog.querySelector('[data-like], [data-comments]')).toBeNull();

        // Clicar na lixeira exibe Confirmar exclusão e Cancelar; Cancelar restaura os ícones
        deleteBtn.click();
        expect(dialog.querySelector('[data-confirm-delete-review="101"]')?.textContent).toBe('Confirmar exclusão');
        expect(dialog.querySelector('[data-cancel-delete-review="101"]')?.textContent).toBe('Cancelar');
        expect(adapter.deleteReview).not.toHaveBeenCalled();
        dialog.querySelector('[data-cancel-delete-review="101"]').click();
        expect(dialog.querySelector('[data-edit-review="101"]')).not.toBeNull();
        expect(dialog.querySelector('[data-delete-review="101"]')).not.toBeNull();

        dialog.querySelector('[data-edit-review="101"]').click();
        const form = dialog.querySelector('#edit-review-form');
        expect(form).not.toBeNull();
        expect(form.elements.rating.value).toBe('4.25');
        expect(form.elements.review.value).toBe('Resenha original');

        form.elements.rating.value = '4.75';
        form.elements.rating.dispatchEvent(new Event('input'));
        form.elements.review.value = 'Texto editado';
        form.elements.review.dispatchEvent(new Event('input'));
        form.dispatchEvent(new Event('submit', { cancelable: true }));

        await vi.waitFor(() => expect(adapter.updateReview).toHaveBeenCalledWith(101, {
            rating: 4.75,
            reviewText: 'Texto editado'
        }));
        await vi.waitFor(() => expect(notify).toHaveBeenCalledWith('Avaliação atualizada com sucesso.'));

        store.setData({ profile: { id: '99', handle: 'other' }, session: { userId: '7' }, collection: [] });
        const otherDto = mapProfileCollection({
            author: { id: 99, handle: 'other', displayName: 'Other' },
            items: [collectionItem(202, 8.0, 'De terceiro')],
            totalReviews: 1,
            matchingReviews: 1,
            nextCursor: null
        });
        dialogs.review(otherDto.items[0]);
        expect(dialog.querySelector('[data-edit-review], [data-delete-review]')).toBeNull();
        expect(dialog.querySelector('[data-like], [data-comments]')).toBeNull();
    });

    // Gera rota de álbum com spotifyId para cards da coleção e preserva modo demo quando ativo.
    it('gera rota album.html?albumId=<spotifyId> e renderiza botão de álbum apenas com ID válido', () => {
        expect(albumURL('4aawyAB9vmqN3uQ7FjRGTy')).toBe('album.html?albumId=4aawyAB9vmqN3uQ7FjRGTy');
        expect(albumURL('demo-1', { demo: true, album: { title: 'Disco', artist: 'Banda' } }))
            .toBe('album.html?demo=true&albumId=demo-1&title=Disco&artist=Banda');

        const interactiveHtml = albumDetails({ id: 'fallback', spotifyId: '4aawyAB9vmqN3uQ7FjRGTy', title: 'Album', artist: 'Artist' });
        expect(interactiveHtml).toContain('data-album="4aawyAB9vmqN3uQ7FjRGTy"');
        expect(interactiveHtml).toContain('<button class="album-details"');

        const missingIdHtml = albumDetails({ id: '', spotifyId: '', title: 'Sem ID', artist: 'Artist' });
        expect(missingIdHtml).not.toContain('data-album=');
        expect(missingIdHtml).toContain('<div class="album-details">');
    });
});
