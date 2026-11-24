import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpAccountAdapter, mapCitySuggestions, mapUserDto } from '../js/account-http.js';
import { resolveAccountAdapter } from '../js/account.js';

const userDto = (overrides = {}) => ({
    id: 42,
    name: 'Maria',
    surname: 'Silva',
    handle: 'maria.silva',
    email: 'maria@example.com',
    city: 'São Paulo',
    country: 'Brasil',
    birthDate: '2000-05-15',
    active: true,
    ...overrides
});

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
});

describe('account-http: GET/PUT /api/users/me e GET /api/locations/cities', () => {
    beforeEach(() => {
        localStorage.clear();
        delete window.sonarfyAccountAdapter;
        delete window.sonarfyCitySearch;
        history.replaceState(null, '', '/pages/account.html');
    });

    // Seleciona HTTP por padrão e demo somente com ?demo=true ou adapter injetado.
    it('resolve HTTP adapter por padrão e demo somente quando ?demo=true', () => {
        expect(resolveAccountAdapter().demo).toBe(false);
        history.replaceState(null, '', '/pages/account.html?demo=true');
        expect(resolveAccountAdapter().demo).toBe(true);
        const host = { demo: false, load: vi.fn() };
        expect(resolveAccountAdapter(host)).toBe(host);
    });

    // Carrega GET /api/users/me com Bearer, renovando em 401 via refresh single-flight.
    it('carrega dados reais via GET /api/users/me e renova token em 401', async () => {
        let token = 'expired-token';
        const fetcher = vi.fn()
            .mockResolvedValueOnce(new Response(null, { status: 401 }))
            .mockResolvedValueOnce(jsonResponse({ accessToken: 'fresh-token', tokenType: 'Bearer', expiresInSeconds: 900 }))
            .mockResolvedValueOnce(jsonResponse(userDto()));
        const expire = vi.fn();
        const adapter = createHttpAccountAdapter({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => token,
            setToken: next => { token = next; },
            expire
        });

        const { account } = await adapter.load();
        expect(account).toMatchObject({
            id: '42',
            firstName: 'Maria',
            lastName: 'Silva',
            handle: 'maria.silva',
            birthDate: '2000-05-15',
            city: 'São Paulo',
            country: 'Brasil',
            cityId: null,
            email: 'maria@example.com'
        });
        expect(token).toBe('fresh-token');
        expect(expire).not.toHaveBeenCalled();
        expect(fetcher.mock.calls[0][0]).toBe('https://api.example.invalid/api/users/me');
        expect(fetcher.mock.calls[1][0]).toBe('https://api.example.invalid/api/auth/refresh');
        expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh-token');
    });

    // Consulta GET /api/locations/cities sem Authorization e mapeia CityDto.
    it('consulta GET /api/locations/cities sem Bearer e mapeia CityDto', async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse([
            { cityId: 3467865, name: 'Campinas', region: 'São Paulo', country: 'Brasil' },
            { cityId: 0, name: 'Inválida', region: '', country: '' }
        ]));
        const adapter = createHttpAccountAdapter({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => 'tok'
        });

        const cities = await adapter.searchCities('Campinas');
        expect(cities).toEqual([
            { id: 3467865, name: 'Campinas', adminName1: 'São Paulo', countryName: 'Brasil' }
        ]);
        expect(fetcher).toHaveBeenCalledExactlyOnceWith(
            'https://api.example.invalid/api/locations/cities?q=Campinas',
            expect.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store' })
        );
        expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
        expect(mapCitySuggestions(null)).toEqual([]);
    });

    // Envia PUT /api/users/me omitindo cityId quando não selecionado e enviando quando selecionado.
    it('envia PUT /api/users/me com UpdateUserDto e reconcilia UserDto retornado', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(jsonResponse(userDto({ name: 'Maria Clara', handle: 'maria-clara' })))
            .mockResolvedValueOnce(jsonResponse(userDto({ city: 'Campinas', country: 'Brasil' })));
        const adapter = createHttpAccountAdapter({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => 'valid-token'
        });

        const res1 = await adapter.updateAccount({
            firstName: 'Maria Clara',
            lastName: 'Silva',
            handle: 'maria-clara',
            birthDate: '2000-05-15',
            cityId: null
        });
        expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
            name: 'Maria Clara',
            surname: 'Silva',
            handle: 'maria-clara',
            birthDate: '2000-05-15'
        });
        expect(res1.account.handle).toBe('maria-clara');

        const res2 = await adapter.updateAccount({
            firstName: 'Maria',
            lastName: 'Silva',
            handle: 'maria.silva',
            birthDate: '2000-05-15',
            cityId: 3467865
        });
        expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
            name: 'Maria',
            surname: 'Silva',
            handle: 'maria.silva',
            birthDate: '2000-05-15',
            cityId: 3467865
        });
        expect(res2.account.city).toBe('Campinas');
    });

    // Trata 409, 400 e 503 no PUT e rejeita ações sem endpoint no backend sem simular sucesso.
    it('trata erros 409/400/503 e bloqueia ações sem endpoint no backend', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(new Response(null, { status: 409 }))
            .mockResolvedValueOnce(new Response(null, { status: 400 }))
            .mockResolvedValueOnce(new Response(null, { status: 503 }));
        const adapter = createHttpAccountAdapter({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => 'valid-token'
        });
        const payload = { firstName: 'A', lastName: 'B', handle: 'taken', birthDate: '2000-05-15', cityId: null };

        await expect(adapter.updateAccount(payload)).rejects.toMatchObject({ status: 409 });
        await expect(adapter.updateAccount(payload)).rejects.toMatchObject({ status: 400 });
        await expect(adapter.updateAccount(payload)).rejects.toMatchObject({ status: 503 });
        await expect(adapter.deleteAccount()).rejects.toThrow('não está disponível');
        expect(() => mapUserDto({})).toThrow('inválida');
    });
});
