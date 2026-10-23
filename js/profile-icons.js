// Original Figma SVGs are kept intact; theme variants preserve their original geometry.
const icons = {
    home: ['home-light','home-dark'], search: ['search-light','search-dark'], echoes: ['echoes-light','echoes-dark'],
    notifications: ['notifications-light','notifications-dark'], profile: ['profile-light','profile-dark'], activeProfile: ['active-profile-light','active-profile-light'],
    settings: ['settings-light','settings-dark'], logout: ['logout-light','logout-dark'], menu: ['menu-light','menu-dark'],
    edit: ['edit-light','edit-dark'], share: ['share-light','share-dark'], disc: ['disc-light','disc-dark'],
    people: ['people-light','people-dark'], location: ['location-light','location-dark'], calendar: ['calendar-light','calendar-dark'],
    heart: ['heart-light','heart-dark'], liked: ['liked-light','liked-light'], comment: ['comment-light','comment-dark'],
    close: ['close-light','close-dark'], camera: ['camera-light','camera-light'], copy: ['copy-light','copy-light'],
    link: ['link-light','link-dark'], whatsapp: ['whatsapp-light','whatsapp-dark'], x: ['x-light','x-dark'],
    telegram: ['telegram-light','telegram-dark'], more: ['more-light','more-dark'], sort: ['sort-light','sort-dark'],
    chevron: ['chevron-light','chevron-dark'], check: ['check-light','check-light']
};
export function icon(name) {
    const [light, dark] = icons[name];
    const img = (file, theme) => `<img class="${theme}" src="../assets/icons/profile/${file}.svg" alt="" aria-hidden="true">`;
    return `<span class="profile-icon" aria-hidden="true">${light === dark ? img(light, '') : img(light, 'theme-light-only') + img(dark, 'theme-dark-only')}</span>`;
}
