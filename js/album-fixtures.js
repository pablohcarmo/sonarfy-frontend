// Local demonstration fixtures for the Album Page skeleton while backend endpoints are in development.
export const demoAlbum = {
    spotifyId: 'demo-neon-horizons',
    name: 'Neon Horizons',
    artist: 'Synth Collective',
    releaseYear: '2026',
    trackCount: 11,
    coverUrl: null,
    spotifyUrl: 'https://open.spotify.com/album/demo-neon-horizons',
    averageRating: 4.2,
    reviewCount: 128
};

export const demoUserReview = {
    reviewId: 901,
    authorName: 'Nome Sobrenome',
    authorHandle: 'usuario',
    publishedLabel: '3h',
    createdAt: '2026-11-24T03:00:00Z',
    rating: 5.0,
    reviewText: "Ouvir 'Neon Horizons' do começo ao fim é uma experiência imersiva única. Os sintetizadores oitentistas se misturam com batidas modernas de forma impecável."
};

export const demoCommunityReviews = [
    {
        reviewId: 101,
        authorName: 'Rafael Mendes',
        authorHandle: 'synth_wave',
        publishedLabel: '2h',
        createdAt: '2026-11-24T04:00:00Z',
        rating: 5.0,
        reviewText: "Ouvir 'Neon Horizons' do começo ao fim é uma experiência imersiva única. Os sintetizadores oitentistas se misturam com batidas modernas de forma impecável, criando uma atmosfera noturna hipnotizante até o último acorde."
    },
    {
        reviewId: 102,
        authorName: 'Marina Costa',
        authorHandle: 'marina_som',
        publishedLabel: 'Out 24',
        createdAt: '2026-10-24T18:00:00Z',
        rating: 3.0,
        reviewText: 'A primeira metade do disco é excelente e tem ótimos arranjos, mas da faixa 7 em diante o ritmo cai bastante e algumas músicas parecem repetitivas.'
    },
    {
        reviewId: 103,
        authorName: 'Lucas Andrade',
        authorHandle: 'lucas_vinyl',
        publishedLabel: 'Out 20',
        createdAt: '2026-10-20T15:00:00Z',
        rating: 1.0,
        reviewText: 'Produção excessivamente comprimida e sem dinâmica. Esperava uma evolução sonora da banda, mas acabou soando genérico e cansativo.'
    },
    {
        reviewId: 104,
        authorName: 'Beatriz Lima',
        authorHandle: 'bia_indie',
        publishedLabel: 'Nov 18',
        createdAt: '2026-11-18T12:00:00Z',
        rating: 4.0,
        reviewText: ''
    }
];

// Create a local fixtures adapter supporting rated, already-rated, empty, loading, and error scenarios.
export function createAlbumFixturesAdapter({ scenario = 'rated', albumOverride = null } = {}) {
    let currentUserReview = scenario === 'already-rated' ? { ...demoUserReview } : null;
    let currentReviews = scenario === 'empty'
        ? []
        : scenario === 'already-rated'
            ? demoCommunityReviews.slice(1).map(item => ({ ...item }))
            : demoCommunityReviews.map(item => ({ ...item }));

    return {
        isDemo: true,
        routes: {
            home: 'feed.html?demo=true',
            profile: 'profile.html?demo=true',
            settings: 'account.html?demo=true',
            echoes: 'echoes.html?demo=true',
            review: 'album-review.html?demo=true',
            login: 'login.html'
        },
        async loadAlbum({ sort = 'recent' } = {}) {
            if (scenario === 'loading') {
                return new Promise(() => {});
            }
            if (scenario === 'error') {
                throw new Error('Não foi possível carregar as informações deste álbum no momento.');
            }
            const baseAlbum = { ...demoAlbum, ...(albumOverride || {}) };
            if (scenario === 'empty') {
                baseAlbum.averageRating = null;
                baseAlbum.reviewCount = 0;
            }
            const sorted = [...currentReviews];
            if (sort === 'highest') sorted.sort((a, b) => b.rating - a.rating);
            else if (sort === 'lowest') sorted.sort((a, b) => a.rating - b.rating);
            else sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            return {
                album: baseAlbum,
                userReview: currentUserReview ? { ...currentUserReview } : null,
                reviews: sorted
            };
        },
        async deleteReview(reviewId) {
            if (currentUserReview && currentUserReview.reviewId === reviewId) {
                currentUserReview = null;
            }
        }
    };
}
