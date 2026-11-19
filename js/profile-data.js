import { createFixtures } from './profile-fixtures.js';
import { sortCollection, validateProfile, validateReview } from './profile-utils.js';

// No public-profile, follow, media or social API contract exists in this repository.
// This bridge is an explicit integration seam, not a claim that those endpoints exist.
export function createProfileAdapter(integration = window.sonarfyProfileAdapter) {
    if (integration) return integration;
    let data;
    const wait = () => new Promise(resolve => setTimeout(resolve, 180));
    return {
        demo: true,
        async load(handle) { await wait(); data = createFixtures(handle); data.collection = sortCollection(data.collection, 'recent'); return data; },
        async collection(sort) { return sortCollection(data.collection, sort); },
        async updateProfile(values) {
            validateProfile(values);
            if (data.profile.id !== data.session.userId) throw new Error('Sem permissão para editar este perfil.');
            await wait(); Object.assign(data.profile, values); return data.profile;
        },
        async follow(following) {
            if (data.profile.id === data.session.userId) throw new Error('Este é o perfil autenticado.');
            await wait();
            if (data.profile.isFollowing !== following) data.profile.followers += following ? 1 : -1;
            data.profile.isFollowing = following;
            return { isFollowing: following, followers: data.profile.followers };
        },
        async like(id, liked) {
            const item = [...data.activities, ...data.replies, ...data.collection].find(item => item.id === id);
            if (!item) throw new Error('Publicação não encontrada.');
            await wait();
            if (item.liked !== liked) item.likeCount = Math.max(0, item.likeCount + (liked ? 1 : -1));
            item.liked = liked;
            return { liked, likeCount: item.likeCount };
        },
        uploadPolicy: { types: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 5 * 1024 * 1024 },
        async upload(file) { await wait(); return URL.createObjectURL(file); }
    };
}
export function validateData(data) {
    if (!data?.profile?.id || !data.profile.handle) throw new Error('Dados públicos do perfil indisponíveis.');
    for (const items of [data.activities, data.replies, data.collection]) {
        if (!Array.isArray(items)) throw new Error('Conteúdo do perfil indisponível.');
        items.forEach(item => validateReview(item.review));
    }
    return data;
}
