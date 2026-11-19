// Explicit local demo; no backend endpoints or persistent social mutations.
import { createFixtures } from './profile-fixtures.js';

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
    const publications = [7, 0, 2, 3].map((albumIndex, i) => ({
        ...base.collection[albumIndex], id: `community-${i}`,
        author: { id: `community-author-${i}`, displayName: authors[i][0], handle: authors[i][1], avatar: base.profile.avatar },
        review: reviews[i], rating: [5, 4, 5, 2][i],
        createdAt: new Date(now - [45 * 60000, 3 * 3600000, 2 * 86400000, 5 * 86400000][i]).toISOString(),
        liked: i % 2 === 0, likeCount: [24, 9, 53, 4][i], commentCount: [6, 1, 14, 0][i]
    }));
    return { session: { userId: base.profile.id }, viewer: base.profile, followingCount: 4, publications };
}

export function createFeedAdapter(integration = window.sonarfyFeedAdapter) {
    if (integration) return integration;
    const data = createFeedFixtures();
    const wait = () => new Promise(resolve => setTimeout(resolve, 180));
    return {
        demo: true,
        async load(tab) {
            await wait();
            return structuredClone({ ...data, publications: tab === 'for-you' ? [...data.publications].reverse() : data.publications });
        },
        async like(id, liked) {
            const item = data.publications.find(item => item.id === id);
            if (!item) throw new Error('Publicação não encontrada.');
            await wait();
            if (item.liked !== liked) item.likeCount = Math.max(0, item.likeCount + (liked ? 1 : -1));
            item.liked = liked;
            return { liked, likeCount: item.likeCount };
        }
    };
}
