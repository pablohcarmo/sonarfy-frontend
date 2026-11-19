import { icon } from './profile-icons.js';
import { escapeHTML as e } from './profile-utils.js';
const items = [
    ['home', 'Home', '../index.html'], ['search', 'Pesquisar'], ['echoes', 'Ecos'],
    ['notifications', 'Notificações'], ['profile', 'Perfil', 'profile.html'],
    ['settings', 'Configurações', 'account.html'], ['logout', 'Sair']
];
export function sidebar(own, routes = {}) {
    return `<nav class="profile-navigation" aria-label="Navegação principal">${items.map(([key, label, route]) => {
        const active = own && key === 'profile';
        const content = `${icon(active ? 'activeProfile' : key)}<span>${label}</span>`;
        // Only known local routes or host-configured routes become links.
        const href = routes[key] || route;
        return href ? `<a href="${e(href)}" ${active ? 'aria-current="page"' : ''}>${content}</a>` : `<button data-navigation="${key}">${content}</button>`;
    }).join('')}</nav><button class="profile-primary review-cta" data-navigation="review">Avaliar Álbum</button>`;
}
export function waveform() {
    const heights = [22,38,30,50,34,58,44,68,40,52,30,62,46,74,34,56,43,64];
    return `<div class="waveform" aria-hidden="true"><div class="waveform-bars">${Array.from({ length: 40 }, (_, i) => `<i style="--bar-height:${12 + (i * 17) % 58}px"></i>`).join('')}</div><div class="waveform-city">${heights.map(height => `<i style="--building-height:${height}%"></i>`).join('')}</div></div>`;
}
export function emptyState(title, description = '') {
    return `<div class="profile-empty">${icon('disc')}<h2>${e(title)}</h2>${description ? `<p>${e(description)}</p>` : ''}</div>`;
}
export function skeleton(kind = 'activities') {
    if (kind === 'header') return '<div class="profile-header-skeleton" aria-label="Carregando perfil" aria-busy="true"><div class="skeleton skeleton-banner"></div><div class="skeleton skeleton-name"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div></div>';
    const card = kind === 'collection' ? '<div class="collection-card"><div class="skeleton skeleton-cover"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div></div>' : '<div class="activity-card"><div class="skeleton skeleton-avatar"></div><div class="skeleton-content"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div></div><div class="skeleton skeleton-album"></div></div>';
    return `<div class="${kind === 'collection' ? 'collection-grid' : 'activity-feed'}" aria-label="Carregando publicações" aria-busy="true">${card.repeat(kind === 'collection' ? 8 : 3)}</div>`;
}
