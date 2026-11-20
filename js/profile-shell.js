import { icon } from './profile-icons.js';
import { escapeHTML as e } from './profile-utils.js';
const items = [
    ['home', 'Home', 'feed.html'], ['search', 'Pesquisar'], ['echoes', 'Ecos'],
    ['notifications', 'Notificações'], ['profile', 'Perfil', 'profile.html'],
    ['settings', 'Configurações', 'account.html'], ['logout', 'Sair']
];
// Build the logout page link preserving the originating internal page when available.
export function logoutRoute() {
    const file = typeof location === 'object' ? location.pathname.split('/').pop() : '';
    if (!file || file === 'logout.html' || !/\.html$/i.test(file)) return 'logout.html';
    return `logout.html?from=${encodeURIComponent(`${file}${location.search || ''}`)}`;
}
export function sidebar(own, routes = {}, activeItem = own ? 'profile' : null) {
    return `<nav class="profile-navigation" aria-label="Navegação principal">${items.map(([key, label, route]) => {
        const active = key === activeItem;
        const iconKey = active && key === 'profile' ? 'activeProfile' : active && key === 'home' ? 'activeHome' : active && key === 'settings' ? 'activeSettings' : key;
        const content = `${icon(iconKey)}<span>${label}</span>`;
        // Only known local routes or host-configured routes become links.
        const href = routes[key] || (key === 'logout' ? logoutRoute() : route);
        return href ? `<a href="${e(href)}" ${active ? 'aria-current="page"' : ''}>${content}</a>` : `<button data-navigation="${key}">${content}</button>`;
    }).join('')}</nav><button class="profile-primary review-cta" data-navigation="review">Avaliar Álbum</button>`;
}
export function globalHeader(home = 'feed.html') {
    return `<button class="profile-icon-button mobile-menu" id="open-menu" aria-label="Abrir menu" aria-haspopup="dialog" aria-expanded="false" aria-controls="profile-drawer">${icon('menu')}</button><a href="${e(home)}" class="brand" aria-label="Sonarfy — página inicial"><svg width="118" height="32" viewBox="0 0 118 32" aria-hidden="true"><use href="../assets/logos/sonarfy-desktop.svg#logo"></use></svg></a><button id="theme-toggle" class="profile-icon-button" aria-label="Ativar tema escuro" aria-pressed="false"><img class="theme-light-only" src="../assets/icons/shared/theme-moon.svg" alt=""><img class="theme-dark-only" src="../assets/icons/shared/theme-sun.svg" alt=""></button>`;
}
export function globalFooter() {
    return `<nav class="footer-links" aria-label="Informações institucionais">${['Termos de Uso', 'Privacidade', 'Diretrizes', 'Apoie o Sonarfy'].map(label => `<button data-unavailable="${e(label)}">${e(label)}</button>`).join('<span aria-hidden="true">•</span>')}</nav><p>© 2026 Sonarfy</p>`;
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
