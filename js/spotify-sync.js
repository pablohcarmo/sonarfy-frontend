import { markSpotifySynced, shouldShowSpotifySync, skipSpotifySync, syncSpotify } from './spotify-sync-state.js';
import { createSpotifyClient, readSpotifyCallbackOutcome } from './spotify-http.js';

const STATE_METADATA = {
    initial: {
        titleId: 'spotify-title',
        descriptionId: 'spotify-description',
        announcement: ''
    },
    success: {
        titleId: 'spotify-success-title',
        descriptionId: 'spotify-success-description',
        announcement: 'Conta conectada com sucesso!'
    },
    failure: {
        titleId: 'spotify-failure-title',
        descriptionId: 'spotify-failure-description',
        announcement: 'Não foi possível conectar ao Spotify.'
    }
};

// Initialize the Spotify onboarding/connect screen, OAuth redirect, and state transitions.
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
    const card = root.getElementById('spotify-card');
    const connect = root.getElementById('spotify-connect');
    const skip = root.getElementById('spotify-skip');
    const error = root.getElementById('spotify-error');
    const continueButton = root.getElementById('spotify-continue');
    const retryButton = root.getElementById('spotify-retry');
    const failureSkip = root.getElementById('spotify-failure-skip');
    const announcer = root.getElementById('spotify-status-announcer');
    const failureTip = root.getElementById('spotify-failure-tip');
    if (!card || !connect || !skip || !error) return;

    const panels = {
        initial: card.querySelector('[data-sync-panel="initial"]'),
        success: card.querySelector('[data-sync-panel="success"]'),
        failure: card.querySelector('[data-sync-panel="failure"]')
    };

    const callbackOutcome = readSpotifyCallbackOutcome(locationObj, historyObj);
    const client = spotifyClient || createSpotifyClient({ storage });

    // Settings or a returning OAuth callback can explicitly open this screen during the login cooldown.
    if (!manual && !callbackOutcome && !shouldShowSpotifySync(storage)) {
        navigate('profile.html');
        return;
    }

    const showInlineError = message => {
        error.textContent = message;
        error.hidden = false;
        error.dataset.state = 'error';
    };

    const setState = (nextState, { focusPrimary = false, tipMessage } = {}) => {
        const metadata = STATE_METADATA[nextState] || STATE_METADATA.initial;
        card.dataset.state = nextState;
        card.setAttribute('aria-labelledby', metadata.titleId);
        card.setAttribute('aria-describedby', metadata.descriptionId);

        Object.entries(panels).forEach(([key, panel]) => {
            if (panel) panel.hidden = key !== nextState;
        });

        if (nextState === 'failure' && tipMessage && failureTip) {
            failureTip.textContent = tipMessage;
        }
        if (announcer) {
            announcer.textContent = metadata.announcement;
        }
        if (focusPrimary) {
            const target = nextState === 'success'
                ? continueButton
                : nextState === 'failure'
                    ? retryButton
                    : connect;
            if (target && typeof target.focus === 'function') {
                target.focus();
            }
        }
    };

    const handleSkip = () => {
        try {
            skipSpotifySync(storage);
            navigate(returnDestination);
        } catch {
            setState('initial');
            showInlineError('Não foi possível salvar sua preferência. Permita o armazenamento neste navegador e tente novamente.');
        }
    };

    const startSync = async triggerButton => {
        if (connect.disabled || (retryButton && retryButton.disabled)) return;
        const buttons = [connect, skip, retryButton, failureSkip].filter(Boolean);
        buttons.forEach(button => { button.disabled = true; });
        card.setAttribute('aria-busy', 'true');
        error.hidden = true;

        const label = triggerButton.querySelector('span');
        const originalLabel = label ? label.textContent : '';
        if (label) label.textContent = 'Conectando...';

        let nextState = null;
        try {
            const customHandler = typeof handler === 'function'
                ? handler
                : typeof window !== 'undefined' && typeof window.sonarfySpotifyOAuth === 'function'
                    ? () => window.sonarfySpotifyOAuth()
                    : null;

            if (customHandler) {
                await syncSpotify(customHandler, storage);
                nextState = 'success';
                return;
            }

            const { authorizationUrl } = await client.startAuthorization();
            navigate(authorizationUrl);
        } catch {
            nextState = 'failure';
        } finally {
            buttons.forEach(button => { button.disabled = false; });
            if (label) label.textContent = originalLabel;
            card.removeAttribute('aria-busy');
            if (nextState) {
                setState(nextState, { focusPrimary: true });
            }
        }
    };

    if (callbackOutcome) {
        if (callbackOutcome.outcome === 'connected') {
            client.getConnection().then(connection => {
                if (connection.status === 'CONNECTED') {
                    if (connection.recentListensAuthorized === false) {
                        setState('failure', {
                            focusPrimary: true,
                            tipMessage: 'Dica: Conta conectada, mas sem permissão para escutas recentes. Tente conectar novamente para habilitar Ecos.'
                        });
                        return;
                    }
                    try {
                        markSpotifySynced(storage);
                    } catch {}
                    setState('success', { focusPrimary: true });
                    return;
                }
                setState('failure', { focusPrimary: true });
            }).catch(() => {
                setState('failure', { focusPrimary: true });
            });
        } else {
            setState('failure', { focusPrimary: true });
        }
    }

    skip.addEventListener('click', handleSkip);
    if (failureSkip) failureSkip.addEventListener('click', handleSkip);
    if (continueButton) continueButton.addEventListener('click', () => navigate(returnDestination));
    connect.addEventListener('click', () => startSync(connect));
    if (retryButton) retryButton.addEventListener('click', () => startSync(retryButton));
}

initSpotifySync();
