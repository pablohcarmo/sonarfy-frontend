import { describe, expect, it, vi } from 'vitest';
import {
    AVATAR_UPLOAD_POLICY,
    computeAvatarCrop,
    computePreviewTransform,
    getOrientedDimensions,
    validateAvatarCrop,
    validateAvatarFile
} from '../js/avatar-crop.js';
import { createHttpProfileAdapter } from '../js/profile-http.js';

const profileDto = (avatarUrl = 'https://cdn.example/avatars/1/new.png') => ({
    identity: {
        id: 1,
        handle: 'maria',
        displayName: 'Maria Música',
        avatarUrl,
        coverUrl: 'https://cdn.example/wallpapers/1/keep.png',
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

describe('avatar-crop: orientação EXIF, recorte quadrado, zoom e prévia', () => {
    // Troca largura e altura para orientações EXIF 5-8 e preserva para 1-4.
    it('calcula dimensões orientadas por EXIF (1-4 preservadas, 5-8 trocadas)', () => {
        expect(getOrientedDimensions(1200, 800, 1)).toEqual({ width: 1200, height: 800 });
        expect(getOrientedDimensions(1200, 800, 3)).toEqual({ width: 1200, height: 800 });
        expect(getOrientedDimensions(1200, 800, 6)).toEqual({ width: 800, height: 1200 });
        expect(getOrientedDimensions(1200, 800, 8)).toEqual({ width: 800, height: 1200 });
    });

    // Calcula recorte central e bordas para paisagem, retrato e quadrada sem ultrapassar limites.
    it('calcula recorte inteiro válido para paisagem, retrato, quadrada e zoom', () => {
        expect(computeAvatarCrop({ imageWidth: 1200, imageHeight: 800, zoom: 1, panX: 0, panY: 0 }))
            .toEqual({ cropX: 200, cropY: 0, cropSize: 800 });
        expect(computeAvatarCrop({ imageWidth: 800, imageHeight: 1200, zoom: 1, panX: 0, panY: 0 }))
            .toEqual({ cropX: 0, cropY: 200, cropSize: 800 });
        expect(computeAvatarCrop({ imageWidth: 1000, imageHeight: 1000, zoom: 2, panX: 1, panY: -1 }))
            .toEqual({ cropX: 500, cropY: 0, cropSize: 500 });
        const preview = computePreviewTransform({ imageWidth: 1200, imageHeight: 800, cropX: 400, cropY: 100, cropSize: 600, viewportSize: 180 });
        expect(preview).toEqual({ width: 360, height: 240, left: -120, top: -30 });
    });

    // Valida tipo JPEG/PNG, tamanho <= 5 MiB, pixels <= 16 MP e integridade de cropX/cropY/cropSize.
    it('valida limites de arquivo, pixels e coordenadas de recorte', () => {
        const png = new File([new Uint8Array(64)], 'avatar.png', { type: 'image/png' });
        expect(() => validateAvatarFile(png, { width: 1200, height: 800 })).not.toThrow();
        expect(() => validateAvatarFile(new File([new Uint8Array(10)], 'a.webp', { type: 'image/webp' }))).toThrow('não suportado');
        expect(() => validateAvatarFile(new File([], 'empty.png', { type: 'image/png' }))).toThrow('vazio');
        expect(() => validateAvatarFile({ type: 'image/jpeg', size: AVATAR_UPLOAD_POLICY.maxBytes + 1 })).toThrow('5 MiB');
        expect(() => validateAvatarFile(png, { width: 5000, height: 4000 })).toThrow('16 milhões');

        expect(validateAvatarCrop(null)).toBeNull();
        expect(validateAvatarCrop({ cropX: 400, cropY: 100, cropSize: 600 }, 1200, 800))
            .toEqual({ cropX: 400, cropY: 100, cropSize: 600 });
        expect(() => validateAvatarCrop({ cropX: -1, cropY: 0, cropSize: 100 })).toThrow('inválidas');
        expect(() => validateAvatarCrop({ cropX: 700, cropY: 100, cropSize: 600 }, 1200, 800)).toThrow('ultrapassa');
    });
});

describe('profile-http: upload de avatar (POST /api/profile/me/avatar)', () => {
    // Envia multipart/form-data com arquivo único e cropX/cropY/cropSize sem Content-Type manual.
    it('envia FormData com file e cropX/cropY/cropSize e reconcilia ProfileDto', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(json(profileDto(null)))
            .mockResolvedValueOnce(json(profileDto('https://cdn.example/avatars/1/final.png')));
        const adapter = createHttpProfileAdapter({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => 'tok-avatar'
        });
        await adapter.load('');

        const file = new File([new Uint8Array([137, 80, 78, 71])], 'foto.png', { type: 'image/png' });
        const updated = await adapter.uploadAvatar(file, { cropX: 400, cropY: 100, cropSize: 600 });

        expect(updated.avatar).toBe('https://cdn.example/avatars/1/final.png');
        expect(updated.cover).toBe('https://cdn.example/wallpapers/1/keep.png');
        const [url, init] = fetcher.mock.calls[1];
        expect(url).toBe('https://api.example.invalid/api/profile/me/avatar');
        expect(init.method).toBe('POST');
        expect(init.headers.Authorization).toBe('Bearer tok-avatar');
        expect(init.headers['Content-Type']).toBeUndefined();
        expect(init.body).toBeInstanceOf(FormData);
        expect(init.body.get('file')).toBe(file);
        expect(init.body.get('cropX')).toBe('400');
        expect(init.body.get('cropY')).toBe('100');
        expect(init.body.get('cropSize')).toBe('600');
    });

    // Trata 400, 413, 415 e 503 sem alterar o perfil carregado.
    it.each([
        [400, 'inválido'],
        [413, '5 MiB'],
        [415, 'não suportado'],
        [503, 'indisponível']
    ])('traduz HTTP %s em uploadAvatar sem sobrescrever avatar atual', async (status, expected) => {
        const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status }));
        const adapter = createHttpProfileAdapter({
            baseUrl: 'https://api.example.invalid/api',
            fetcher,
            getToken: () => 'tok-avatar'
        });
        const file = new File([new Uint8Array([255, 216, 255])], 'foto.jpg', { type: 'image/jpeg' });
        await expect(adapter.uploadAvatar(file)).rejects.toMatchObject({ status, message: expect.stringContaining(expected) });
    });
});
