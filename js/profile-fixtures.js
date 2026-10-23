// Isolated Figma fixtures. Never used when a real profile adapter is provided.
const avatar = '../assets/icons/profile/avatar.svg';
const longReview = "Ouvir 'Neon Horizons' do começo ao fim é uma experiência imersiva única. Os sintetizadores oitentistas se misturam com batidas modernas de forma impecável, criando uma atmosfera noturna hipnotizante que prende a atenção até o último acorde da faixa final.";
const solarReview = "'Solar Vibes' combina ritmos brasileiros, baixos quentes e melodias solares em uma produção cheia de detalhes. Cada faixa revela novas camadas de percussão e vozes, criando uma experiência acolhedora que dá vontade de ouvir novamente, do começo até o fim.";
const albums = [
    ['urban-jungle', 'Urban Jungle', 'Artista Urbano', 'UJ', 4, ''],
    ['static-noise', 'Static Noise', 'The Glitches', 'SD', 1, 'Produção confusa e faixas repetitivas. Infelizmente decepcionou bastante.'],
    ['neon-horizons', 'Neon Horizons', 'Synth Collective', 'NH', 5, longReview],
    ['classic-rewind', 'Classic Rewind', 'Artista Retrô', 'CR', 2, 'Apenas duas músicas se salvam. O álbum envelheceu mal e soa datado.'],
    ['midnight-echoes', 'Midnight Echoes', 'Lunar Pulse', 'ME', 4, 'Atmosfera minimalista perfeita para ouvir na madrugada.'],
    ['broken-tape', 'Broken Tape', 'Lo-Fi Basement', 'BR', 2, ''],
    ['overproduced', 'Overproduced', 'Pop Factory', 'OV', 1, "'Overproduced' aposta em tantos efeitos que a identidade vocal desaparece. Os arranjos repetem fórmulas comerciais e deixam pouco espaço para emoção ou surpresa."],
    ['solar-vibes', 'Solar Vibes', 'Tropikal Groove', 'SV', 5, '']
];
export function createFixtures(handle = '', now = Date.now()) {
    const friend = handle === 'lucas_vinyl';
    if (handle && !friend && handle !== 'username_123456') throw new Error('Perfil não encontrado.');
    const profile = friend ? {
        id: 'demo-lucas', displayName: 'Lucas Andrade', handle: 'lucas_vinyl', ratedCount: 89, followers: 1400,
        following: 210, city: 'Curitiba', country: 'Brasil', joinedAt: '2026-03-12T12:00:00Z',
        bio: 'Colecionador de discos de vinil, entusiasta de synthwave, post-punk e produções independentes.'
    } : {
        id: 'demo-owner', displayName: 'Display Name', handle: 'username_123456', ratedCount: 142,
        followers: 32000, following: 321, city: 'Cidade', country: 'País', joinedAt: '2026-10-01T12:00:00Z',
        bio: 'Apaixonado por música, descubro bons artistas, coleciono discos e compartilho resenhas dos álbuns, shows e histórias que conectam pessoas diariamente.'
    };
    Object.assign(profile, { avatar, cover: '', isFollowing: false });
    const make = (index, options = {}) => {
        const [id, title, artist, mark, rating, review] = albums[index];
        return { id: `${profile.id}-${id}`, album: { id, title, artist, mark }, author: profile, rating, review,
            createdAt: new Date(now - (index + 1) * 86400000).toISOString(), liked: false, likeCount: 0, commentCount: 0, ...options };
    };
    const activities = friend ? [
        make(2, { review: '', createdAt: new Date(now - 2 * 3600000).toISOString(), liked: true, likeCount: 9, commentCount: 1 }),
        make(4, { review: 'A masterização em vinil desse álbum ficou impecável, graves muito bem definidos.', createdAt: '2026-10-18T12:00:00Z', likeCount: 19, commentCount: 4 }),
        make(7, { review: solarReview, createdAt: '2026-07-09T12:00:00Z', liked: true, likeCount: 62, commentCount: 15 })
    ] : [
        make(0, { createdAt: new Date(now - 3 * 3600000).toISOString(), liked: true, likeCount: 14, commentCount: 3 }),
        make(3, { rating: 3, review: "Revisitei 'Classic Rewind'. Tem faixas boas, mas o álbum como um todo não envelheceu tão bem quanto eu esperava.", createdAt: '2026-10-20T12:00:00Z', likeCount: 5 }),
        make(2, { createdAt: '2026-06-15T12:00:00Z', liked: true, likeCount: 48, commentCount: 11 })
    ];
    // Friend replies intentionally have their own texts, targets and publication identities.
    const texts = friend ? ['Também gosto dessa linha de baixo. A edição em vinil destaca os detalhes.', 'Essa produção ganhou novas camadas a cada escuta.', 'Os sintetizadores desse disco são uma das minhas referências.'] : [
        'Concordo totalmente! A faixa 4 tem uma linha de baixo absurda, ouvindo no fone de referência a mixagem fica muito mais nítida.',
        'Acho que as três primeiras faixas ainda seguram muito bem o disco, principalmente pela nostalgia dos timbres analógicos.',
        'Esse álbum redefiniu o gênero pra mim. A transição instrumental entre as duas últimas faixas continua sendo uma obra-prima até hoje.'
    ];
    const replies = [0, 3, 2].map((albumIndex, index) => make(albumIndex, {
        id: `${profile.id}-reply-${index}`, replyTo: ['lucas_vinyl', 'marina_som', 'synth_wave'][index],
        review: texts[index], createdAt: index === 0 ? new Date(now - 5 * 3600000).toISOString() : ['','2026-10-19T12:00:00Z', '2026-08-12T12:00:00Z'][index],
        liked: index !== 1, likeCount: [8, 3, 21][index], commentCount: [2, 0, 4][index]
    }));
    const collection = albums.map((_, index) => make(index));
    // Reuse the same entity wherever a publication appears, including collection details.
    activities.forEach(item => {
        const index = collection.findIndex(entry => entry.id === item.id);
        if (!friend && item.album.id === 'classic-rewind') collection[index].id += '-earlier';
        else collection[index] = item;
    });
    return { profile, session: { userId: 'demo-owner' }, activities, replies, collection };
}
