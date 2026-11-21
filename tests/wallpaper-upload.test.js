import { describe, expect, it, vi } from 'vitest';
import { createHttpProfileAdapter } from '../js/profile-http.js';

const profileDto = (coverUrl = 'https://cdn.example/wallpapers/1/new.png') => ({
    identity: {
        id: 1,
        handle: 'maria',
        displayName: 'Maria Música',
        avatarUrl: 'https://cdn.example/avatars/1/keep.png',
        coverUrl,
        biography: 'Bio mantida',
        location: { city: 'Campinas', country: 'Brasil' },
        joinedAt: '2026-11-01T14:30:00Z'
    },
    viewer: { isSelf: true, canEdit: true, isFollowing: false },
    statistics: { followers: 10, following: 4 }
});

const json = value => new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
});

describe('profile-http: upload de wallpaper/capa (POST /api/profile/me/wallpaper)', () => {
    // Envia multipart/form-data com único campo file (sem crop) e reconcilia identity.coverUrl.
    it('envia FormData com campo único file e reconcilia coverUrl preservando avatar', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(json(profileDto(null)))
            .mockResolvedValueOnce(json(profileDto('https://cdn.example/wallpapers/1/final.png')));
        const adapter = createHttpProfileAdapter({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => 'tok-wall'
        });
        await adapter.load('');

        const file = new File([new Uint8Array([137, 80, 78, 71])], 'capa.png', { type: 'image/png' });
        const updated = await adapter.uploadWallpaper(file);

        expect(updated.cover).toBe('https://cdn.example/wallpapers/1/final.png');
        expect(updated.avatar).toBe('https://cdn.example/avatars/1/keep.png');
        const [url, init] = fetcher.mock.calls[1];
        expect(url).toBe('https://api.example.invalid/api/profile/me/wallpaper');
        expect(init.method).toBe('POST');
        expect(init.headers.Authorization).toBe('Bearer tok-wall');
        expect(init.headers['Content-Type']).toBeUndefined();
        expect(init.body).toBeInstanceOf(FormData);
        expect([...init.body.keys()]).toEqual(['file']);
        expect(init.body.get('file')).toBe(file);
    });

    // Traduz erros 400, 413, 415 e 503 sem substituir a capa atual.
    it.each([
        [400, 'inválido'],
        [413, '5 MiB'],
        [415, 'não suportado'],
        [503, 'indisponível']
    ])('traduz HTTP %s em uploadWallpaper sem sobrescrever capa atual', async (status, expected) => {
        const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status }));
        const adapter = createHttpProfileAdapter({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => 'tok-wall'
        });
        const file = new File([new Uint8Array([255, 216, 255])], 'capa.jpg', { type: 'image/jpeg' });
        await expect(adapter.uploadWallpaper(file)).rejects.toMatchObject({ status, message: expect.stringContaining(expected) });
    });
});
