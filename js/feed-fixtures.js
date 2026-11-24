// Modo demonstração explícito (?demo=true); sem fallback silencioso no fluxo normal.
import { createFixtures } from './profile-fixtures.js';
import { createHttpFeedAdapter } from './feed-http.js';

// Gera fixtures locais no formato normalizado do feed único paginado, sem campos sociais fictícios.
export function createFeedFixtures(now = Date.now()) {
    const base = createFixtures('', now);
    const authors = [
        ['Marina Costa', 'marina_som'], ['Lucas Andrade', 'lucas_vinyl'],
        ['Rafael Mendes', 'synth_wave'], ['Beatriz Lima', 'bia_indie']
    ];
    const reviews = [
        "Ritmos solares, baixo envolvente e uma energia que fica com você. 'Solar Vibes' é daqueles discos que melhoram o dia.",
        '', base.activities[2].review,
        'Apenas duas músicas se salvam. O álbum envelheceu mal, a mixagem soa abafada e falta coesão entre a primeira e a segunda metade do disco.'
    ];
    const ratings = [5, 4.25, 4.75, 0];
    const items = [7, 0, 2, 3].map((albumIndex, i) => {
        const album = base.collection[albumIndex].album;
        const createdAt = new Date(now - [45 * 60000, 3 * 3600000, 2 * 86400000, 5 * 86400000][i]).toISOString();
        return {
            id: String(104 - i),
            reviewId: 104 - i,
            author: { id: `community-author-${i}`, displayName: authors[i][0], handle: authors[i][1], avatar: base.profile.avatar },
            album: {
                ...album,
                spotifyId: `demo-album-${i}`,
                artistSpotifyId: `demo-artist-${i}`
            },
            rating: ratings[i],
            review: reviews[i],
            createdAt,
            updatedAt: createdAt
        };
    });
    return { session: { userId: base.profile.id }, viewer: base.profile, followingCount: 4, items, nextCursor: null };
}

// Cria o adapter demonstrativo local quando ?demo=true é informado explicitamente.
export function createDemoFeedAdapter() {
    const data = createFeedFixtures();
    const wait = () => new Promise(resolve => setTimeout(resolve, 120));
    return {
        demo: true,
        getSessionKey: () => 'demo',
        async loadViewer() {
            return { session: structuredClone(data.session), viewer: structuredClone(data.viewer) };
        },
        async loadPage({ cursor = null } = {}) {
            await wait();
            if (!cursor) {
                return { items: structuredClone(data.items.slice(0, 2)), followingCount: data.followingCount, nextCursor: 'demo-page-2' };
            }
            if (cursor === 'demo-page-2') {
                return { items: structuredClone(data.items.slice(2)), followingCount: data.followingCount, nextCursor: null };
            }
            return { items: [], followingCount: data.followingCount, nextCursor: null };
        }
    };
}

// Resolve host override, modo demonstração explícito (?demo=true) ou adapter HTTP real por padrão.
export function createFeedAdapter(integration = globalThis.sonarfyFeedAdapter) {
    if (integration) return integration;
    const isDemo = typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === 'true';
    return isDemo ? createDemoFeedAdapter() : createHttpFeedAdapter();
}
