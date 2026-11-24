import { escapeHTML as e, safeImage } from './profile-utils.js';

// Search after a typing pause; cancel obsolete requests and preserve pagination on failure.
export function mountAlbumSearch(content, adapter) {
    content.innerHTML = `<article class="album-review-card"><h1 class="album-review-title">Avaliar Álbum</h1>
        <p class="review-rating-helper">Encontre um álbum pelo nome ou artista, sem precisar sincronizar o Spotify.</p>
        <form class="album-search-form"><label for="album-query" class="review-field-label">Álbum ou artista</label>
        <div class="album-search-controls"><input id="album-query" class="review-textarea" type="search" required minlength="2" maxlength="200" placeholder="Ex.: Random Access Memories ou Daft Punk" autocomplete="off"></div></form>
        <p data-search-status role="status" aria-live="polite"></p><div data-search-results></div></article>`;
    const form = content.querySelector('form');
    const input = content.querySelector('input');
    const results = content.querySelector('[data-search-results]');
    const status = content.querySelector('[data-search-status]');
    const lifetime = new AbortController();
    let pending, timer, generation = 0, query = '', items = [], nextOffset = null, busy = false, failed = false;
    const render = () => {
        results.setAttribute('aria-busy', String(busy));
        results.innerHTML = `<ul class="album-search-list">${items.map(album => {
            const cover = safeImage(album.coverUrl);
            return `<li><a class="album-search-result" href="album-review.html?albumId=${encodeURIComponent(album.spotifyId)}">${cover ? `<img src="${cover}" alt="" width="64" height="64">` : '<span class="album-search-cover" aria-hidden="true">♪</span>'}<span><strong>${e(album.name)}</strong><span>${e(album.artist.name)}</span></span><span aria-hidden="true">›</span></a></li>`;
        }).join('')}</ul>${failed ? '<button type="button" class="review-btn-secondary" data-search-retry>Tentar novamente</button>' : ''}${nextOffset !== null ? `<button type="button" class="review-btn-secondary" data-search-more ${busy ? 'disabled' : ''}>Carregar mais álbuns</button>` : ''}`;
    };
    async function search(more = false) {
        clearTimeout(timer);
        if (more && busy) return;
        const value = input.value.trim();
        const current = ++generation;
        pending?.abort();
        pending = new AbortController();
        failed = false;
        if (!more) { query = value; items = []; nextOffset = null; }
        if ([...query].length < 2 || [...query].length > 100 || query.includes('\0')) {
            busy = false; status.textContent = 'Digite de 2 a 100 caracteres para pesquisar.'; render(); return;
        }
        busy = true; status.textContent = 'Buscando álbuns…'; render();
        try {
            const page = await adapter.searchAlbums(query, { offset: more ? nextOffset : 0, signal: pending.signal });
            if (current !== generation) return;
            items = [...items, ...page.items.filter(album => !items.some(item => item.spotifyId === album.spotifyId))];
            nextOffset = page.nextOffset;
            status.textContent = items.length ? `${items.length} álbuns encontrados. Selecione um para avaliar.` : 'Nenhum álbum encontrado. Tente outro nome ou artista.';
        } catch (error) {
            if (current !== generation || error.name === 'AbortError') return;
            failed = !more;
            status.textContent = error.message || 'Não foi possível pesquisar. Tente novamente.';
        } finally {
            if (current === generation) { busy = false; render(); }
        }
    }
    form.addEventListener('submit', event => { event.preventDefault(); search(); }, { signal: lifetime.signal });
    // Invalidate immediately; wait 350ms before sending the completed text, including IME input.
    const schedule = event => {
        clearTimeout(timer);
        generation++; pending?.abort(); busy = false; failed = false; items = []; nextOffset = null; status.textContent = ''; render();
        if (event.type !== 'compositionstart' && !event.isComposing && input.value.trim()) timer = setTimeout(() => search(), 350);
    };
    input.addEventListener('input', schedule, { signal: lifetime.signal });
    input.addEventListener('compositionstart', schedule, { signal: lifetime.signal });
    input.addEventListener('compositionend', schedule, { signal: lifetime.signal });
    results.addEventListener('click', event => {
        if (event.target.closest('[data-search-more]')) search(true);
        if (event.target.closest('[data-search-retry]')) search();
    }, { signal: lifetime.signal });
    results.addEventListener('error', event => { if (event.target.tagName === 'IMG') event.target.hidden = true; }, { capture: true, signal: lifetime.signal });
    return { destroy() { clearTimeout(timer); generation++; pending?.abort(); lifetime.abort(); } };
}
