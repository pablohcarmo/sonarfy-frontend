import { shouldShowSpotifySync, skipSpotifySync, syncSpotify } from './spotify-sync-state.js';

export function initSpotifySync({
    root = document,
    storage = localStorage,
    navigate = destination => window.location.assign(destination),
    handler = () => window.sonarfySpotifyOAuth?.(),
    manual = new URLSearchParams(window.location.search).get('source') === 'account'
} = {}) {
    const connect = root.getElementById('spotify-connect');
    const skip = root.getElementById('spotify-skip');
    const error = root.getElementById('spotify-error');
    const card = root.getElementById('spotify-card');
    if (!connect || !skip || !error || !card) return;
    // Settings can explicitly open this screen during the login cooldown.
    if (!manual && !shouldShowSpotifySync(storage)) {
        navigate('profile.html');
        return;
    }
    const showError = message => {
        error.textContent = message;
        error.hidden = false;
    };
    skip.addEventListener('click', () => {
        try {
            skipSpotifySync(storage);
            navigate('profile.html');
        } catch {
            showError('Não foi possível salvar sua preferência. Permita o armazenamento neste navegador e tente novamente.');
        }
    });
    connect.addEventListener('click', async () => {
        if (connect.disabled) return;
        connect.disabled = true;
        skip.disabled = true;
        card.setAttribute('aria-busy', 'true');
        error.hidden = true;
        const label = connect.querySelector('span');
        label.textContent = 'Conectando...';
        try {
            await syncSpotify(handler, storage);
            navigate('profile.html');
        } catch (cause) {
            showError(cause instanceof Error ? cause.message : 'Não foi possível conectar ao Spotify. Tente novamente.');
        } finally {
            connect.disabled = false;
            skip.disabled = false;
            label.textContent = 'Conectar ao Spotify';
            card.removeAttribute('aria-busy');
        }
    });
}

initSpotifySync();
