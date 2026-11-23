import { shouldShowSpotifySync, skipSpotifySync, syncSpotify } from './spotify-sync-state.js';
import { createSpotifyClient, readSpotifyCallbackOutcome } from './spotify-http.js';

// Initialize the Spotify onboarding/connect screen, OAuth redirect, and callback outcome handling.
export function initSpotifySync({
    root = document,
    storage = localStorage,
    navigate = destination => window.location.assign(destination),
    handler,
    spotifyClient,
    locationObj = typeof window !== 'undefined' ? window.location : { search: '', pathname: '', hash: '' },
    historyObj = typeof window !== 'undefined' ? window.history : null,
    source = new URLSearchParams(locationObj.search || '').get('source'),
    manual = source === 'account' || source === 'echoes'
} = {}) {
    const returnDestination = source === 'echoes' ? 'echoes.html' : 'profile.html';
    const connect = root.getElementById('spotify-connect');
    const skip = root.getElementById('spotify-skip');
    const error = root.getElementById('spotify-error');
    const card = root.getElementById('spotify-card');
    if (!connect || !skip || !error || !card) return;

    const callbackOutcome = readSpotifyCallbackOutcome(locationObj, historyObj);
    const client = spotifyClient || createSpotifyClient({ storage });

    // Settings or a returning OAuth callback can explicitly open this screen during the login cooldown.
    if (!manual && !callbackOutcome && !shouldShowSpotifySync(storage)) {
        navigate('profile.html');
        return;
    }

    const showMessage = (message, isError = true) => {
        error.textContent = message;
        error.hidden = false;
        error.dataset.state = isError ? 'error' : 'success';
    };

    if (callbackOutcome) {
        showMessage(callbackOutcome.message, callbackOutcome.isError);
        client.getConnection().then(connection => {
            if (callbackOutcome.outcome === 'connected' && connection.status === 'CONNECTED') {
                if (connection.recentListensAuthorized === false) {
                    showMessage('Conta conectada, mas sem permissão para escutas recentes. Tente conectar novamente para habilitar Ecos.', true);
                    return;
                }
                showMessage(callbackOutcome.message, false);
            }
        }).catch(() => {});
    }

    skip.addEventListener('click', () => {
        try {
            skipSpotifySync(storage);
            navigate(returnDestination);
        } catch {
            showMessage('Não foi possível salvar sua preferência. Permita o armazenamento neste navegador e tente novamente.');
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
            const customHandler = typeof handler === 'function'
                ? handler
                : typeof window !== 'undefined' && typeof window.sonarfySpotifyOAuth === 'function'
                    ? () => window.sonarfySpotifyOAuth()
                    : null;

            if (customHandler) {
                await syncSpotify(customHandler, storage);
                navigate('profile.html');
                return;
            }

            const { authorizationUrl } = await client.startAuthorization();
            navigate(authorizationUrl);
        } catch (cause) {
            showMessage(cause instanceof Error ? cause.message : 'Não foi possível conectar ao Spotify. Tente novamente.');
        } finally {
            connect.disabled = false;
            skip.disabled = false;
            label.textContent = 'Conectar ao Spotify';
            card.removeAttribute('aria-busy');
        }
    });
}

initSpotifySync();
