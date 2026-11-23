// Explicit local demo fixtures aligned with /api/echoes/albums and /api/echoes/albums/{spotifyId}/listens.
const demoAlbums = [
    {
        spotifyId: 'album-bad',
        name: 'Bad (Remastered)',
        artist: 'Michael Jackson',
        color: '#6366f1',
        mark: 'BA',
        tracks: [
            { id: '103', trackName: 'Bad - 2012 Remaster', durationMs: 247000, offsetMs: 18 * 60000 },
            { id: '102', trackName: 'Smooth Criminal - 2012 Remaster', durationMs: 257000, offsetMs: 2 * 86400000 },
            { id: '101', trackName: 'Bad - 2012 Remaster', durationMs: 247000, offsetMs: 2 * 86400000 + 300000 }
        ]
    },
    {
        spotifyId: 'album-dark-side',
        name: 'The Dark Side of the Moon',
        artist: 'Pink Floyd',
        color: '#1f2937',
        mark: 'DS',
        tracks: [
            { id: '203', trackName: 'Time', durationMs: 413000, offsetMs: 3 * 3600000 },
            { id: '202', trackName: 'Money', durationMs: 382000, offsetMs: 3 * 3600000 + 420000 },
            { id: '201', trackName: 'Breathe (In the Air)', durationMs: 169000, offsetMs: 3 * 3600000 + 840000 }
        ]
    },
    {
        spotifyId: 'album-neon',
        name: 'Neon Horizons',
        artist: 'Synth Collective',
        color: '#ec4899',
        mark: 'NH',
        tracks: [
            { id: '302', trackName: 'Midnight Drive', durationMs: 215000, offsetMs: 9 * 3600000 },
            { id: '301', trackName: 'Neon Rain', durationMs: 198000, offsetMs: 9 * 3600000 + 240000 }
        ]
    },
    {
        spotifyId: 'album-solaris',
        name: 'Solaris',
        artist: 'Aether',
        color: '#f59e0b',
        mark: 'SO',
        tracks: [
            { id: '401', trackName: 'Golden Hour', durationMs: 224000, offsetMs: 86400000 }
        ]
    }
];

// Generate demo album summaries and per-album listen histories matching the backend contract.
export function createEcosFixtures(now = Date.now()) {
    const items = demoAlbums.map(entry => ({
        album: {
            spotifyId: entry.spotifyId,
            id: entry.spotifyId,
            name: entry.name,
            title: entry.name,
            color: entry.color,
            mark: entry.mark,
            coverUrl: null
        },
        lastPlayedAt: new Date(now - entry.tracks[0].offsetMs).toISOString(),
        listenCount: entry.tracks.length
    }));

    const listensByAlbum = {};
    for (const entry of demoAlbums) {
        listensByAlbum[entry.spotifyId] = entry.tracks.map(track => ({
            id: track.id,
            playedAt: new Date(now - track.offsetMs).toISOString(),
            isPlaying: false,
            trackName: track.trackName,
            track: {
                spotifyId: `track-${track.id}`,
                name: track.trackName,
                durationMs: track.durationMs,
                explicit: false
            },
            artists: [{ spotifyId: `artist-${entry.spotifyId}`, name: entry.artist }],
            album: {
                spotifyId: entry.spotifyId,
                id: entry.spotifyId,
                name: entry.name,
                title: entry.name,
                coverUrl: null
            }
        }));
    }

    return {
        connected: true,
        connection: { status: 'CONNECTED', connectedAt: new Date(now - 7 * 86400000).toISOString(), recentListensAuthorized: true },
        items,
        nextCursor: null,
        sync: { lastSucceededAt: new Date(now).toISOString(), historyStartsAt: new Date(now - 3 * 86400000).toISOString(), nextAllowedAt: null },
        listensByAlbum
    };
}

// Resolve the host-provided adapter or fall back to explicit local demonstration fixtures.
export function createEcosAdapter(integration = window.sonarfyEcosAdapter) {
    if (integration) return integration;
    const wait = () => new Promise(resolve => setTimeout(resolve, 120));
    const fixtures = createEcosFixtures();
    return {
        demo: true,
        async load() {
            await wait();
            return structuredClone({
                connected: fixtures.connected,
                connection: fixtures.connection,
                items: fixtures.items,
                nextCursor: fixtures.nextCursor,
                sync: fixtures.sync
            });
        },
        async loadAlbumListens(spotifyId) {
            await wait();
            return structuredClone({
                items: fixtures.listensByAlbum[spotifyId] || [],
                nextCursor: null,
                sync: fixtures.sync
            });
        },
        async sync() {
            await wait();
            return {
                fetched: 9,
                imported: 0,
                alreadyKnown: 9,
                skipped: 0,
                complete: true,
                possibleGap: false,
                newestPlayedAt: fixtures.items[0]?.lastPlayedAt || null,
                syncedAt: new Date().toISOString()
            };
        }
    };
}
