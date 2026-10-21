// Preserve existing registration bookmarks while the hosting routes evolve.
(() => {
    const destination = new URL('register.html', window.location.href);
    destination.search = window.location.search;
    destination.hash = window.location.hash;
    window.location.replace(destination.href);
})();
