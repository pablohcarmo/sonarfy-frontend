export const limits = Object.freeze({ displayName: 50, bio: 150, review: 255 });
export const length = value => Array.from(value || '').length;
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function validateProfile({ displayName, bio }) {
    if (!displayName?.trim()) throw new Error('Informe o nome de exibição.');
    if (length(displayName) > limits.displayName) throw new Error('O nome de exibição deve ter até 50 caracteres.');
    if (length(bio) > limits.bio) throw new Error('A bio deve ter até 150 caracteres.');
}
export function validateReview(text) {
    if (length(text) > limits.review) throw new Error('A resenha deve ter até 255 caracteres.');
    return text || '';
}
const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
// Existing pages use the browser's locale/timezone; keep publication and join dates consistent.
export function timestamp(value, now = Date.now()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const hours = Math.max(0, Math.floor((now - date.getTime()) / 3600000));
    return hours < 24 ? `${hours}h` : `${months[date.getMonth()]} ${String(date.getDate()).padStart(2, '0')}`;
}
export function joined(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : `Entrou em ${months[date.getMonth()]} ${date.getFullYear()}`;
}
// Product references use K/M suffixes (32K, 1.4K) in the Portuguese interface.
export const count = value => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.max(0, Number(value) || 0));
export const sortOptions = [
    ['recent', 'Mais recentes'], ['oldest', 'Mais antigos'], ['highest', 'Maior avaliação (5 ★)'],
    ['lowest', 'Menor avaliação (1 ★)'], ['written', 'Com resenha escrita']
];
export function sortCollection(items, sort) {
    const filtered = sort === 'written' ? items.filter(item => item.review?.trim()) : [...items];
    return filtered.sort((a, b) => {
        const recent = new Date(b.createdAt) - new Date(a.createdAt);
        if (sort === 'oldest') return -recent;
        if (sort === 'highest') return b.rating - a.rating || recent;
        if (sort === 'lowest') return a.rating - b.rating || recent;
        return recent;
    });
}
export function safeImage(value) {
    if (!value) return '';
    try { const url = new URL(value, window.location.href); return ['http:', 'https:', 'blob:'].includes(url.protocol) ? escapeHTML(url.href) : ''; } catch { return ''; }
}
export function profileURL(handle, origin = window.location.origin) {
    const url = new URL('/pages/profile.html', origin);
    url.searchParams.set('handle', handle);
    return url.href;
}
