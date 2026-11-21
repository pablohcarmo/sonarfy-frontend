import { createAccountAdapter } from './account-fixtures.js';
import { createHttpAccountAdapter } from './account-http.js';
import { createAccountState, logoutAccount, normalizeHandle } from './account-state.js';
import { readSpotifyCallbackOutcome } from './spotify-http.js';
import { extractUrlToken } from './password-http.js';
import { globalHeader, globalFooter, sidebar } from './profile-shell.js';
import { icon } from './profile-icons.js';
import { containFocus } from './profile-dialogs.js';
import { escapeHTML as e } from './profile-utils.js';

// Resolve the host adapter, explicit demo mode (?demo=true), or default HTTP adapter.
export function resolveAccountAdapter(integration = globalThis.sonarfyAccountAdapter) {
    if (integration) return integration;
    const isDemo = typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === 'true';
    return isDemo ? createAccountAdapter() : createHttpAccountAdapter();
}

// Render a themed SVG pair from assets/icons/account.
function accountIcon(lightFile, darkFile, size, alt = '') {
    if (!darkFile || lightFile === darkFile) {
        return `<img src="../assets/icons/account/${lightFile}.svg" width="${size}" height="${size}" alt="${e(alt)}" aria-hidden="true">`;
    }
    return `<img class="theme-light-only" src="../assets/icons/account/${lightFile}.svg" width="${size}" height="${size}" alt="${e(alt)}" aria-hidden="true"><img class="theme-dark-only" src="../assets/icons/account/${darkFile}.svg" width="${size}" height="${size}" alt="${e(alt)}" aria-hidden="true">`;
}

// Mount the Settings / Account page controller and bind all UI interactions.
export function mountAccount(adapter = resolveAccountAdapter(), options = {}) {
    const navigate = options.navigate || (url => { location.href = url; });
    const store = createAccountState(adapter);
    const { state } = store;
    const controller = new AbortController();
    const on = (target, type, fn, opts = {}) => target?.addEventListener(type, fn, { ...opts, signal: controller.signal });

    const statusEl = document.getElementById('account-status');
    const demoEl = document.getElementById('account-demo');
    const drawer = document.getElementById('profile-drawer');
    const dialog = document.getElementById('account-dialog');
    containFocus(drawer);
    containFocus(dialog);

    document.querySelector('.profile-global-header').innerHTML = globalHeader(adapter.routes?.home || 'feed.html');
    document.querySelector('.profile-footer').innerHTML = globalFooter();
    document.getElementById('profile-sidebar').innerHTML = sidebar(false, adapter.routes, 'settings');
    demoEl.hidden = !adapter.demo;

    const menuTrigger = document.getElementById('open-menu');
    const editBtn = document.getElementById('edit-account-btn');
    const form = document.getElementById('account-form');
    const firstNameInput = document.getElementById('first-name');
    const lastNameInput = document.getElementById('last-name');
    const handleInput = document.getElementById('handle-input');
    const handleBox = handleInput.closest('.account-input-box');
    const handleFeedback = document.getElementById('handle-feedback');
    const birthDateInput = document.getElementById('birth-date');
    const countryInput = document.getElementById('country-input');
    const cityInput = document.getElementById('city-input');
    const cityList = document.getElementById('city-suggestions');
    const editActions = document.getElementById('edit-actions');
    const saveBtn = document.getElementById('save-account-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const saveCooldownBanner = document.getElementById('save-cooldown');
    const saveCooldownText = document.getElementById('save-cooldown-text');
    const spotifyDesc = document.getElementById('spotify-description');
    const spotifySlot = document.getElementById('spotify-action-slot');
    const emailInput = document.getElementById('email-input');
    const emailBtn = document.getElementById('change-email-btn');
    const emailTimerEl = document.getElementById('email-timer');
    const passwordBtn = document.getElementById('reset-password-btn');
    const passwordTimerEl = document.getElementById('password-timer');
    const deactivateBtn = document.getElementById('deactivate-account-btn');
    const deleteBtn = document.getElementById('delete-account-btn');

    const editableInputs = [firstNameInput, lastNameInput, handleInput, birthDateInput, cityInput];
    let selectedCityId = null;
    let dialogTrigger = null;
    let dialogBusy = false;
    let handleDebounce = null;
    let cityDebounce = null;
    let cityAbort = null;
    const activeTimers = new Map();

    // Announce status messages in the page-level live region.
    function notify(message) {
        statusEl.textContent = message || '';
    }

    // Populate form inputs from the current committed account snapshot.
    function populateForm(account) {
        if (!account) return;
        firstNameInput.value = account.firstName || '';
        lastNameInput.value = account.lastName || '';
        handleInput.value = normalizeHandle(account.handle || '');
        birthDateInput.value = account.birthDate || '';
        countryInput.value = account.country || '';
        cityInput.value = account.city || '';
        selectedCityId = account.cityId || null;
        emailInput.value = account.email || '';
    }

    // Close and clear the city autocomplete listbox.
    function closeCities() {
        cityList.hidden = true;
        cityList.innerHTML = '';
        cityInput.setAttribute('aria-expanded', 'false');
    }

    // Start a per-action cooldown countdown and disable its button while active.
    function startCooldown(key, seconds, button, outputEl, onTick) {
        if (activeTimers.has(key)) clearInterval(activeTimers.get(key));
        let remaining = Math.max(1, Math.round(seconds || 30));
        const update = () => {
            if (remaining <= 0) {
                clearInterval(activeTimers.get(key));
                activeTimers.delete(key);
                if (button) button.disabled = false;
                if (outputEl) outputEl.textContent = '';
                if (onTick) onTick(0);
                return;
            }
            if (button) button.disabled = true;
            if (outputEl) outputEl.textContent = `Aguarde ${remaining}s para tentar novamente.`;
            if (onTick) onTick(remaining);
            remaining -= 1;
        };
        update();
        activeTimers.set(key, setInterval(update, 1000));
    }

    // Synchronize the UI controls with the current account state.
    function render() {
        const { account, editing, saving, handleStatus, handleMessage } = state;
        editBtn.setAttribute('aria-pressed', String(editing));
        editBtn.disabled = saving || !account;
        editableInputs.forEach(input => {
            input.disabled = !editing || saving;
            input.closest('.account-input-box')?.classList.toggle('is-editable', editing);
        });
        editActions.hidden = !editing;
        saveBtn.disabled = saving || activeTimers.has('save') || handleStatus === 'taken' || handleStatus === 'invalid' || handleStatus === 'checking';
        cancelBtn.disabled = saving;

        handleFeedback.textContent = editing ? handleMessage : '';
        handleFeedback.className = 'account-field-feedback';
        const isHandleError = editing && (handleStatus === 'taken' || handleStatus === 'invalid' || handleStatus === 'error');
        const isHandleOk = editing && handleStatus === 'available';
        if (isHandleError) handleFeedback.classList.add('is-error');
        if (isHandleOk) handleFeedback.classList.add('is-success');
        handleBox.classList.toggle('has-error', isHandleError);
        handleInput.setAttribute('aria-invalid', String(isHandleError));

        if (!editing) closeCities();

        if (account) {
            const spotifyStatus = account.spotifyStatus || (account.spotifyConnected ? 'CONNECTED' : 'DISCONNECTED');
            const syncHref = adapter.routes?.spotifySync || 'spotify-sync.html?source=account';
            if (spotifyStatus === 'CONNECTED') {
                spotifyDesc.textContent = 'Sua conta do Spotify está conectada ao Sonarfy.';
                spotifySlot.innerHTML = `<button id="spotify-disconnect-btn" type="button" class="account-btn-spotify"${state.pendingAction === 'spotify' ? ' disabled' : ''}>Conectado · Desconectar</button>`;
            } else if (spotifyStatus === 'REAUTHORIZATION_REQUIRED') {
                spotifyDesc.textContent = 'Sua autorização do Spotify expirou. Reconecte para continuar usando a integração.';
                spotifySlot.innerHTML = `<a id="spotify-sync-link" class="account-btn-spotify" href="${e(syncHref)}">Reconectar Spotify</a>`;
            } else {
                spotifyDesc.textContent = 'Conecte sua conta para personalizar sua experiência.';
                spotifySlot.innerHTML = `<a id="spotify-sync-link" class="account-btn-spotify" href="${e(syncHref)}">Sincronizar com Spotify</a>`;
            }
        }
    }

    // Open a native modal dialog with focus containment and safe closing.
    function openDialog(html, onConfirm) {
        dialogTrigger = document.activeElement;
        dialogBusy = false;
        dialog.innerHTML = html;
        dialog.showModal();
        document.body.classList.add('profile-modal-open');
        const confirmBtn = dialog.querySelector('[data-confirm]');
        const closeButtons = dialog.querySelectorAll('[data-close]');
        const dialogStatus = dialog.querySelector('.account-dialog-status');
        closeButtons.forEach(btn => btn.addEventListener('click', () => { if (!dialogBusy) dialog.close(); }));
        if (confirmBtn && onConfirm) {
            confirmBtn.addEventListener('click', async () => {
                if (dialogBusy) return;
                dialogBusy = true;
                dialog.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
                if (dialogStatus) dialogStatus.textContent = '';
                try {
                    await onConfirm();
                    dialogBusy = false;
                    if (dialog.open) dialog.close();
                } catch (error) {
                    dialogBusy = false;
                    dialog.querySelectorAll('button').forEach(btn => { btn.disabled = false; });
                    if (dialogStatus) dialogStatus.textContent = error.message || 'Não foi possível concluir a ação. Tente novamente.';
                }
            });
        }
        (dialog.querySelector('[data-close]') || confirmBtn || dialog).focus();
    }

    // Open the success feedback modal matching the Figma specification.
    function openSuccessDialog(message, note = 'Por segurança, aguarde antes de fazer uma nova alteração.') {
        openDialog(
            `<div class="account-dialog-content">
                <div class="account-dialog-success-head">
                    <span class="account-dialog-badge is-success" aria-hidden="true">${accountIcon('circle-check', 'circle-check', 24)}</span>
                    <h2 id="account-dialog-title" class="account-dialog-title">Sucesso</h2>
                </div>
                <p class="account-dialog-text">${e(message)}</p>
                <p class="account-dialog-note">${e(note)}</p>
                <div class="account-dialog-actions is-single">
                    <button type="button" class="account-btn-primary" data-close>Entendi</button>
                </div>
            </div>`
        );
    }

    // Open the Deactivate Account confirmation modal.
    function openDeactivateDialog() {
        openDialog(
            `<div class="account-dialog-content">
                <div class="account-dialog-top">
                    <span class="account-dialog-badge" aria-hidden="true">${accountIcon('eye-off-light', 'eye-off-dark', 24)}</span>
                    <button type="button" class="account-dialog-close" data-close aria-label="Fechar">${accountIcon('close-light', 'close-dark', 20)}</button>
                </div>
                <h2 id="account-dialog-title" class="account-dialog-title">Desativar sua conta?</h2>
                <p class="account-dialog-text">Ao confirmar a desativação, seu perfil ficará temporariamente indisponível para outros usuários, mas todas as suas avaliações, resenhas e dados continuarão armazenados com segurança.</p>
                <div class="account-dialog-info"><strong>Reativação automática:</strong> Sua conta será reativada automaticamente assim que você realizar o próximo login.</div>
                <p class="account-dialog-status" role="alert" aria-live="polite"></p>
                <div class="account-dialog-actions">
                    <button type="button" class="account-btn-secondary" data-close>Cancelar</button>
                    <button type="button" class="account-btn-primary" data-confirm>Confirmar Desativação</button>
                </div>
            </div>`,
            () => store.deactivateAccount(navigate)
        );
    }

    // Open the destructive Delete Account confirmation modal.
    function openDeleteDialog() {
        openDialog(
            `<div class="account-dialog-content">
                <div class="account-dialog-top">
                    <span class="account-dialog-badge is-danger" aria-hidden="true">${accountIcon('trash-light', 'trash-dark', 24)}</span>
                    <button type="button" class="account-dialog-close" data-close aria-label="Fechar">${accountIcon('close-light', 'close-dark', 20)}</button>
                </div>
                <h2 id="account-dialog-title" class="account-dialog-title">Deletar conta permanentemente?</h2>
                <p class="account-dialog-text">Esta ação é definitiva e não pode ser desfeita. Seu perfil, histórico, avaliações, resenhas e conexões serão permanentemente removidos do Sonarfy.</p>
                <p class="account-dialog-note">Se quiser apenas ocultar seu perfil sem perder seus dados, utilize a opção Desativar Conta.</p>
                <p class="account-dialog-status" role="alert" aria-live="polite"></p>
                <div class="account-dialog-actions">
                    <button type="button" class="account-btn-secondary" data-close>Cancelar</button>
                    <button type="button" class="account-btn-danger-solid" data-confirm>Deletar Permanentemente</button>
                </div>
            </div>`,
            () => store.deleteAccount(navigate)
        );
    }

    // Open the authenticated password change modal when arriving with #password-change-token=...
    function openPasswordChangeDialog(initialToken) {
        let authToken = initialToken;
        openDialog(
            `<div class="account-dialog-content">
                <div class="account-dialog-top">
                    <span class="account-dialog-badge" aria-hidden="true">${accountIcon('lock-light', 'lock-dark', 24)}</span>
                    <button type="button" class="account-dialog-close" data-close aria-label="Fechar">${accountIcon('close-light', 'close-dark', 20)}</button>
                </div>
                <h2 id="account-dialog-title" class="account-dialog-title">Alterar senha de acesso</h2>
                <p class="account-dialog-text">Informe sua senha atual e escolha uma nova senha com pelo menos 8 caracteres. Ao concluir, você precisará entrar novamente.</p>
                <form id="password-change-form" class="account-section" novalidate>
                    <div class="account-field">
                        <label for="pwd-current">Senha atual</label>
                        <div class="account-input-box is-editable">
                            <input id="pwd-current" name="currentPassword" type="password" autocomplete="current-password" required>
                        </div>
                    </div>
                    <div class="account-field">
                        <label for="pwd-new">Nova senha</label>
                        <div class="account-input-box is-editable">
                            <input id="pwd-new" name="newPassword" type="password" autocomplete="new-password" minlength="8" required>
                        </div>
                    </div>
                    <div class="account-field">
                        <label for="pwd-confirm">Confirmar nova senha</label>
                        <div class="account-input-box is-editable">
                            <input id="pwd-confirm" name="confirmNewPassword" type="password" autocomplete="new-password" minlength="8" required>
                        </div>
                    </div>
                    <p class="account-dialog-status" role="alert" aria-live="polite"></p>
                    <div class="account-dialog-actions">
                        <button type="button" class="account-btn-secondary" data-close>Cancelar</button>
                        <button type="button" class="account-btn-primary" data-confirm>Confirmar nova senha</button>
                    </div>
                </form>
            </div>`,
            async () => {
                const currentPassword = dialog.querySelector('#pwd-current')?.value || '';
                const newPassword = dialog.querySelector('#pwd-new')?.value || '';
                const confirmNewPassword = dialog.querySelector('#pwd-confirm')?.value || '';
                await adapter.changePassword({ token: authToken, currentPassword, newPassword, confirmNewPassword });
                authToken = null;
                navigate('login.html?reset=true');
            }
        );
    }

    const unsubscribe = store.subscribe(render);

    on(dialog, 'cancel', event => { if (dialogBusy) event.preventDefault(); });
    on(dialog, 'click', event => { if (event.target === dialog && !dialogBusy) dialog.close(); });
    on(dialog, 'close', () => {
        document.body.classList.remove('profile-modal-open');
        if (dialogTrigger?.isConnected) dialogTrigger.focus();
    });

    on(editBtn, 'click', () => {
        notify('');
        if (state.editing) {
            populateForm(state.account);
            store.setEditing(false);
        } else {
            store.setEditing(true);
            firstNameInput.focus();
        }
    });

    on(cancelBtn, 'click', () => {
        notify('');
        populateForm(state.account);
        store.setEditing(false);
        editBtn.focus();
    });

    on(handleInput, 'input', () => {
        if (!state.editing) return;
        clearTimeout(handleDebounce);
        const cleaned = handleInput.value.replace(/^@+/, '');
        if (cleaned !== handleInput.value) handleInput.value = cleaned;
        handleDebounce = setTimeout(() => store.checkHandle(handleInput.value), 180);
    });

    on(handleInput, 'blur', () => {
        if (!state.editing) return;
        clearTimeout(handleDebounce);
        store.checkHandle(handleInput.value);
    });

    on(cityInput, 'input', () => {
        if (!state.editing || typeof adapter.searchCities !== 'function') return;
        selectedCityId = null;
        clearTimeout(cityDebounce);
        cityAbort?.abort();
        const query = cityInput.value.trim();
        if (query.length < 2) { closeCities(); return; }
        cityDebounce = setTimeout(async () => {
            cityAbort = new AbortController();
            try {
                const results = await adapter.searchCities(query, { signal: cityAbort.signal });
                if (!state.editing || cityInput.value.trim() !== query) return;
                if (!results?.length) { closeCities(); return; }
                cityList.innerHTML = results.map((city, idx) => {
                    const meta = [city.adminName1, city.countryName].filter(Boolean).join(', ');
                    return `<li role="option"><button type="button" data-city-idx="${idx}">${e(city.name)}<span>${e(meta)}</span></button></li>`;
                }).join('');
                cityList.hidden = false;
                cityInput.setAttribute('aria-expanded', 'true');
                cityList.querySelectorAll('button').forEach((btn, idx) => {
                    btn.addEventListener('click', () => {
                        const chosen = results[idx];
                        cityInput.value = chosen.name;
                        countryInput.value = chosen.countryName || '';
                        selectedCityId = chosen.id || null;
                        closeCities();
                        cityInput.focus();
                    });
                });
            } catch (error) {
                if (error?.name !== 'AbortError') closeCities();
            }
        }, 180);
    });

    on(form, 'submit', async event => {
        event.preventDefault();
        notify('');
        clearTimeout(handleDebounce);
        const cityChanged = cityInput.value.trim() !== String(state.account?.city || '').trim();
        if (!adapter.demo && cityChanged && !selectedCityId) {
            notify('Selecione uma cidade da lista de sugestões para alterar sua localização.');
            cityInput.focus();
            return;
        }
        try {
            const response = await store.savePersonalInfo({
                firstName: firstNameInput.value,
                lastName: lastNameInput.value,
                handle: handleInput.value,
                birthDate: birthDateInput.value,
                city: cityInput.value,
                country: countryInput.value,
                cityId: selectedCityId
            });
            if (!response) return;
            populateForm(state.account);
            saveCooldownBanner.hidden = false;
            startCooldown('save', response.cooldownSeconds || 30, saveBtn, null, remaining => {
                saveCooldownText.textContent = remaining > 0
                    ? `Alterações salvas. Aguarde ${remaining}s antes de salvar novamente.`
                    : 'Você já pode salvar novas alterações.';
                if (remaining === 0) saveCooldownBanner.hidden = true;
                render();
            });
            openSuccessDialog('Suas informações foram atualizadas com sucesso.');
        } catch (error) {
            notify(error.message || 'Não foi possível salvar as alterações.');
        }
    });

    on(emailBtn, 'click', async () => {
        if (emailBtn.disabled) return;
        notify('');
        emailBtn.disabled = true;
        try {
            const result = await adapter.requestEmailChange();
            startCooldown('email', result?.cooldownSeconds || 30, emailBtn, emailTimerEl);
            openSuccessDialog(result?.message || 'Enviamos as instruções para alteração do seu e-mail.');
        } catch (error) {
            emailBtn.disabled = false;
            notify(error.message || 'Não foi possível solicitar a alteração de e-mail.');
        }
    });

    on(passwordBtn, 'click', async () => {
        if (passwordBtn.disabled) return;
        notify('');
        passwordBtn.disabled = true;
        try {
            const result = await adapter.requestPasswordReset();
            startCooldown('password', result?.cooldownSeconds || 30, passwordBtn, passwordTimerEl);
            openSuccessDialog(result?.message || 'Enviamos um link para redefinição de senha no seu e-mail.');
        } catch (error) {
            passwordBtn.disabled = false;
            notify(error.message || 'Não foi possível solicitar a redefinição de senha.');
        }
    });

    on(deactivateBtn, 'click', openDeactivateDialog);
    on(deleteBtn, 'click', openDeleteDialog);

    // Handle sidebar navigation actions, Spotify disconnect, and footer buttons.
    async function handleNavigation(key) {
        if (key === 'logout') return logoutAccount(adapter, navigate);
        if (adapter.actions?.[key]) return adapter.actions[key]();
        notify(key === 'notifications' ? 'Notificações estarão disponíveis em breve.' : 'Esta funcionalidade ainda não está disponível neste frontend.');
    }

    on(document, 'click', event => {
        const target = event.target.closest('button, a');
        if (!target) {
            if (!event.target.closest('.account-city-field')) closeCities();
            return;
        }
        if (target.id === 'spotify-disconnect-btn') {
            notify('');
            store.disconnectSpotify()
                .then(result => {
                    if (result?.message) notify(result.message);
                })
                .catch(error => notify(error.message || 'Não foi possível desconectar o Spotify.'));
        }
        if (target.dataset.navigation) {
            handleNavigation(target.dataset.navigation);
            if (drawer.open) drawer.close();
        }
        if (target.dataset.unavailable) {
            notify(`${target.dataset.unavailable} ainda não está disponível neste frontend.`);
        }
    });

    on(menuTrigger, 'click', () => {
        drawer.innerHTML = `<header class="drawer-heading"><a class="brand" href="${e(adapter.routes?.home || 'feed.html')}"><svg width="95" height="24" viewBox="0 0 95 24" aria-label="Sonarfy"><use href="../assets/logos/sonarfy-mobile.svg#logo"></use></svg></a><button class="profile-icon-button" id="close-menu" aria-label="Fechar">${icon('close')}</button></header>${sidebar(false, adapter.routes, 'settings')}`;
        drawer.showModal();
        document.body.classList.add('profile-modal-open');
        menuTrigger.setAttribute('aria-expanded', 'true');
        drawer.querySelector('#close-menu').addEventListener('click', () => drawer.close(), { once: true });
        drawer.querySelector('#close-menu').focus();
    });

    on(drawer, 'click', event => {
        if (event.target !== drawer) return;
        const box = drawer.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) drawer.close();
    });

    on(drawer, 'close', () => {
        document.body.classList.remove('profile-modal-open');
        menuTrigger.setAttribute('aria-expanded', 'false');
        menuTrigger.focus();
    });

    const spotifyCallback = readSpotifyCallbackOutcome(options.location, options.history);
    const passwordChangeToken = extractUrlToken('password-change-token', options.location, options.history);

    on(window, 'hashchange', () => {
        const nextToken = extractUrlToken('password-change-token', options.location, options.history);
        if (nextToken && typeof adapter.changePassword === 'function') {
            openPasswordChangeDialog(nextToken);
        }
    });

    const ready = store.load().then(account => {
        populateForm(account);
        render();
        if (spotifyCallback) notify(spotifyCallback.message);
        if (passwordChangeToken && typeof adapter.changePassword === 'function') {
            openPasswordChangeDialog(passwordChangeToken);
        }
        return account;
    }).catch(error => {
        notify(error.message || 'Não foi possível carregar as configurações.');
    });

    return {
        store,
        ready,
        openDeactivateDialog,
        openDeleteDialog,
        destroy() {
            clearTimeout(handleDebounce);
            clearTimeout(cityDebounce);
            cityAbort?.abort();
            activeTimers.forEach(timer => clearInterval(timer));
            activeTimers.clear();
            unsubscribe();
            controller.abort();
        }
    };
}

if (document.getElementById('account-main')) mountAccount();
