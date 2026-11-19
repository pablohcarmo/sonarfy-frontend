import { SPOTIFY_SYNCED_KEY } from './spotify-sync-state.js';

const DEMO_CITIES = [
    { id: 3448439, name: 'São Paulo', adminName1: 'São Paulo', countryName: 'Brasil' },
    { id: 3451190, name: 'Rio de Janeiro', adminName1: 'Rio de Janeiro', countryName: 'Brasil' },
    { id: 3467865, name: 'Campinas', adminName1: 'São Paulo', countryName: 'Brasil' },
    { id: 3470127, name: 'Belo Horizonte', adminName1: 'Minas Gerais', countryName: 'Brasil' },
    { id: 3464975, name: 'Curitiba', adminName1: 'Paraná', countryName: 'Brasil' },
    { id: 3452925, name: 'Porto Alegre', adminName1: 'Rio Grande do Sul', countryName: 'Brasil' },
    { id: 3450554, name: 'Salvador', adminName1: 'Bahia', countryName: 'Brasil' },
    { id: 3390760, name: 'Recife', adminName1: 'Pernambuco', countryName: 'Brasil' },
    { id: 2267057, name: 'Lisboa', adminName1: 'Lisboa', countryName: 'Portugal' },
    { id: 3117735, name: 'Madrid', adminName1: 'Comunidad de Madrid', countryName: 'Espanha' },
    { id: 3435910, name: 'Buenos Aires', adminName1: 'Buenos Aires', countryName: 'Argentina' },
    { id: 2643743, name: 'Londres', adminName1: 'Inglaterra', countryName: 'Reino Unido' }
];

const RESERVED_HANDLES = new Set(['lucas_vinyl', 'marina_jazz', 'admin', 'sonarfy', 'suporte']);

// Normalize strings for accent-insensitive local city matching.
function normalizeSearch(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Create the default in-memory account adapter when no host adapter is injected.
export function createAccountAdapter(host = globalThis.sonarfyAccountAdapter) {
    if (host) return host;
    const state = {
        account: {
            id: 'usr-demo-1',
            firstName: 'Ana',
            lastName: 'Ribeiro',
            handle: 'ana_ribeiro',
            birthDate: '1999-08-15',
            city: 'São Paulo',
            country: 'Brasil',
            cityId: 3448439,
            email: 'ana@sonarfy.com',
            spotifyConnected: false
        }
    };
    return {
        demo: true,
        routes: { home: 'feed.html', profile: 'profile.html', settings: 'account.html', login: 'login.html', spotifySync: 'spotify-sync.html?source=account' },
        async load() {
            let synced = state.account.spotifyConnected;
            try { synced = localStorage.getItem(SPOTIFY_SYNCED_KEY) === 'true' || synced; } catch {}
            return { account: { ...state.account, spotifyConnected: synced } };
        },
        async checkHandle(handle) {
            const normalized = String(handle || '').replace(/^@+/, '').trim().toLowerCase();
            if (normalized === state.account.handle.toLowerCase()) return { available: true };
            return { available: !RESERVED_HANDLES.has(normalized) };
        },
        async searchCities(query, options = {}) {
            if (typeof globalThis.sonarfyCitySearch === 'function') return globalThis.sonarfyCitySearch(query, options);
            const needle = normalizeSearch(query);
            if (needle.length < 2) return [];
            return DEMO_CITIES.filter(city => normalizeSearch(city.name).includes(needle)).slice(0, 6);
        },
        async updateAccount(payload) {
            const normalized = String(payload.handle || '').replace(/^@+/, '').trim().toLowerCase();
            if (normalized !== state.account.handle.toLowerCase() && RESERVED_HANDLES.has(normalized)) {
                throw new Error('Este nome de usuário já está em uso. Escolha outro @.');
            }
            state.account = { ...state.account, ...payload, handle: normalized };
            return { account: { ...state.account }, cooldownSeconds: 30 };
        },
        async requestEmailChange() {
            return { message: 'Enviamos um link de confirmação para alterar seu e-mail.', cooldownSeconds: 30 };
        },
        async requestPasswordReset() {
            return { message: 'Enviamos um link seguro para redefinição de senha no seu e-mail.', cooldownSeconds: 30 };
        },
        async disconnectSpotify() {
            state.account.spotifyConnected = false;
            try { localStorage.removeItem(SPOTIFY_SYNCED_KEY); } catch {}
            return { spotifyConnected: false };
        },
        async deactivateAccount() {
            return { deactivated: true };
        },
        async deleteAccount() {
            return { deleted: true };
        }
    };
}
