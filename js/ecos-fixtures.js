// Explicit local demo fixtures for Ecos; no backend endpoints or Spotify OAuth tokens are called.
const featuredEcos = [
    ['neon-horizons', 'Neon Horizons', 'Synth Collective', 'Midnight Drive', '#6366f1', 'NH', 0, true],
    ['velvet-echoes', 'Velvet Echoes', 'Luna & The Waves', 'Static Rain', '#ec4899', 'VE', 18 * 60000, false],
    ['solaris', 'Solaris', 'Aether', 'Golden Hour', '#f59e0b', 'SO', 3 * 3600000, false],
    ['concrete-jungle', 'Concrete Jungle', 'Metro Beats', 'Subway Pulse', '#10b981', 'CJ', 9 * 3600000, false],
    ['glass-gardens', 'Glass Gardens', 'Clara Vance', 'Morning Dew', '#3b82f6', 'GG', 2 * 86400000, false],
    ['analog-dreams', 'Analog Dreams', 'Tape Loop', 'Cassette 84', '#8b5cf6', 'AD', 3 * 86400000, false]
];

const extraAlbums = [
    ['Horizonte Azul', 'Marina Costa', 'Maré Alta', '#0ea5e9'],
    ['Noite em Copacabana', 'Lucas Andrade', 'Brisa Urbana', '#14b8a6'],
    ['Sinal Analógico', 'Rafael Mendes', 'Frequência 92', '#f97316'],
    ['Cidade Submersa', 'Beatriz Lima', 'Luz de Néon', '#6366f1'],
    ['Prisma Solar', 'Vento Norte', 'Espectro', '#eab308']
];

// Generate up to 50 deterministic recent Spotify plays for demonstration mode.
export function createEcosFixtures(now = Date.now()) {
    const items = [];
    for (let i = 0; i < 50; i += 1) {
        if (i < featuredEcos.length) {
            const [id, title, artist, trackName, color, mark, offsetMs, isPlaying] = featuredEcos[i];
            items.push({
                id: `eco-${i + 1}`,
                album: { id, title, artist, color, mark },
                trackName,
                playedAt: new Date(now - offsetMs).toISOString(),
                isPlaying
            });
            continue;
        }
        const [title, artist, trackName, color] = extraAlbums[(i - featuredEcos.length) % extraAlbums.length];
        const cycle = Math.floor((i - featuredEcos.length) / extraAlbums.length) + 1;
        items.push({
            id: `eco-${i + 1}`,
            album: {
                id: `demo-album-${i + 1}`,
                title: `${title} · Vol. ${cycle}`,
                artist,
                color,
                mark: title.slice(0, 2).toUpperCase()
            },
            trackName: `${trackName} (${cycle})`,
            playedAt: new Date(now - (3 + i) * 86400000).toISOString(),
            isPlaying: false
        });
    }
    return {
        connected: true,
        items
    };
}

// Resolve the host-provided adapter or fall back to explicit local demonstration fixtures.
export function createEcosAdapter(integration = window.sonarfyEcosAdapter) {
    if (integration) return integration;
    const wait = () => new Promise(resolve => setTimeout(resolve, 180));
    const load = async () => {
        await wait();
        return structuredClone(createEcosFixtures());
    };
    return {
        demo: true,
        load,
        refresh: load
    };
}
