import { icon } from './profile-icons.js';
import { escapeHTML as e, safeImage, count, timestamp, joined, profileURL, sortOptions, validateReview } from './profile-utils.js';
import { waveform, emptyState } from './profile-shell.js';

export function avatar(profile, className = '') {
    const src = safeImage(profile.avatar);
    return `<span class="profile-avatar ${className}">${src ? `<img src="${src}" alt="" data-image-fallback>` : `<span aria-hidden="true">${e(Array.from(profile.displayName || '?')[0])}</span>`}</span>`;
}
export function profileHeader(profile, own, busy = false) {
    const metadata = (name, text) => `<p class="profile-metadata">${icon(name)}<span>${e(text)}</span></p>`;
    return `<article class="profile-card"><div class="profile-cover">${safeImage(profile.cover) ? `<img class="profile-cover-image" src="${safeImage(profile.cover)}" alt="" data-image-fallback>` : waveform()}<div class="profile-cover-actions">${own && profile.editable !== false ? `<button class="profile-icon-button" data-action="edit" aria-label="Editar perfil">${icon('edit')}</button>` : ''}<button class="profile-icon-button" data-action="share" aria-label="Compartilhar perfil">${icon('share')}</button></div></div>
        <div class="profile-identity">${avatar(profile, 'main-avatar')}${!own ? `<button class="profile-follow ${profile.isFollowing ? 'is-following' : ''}" data-action="follow" ${profile.followUncertain ? '' : `aria-pressed="${Boolean(profile.isFollowing)}"`} ${busy ? 'disabled' : ''}>${busy ? 'Aguarde…' : profile.followUncertain ? 'Atualizar estado' : profile.isFollowing ? 'Seguindo' : 'Seguir'}</button>` : ''}
            <h1>${e(profile.displayName)}</h1><p class="profile-handle">@${e(profile.handle)}</p>
            <div class="profile-statistics">${profile.ratedCount == null ? '' : metadata('disc', `${count(profile.ratedCount)} Álbuns Avaliados`)}${metadata('people', `${count(profile.followers)} Seguidores`)}${metadata('people', `${count(profile.following)} Seguindo`)}</div>
            ${[profile.city, profile.country].filter(Boolean).length ? metadata('location', [profile.city, profile.country].filter(Boolean).join(', ')) : ''}
            ${profile.joinedAt ? metadata('calendar', joined(profile.joinedAt)) : ''}${profile.bio ? `<p class="profile-bio">${e(profile.bio)}</p>` : ''}
        </div></article>`;
}
export function stars(rating) {
    const value = Math.max(0, Math.min(5, Number(rating) || 0));
    return `<span class="profile-stars" role="img" aria-label="${value} de 5 estrelas">${'★'.repeat(Math.floor(value))}${'☆'.repeat(5 - Math.floor(value))}</span>`;
}
export function cover(album) {
    return `<span class="album-cover">${safeImage(album.cover) ? `<img src="${safeImage(album.cover)}" alt="Capa de ${e(album.title)}" data-image-fallback>` : `<span>${e(album.mark || album.title?.slice(0, 2))}</span>`}</span>`;
}
export function socialActions(item, pending = new Set()) {
    return `<div class="activity-social"><button data-like="${e(item.id)}" aria-label="${item.liked ? 'Descurtir' : 'Curtir'} publicação" aria-pressed="${Boolean(item.liked)}" ${pending.has(`like:${item.id}`) ? 'disabled' : ''}>${icon(item.liked ? 'liked' : 'heart')}${item.likeCount > 0 ? `<span>${count(item.likeCount)}</span>` : ''}</button><button data-comments="${e(item.id)}" aria-label="Abrir comentários">${icon('comment')}${item.commentCount > 0 ? `<span>${count(item.commentCount)}</span>` : ''}</button></div>`;
}
function spotifyAttribution(album) {
    const rawUrl = typeof album?.spotifyUrl === 'string' ? album.spotifyUrl.trim() : '';
    const href = /^https:\/\/open\.spotify\.com\//i.test(rawUrl)
        ? rawUrl
        : typeof album?.spotifyId === 'string' && album.spotifyId.trim()
            ? `https://open.spotify.com/album/${encodeURIComponent(album.spotifyId.trim())}`
            : '';
    if (!href) return '';
    return `<a class="album-spotify-link" href="${e(href)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir ${e(album?.title || 'álbum')} no Spotify"><img src="../assets/icons/account/spotify.svg" width="21" height="21" alt="" aria-hidden="true"><span>Abrir no Spotify</span></a>`;
}
export function albumDetails(album) {
    return `<button class="album-details" data-album="${e(album.id)}">${cover(album)}<strong>'${e(album.title)}'</strong><span>por ${e(album.artist)}</span></button>`;
}
// Global activity card has one layout for ratings, written reviews and replies.
export function activityCard(item, pending) {
    const author = item.author;
    validateReview(item.review);
    const spotifyLink = spotifyAttribution(item.album);
    const albumBlock = spotifyLink ? `<div class="album-column">${albumDetails(item.album)}${spotifyLink}</div>` : albumDetails(item.album);
    return `<article class="activity-card ${!item.review ? 'rating-only' : ''}" data-publication="${e(item.id)}"><div class="activity-left"><a class="activity-avatar-link" href="${e(profileURL(author.handle))}" aria-label="Ver perfil de ${e(author.displayName)}">${avatar(author, 'activity-avatar')}</a><div class="activity-content"><div class="activity-publication"><header class="activity-author"><a href="${e(profileURL(author.handle))}">${e(author.displayName)}</a><span class="activity-author-meta"><a href="${e(profileURL(author.handle))}">@${e(author.handle)}</a><span aria-hidden="true">·</span><time datetime="${e(item.createdAt)}">${e(timestamp(item.createdAt))}</time></span></header>${item.replyTo ? `<p class="activity-reply">Em resposta a <a href="${e(profileURL(item.replyTo))}">@${e(item.replyTo)}</a></p>` : ''}${item.review ? `<p class="activity-review">${e(item.review)}</p>` : ''}${item.replyTo ? '' : stars(item.rating)}</div>${socialActions(item, pending)}</div></div>${albumBlock}</article>`;
}
export function activityFeed(items, pending) {
    return items.length ? `<div class="activity-feed">${items.map(item => activityCard(item, pending)).join('')}</div>` : emptyState('Nenhuma publicação ainda');
}
export function collectionCard(item) {
    return `<article class="collection-card">${albumDetails(item.album)}${spotifyAttribution(item.album)}${stars(item.rating)}<button class="collection-preview ${item.review ? '' : 'no-review'}" data-review="${e(item.id)}" aria-label="Ver ${item.review ? 'resenha completa' : 'avaliação'} de ${e(item.album.title)}">${item.review ? e(item.review) : '<span class="visually-hidden">Ver avaliação</span>'}</button></article>`;
}
export function collectionView(items, profile, sort, busy, total) {
    if (!total) return emptyState('Nenhuma avaliação na coleção ainda', `@${profile.handle} ainda não avaliou nenhum álbum. Assim que publicar uma avaliação ou resenha, os álbuns aparecerão organizados aqui.`);
    return `<div class="collection-sort"><span>${count(items.length)} ${items.length === 1 ? 'álbum' : 'álbuns'}</span><div class="sort-control"><button id="sort-trigger" aria-expanded="false" aria-controls="sort-options" ${busy ? 'disabled' : ''}>${icon('sort')}<span>Ordenar: <strong>${sortOptions.find(([key]) => key === sort)?.[1]}</strong></span>${icon('chevron')}</button><div id="sort-options" class="sort-options" hidden role="group" aria-label="Ordenar coleção">${sortOptions.map(([key, label]) => `<button data-sort="${key}" aria-pressed="${sort === key}">${label}${sort === key ? icon('check') : ''}</button>`).join('')}</div></div></div>${items.length ? `<div class="collection-grid" aria-busy="${busy}">${items.map(collectionCard).join('')}</div>` : emptyState('Nenhuma resenha escrita encontrada', 'Selecione outra ordenação para ver todas as avaliações.')}`;
}
