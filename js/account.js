document.addEventListener('DOMContentLoaded', async () => {

    const editProfileBtn = document.getElementById('editProfileBtn');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    const accountForm = document.getElementById('accountForm');
    const feedbackMessage = document.getElementById('feedbackMessage');

    const reqChangeEmailBtn = document.getElementById('reqChangeEmailBtn');
    const emailTimerSpan = document.getElementById('emailTimer');

    const reqChangePwdBtn = document.getElementById('reqChangePwdBtn');
    const pwdTimerSpan = document.getElementById('pwdTimer');

    const actionModal = document.getElementById('actionModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const closeModalBtn = document.getElementById('closeModalBtn');

    const birthDateField = document.getElementById('birthDateField');
    if (birthDateField) {
        const today = new Date();
        const maxDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
        const yyyy = maxDate.getFullYear();
        const mm = String(maxDate.getMonth() + 1).padStart(2, '0');
        const dd = String(maxDate.getDate()).padStart(2, '0');
        birthDateField.max = `${yyyy}-${mm}-${dd}`;
        birthDateField.min = '1900-01-01';
    }

    const editableFields = [
        document.getElementById('nameField'),
        document.getElementById('surnameField'),
        birthDateField,
        document.getElementById('cityField')
    ];

    let isEditing = false;

    // Fetch da API (ex: GET /api/users/me)
    const loadUserData = () => {
        document.getElementById('nameField').value = "Name";
        document.getElementById('surnameField').value = "Surname";
        // Removemos o @ do valor bruto, pois o wrapper visual gerencia o prefixo
        document.getElementById('handleField').value = "username";
        document.getElementById('emailField').value = "your@email.com";
        document.getElementById('birthDateField').value = "2000-01-01";
        document.getElementById('countryField').value = "Country";
        document.getElementById('cityField').value = "City";
    };

    loadUserData();

    // Controle de Edição
    editProfileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        isEditing = !isEditing;

        if (isEditing) {
            editableFields.forEach(field => field.removeAttribute('disabled'));
            editableFields[0].focus();

            editProfileBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            editProfileBtn.classList.add('editing');
            saveProfileBtn.style.display = 'block';
        } else {
            editableFields.forEach(field => field.setAttribute('disabled', 'true'));
            editProfileBtn.innerHTML = '<i class="fa-solid fa-pencil"></i>';
            editProfileBtn.classList.remove('editing');
            saveProfileBtn.style.display = 'none';
            loadUserData();
        }
    });

    accountForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        feedbackMessage.innerText = "Perfil atualizado com sucesso!";
        feedbackMessage.className = `feedback-message feedback-success`;
        feedbackMessage.style.display = 'block';
        setTimeout(() => feedbackMessage.style.display = 'none', 5000);
        editProfileBtn.click();
    });

    function showModal(title, message) {
        modalTitle.innerText = title;
        modalMessage.innerText = message;
        actionModal.style.display = 'flex';
    }

    closeModalBtn.addEventListener('click', () => {
        actionModal.style.display = 'none';
    });

    function startCooldown(buttonElement, timerElement) {
        buttonElement.disabled = true;
        let timeLeft = 60;
        timerElement.innerText = `${timeLeft}s`;

        const countdown = setInterval(() => {
            timeLeft--;
            timerElement.innerText = `${timeLeft}s`;

            if (timeLeft <= 0) {
                clearInterval(countdown);
                timerElement.innerText = '';
                buttonElement.disabled = false;
                buttonElement.innerHTML = buttonElement.dataset.originalText;
            }
        }, 1000);
    }

    reqChangeEmailBtn.addEventListener('click', async () => {
        reqChangeEmailBtn.dataset.originalText = reqChangeEmailBtn.innerHTML;
        reqChangeEmailBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        setTimeout(() => {
            showModal("Link Enviado", "Enviamos um link de verificação para o seu e-mail atual. Clique nele para redefinir seu e-mail de acesso na plataforma.");
            startCooldown(reqChangeEmailBtn, emailTimerSpan);
        }, 800);
    });

    reqChangePwdBtn.addEventListener('click', async () => {
        reqChangePwdBtn.dataset.originalText = reqChangePwdBtn.innerHTML;
        reqChangePwdBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        setTimeout(() => {
            showModal("Redefinição Solicitada", "As instruções para redefinição de senha foram enviadas. Verifique a caixa de entrada do seu e-mail associado a esta conta.");
            startCooldown(reqChangePwdBtn, pwdTimerSpan);
        }, 800);
    });
});