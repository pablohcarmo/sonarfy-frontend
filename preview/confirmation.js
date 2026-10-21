// This preview imports the current card markup, without loading registration/API scripts.
(async () => {
    try {
        const sourceURL = new URL('../pages/register.html', location.href);
        const response = await fetch(sourceURL);
        if (!response.ok) throw new Error('Não foi possível carregar o cadastro.');
        const source = new DOMParser().parseFromString(await response.text(), 'text/html');
        const copy = selector => {
            const node = source.querySelector(selector)?.cloneNode(true);
            if (!node) throw new Error('A estrutura da confirmação mudou. Atualize a prévia.');
            for (const element of node.querySelectorAll('[src], [href]')) {
                for (const attribute of ['src', 'href']) {
                    if (element.hasAttribute(attribute)) element.setAttribute(attribute, new URL(element.getAttribute(attribute), sourceURL).href);
                }
            }
            return node;
        };
        const header = copy('.site-header');
        const confirmation = copy('#pendingSection');
        const footer = copy('.site-footer');
        const modal = copy('#editEmailModal');
        confirmation.style.display = 'block';
        const main = document.createElement('main');
        main.className = 'register-layout';
        main.append(confirmation);
        const notice = document.createElement('aside');
        notice.className = 'preview-notice';
        notice.setAttribute('aria-label', 'Aviso de prévia');
        const description = document.createElement('span');
        description.textContent = 'Prévia local · ações simuladas, sem envio de e-mails.';
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.textContent = 'Ocultar aviso';
        dismiss.addEventListener('click', () => notice.remove());
        notice.append(description, dismiss);
        document.body.className = 'register-page';
        document.body.dataset.registrationStep = 'confirmation';
        document.body.replaceChildren(notice, header, main, footer, modal);

        const root = document.documentElement;
        const themeButton = document.getElementById('theme-toggle');
        try { root.dataset.theme = localStorage.getItem('sonarfy_theme') === 'dark' ? 'dark' : 'light'; } catch {}
        const updateTheme = () => {
            const dark = root.dataset.theme === 'dark';
            themeButton.setAttribute('aria-pressed', String(dark));
            themeButton.setAttribute('aria-label', dark ? 'Ativar tema claro' : 'Ativar tema escuro');
        };
        updateTheme();
        themeButton.addEventListener('click', () => {
            root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
            updateTheme();
        });

        const address = document.getElementById('pendingEmailDisplay');
        const edit = document.getElementById('btnEditEmailIcon');
        const addressButton = document.getElementById('pendingEmailBadge');
        const input = document.getElementById('newPendingEmailField');
        const feedback = document.getElementById('pendingSuccessAlert');
        const resend = document.getElementById('btnResendPendingEmail');
        let cooldown;
        const showFeedback = message => {
            feedback.textContent = message;
            feedback.style.display = 'block';
        };
        const closeModal = () => {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
            edit.focus();
        };
        const openModal = () => {
            input.value = address.textContent.trim();
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
            input.focus();
        };
        edit.addEventListener('click', openModal);
        addressButton.addEventListener('click', openModal);
        document.getElementById('closeEditEmailModalBtn').addEventListener('click', closeModal);
        modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
        modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeModal();
            if (event.key !== 'Tab') return;
            const controls = Array.from(modal.querySelectorAll('button:not([disabled]), input:not([disabled])'));
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
        document.getElementById('editEmailForm').addEventListener('submit', event => {
            event.preventDefault();
            address.textContent = input.value.trim();
            closeModal();
            showFeedback('Simulação: endereço atualizado. Nenhum e-mail foi enviado.');
        });
        resend.addEventListener('click', () => {
            if (resend.disabled) return;
            showFeedback('Simulação: reenvio solicitado. Nenhum e-mail foi enviado.');
            const label = resend.innerHTML;
            const deadline = Date.now() + 30000;
            resend.disabled = true;
            const tick = () => {
                const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
                if (seconds) resend.textContent = `Reenviar em (${seconds}s)`;
                else { clearInterval(cooldown); resend.innerHTML = label; resend.disabled = false; }
            };
            tick();
            cooldown = setInterval(tick, 1000);
        });
        document.getElementById('btnBackToForm').addEventListener('click', () => location.assign(sourceURL));
    } catch (error) {
        document.body.replaceChildren();
        const message = document.createElement('p');
        message.className = 'preview-loading';
        message.setAttribute('role', 'alert');
        message.textContent = `Não foi possível abrir a prévia. ${error.message}`;
        document.body.append(message);
    }
})();
