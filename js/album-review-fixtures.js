export const demoAlbum = Object.freeze({
    spotifyId: 'neon-horizons',
    name: 'Neon Horizons',
    artist: 'Synth Collective',
    releaseYear: '2026',
    trackCount: 11,
    coverUrl: null
});

const defaultSampleReview = "Ouvir 'Neon Horizons' do começo ao fim é uma experiência imersiva única. Os sintetizadores oitentistas se misturam com batidas modernas.";

// Create a local demonstration adapter for Avaliar Álbum without network calls.
export function createAlbumReviewFixturesAdapter({
    album = demoAlbum,
    initialRating = 4.5,
    initialReviewText = defaultSampleReview,
    initialReviewId = null,
    initialFavorited = false,
    scenario = 'default'
} = {}) {
    let storedReview = initialReviewId ? {
        reviewId: initialReviewId,
        album: { ...album },
        rating: initialRating,
        reviewText: initialReviewText
    } : null;
    let favorited = Boolean(initialFavorited);

    return {
        isDemo: true,
        routes: {
            home: 'feed.html?demo=true',
            profile: 'profile.html?demo=true',
            settings: 'account.html?demo=true',
            echoes: 'echoes.html?demo=true',
            login: 'login.html'
        },
        async loadAlbumReview(spotifyId) {
            const resolvedAlbum = { ...album, spotifyId: spotifyId || album.spotifyId };
            if (scenario === 'empty') {
                return { album: resolvedAlbum, review: null, initialDraft: { rating: 0, reviewText: '' } };
            }
            return {
                album: resolvedAlbum,
                review: storedReview,
                initialDraft: storedReview ? null : { rating: initialRating, reviewText: initialReviewText }
            };
        },
        async publishReview({ spotifyId, reviewId, rating, reviewText }) {
            storedReview = {
                reviewId: reviewId || 101,
                album: { ...album, spotifyId: spotifyId || album.spotifyId },
                rating,
                reviewText: typeof reviewText === 'string' && reviewText.trim() ? reviewText.trim() : ''
            };
            return storedReview;
        },
        async toggleFavorite() {
            favorited = !favorited;
            return { favorited };
        },
        async logout() {}
    };
}
