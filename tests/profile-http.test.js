import { describe, it, expect, vi } from 'vitest';
import { createHttpProfileAdapter, mapProfile } from '../js/profile-http.js';
import { createProfileState } from '../js/profile-state.js';
const dto = (id = 2, isFollowing = false, followers = 0) => ({
    identity: { id, handle: id === 1 ? 'me' : 'other', displayName: 'Nome público', location: { city: 'Cidade' } },
    viewer: { isSelf: id === 1, isFollowing }, statistics: { followers, following: 3 }, email: 'private@example.invalid'
});
const json = value => new Response(JSON.stringify(value), { status: 200 });
function setup() {
    const fetcher = vi.fn(), expire = vi.fn(); let token = 'test-access';
    const adapter = createHttpProfileAdapter({ baseUrl: 'https://api.example.invalid/api/', fetcher, expire, getToken: () => token });
    const load = async () => { fetcher.mockResolvedValueOnce(json(dto(1))).mockResolvedValueOnce(json(dto())); return adapter.load('other'); };
    return { adapter, fetcher, expire, load, changeToken: () => { token = 'new-session'; } };
}

describe('perfil HTTP e relacionamentos', () => {
    // Não usa campos privados, fixtures, estatísticas de álbuns ou edição demonstrativa.
    it('mapeia o contrato público e identifica o visitante pelo /me', async () => {
        const { adapter, fetcher, load } = setup(); const data = await load();
        expect(data.session.userId).toBe('1'); expect(data.profile.id).toBe('2');
        expect(data.profile).not.toHaveProperty('email'); expect(data.profile).not.toHaveProperty('ratedCount');
        expect(data.profile.editable).toBe(false); expect(data.contentAvailable).toBe(false);
        expect(adapter.demo).toBe(false); expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
            'https://api.example.invalid/api/profile/me', 'https://api.example.invalid/api/profile/by-handle/other']);
        expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer test-access' }, credentials: 'omit' });
    });
    it('carrega o próprio perfil sem consulta redundante e rejeita resposta inválida', async () => {
        const { adapter, fetcher } = setup(); fetcher.mockResolvedValueOnce(json(dto(1)));
        expect((await adapter.load('')).profile.id).toBe('1'); expect(fetcher).toHaveBeenCalledTimes(1);
        await expect(adapter.follow(true)).rejects.toThrow('autenticado');
        expect(() => mapProfile({ ...dto(), statistics: { followers: -1, following: 0 } })).toThrow('inválida');
    });
    // O estado confirmado vem do GET, inclusive quando difere da intenção ou da contagem anterior.
    it.each([[true, 'PUT'], [false, 'DELETE']])('reconcilia %s após %s sem corpo', async (following, method) => {
        const { adapter, fetcher, load } = setup(); await load();
        fetcher.mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json(dto(2, following, 9)));
        expect(await adapter.follow(following)).toMatchObject({ isFollowing: following, followers: 9, following: 3 });
        expect(fetcher.mock.calls[2]).toEqual(['https://api.example.invalid/api/profile/2/following',
            expect.objectContaining({ method })]); expect(fetcher.mock.calls[2][1]).not.toHaveProperty('body');
        expect(fetcher.mock.calls[3][0]).toContain('/by-handle/other');
    });
    it('não repete nem inverte mutação de resultado incerto; o próximo clique só consulta', async () => {
        const { adapter, fetcher, load } = setup(); const store = createProfileState(adapter); store.setData(await load());
        fetcher.mockResolvedValueOnce(new Response(null, { status: 204 })).mockRejectedValueOnce(new Error('offline'));
        await expect(store.follow()).rejects.toThrow('confirmar');
        expect(store.state.data.profile).toMatchObject({ isFollowing: false, followers: 0, followUncertain: true });
        fetcher.mockResolvedValueOnce(json(dto(2, true, 1))); await store.follow();
        expect(fetcher.mock.calls.slice(2).map(([, request]) => request.method)).toEqual(['PUT', 'GET', 'GET']);
        expect(store.state.data.profile).toMatchObject({ isFollowing: true, followers: 1, followUncertain: false });
    });
    it.each([401, 404, 500])('trata HTTP %s sem fallback para demonstração', async status => {
        const { adapter, fetcher, expire } = setup(); fetcher.mockResolvedValueOnce(new Response(null, { status }));
        await expect(adapter.load('')).rejects.toMatchObject({ status }); expect(expire).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
    });
    it('descarta resposta recebida depois de troca da sessão', async () => {
        const { adapter, fetcher, changeToken } = setup();
        fetcher.mockImplementationOnce(async () => { changeToken(); return json(dto(1)); });
        await expect(adapter.load('')).rejects.toThrow('sessão mudou');
    });
    // Resultado de rede incerto exige leitura, sem repetir uma possível escrita confirmada.
    it('recupera falha da própria mutação somente por GET e codifica o handle', async () => {
        const { adapter, fetcher } = setup();
        fetcher.mockResolvedValueOnce(json(dto(1))).mockResolvedValueOnce(json(dto()));
        await adapter.load('a/b'); expect(fetcher.mock.calls[1][0]).toContain('a%2Fb');
        fetcher.mockRejectedValueOnce(new Error('offline'));
        await expect(adapter.follow(true)).rejects.toMatchObject({ reconcileRequired: true });
        fetcher.mockResolvedValueOnce(json(dto())); await adapter.follow(true);
        expect(fetcher.mock.calls.slice(2).map(([, request]) => request.method)).toEqual(['PUT', 'GET']);
        expect(() => mapProfile(null)).toThrow('inválida');
    });
    it('encaminha ao login sem enviar requisição quando não há token', async () => {
        const fetcher = vi.fn(), expire = vi.fn();
        const adapter = createHttpProfileAdapter({ fetcher, expire, getToken: () => null });
        await expect(adapter.load('')).rejects.toMatchObject({ status: 401 });
        expect(fetcher).not.toHaveBeenCalled(); expect(expire).toHaveBeenCalledOnce();
    });
    it('envia um só follow enquanto pendente e ignora resultado de um perfil substituído', async () => {
        const { adapter, fetcher, load } = setup(); const store = createProfileState(adapter); store.setData(await load());
        let release; fetcher.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        fetcher.mockResolvedValueOnce(json(dto(2, true, 1)));
        const pending = store.follow(); await store.follow();
        const replacement = { profile: { id: '3' }, collection: [] }; store.setData(replacement);
        release(new Response(null, { status: 204 })); await pending;
        expect(store.state.data).toBe(replacement); expect(store.state.pending.size).toBe(0);
        expect(fetcher.mock.calls.filter(([, r]) => r.method === 'PUT')).toHaveLength(1);
    });
});
