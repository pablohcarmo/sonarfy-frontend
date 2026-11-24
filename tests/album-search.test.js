import { afterEach, expect, it, vi } from 'vitest';
import { mountAlbumSearch } from '../js/album-search.js';
import { createHttpAlbumReviewAdapter } from '../js/album-review-http.js';
import { mountAlbumReview } from '../js/album-review.js';
import { readFileSync } from 'node:fs';
import { sidebar } from '../js/profile-shell.js';

const id = '4aawyAB9vmqN3uQ7FjRGTy';
const album = { spotifyId: id, name: '<Album>', coverUrl: null, artist: { name: 'Artista' } };
let mounted;
afterEach(() => { mounted?.destroy(); document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.useRealTimers(); });

// Shared CTA navigates without page-specific handlers, album context, or personal Spotify synchronization.
it('uses a common album-selection link with explicit route and demo support', () => {
    history.replaceState(null, '', '/pages/album.html?albumId=selected');
    document.body.innerHTML = sidebar(false);
    expect(document.querySelector('a.review-cta').getAttribute('href')).toBe('album-review.html');
    expect(document.querySelector('.review-cta').hasAttribute('data-navigation')).toBe(false);
    history.replaceState(null, '', '/pages/profile.html?demo=true');
    document.body.innerHTML = sidebar(true);
    expect(document.querySelector('.review-cta').getAttribute('href')).toBe('album-review.html?demo=true');
    document.body.innerHTML = sidebar(true, { review: 'custom-review.html' });
    expect(document.querySelector('.review-cta').getAttribute('href')).toBe('custom-review.html');
});

// Batch keystrokes, ignore incomplete IME text, and prevent requests after clearing or unmounting.
it('searches automatically after typing stops without a search button', async () => {
    vi.useFakeTimers();
    const searchAlbums = vi.fn().mockResolvedValue({ items: [], nextOffset: null });
    document.body.innerHTML = '<div id="content"></div>';
    mounted = mountAlbumSearch(document.querySelector('#content'), { searchAlbums });
    const input = document.querySelector('input');
    const type = value => { input.value = value; input.dispatchEvent(new Event('input')); };
    expect(document.querySelector('form button')).toBeNull();
    type('D'); await vi.advanceTimersByTimeAsync(350);
    expect(searchAlbums).not.toHaveBeenCalled();
    type('Da'); await vi.advanceTimersByTimeAsync(200);
    type('Daft Punk'); await vi.advanceTimersByTimeAsync(349);
    expect(searchAlbums).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(searchAlbums).toHaveBeenCalledExactlyOnceWith('Daft Punk', expect.objectContaining({ offset: 0 }));
    input.dispatchEvent(new Event('compositionstart'));
    await vi.advanceTimersByTimeAsync(400);
    expect(searchAlbums).toHaveBeenCalledTimes(1);
    input.dispatchEvent(new Event('compositionend'));
    await vi.advanceTimersByTimeAsync(350);
    expect(searchAlbums).toHaveBeenCalledTimes(2);
    type('Outro álbum'); type(''); await vi.advanceTimersByTimeAsync(350);
    expect(searchAlbums).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-search-status]').textContent).toBe('');
    type('Artista'); mounted.destroy(); await vi.advanceTimersByTimeAsync(350);
    expect(searchAlbums).toHaveBeenCalledTimes(2);
});

// Exercise cancellation even when an adapter ignores AbortSignal, plus retry at the same pagination boundary.
it('ignores obsolete searches and preserves results and offset after pagination failure', async () => {
    let resolveOld;
    const searchAlbums = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
        .mockResolvedValueOnce({ items: [album], nextOffset: 10 })
        .mockRejectedValueOnce(new Error('Indisponível'))
        .mockResolvedValueOnce({ items: [{ ...album, spotifyId: '0'.repeat(22) }], nextOffset: null });
    document.body.innerHTML = '<div id="content"></div>';
    mounted = mountAlbumSearch(document.querySelector('#content'), { searchAlbums });
    const input = document.querySelector('input');
    const submit = () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    input.value = 'Anterior'; submit();
    input.value = 'Artista'; input.dispatchEvent(new Event('input')); submit();
    await vi.waitFor(() => expect(document.querySelectorAll('.album-search-result')).toHaveLength(1));
    resolveOld({ items: [], nextOffset: null });
    await Promise.resolve();
    expect(document.querySelector('.album-search-result strong').textContent).toBe('<Album>');
    expect(document.querySelector('Album')).toBeNull();
    document.querySelector('[data-search-more]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-search-status]').textContent).toBe('Indisponível'));
    expect(document.querySelectorAll('.album-search-result')).toHaveLength(1);
    document.querySelector('[data-search-more]').click();
    await vi.waitFor(() => expect(document.querySelectorAll('.album-search-result')).toHaveLength(2));
    expect(searchAlbums.mock.calls.slice(2).map(call => call[1].offset)).toEqual([10, 10]);
    input.value = 'a'; submit();
    expect(searchAlbums).toHaveBeenCalledTimes(4);
    expect(document.querySelector('[data-search-status]').textContent).toContain('2 a 100');
});

// Verify Bearer auth, bounded pagination, encoded query, Retry-After, and authoritative detail mapping.
it('uses the search and details contracts without any Spotify connection request', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ items: [album], nextOffset: 10 })))
        .mockResolvedValueOnce(new Response('', { status: 503, headers: { 'Retry-After': '30' } }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ...album, releaseOn: '2024-05', totalTracks: 12 })));
    const adapter = createHttpAlbumReviewAdapter({ baseUrl: 'https://example.test/api', fetcher, getToken: () => 'token' });
    await expect(adapter.searchAlbums('Álbum & artista')).resolves.toMatchObject({ nextOffset: 10 });
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/albums/search');
    expect(url.searchParams.get('q')).toBe('Álbum & artista');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', cache: 'no-store', headers: { Authorization: 'Bearer token' } });
    await expect(adapter.searchAlbums('Artista', { offset: 10 })).rejects.toThrow('30 segundos');
    await expect(adapter.loadAlbumDetails(id)).resolves.toMatchObject({ name: '<Album>', artist: 'Artista', releaseYear: '2024', trackCount: 12 });
    await expect(adapter.loadAlbumDetails('invalid')).rejects.toMatchObject({ status: 400 });
    expect(fetcher).toHaveBeenCalledTimes(3);
});

// Malformed pages cannot masquerade as empty results or create an invalid pagination control.
it.each([null, { items: [null], nextOffset: null }, { items: [album], nextOffset: 0 }])('rejects incompatible search responses: %j', async page => {
    const adapter = createHttpAlbumReviewAdapter({ getToken: () => 'token', fetcher: vi.fn().mockResolvedValue(new Response(JSON.stringify(page))) });
    await expect(adapter.searchAlbums('Artista')).rejects.toThrow('Resposta da busca de álbuns inválida.');
});

// Prevent publishing before successful details and own-review loading; retry reuses the same selected ID.
it('gates the form on successful album resolution and restores the existing review', async () => {
    history.replaceState(null, '', `/pages/album-review.html?albumId=${id}&title=Forged`);
    document.body.innerHTML = readFileSync('pages/album-review.html', 'utf8').split('<body class="album-review-page">')[1].split('</body>')[0];
    const loadAlbumDetails = vi.fn().mockRejectedValueOnce(new Error('Catálogo indisponível'))
        .mockResolvedValueOnce({ spotifyId: id, name: 'Official', artist: 'Artista' });
    const loadAlbumReview = vi.fn().mockResolvedValue({ review: { reviewId: 42, rating: 0, reviewText: 'Minha resenha' } });
    mounted = mountAlbumReview({ adapter: { loadAlbumDetails, loadAlbumReview } });
    await mounted.ready;
    expect(loadAlbumReview).not.toHaveBeenCalled();
    expect(document.querySelector('[data-review-submit]')).toBeNull();
    document.querySelector('[data-review-retry]').click();
    await vi.waitFor(() => expect(document.querySelector('[data-review-submit]')?.textContent).toBe('Salvar alterações'));
    expect(document.querySelector('.album-summary-name').textContent).toBe('Official');
    expect(document.querySelector('.review-form-error')).toBeNull();
    expect(document.querySelector('#review-text').value).toBe('Minha resenha');
    expect(mounted.state.rating).toBe(0);
});
