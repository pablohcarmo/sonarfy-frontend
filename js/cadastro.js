document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    const nameField = document.getElementById('nameField');
    const surnameField = document.getElementById('surnameField');
    const passwordField = document.getElementById('passwordField');
    const confirmPasswordField = document.getElementById('confirmPasswordField');
    const birthDateField = document.getElementById('birthDateField');
    const allInputs = document.querySelectorAll('.login-field');

    // Regras do Checklist de Senha
    const reqLength = document.getElementById('req-length');
    const reqUppercase = document.getElementById('req-uppercase');
    const reqNumber = document.getElementById('req-number');
    const reqSpecial = document.getElementById('req-special');

    // Bloqueia datas futuras no calendário
    if (birthDateField) {
        const today = new Date();
        today.setDate(today.getDate() - 1);
        birthDateField.max = today.toISOString().split("T")[0];
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

    // REGRA 2: Bloqueia Números no Nome e Sobrenome
    const numberRegex = /[0-9]/g;
    [nameField, surnameField].forEach(field => {
        if (field) {
            field.addEventListener('input', function() {
                if (numberRegex.test(this.value)) {
                    this.value = this.value.replace(numberRegex, '');
                }
            });
        }
    });

    // REGRA 3: Validação Dinâmica da Senha (Checklist)
    let isPasswordValid = false;

    function updateChecklistItem(element, isValid) {
        if (isValid) {
            element.classList.replace('invalid', 'valid');
            element.querySelector('i').className = 'fa-solid fa-check';
        } else {
            element.classList.replace('valid', 'invalid');
            element.querySelector('i').className = 'fa-solid fa-xmark';
        }
    }

    passwordField.addEventListener('input', function() {
        const val = this.value;

        const hasLength = val.length >= 6;
        const hasUppercase = /[A-Z]/.test(val);
        const hasNumber = /[0-9]/.test(val);
        const hasSpecial = /[!@#$%^&*(),.?":{}|<>_+\-=\\[\]\\]/.test(val);

        updateChecklistItem(reqLength, hasLength);
        updateChecklistItem(reqUppercase, hasUppercase);
        updateChecklistItem(reqNumber, hasNumber);
        updateChecklistItem(reqSpecial, hasSpecial);

        // A senha só é válida se cumprir os 4 requisitos
        isPasswordValid = hasLength && hasUppercase && hasNumber && hasSpecial;
    });

    if (registerForm) {
        registerForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            errorMessage.style.display = 'none';
            successMessage.style.display = 'none';

            // Trava de segurança: Se o checklist não estiver 100% verde, bloqueia o envio
            if (!isPasswordValid) {
                errorMessage.innerText = "A senha não atende a todos os requisitos de segurança.";
                errorMessage.style.display = 'block';
                return;
            }

            if (passwordField.value !== confirmPasswordField.value) {
                errorMessage.innerText = "As senhas não coincidem.";
                errorMessage.style.display = 'block';
                return;
            }

            const payload = {
                name: nameField.value,
                surname: surnameField.value,
                handle: document.getElementById('handleField').value,
                email: document.getElementById('emailField').value,
                password: passwordField.value,
                birthDate: birthDateField.value,
                city: document.getElementById('cityField').value,
                country: document.getElementById('countryField').value
            };

            try {
                const response = await fetch(`${API_BASE_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    registerForm.reset();
                    // Reseta visualmente o checklist
                    [reqLength, reqUppercase, reqNumber, reqSpecial].forEach(el => updateChecklistItem(el, false));
                    isPasswordValid = false;

                    successMessage.innerText = "Conta criada com sucesso! Enviamos um link de confirmação para o seu e-mail.";
                    successMessage.style.display = 'block';
                } else {
                    const data = await response.json().catch(() => ({}));
                    errorMessage.innerText = data.message || "Erro ao realizar o cadastro. E-mail ou handle já em uso.";
                    errorMessage.style.display = 'block';
                }
            } catch (error) {
                console.error("Erro de conexão", error);
                errorMessage.innerText = "Erro de conexão com o servidor.";
                errorMessage.style.display = 'block';
            }
        });
    }

    // Autocompletar de Cidades com GeoNames API
    const cityField = document.getElementById('cityField');
    const countryField = document.getElementById('countryField');
    let geocodeTimeout;

    if (cityField) {
        // Envolve o input de cidade na div relativa
        const wrapper = document.createElement('div');
        wrapper.className = 'autocomplete-wrapper';
        cityField.parentNode.insertBefore(wrapper, cityField);
        wrapper.appendChild(cityField);

        // Cria a lista (ul) que receberá os resultados
        const suggestionList = document.createElement('ul');
        suggestionList.className = 'autocomplete-list';
        wrapper.appendChild(suggestionList);

        cityField.addEventListener('input', function() {
            clearTimeout(geocodeTimeout);
            const query = this.value.trim();
            suggestionList.innerHTML = ''; // Limpa a lista ao digitar

            // Só pesquisa se houver pelo menos 3 letras
            if (query.length < 3) return;

            geocodeTimeout = setTimeout(async () => {
                try {
                    // ATENÇÃO: Substitua 'demo' pelo seu nome de usuário criado no geonames.org
                    const username = 'demo';
                    // featureClass=P filtra estritamente por Cidades/Vilas
                    // Use a constante GEONAMES_USERNAME injetada pelo env.js
                    const url = `https://secure.geonames.org/searchJSON?name_startsWith=${query}&maxRows=5&featureClass=P&username=${GEONAMES_USERNAME}`;

                    const response = await fetch(url);
                    if (response.ok) {
                        const data = await response.json();

                        if (data.geonames && data.geonames.length > 0) {
                            data.geonames.forEach(place => {
                                const li = document.createElement('li');
                                li.className = 'autocomplete-item';

                                const region = place.adminName1 ? `${place.adminName1}, ` : '';
                                li.innerText = `${place.name}, ${region}${place.countryName}`;

                                li.addEventListener('click', () => {
                                    cityField.value = place.name;
                                    if (countryField) countryField.value = place.countryName;
                                    suggestionList.innerHTML = ''; // Fecha o menu após a seleção
                                });

                                suggestionList.appendChild(li);
                            });
                        }
                    }
                } catch (error) {
                    console.error("Erro ao buscar a cidade:", error);
                }
            }, 500);
        });

        // Oculta a lista se o usuário clicar fora do campo
        document.addEventListener('click', (e) => {
            if (e.target !== cityField) suggestionList.innerHTML = '';
        });
    }
});