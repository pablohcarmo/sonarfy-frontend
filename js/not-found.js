// Resolve the home destination based on whether a local session token exists.
export function resolveHomeRoute(storage = globalThis.localStorage) {
    try {
        if (storage?.getItem?.('sonarfy_token')) return '/pages/feed.html';
    } catch {}
    return '/index.html';
}

// Navigate back when browser history is available, or fall back to the resolved home route.
export function navigateBackOrHome({
    historyObj = globalThis.history,
    locationObj = globalThis.location,
    storage = globalThis.localStorage
} = {}) {
    if (historyObj && typeof historyObj.back === 'function' && Number(historyObj.length) > 1) {
        historyObj.back();
        return 'back';
    }
    const home = resolveHomeRoute(storage);
    if (locationObj && typeof locationObj.assign === 'function') {
        locationObj.assign(home);
    }
    return home;
}

// Wire the 404 page home links and back button.
export function mountNotFoundPage(options = {}) {
    const brandLink = document.getElementById('notFoundBrand');
    const homeLink = document.getElementById('btnGoHome');
    const backBtn = document.getElementById('btnGoBack');
    if (!homeLink && !backBtn) return null;

    const home = resolveHomeRoute(options.storage);
    if (brandLink) brandLink.setAttribute('href', home);
    if (homeLink) homeLink.setAttribute('href', home);

    const controller = new AbortController();
    backBtn?.addEventListener('click', () => {
        navigateBackOrHome({
            historyObj: options.historyObj || globalThis.history,
            locationObj: options.locationObj || globalThis.location,
            storage: options.storage || globalThis.localStorage
        });
    }, { signal: controller.signal });

    return {
        home,
        destroy() {
            controller.abort();
        }
    };
}

if (document.getElementById('not-found-main')) mountNotFoundPage();
