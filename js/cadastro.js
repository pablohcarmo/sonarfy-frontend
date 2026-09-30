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
        if (isValid) {
            element.classList.replace('invalid', 'valid');
            element.querySelector('i').className = 'fa-solid fa-check';
        } else {
            element.classList.replace('valid', 'invalid');
            element.querySelector('i').className = 'fa-solid fa-xmark';
        }
    }

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
        });
    }

    // ENVIO DO FORMULÁRIO (Submissão para a API com validações completas)
    if (registerForm) {
        registerForm.addEventListener('submit', async function(event) {
            event.preventDefault();
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
            console.log("Payload gerado pelo Front-end:", JSON.stringify(payload, null, 2));

            try {
                const response = await fetch(`${API_BASE_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    registerForm.reset();
                    [reqLength, reqUppercase, reqNumber, reqSpecial].forEach(el => updateChecklistItem(el, false));
                    isPasswordValid = false;
                    selectedCountry = ''; // Reseta o país após sucesso
                    hideError();

                    successMessage.innerText = "Conta criada com sucesso! Enviamos um link de confirmação para o seu e-mail.";
                    successMessage.style.display = 'block';
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
        });
    }

    // Autocompletar de Cidades com GeoNames API (usando HTTPS seguro e ordenação por relevância)
    if (cityField) {
        const wrapper = document.createElement('div');
        wrapper.className = 'autocomplete-wrapper';
        cityField.parentNode.insertBefore(wrapper, cityField);
        wrapper.appendChild(cityField);

        const suggestionList = document.createElement('ul');
        suggestionList.className = 'autocomplete-list';
        wrapper.appendChild(suggestionList);

        const cityInputInvalidRegex = /[^a-zA-ZÀ-ÿ\s.'-]/g;

        cityField.addEventListener('input', function() {
            if (cityInputInvalidRegex.test(this.value)) {
                this.value = this.value.replace(cityInputInvalidRegex, '');
            }

            clearTimeout(geocodeTimeout);
            const query = this.value.trim();
            suggestionList.innerHTML = '';
            selectedCountry = ''; // Reseta o país oculto se o usuário voltar a digitar

            if (query.length < 2) return;

            geocodeTimeout = setTimeout(async () => {
                try {
                    const encoded = encodeURIComponent(query);
                    // 1. Busca prioritária por prefixo e população no endpoint seguro (HTTPS)
                    let url = `https://secure.geonames.org/searchJSON?name_startsWith=${encoded}&maxRows=10&featureClass=P&orderby=population&username=${GEONAMES_USERNAME}`;
                    let response = await fetch(url);
                    let places = [];

                    if (response.ok) {
                        const data = await response.json();
                        if (data.geonames && data.geonames.length > 0) {
                            places = data.geonames;
                        }
                    }

                    // 2. Fallback para busca textual mais abrangente se o prefixo não trouxer nada
                    if (places.length === 0) {
                        url = `https://secure.geonames.org/searchJSON?q=${encoded}&maxRows=10&featureClass=P&orderby=population&username=${GEONAMES_USERNAME}`;
                        response = await fetch(url);
                        if (response.ok) {
                            const data = await response.json();
                            if (data.geonames && data.geonames.length > 0) {
                                places = data.geonames;
                            }
                        }
                    }

                    suggestionList.innerHTML = '';
                    if (places.length > 0) {
                        places.forEach(place => {
                            const li = document.createElement('li');
                            li.className = 'autocomplete-item';
                            const region = place.adminName1 ? `${place.adminName1}, ` : '';
                            li.innerText = `${place.name}, ${region}${place.countryName}`;

                            li.addEventListener('click', () => {
                                cityField.value = place.name;
                                selectedCountry = place.countryName; // Salva o país invisivelmente
                                suggestionList.innerHTML = '';
                                hideError();
                            });

                            suggestionList.appendChild(li);
                        });
                    }
                } catch (error) {
                    console.error("Erro na GeoNames API:", error);
                }
            }, 350);
        });

        document.addEventListener('click', (e) => {
            if (e.target !== cityField) suggestionList.innerHTML = '';
        });
    }
});