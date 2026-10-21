document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    const nameField = document.getElementById('nameField');
    const surnameField = document.getElementById('surnameField');
    const emailField = document.getElementById('emailField');
    const passwordField = document.getElementById('passwordField');
    const handleField = document.getElementById('handleField');
    const confirmPasswordField = document.getElementById('confirmPasswordField');
    const birthDateField = document.getElementById('birthDateField');
    const cityField = document.getElementById('cityField');
    const allInputs = document.querySelectorAll('.login-field');

    // Estado da sessão de cadastro pendente
    let currentRegistrationToken = '';
    let currentRegisteredHandle = '';
    let currentRegisteredEmail = '';
    let pendingCooldownInterval = null;
    let pendingCooldownRemaining = 0;
    const PENDING_COOLDOWN_SECONDS = 30;

    // Elementos da Seção de Confirmação Pendente
    const registerSection = document.getElementById('registerSection');
    const pendingSection = document.getElementById('pendingSection');
    const pendingEmailBadge = document.getElementById('pendingEmailBadge');
    const pendingEmailDisplay = document.getElementById('pendingEmailDisplay');
    const btnEditEmailIcon = document.getElementById('btnEditEmailIcon');
    const btnResendPendingEmail = document.getElementById('btnResendPendingEmail');
    const btnBackToForm = document.getElementById('btnBackToForm');
    const pendingErrorAlert = document.getElementById('pendingErrorAlert');
    const pendingSuccessAlert = document.getElementById('pendingSuccessAlert');
    const pendingCooldownStatus = document.getElementById('pendingCooldownStatus');
    const registrationTitle = document.title;

    function showRegistrationStep(confirmation) {
        if (!registerSection || !pendingSection) return;
        registerSection.style.display = confirmation ? 'none' : 'block';
        pendingSection.style.display = confirmation ? 'block' : 'none';
        if (confirmation) document.body.dataset.registrationStep = 'confirmation';
        else delete document.body.dataset.registrationStep;
        document.title = confirmation ? 'Confirmação de e-mail – Sonarfy' : registrationTitle;
        const target = confirmation ? document.getElementById('pendingTitle') : nameField;
        target?.focus({ preventScroll: true });
        window.scrollTo?.({ top: 0, behavior: 'instant' });
    }

    function resetPendingResendButton() {
        if (!btnResendPendingEmail) return;
        const icon = document.createElement('span');
        icon.className = 'confirmation-resend-symbol';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '↻';
        const label = document.createElement('span');
        label.textContent = 'Reenviar e-mail';
        btnResendPendingEmail.replaceChildren(icon, label);
    }

    // Elementos do Modal de Edição de E-mail Pendente
    const editEmailModal = document.getElementById('editEmailModal');
    const closeEditEmailModalBtn = document.getElementById('closeEditEmailModalBtn');
    const editEmailForm = document.getElementById('editEmailForm');
    const newPendingEmailField = document.getElementById('newPendingEmailField');
    const btnSubmitEditEmail = document.getElementById('btnSubmitEditEmail');
    const editEmailModalError = document.getElementById('editEmailModalError');
    const editEmailModalSuccess = document.getElementById('editEmailModalSuccess');

    // Funções utilitárias da Tela de Confirmação Pendente
    function showPendingError(msg) {
        if (pendingErrorAlert) {
            pendingErrorAlert.innerText = msg;
            pendingErrorAlert.style.display = 'block';
        }
        if (pendingSuccessAlert) {
            pendingSuccessAlert.style.display = 'none';
        }
    }

    function showPendingSuccess(message) {
        if (pendingSuccessAlert) {
            pendingSuccessAlert.textContent = message;
            pendingSuccessAlert.style.display = 'block';
        }
        if (pendingErrorAlert) {
            pendingErrorAlert.style.display = 'none';
        }
    }

    function clearPendingAlerts() {
        if (pendingErrorAlert) {
            pendingErrorAlert.style.display = 'none';
            pendingErrorAlert.innerText = '';
        }
        if (pendingSuccessAlert) {
            pendingSuccessAlert.style.display = 'none';
            pendingSuccessAlert.innerHTML = '';
        }
    }

    function updateEmailEditLockState() {
        const isLocked = pendingCooldownRemaining > 0;

        if (pendingEmailBadge) {
            pendingEmailBadge.disabled = isLocked;
            if (isLocked) {
                pendingEmailBadge.classList.add('is-disabled');
                pendingEmailBadge.setAttribute('aria-disabled', 'true');
                pendingEmailBadge.title = `Aguarde (${pendingCooldownRemaining}s) para alterar o e-mail`;
            } else {
                pendingEmailBadge.classList.remove('is-disabled');
                pendingEmailBadge.removeAttribute('aria-disabled');
                pendingEmailBadge.title = "Clique para corrigir o e-mail";
            }
        }

        if (btnEditEmailIcon) {
            btnEditEmailIcon.disabled = isLocked;
            if (isLocked) {
                btnEditEmailIcon.title = `Aguarde (${pendingCooldownRemaining}s) para alterar o e-mail`;
            } else {
                btnEditEmailIcon.title = "Corrigir e-mail";
            }
        }

        if (newPendingEmailField) {
            newPendingEmailField.disabled = isLocked;
        }

        if (btnSubmitEditEmail && isLocked) {
            btnSubmitEditEmail.disabled = isLocked;
        }
    }

    function startPendingCooldown(button) {
        clearInterval(pendingCooldownInterval);
        pendingCooldownRemaining = PENDING_COOLDOWN_SECONDS;
        const deadline = Date.now() + PENDING_COOLDOWN_SECONDS * 1000;

        if (button) {
            button.disabled = true;
            button.textContent = `Reenviar em (${pendingCooldownRemaining}s)`;
        }
        if (pendingCooldownStatus) pendingCooldownStatus.textContent = 'Aguarde 30 segundos para reenviar ou corrigir o e-mail.';

        updateEmailEditLockState();

        pendingCooldownInterval = setInterval(() => {
            pendingCooldownRemaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            if (pendingCooldownRemaining > 0) {
                if (button) {
                    button.textContent = `Reenviar em (${pendingCooldownRemaining}s)`;
                }
                updateEmailEditLockState();
            } else {
                clearInterval(pendingCooldownInterval);
                pendingCooldownRemaining = 0;
                if (button) {
                    button.disabled = false;
                    resetPendingResendButton();
                }
                if (pendingCooldownStatus) pendingCooldownStatus.textContent = 'Você já pode reenviar ou corrigir o e-mail.';
                updateEmailEditLockState();
            }
        }, 1000);
    }

    function showEditEmailError(msg) {
        if (editEmailModalError) {
            editEmailModalError.innerText = msg;
            editEmailModalError.style.display = 'block';
        }
        if (editEmailModalSuccess) {
            editEmailModalSuccess.style.display = 'none';
        }
    }

    function showEditEmailSuccess(htmlOrText) {
        if (editEmailModalSuccess) {
            editEmailModalSuccess.innerHTML = htmlOrText;
            editEmailModalSuccess.style.display = 'block';
        }
        if (editEmailModalError) {
            editEmailModalError.style.display = 'none';
        }
    }

    function clearEditEmailAlerts() {
        if (editEmailModalError) {
            editEmailModalError.style.display = 'none';
            editEmailModalError.innerText = '';
        }
        if (editEmailModalSuccess) {
            editEmailModalSuccess.style.display = 'none';
            editEmailModalSuccess.innerHTML = '';
        }
    }

    function openEditEmailModal() {
        if (!editEmailModal) return;
        if (pendingCooldownRemaining > 0) {
            showPendingError(`Aguarde mais ${pendingCooldownRemaining}s para alterar o e-mail.`);
            return;
        }
        clearEditEmailAlerts();
        if (newPendingEmailField) {
            newPendingEmailField.value = currentRegisteredEmail || '';
            newPendingEmailField.disabled = false;
        }
        if (btnSubmitEditEmail) {
            btnSubmitEditEmail.disabled = false;
        }
        editEmailModal.style.display = 'flex';
        editEmailModal.setAttribute('aria-hidden', 'false');
        if (newPendingEmailField) {
            setTimeout(() => newPendingEmailField.focus(), 50);
        }
    }

    function closeEditEmailModal() {
        if (!editEmailModal) return;
        editEmailModal.style.display = 'none';
        editEmailModal.setAttribute('aria-hidden', 'true');
        clearEditEmailAlerts();
        btnEditEmailIcon?.focus();
    }

    // Variável de memória para o banco de dados
    let selectedCountry = '';
    let geocodeTimeout;

    // Regras do Checklist de Senha
    const reqLength = document.getElementById('req-length');
    const reqUppercase = document.getElementById('req-uppercase');
    const reqNumber = document.getElementById('req-number');
    const reqSpecial = document.getElementById('req-special');

    // Expressões Regulares alinhadas com as anotações do back-end
    const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*(?:\s[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*)*$/;
    const HANDLE_REGEX = /^[a-zA-Z0-9_.-]+$/;
    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const CITY_REGEX = /^[a-zA-ZÀ-ÿ\s.'-]+$/;
    const COUNTRY_REGEX = /^[a-zA-ZÀ-ÿ\s.'-]+$/;

    // Funções utilitárias para exibição de mensagens
    function showError(msg) {
        errorMessage.innerText = msg;
        errorMessage.style.display = 'block';
        successMessage.style.display = 'none';
    }

    function hideError() {
        errorMessage.style.display = 'none';
        errorMessage.innerText = '';
    }

    function clearErrorIfMatches(keywords) {
        if (errorMessage.style.display === 'block') {
            const text = errorMessage.innerText.toLowerCase();
            if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
                hideError();
            }
        }
    }

    // Cálculo de idade e validação
    function calculateAge(birthDate) {
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }

    function validateBirthDate(dateStr) {
        if (!dateStr) {
            return { valid: false, message: "A data de nascimento é obrigatória." };
        }
        const [year, month, day] = dateStr.split('-').map(Number);
        const birth = new Date(year, month - 1, day);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (isNaN(birth.getTime())) {
            return { valid: false, message: "Data de nascimento inválida." };
        }
        if (birth >= today) {
            return { valid: false, message: "A data de nascimento deve ser uma data no passado." };
        }
        if (year < 1900) {
            return { valid: false, message: "Por favor, insira uma data de nascimento válida." };
        }

        const age = calculateAge(birth);
        if (age < 13) {
            return { valid: false, message: "Você precisa ter pelo menos 13 anos para se cadastrar." };
        }

        return { valid: true };
    }

    // Configuração do calendário de nascimento (bloqueia datas < 13 anos e futuras)
    if (birthDateField) {
        const today = new Date();
        const maxBirthDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
        const yyyy = maxBirthDate.getFullYear();
        const mm = String(maxBirthDate.getMonth() + 1).padStart(2, '0');
        const dd = String(maxBirthDate.getDate()).padStart(2, '0');
        birthDateField.max = `${yyyy}-${mm}-${dd}`;
        birthDateField.min = '1900-01-01';

        birthDateField.addEventListener('change', function() {
            const validation = validateBirthDate(this.value);
            if (!validation.valid) {
                showError(validation.message);
            } else {
                clearErrorIfMatches(['13 anos', 'nascimento', 'passado']);
            }
        });
    }

    // REGRA 1: Bloqueia Emojis
    const emojiRegex = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu;
    allInputs.forEach(input => {
        input.addEventListener('input', function() {
            if (emojiRegex.test(this.value)) {
                this.value = this.value.replace(emojiRegex, '');
            }
        });
    });

    // REGRA 2: Bloqueia caracteres inválidos no Nome e Sobrenome (permite apenas letras, espaços, apóstrofos e hífens)
    const nameAllowedCharRegex = /[^A-Za-zÀ-ÖØ-öø-ÿ'’\-\s]/g;
    [nameField, surnameField].forEach(field => {
        if (field) {
            field.addEventListener('input', function() {
                if (nameAllowedCharRegex.test(this.value)) {
                    this.value = this.value.replace(nameAllowedCharRegex, '');
                }
            });
        }
    });

    // REGRA 3: Formata o Handle (Bloqueia @, espaços e caracteres especiais)
    const handleRegex = /[^a-zA-Z0-9_.\-]/g;
    if (handleField) {
        handleField.addEventListener('input', function() {
            if (handleRegex.test(this.value)) {
                this.value = this.value.replace(handleRegex, '');
            }
            // Padroniza visualmente convertendo tudo para letras minúsculas
            this.value = this.value.toLowerCase();
        });
    }

    // REGRA 4: Validação Dinâmica da Senha (Checklist)
    let isPasswordValid = false;

    function updateChecklistItem(element, isValid) {
        if (!element) return;
        element.classList.toggle('valid', isValid);
        element.classList.toggle('invalid', !isValid);
        const label = element.querySelector('.requirement-text')?.textContent.trim() || element.textContent.trim();
        element.setAttribute('aria-label', `${label}: ${isValid ? 'atendido' : 'não atendido'}`);
    }
    [reqLength, reqUppercase, reqNumber, reqSpecial].forEach(item => updateChecklistItem(item, false));

    function validatePasswordMatch() {
        if (!confirmPasswordField || !passwordField) return;
        const mismatch = Boolean(confirmPasswordField.value) && passwordField.value !== confirmPasswordField.value;
        confirmPasswordField.setCustomValidity(mismatch ? 'As senhas não coincidem.' : '');
        confirmPasswordField.setAttribute('aria-invalid', String(mismatch));
        const message = document.getElementById('confirmPasswordError');
        if (message) {
            message.textContent = mismatch ? 'As senhas não coincidem.' : '';
            message.hidden = !mismatch;
        }
    }
    confirmPasswordField?.addEventListener('input', validatePasswordMatch);
    document.querySelectorAll('.btn-toggle-password').forEach(button => {
        button.addEventListener('click', () => {
            const input = document.getElementById(button.getAttribute('aria-controls'));
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            button.setAttribute('aria-pressed', String(show));
            button.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
        });
    });
    const dateWrapper = birthDateField?.closest('.date-wrapper');
    const syncDate = () => dateWrapper?.classList.toggle('has-value', Boolean(birthDateField.value));
    birthDateField?.addEventListener('change', syncDate);
    document.getElementById('openBirthDatePicker')?.addEventListener('click', () => {
        birthDateField.focus();
        try { birthDateField.showPicker?.(); } catch { /* Native field remains usable. */ }
    });
    syncDate();

    if (passwordField) {
        passwordField.addEventListener('input', function() {
            const val = this.value;
            const hasLength = val.length >= 8; // Mínimo de 8 caracteres exigido pelo back-end
            const hasUppercase = /[A-Z]/.test(val);
            const hasNumber = /[0-9]/.test(val);
            const hasSpecial = /[!@#$%^&*(),.?":{}|<>_+\-=\\[\]\\]/.test(val);

            updateChecklistItem(reqLength, hasLength);
            updateChecklistItem(reqUppercase, hasUppercase);
            updateChecklistItem(reqNumber, hasNumber);
            updateChecklistItem(reqSpecial, hasSpecial);

            isPasswordValid = hasLength && hasUppercase && hasNumber && hasSpecial;
            validatePasswordMatch();
        });
    }

    // ENVIO DO FORMULÁRIO (Submissão para a API com validações completas)
    if (registerForm) {
        registerForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            if (registerForm.getAttribute('aria-busy') === 'true') return;
            const submitButton = registerForm.querySelector('button[type="submit"]');
            const submitLabel = submitButton.textContent;
            registerForm.setAttribute('aria-busy', 'true');
            submitButton.disabled = true;
            submitButton.textContent = 'Cadastrando…';
            try {
                hideError();
                successMessage.style.display = 'none';

                // 1. Validação do Nome
                const nameVal = nameField ? nameField.value.trim() : '';
                if (!nameVal) {
                    showError("O nome é obrigatório.");
                    if (nameField) nameField.focus();
                    return;
                }
                if (!NAME_REGEX.test(nameVal)) {
                    showError("O nome deve conter apenas letras e espaços.");
                    if (nameField) nameField.focus();
                    return;
                }

                // 2. Validação do Sobrenome
                const surnameVal = surnameField ? surnameField.value.trim() : '';
                if (!surnameVal) {
                    showError("O sobrenome é obrigatório.");
                    if (surnameField) surnameField.focus();
                    return;
                }
                if (!NAME_REGEX.test(surnameVal)) {
                    showError("O sobrenome deve conter apenas letras e espaços.");
                    if (surnameField) surnameField.focus();
                    return;
                }

                // 3. Validação do Handle
                const handleVal = handleField ? handleField.value.trim() : '';
                if (!handleVal) {
                    showError("O nome de usuário é obrigatório.");
                    if (handleField) handleField.focus();
                    return;
                }
                if (!HANDLE_REGEX.test(handleVal)) {
                    showError("O nome de usuário deve conter apenas letras, números, sublinhados (_), hífens (-) e pontos (.).");
                    if (handleField) handleField.focus();
                    return;
                }

                // 4. Validação do E-mail
                const emailVal = emailField ? emailField.value.trim() : '';
                if (!emailVal) {
                    showError("O e-mail é obrigatório.");
                    if (emailField) emailField.focus();
                    return;
                }
                if (!EMAIL_REGEX.test(emailVal)) {
                    showError("O e-mail deve ser um endereço de e-mail válido.");
                    if (emailField) emailField.focus();
                    return;
                }

                // 5. Validação de Senha (tamanho mínimo 8 caracteres + requisitos do checklist)
                const passwordVal = passwordField ? passwordField.value : '';
                if (!passwordVal) {
                    showError("A senha é obrigatória.");
                    if (passwordField) passwordField.focus();
                    return;
                }
                if (passwordVal.length < 8) {
                    showError("A senha deve ter no mínimo 8 caracteres.");
                    if (passwordField) passwordField.focus();
                    return;
                }
                if (!isPasswordValid) {
                    showError("A senha não atende a todos os requisitos de segurança.");
                    if (passwordField) passwordField.focus();
                    return;
                }
                if (passwordVal !== confirmPasswordField.value) {
                    showError("As senhas não coincidem.");
                    if (confirmPasswordField) confirmPasswordField.focus();
                    return;
                }

                // 6. Validação da Data de Nascimento
                const birthValidation = validateBirthDate(birthDateField ? birthDateField.value : '');
                if (!birthValidation.valid) {
                    showError(birthValidation.message);
                    if (birthDateField) birthDateField.focus();
                    return;
                }

                // 7. Validação da Cidade
                const cityVal = cityField ? cityField.value.trim() : '';
                if (!cityVal) {
                    showError("A cidade é obrigatória.");
                    if (cityField) cityField.focus();
                    return;
                }
                if (!CITY_REGEX.test(cityVal)) {
                    showError("A cidade deve conter apenas letras, espaços, hífens e pontos.");
                    if (cityField) cityField.focus();
                    return;
                }

                // 8. Validação do País (seleção na lista suspensa do GeoNames ou auto-resolução)
                if (!selectedCountry) {
                    try {
                        const encodedQuery = encodeURIComponent(cityVal);
                        const autoUrl = `https://secure.geonames.org/searchJSON?name_startsWith=${encodedQuery}&maxRows=1&featureClass=P&orderby=population&username=${GEONAMES_USERNAME}`;
                        const autoResp = await fetch(autoUrl);
                        if (autoResp.ok) {
                            const autoData = await autoResp.json();
                            if (autoData.geonames && autoData.geonames.length > 0) {
                                selectedCountry = autoData.geonames[0].countryName;
                            }
                        }
                    } catch (e) {
                        console.warn("Falha no auto-resolve de país:", e);
                    }

                    if (!selectedCountry) {
                        selectedCountry = 'Brazil';
                    }
                }

                if (!COUNTRY_REGEX.test(selectedCountry)) {
                    showError("O país selecionado é inválido.");
                    return;
                }

                const payload = {
                    name: nameVal,
                    surname: surnameVal,
                    handle: handleVal,
                    email: emailVal,
                    password: passwordVal,
                    birthDate: birthDateField.value,
                    city: cityVal,
                    country: selectedCountry
                };

                try {
                    const response = await fetch(`${API_BASE_URL}/auth/register`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (response.ok) {
                        const data = await response.json().catch(() => ({}));
                        currentRegistrationToken = data.registrationToken || '';
                        currentRegisteredHandle = handleVal.replace(/^@/, '');
                        currentRegisteredEmail = data.email || emailVal;

                        registerForm.reset();
                        [reqLength, reqUppercase, reqNumber, reqSpecial].forEach(el => updateChecklistItem(el, false));
                        isPasswordValid = false;
                        selectedCountry = ''; // Reseta o país após sucesso
                        hideError();

                        if (registerSection && pendingSection) {
                            showRegistrationStep(true);
                            if (pendingEmailDisplay) {
                                pendingEmailDisplay.innerText = currentRegisteredEmail;
                            }
                            clearPendingAlerts();
                            startPendingCooldown(btnResendPendingEmail);
                        }
                    } else {
                        const data = await response.json().catch(() => ({}));
                        let msg = "Erro ao realizar o cadastro. E-mail ou nome de usuário já está em uso.";
                        if (data.message) {
                            msg = data.message;
                        } else if (Array.isArray(data.errors) && data.errors.length > 0) {
                            msg = data.errors.map(err => err.defaultMessage || err.message || err).join('; ');
                        } else if (data.error) {
                            msg = data.error;
                        }
                        showError(msg);
                    }
                } catch (error) {
                    console.error("Erro de conexão", error);
                    showError("Erro de conexão com o servidor.");
                }
            } finally {
                registerForm.removeAttribute('aria-busy');
                submitButton.disabled = false;
                submitButton.textContent = submitLabel;
            }
        });
    }

    // The provider can be replaced with window.sonarfyCitySearch(query, { signal }).
    // It returns [{ name, adminName1, countryName }], independent of the API vendor.
    if (cityField) {
        const wrapper = cityField.closest('.autocomplete-wrapper');
        const suggestionList = document.getElementById('citySuggestions');
        const status = document.getElementById('cityStatus');
        const examples = [
            { name: 'São Paulo', adminName1: 'São Paulo', countryName: 'Brasil' },
            { name: 'São Paulo da Assunção de Luanda', countryName: 'Angola' },
            { name: 'Guarulhos', adminName1: 'São Paulo', countryName: 'Brasil' },
            { name: 'Campinas', adminName1: 'São Paulo', countryName: 'Brasil' }
        ];
        const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        let results = [];
        let activeIndex = -1;
        let request = 0;
        let controller;

        function closeSuggestions() {
            suggestionList.hidden = true;
            cityField.setAttribute('aria-expanded', 'false');
            cityField.removeAttribute('aria-activedescendant');
            activeIndex = -1;
        }
        function selectCity(index) {
            const place = results[index];
            if (!place) return;
            cityField.value = place.name;
            selectedCountry = place.countryName;
            request++;
            controller?.abort();
            closeSuggestions();
            hideError();
            cityField.focus();
        }
        function setActive(index) {
            activeIndex = index;
            Array.from(suggestionList.children).forEach((item, i) => item.setAttribute('aria-selected', String(i === index)));
            const option = suggestionList.children[index];
            if (option) {
                cityField.setAttribute('aria-activedescendant', option.id);
                option.scrollIntoView?.({ block: 'nearest' });
            }
        }
        function render(places) {
            results = places.filter(place => place.name && place.countryName).slice(0, 10);
            suggestionList.replaceChildren();
            activeIndex = -1;
            cityField.removeAttribute('aria-activedescendant');
            results.forEach((place, index) => {
                const item = document.createElement('li');
                item.id = `city-option-${index}`;
                item.className = 'autocomplete-item';
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', 'false');
                item.textContent = [place.name, place.adminName1, place.countryName].filter(Boolean).join(', ');
                item.addEventListener('mousedown', event => event.preventDefault());
                item.addEventListener('click', () => selectCity(index));
                suggestionList.appendChild(item);
            });
            const open = results.length > 0 && document.activeElement === cityField;
            suggestionList.hidden = !open;
            cityField.setAttribute('aria-expanded', String(open));
            if (status) status.textContent = results.length ? `${results.length} cidades encontradas. Use as setas para navegar.` : 'Nenhuma cidade encontrada.';
        }
        async function search(query, signal) {
            if (typeof window.sonarfyCitySearch === 'function') return window.sonarfyCitySearch(query, { signal });
            if (typeof GEONAMES_USERNAME === 'undefined' || !GEONAMES_USERNAME) {
                return examples.filter(place => normalize(Object.values(place).join(' ')).includes(normalize(query)));
            }
            const params = new URLSearchParams({ name_startsWith: query, maxRows: '10', featureClass: 'P', orderby: 'population', lang: 'pt', username: GEONAMES_USERNAME });
            let response = await fetch(`https://secure.geonames.org/searchJSON?${params}`, { signal });
            if (!response.ok) throw new Error('City search failed');
            let data = await response.json();
            if (!data.geonames?.length) {
                params.delete('name_startsWith');
                params.set('q', query);
                response = await fetch(`https://secure.geonames.org/searchJSON?${params}`, { signal });
                if (!response.ok) throw new Error('City search failed');
                data = await response.json();
            }
            return data.geonames || [];
        }
        function scheduleSearch() {
            cityField.value = cityField.value.replace(/[^a-zA-ZÀ-ÿ\s.'-]/g, '');
            selectedCountry = '';
            clearTimeout(geocodeTimeout);
            controller?.abort();
            const current = ++request;
            const query = cityField.value.trim();
            closeSuggestions();
            results = [];
            if (query.length < 2) { if (status) status.textContent = ''; return; }
            geocodeTimeout = setTimeout(async () => {
                controller = new AbortController();
                if (status) status.textContent = 'Buscando cidades…';
                try {
                    const places = await search(query, controller.signal);
                    if (current === request) render(places);
                } catch (error) {
                    if (error.name !== 'AbortError' && current === request) {
                        closeSuggestions();
                        if (status) status.textContent = 'Não foi possível buscar cidades. Tente novamente.';
                    }
                }
            }, 350);
        }
        cityField.addEventListener('input', scheduleSearch);
        cityField.addEventListener('focus', () => {
            if (results.length && cityField.value.length >= 2) {
                suggestionList.hidden = false;
                cityField.setAttribute('aria-expanded', 'true');
            }
        });
        cityField.addEventListener('blur', closeSuggestions);
        cityField.addEventListener('keydown', event => {
            if (event.key === 'Escape') { request++; controller?.abort(); closeSuggestions(); }
            if (suggestionList.hidden || !results.length) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setActive(activeIndex < 0 && event.key === 'ArrowUp' ? results.length - 1 :
                    (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
            } else if (event.key === 'Enter' && activeIndex >= 0) {
                event.preventDefault();
                selectCity(activeIndex);
            }
        });
        document.addEventListener('click', event => { if (!wrapper.contains(event.target)) closeSuggestions(); });
        registerForm.addEventListener('reset', () => {
            request++;
            clearTimeout(geocodeTimeout);
            controller?.abort();
            results = [];
            closeSuggestions();
            selectedCountry = '';
            isPasswordValid = false;
            [reqLength, reqUppercase, reqNumber, reqSpecial].forEach(item => updateChecklistItem(item, false));
            confirmPasswordField.setCustomValidity('');
            confirmPasswordField.setAttribute('aria-invalid', 'false');
            const message = document.getElementById('confirmPasswordError');
            if (message) message.hidden = true;
            dateWrapper?.classList.remove('has-value');
        });
    }

    // ==========================================
    // EVENTOS DA TELA DE CONFIRMAÇÃO PENDENTE E EDIÇÃO DE E-MAIL
    // ==========================================
    if (btnResendPendingEmail) {
        btnResendPendingEmail.addEventListener('click', async () => {
            if (!currentRegisteredEmail || btnResendPendingEmail.disabled) return;
            clearPendingAlerts();

            const originalBtnHtml = btnResendPendingEmail.innerHTML;
            btnResendPendingEmail.disabled = true;
            btnResendPendingEmail.textContent = 'Reenviando…';
            btnResendPendingEmail.setAttribute('aria-busy', 'true');

            try {
                const response = await fetch(`${API_BASE_URL}/auth/resend-activation-email?email=${encodeURIComponent(currentRegisteredEmail)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                let responseText = '';
                try {
                    const text = await response.text();
                    try {
                        const json = JSON.parse(text);
                        responseText = json.message || json.error || text;
                    } catch {
                        responseText = text;
                    }
                } catch {
                    responseText = '';
                }

                if (response.ok) {
                    if (responseText.toLowerCase().includes('already verified')) {
                        showPendingSuccess('Esta conta já foi ativada! Você já pode fazer login.');
                        btnResendPendingEmail.disabled = false;
                        btnResendPendingEmail.innerHTML = originalBtnHtml;
                    } else {
                        showPendingSuccess(`Novo link de confirmação reenviado para ${currentRegisteredEmail}! Verifique sua caixa de entrada.`);
                        startPendingCooldown(btnResendPendingEmail);
                    }
                } else {
                    btnResendPendingEmail.disabled = false;
                    btnResendPendingEmail.innerHTML = originalBtnHtml;

                    if (response.status === 404 || responseText.toLowerCase().includes('not found')) {
                        showPendingError("Não encontramos nenhuma conta cadastrada com esse e-mail.");
                    } else {
                        showPendingError("Não foi possível reenviar o link no momento. Tente novamente mais tarde.");
                    }
                }
            } catch (err) {
                console.error("Erro ao reenviar confirmação pendente:", err);
                btnResendPendingEmail.disabled = false;
                btnResendPendingEmail.innerHTML = originalBtnHtml;
                showPendingError("Erro de conexão com o servidor. Tente novamente mais tarde.");
            } finally {
                btnResendPendingEmail.removeAttribute('aria-busy');
            }
        });
    }

    if (pendingEmailBadge) {
        pendingEmailBadge.addEventListener('click', (e) => {
            if (pendingCooldownRemaining > 0) {
                e.preventDefault();
                showPendingError(`Aguarde mais ${pendingCooldownRemaining}s para alterar o e-mail.`);
                return;
            }
            openEditEmailModal();
        });
    }

    if (btnEditEmailIcon) {
        btnEditEmailIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            if (pendingCooldownRemaining > 0) {
                e.preventDefault();
                showPendingError(`Aguarde mais ${pendingCooldownRemaining}s para alterar o e-mail.`);
                return;
            }
            openEditEmailModal();
        });
    }

    if (closeEditEmailModalBtn) {
        closeEditEmailModalBtn.addEventListener('click', () => {
            closeEditEmailModal();
        });
    }

    if (editEmailModal) {
        editEmailModal.addEventListener('click', (e) => {
            if (e.target === editEmailModal) {
                closeEditEmailModal();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && editEmailModal && editEmailModal.style.display === 'flex') {
            closeEditEmailModal();
        }
    });

    if (editEmailForm) {
        editEmailForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearEditEmailAlerts();

            if (pendingCooldownRemaining > 0) {
                showEditEmailError(`Aguarde mais ${pendingCooldownRemaining}s para alterar o e-mail.`);
                return;
            }

            const newEmail = newPendingEmailField ? newPendingEmailField.value.trim() : '';
            if (!newEmail) {
                showEditEmailError("O novo e-mail é obrigatório.");
                return;
            }
            if (!EMAIL_REGEX.test(newEmail)) {
                showEditEmailError("Por favor, insira um e-mail válido.");
                return;
            }
            if (newEmail.toLowerCase() === currentRegisteredEmail.toLowerCase()) {
                showEditEmailError("O novo e-mail informado é idêntico ao e-mail atual.");
                return;
            }
            if (!currentRegisteredHandle) {
                showEditEmailError("Não foi possível identificar o usuário para atualização. Por favor, realize o cadastro novamente.");
                return;
            }
            if (btnSubmitEditEmail.disabled) return;

            const originalBtnHtml = btnSubmitEditEmail.innerHTML;
            btnSubmitEditEmail.disabled = true;
            btnSubmitEditEmail.textContent = 'Atualizando e reenviando…';
            btnSubmitEditEmail.setAttribute('aria-busy', 'true');

            try {
                const requestHeaders = {
                    'Content-Type': 'application/json'
                };
                if (currentRegistrationToken) {
                    requestHeaders['Authorization'] = `Bearer ${currentRegistrationToken}`;
                }

                const response = await fetch(`${API_BASE_URL}/auth/update-pending-email`, {
                    method: 'PATCH',
                    headers: requestHeaders,
                    body: JSON.stringify({
                        handle: currentRegisteredHandle,
                        newEmail: newEmail
                    })
                });

                let responseText = '';
                try {
                    responseText = await response.text();
                } catch {
                    responseText = '';
                }

                let responseData = null;
                try {
                    responseData = JSON.parse(responseText);
                } catch {
                    responseData = null;
                }

                if (response.ok) {
                    currentRegisteredEmail = newEmail;
                    if (pendingEmailDisplay) {
                        pendingEmailDisplay.innerText = currentRegisteredEmail;
                    }

                    btnSubmitEditEmail.disabled = false;
                    btnSubmitEditEmail.innerHTML = originalBtnHtml;
                    closeEditEmailModal();

                    showPendingSuccess(`E-mail atualizado! Um novo link foi enviado para ${currentRegisteredEmail}.`);
                    startPendingCooldown(btnResendPendingEmail);
                } else {
                    btnSubmitEditEmail.disabled = false;
                    btnSubmitEditEmail.innerHTML = originalBtnHtml;

                    let msg = "Não foi possível atualizar o e-mail no momento.";
                    const rawMsg = (responseData && (responseData.message || responseData.error)) || responseText || '';
                    const lowerMsg = rawMsg.toLowerCase();

                    if (response.status === 429 || lowerMsg.includes('wait') || lowerMsg.includes('seconds before')) {
                        msg = "Aguarde o tempo de espera de 30 segundos antes de solicitar um novo e-mail.";
                    } else if (response.status === 401 || lowerMsg.includes('unauthorized') || lowerMsg.includes('invalid authorization')) {
                        msg = "Sua sessão temporária de cadastro expirou. Por favor, realize o cadastro novamente.";
                    } else if (response.status === 409 || lowerMsg.includes('already in use') || lowerMsg.includes('em uso')) {
                        msg = "Este e-mail já está em uso por outro usuário.";
                    } else if (response.status === 400 && (lowerMsg.includes('already verified') || lowerMsg.includes('já foi ativada') || lowerMsg.includes('já verificada'))) {
                        msg = "Esta conta já foi ativada. Você já pode fazer login.";
                    } else if (response.status === 400 && lowerMsg.includes('email')) {
                        msg = "Por favor, insira um e-mail válido.";
                    } else if (response.status === 404 || lowerMsg.includes('not found') || lowerMsg.includes('não encontrado')) {
                        msg = "Usuário não encontrado. Por favor, realize o cadastro novamente.";
                    }
                    showEditEmailError(msg);
                }
            } catch (err) {
                console.error("Erro ao atualizar e-mail pendente:", err);
                btnSubmitEditEmail.disabled = false;
                btnSubmitEditEmail.innerHTML = originalBtnHtml;
                showEditEmailError("Erro de conexão com o servidor. Tente novamente mais tarde.");
            } finally {
                btnSubmitEditEmail.removeAttribute('aria-busy');
            }
        });
    }

    if (btnBackToForm) {
        btnBackToForm.addEventListener('click', (e) => {
            e.preventDefault();
            if (pendingSection && registerSection) {
                showRegistrationStep(false);
            }
        });
    }

    // Keep keyboard focus inside the existing confirmation dialogs.
    document.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const modal = [editEmailModal].find(element => element?.getAttribute('aria-hidden') === 'false');
        if (!modal) return;
        const focusable = Array.from(modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]'));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
            event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
            event.preventDefault(); first?.focus();
        }
    });
});
