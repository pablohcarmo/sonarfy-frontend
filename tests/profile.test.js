import { describe, it, expect, vi } from 'vitest';
import { createFixtures } from '../js/profile-fixtures.js';
import { createProfileAdapter, validateData } from '../js/profile-data.js';
import { createProfileState } from '../js/profile-state.js';
import { validateProfile, validateReview, timestamp, sortCollection, profileURL, escapeHTML } from '../js/profile-utils.js';

describe('regras do perfil público', () => {
    it('valida limites e nome obrigatório em caracteres Unicode', () => {
        expect(() => validateProfile({ displayName: ' ', bio: '' })).toThrow();
        expect(() => validateProfile({ displayName: 'a'.repeat(50), bio: 'á'.repeat(150) })).not.toThrow();
        expect(() => validateProfile({ displayName: 'a'.repeat(51), bio: '' })).toThrow();
        expect(() => validateProfile({ displayName: 'Nome', bio: 'a'.repeat(151) })).toThrow();
        expect(() => validateReview('𝄞'.repeat(255))).not.toThrow();
        expect(() => validateReview('𝄞'.repeat(256))).toThrow();
    });
    it('usa horas antes de 24h e mês/dia no limite e além dele', () => {
        const now = new Date(2026, 9, 22, 12).getTime();
        expect(timestamp(now - 3 * 3600000, now)).toBe('3h');
        expect(timestamp(now - 23 * 3600000, now)).toBe('23h');
        expect(timestamp(now - 24 * 3600000, now)).toBe('Out 21');
        expect(timestamp(new Date(2026, 5, 15), now)).toBe('Jun 15');
        expect(timestamp('inválido', now)).toBe('');
    });
    it('constrói a URL a partir da rota implementada e da origem configurada', () => {
        expect(profileURL('lucas_vinyl', 'https://exemplo.test')).toBe('https://exemplo.test/pages/profile.html?handle=lucas_vinyl');
        expect(escapeHTML('<img onerror="x">')).toBe('&lt;img onerror=&quot;x&quot;&gt;');
    });
    it('mantém fixtures separadas por identidade pública, com resenhas válidas', () => {
        const own = validateData(createFixtures());
        const friend = validateData(createFixtures('lucas_vinyl'));
        expect(own.profile.id).toBe(own.session.userId);
        expect(friend.profile.id).not.toBe(friend.session.userId);
        expect(friend.replies.every(item => item.author.id === friend.profile.id)).toBe(true);
        expect(friend.replies[0].review).not.toBe(own.replies[0].review);
        expect('name' in own.profile).toBe(false);
        expect(() => createFixtures('inexistente')).toThrow('Perfil não encontrado');
    });
    it('rejeita conteúdo incompatível com o contrato em vez de truncar silenciosamente', () => {
        const data = createFixtures(); data.activities[0].review = 'a'.repeat(256);
        expect(() => validateData(data)).toThrow('255');
    });
});

describe('ordenação de coleção completa', () => {
    const items = [
        { id: 'old', rating: 5, review: '', createdAt: '2026-01-01' },
        { id: 'middle', rating: 1, review: 'Texto integral', createdAt: '2026-02-01' },
        { id: 'new', rating: 4, review: '  ', createdAt: '2026-03-01' }
    ];
    it.each([
        ['recent', ['new', 'middle', 'old']], ['oldest', ['old', 'middle', 'new']],
        ['highest', ['old', 'new', 'middle']], ['lowest', ['middle', 'new', 'old']], ['written', ['middle']]
    ])('aplica %s sem modificar os dados originais', (sort, ids) => {
        expect(sortCollection(items, sort).map(item => item.id)).toEqual(ids);
        expect(items[0].id).toBe('old');
    });
});

describe('mutações e reconciliação', () => {
    it('bloqueia cliques concorrentes e sincroniza representações da mesma publicação', async () => {
        let complete;
        const adapter = { like: vi.fn(() => new Promise(resolve => { complete = resolve; })) };
        const store = createProfileState(adapter); const data = createFixtures();
        const id = data.activities[0].id;
        data.collection = data.collection.map(item => ({ ...item }));
        store.setData(data);
        const mutation = store.like(id);
        await store.like(id);
        expect(adapter.like).toHaveBeenCalledTimes(1);
        expect(store.state.pending.has(`like:${id}`)).toBe(true);
        complete({ liked: false, likeCount: 13 }); await mutation;
        expect(data.activities[0].likeCount).toBe(13);
        expect(data.collection.find(item => item.id === id).likeCount).toBe(13);
        expect(store.state.pending.size).toBe(0);
    });
    it('preserva dados e libera o envio após falha de curtida', async () => {
        const store = createProfileState({ like: vi.fn().mockRejectedValue(new Error('Falha de rede')) });
        store.setData(createFixtures()); const item = store.state.data.activities[0];
        const before = { liked: item.liked, likeCount: item.likeCount };
        await expect(store.like(item.id)).rejects.toThrow('Falha de rede');
        expect(item).toMatchObject(before); expect(store.state.pending.size).toBe(0);
    });
    it('reconcilia seguir, contagens e falha sem usar o tema', async () => {
        const adapter = createProfileAdapter(null); const data = await adapter.load('lucas_vinyl');
        const store = createProfileState(adapter); store.setData(data);
        await store.follow(); expect(data.profile.isFollowing).toBe(true); expect(data.profile.followers).toBe(1401);
        await store.follow(); expect(data.profile.isFollowing).toBe(false); expect(data.profile.followers).toBe(1400);
    });
    it('bloqueia ação social sem sessão', async () => {
        const adapter = { like: vi.fn(), follow: vi.fn() }; const store = createProfileState(adapter);
        const data = createFixtures(); data.session = null; store.setData(data);
        await expect(store.like(data.activities[0].id)).rejects.toThrow('Entre');
        await expect(store.follow()).rejects.toThrow('Entre');
        expect(adapter.like).not.toHaveBeenCalled(); expect(adapter.follow).not.toHaveBeenCalled();
    });
    it('mantém coleção carregada durante requisição e preserva seleção em falha', async () => {
        const adapter = { collection: vi.fn().mockRejectedValue(new Error('Falha')) };
        const store = createProfileState(adapter); store.setData(createFixtures());
        const before = store.state.collection;
        await expect(store.sort('oldest')).rejects.toThrow();
        expect(store.state.collection).toBe(before); expect(store.state.sort).toBe('recent');
        expect(store.state.pending.size).toBe(0);
    });
    it('reutiliza o adapter real sem recorrer às fixtures', () => {
        const adapter = { load: vi.fn(), demo: false };
        expect(createProfileAdapter(adapter)).toBe(adapter);
    });
});
