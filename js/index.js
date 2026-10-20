// The Home reuses the site's theme controller (login-theme.js).
// Native dialog supplies focus containment, Escape dismissal and focus return.
(() => {
    const trigger = document.getElementById('about-open');
    const dialog = document.getElementById('about-dialog');
    if (!trigger || !dialog) return;
    trigger.addEventListener('click', () => {
        if (!dialog.open) dialog.showModal();
    });
})();
