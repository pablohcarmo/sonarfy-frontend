export const SPOTIFY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const SPOTIFY_SYNCED_KEY = 'sonarfy_spotify_synced';
export const SPOTIFY_SKIPPED_KEY = 'sonarfy_spotify_skipped_at';

export function shouldShowSpotifySync(storage = localStorage, now = Date.now()) {
    try {
        if (storage.getItem(SPOTIFY_SYNCED_KEY) === 'true') return false;
        const saved = storage.getItem(SPOTIFY_SKIPPED_KEY);
        if (saved === null || saved.trim() === '') return true;
        const skippedAt = Number(saved);
        // Invalid or future dates must not suppress onboarding indefinitely.
        if (!Number.isFinite(skippedAt) || skippedAt < 0 || skippedAt > now) return true;
        return now - skippedAt >= SPOTIFY_COOLDOWN_MS;
    } catch {
        return true;
    }
}

export function skipSpotifySync(storage = localStorage, now = Date.now()) {
    storage.setItem(SPOTIFY_SKIPPED_KEY, String(now));
}

export function markSpotifySynced(storage = localStorage) {
    storage.setItem(SPOTIFY_SYNCED_KEY, 'true');
    storage.removeItem(SPOTIFY_SKIPPED_KEY);
}

export function getPostLoginDestination(storage = localStorage, now = Date.now()) {
    return shouldShowSpotifySync(storage, now) ? 'spotify-sync.html' : 'profile.html';
}

// The host's OAuth adapter resolves { synced: true } only after server confirmation.
// A redirect-based adapter may navigate away; starting OAuth alone is not success.
export async function syncSpotify(handler, storage = localStorage) {
    if (typeof handler !== 'function') {
        throw new Error('A conexão com o Spotify ainda não está disponível. Tente novamente mais tarde.');
    }
    const result = await handler();
    if (result?.synced !== true) {
        throw new Error('A conexão com o Spotify não foi confirmada. Tente novamente.');
    }
    markSpotifySynced(storage);
}
