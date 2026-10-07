import { describe, it, expect } from 'vitest';

describe('Regras de Validação do Cadastro (Sonarfy Frontend)', () => {
    const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*(?:\s[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*)*$/;
    const HANDLE_REGEX = /^[a-zA-Z0-9_.-]+$/;
    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const CITY_REGEX = /^[a-zA-ZÀ-ÿ\s.'-]+$/;

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

    describe('Validação de Nome e Sobrenome', () => {
        it('deve aceitar nomes válidos com acentos e espaços', () => {
            expect(NAME_REGEX.test('Pablo')).toBe(true);
            expect(NAME_REGEX.test('João Vitor')).toBe(true);
            expect(NAME_REGEX.test("D'Ávila")).toBe(true);
            expect(NAME_REGEX.test('Jean-Luc')).toBe(true);
        });

        it('deve rejeitar nomes com números ou caracteres inválidos', () => {
            expect(NAME_REGEX.test('Pablo123')).toBe(false);
            expect(NAME_REGEX.test('Pablo @silva')).toBe(false);
            expect(NAME_REGEX.test('Pablo_Silva')).toBe(false);
        });
    });

    describe('Validação de Handle (Nome de Usuário)', () => {
        it('deve aceitar handles alfanuméricos com ponto, hífen e underscore', () => {
            expect(HANDLE_REGEX.test('pablo')).toBe(true);
            expect(HANDLE_REGEX.test('pablo_carmo')).toBe(true);
            expect(HANDLE_REGEX.test('user.123')).toBe(true);
            expect(HANDLE_REGEX.test('dev-master')).toBe(true);
        });

        it('deve rejeitar espaços ou símbolos não permitidos', () => {
            expect(HANDLE_REGEX.test('pablo carmo')).toBe(false);
            expect(HANDLE_REGEX.test('pablo@carmo')).toBe(false);
            expect(HANDLE_REGEX.test('pablo!')).toBe(false);
        });
    });

    describe('Validação de E-mail', () => {
        it('deve aceitar e-mails válidos', () => {
            expect(EMAIL_REGEX.test('usuario@sonarfy.com')).toBe(true);
            expect(EMAIL_REGEX.test('pablo.carmo+test@gmail.com.br')).toBe(true);
        });

        it('deve rejeitar e-mails sem domínio ou inválidos', () => {
            expect(EMAIL_REGEX.test('usuario@')).toBe(false);
            expect(EMAIL_REGEX.test('usuario@dominio')).toBe(false);
            expect(EMAIL_REGEX.test('usuario.com')).toBe(false);
            expect(EMAIL_REGEX.test('usuario @dominio.com')).toBe(false);
        });
    });

    describe('Validação de Data de Nascimento e Idade Mínima (13 anos)', () => {
        it('deve rejeitar datas futuras ou no mesmo dia', () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const str = tomorrow.toISOString().split('T')[0];
            expect(validateBirthDate(str).valid).toBe(false);
        });

        it('deve rejeitar usuários com menos de 13 anos', () => {
            const tenYearsAgo = new Date();
            tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
            const str = tenYearsAgo.toISOString().split('T')[0];
            const result = validateBirthDate(str);
            expect(result.valid).toBe(false);
            expect(result.message).toContain('13 anos');
        });

        it('deve aceitar usuários com 13 anos ou mais', () => {
            const twentyYearsAgo = new Date();
            twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
            const str = twentyYearsAgo.toISOString().split('T')[0];
            expect(validateBirthDate(str).valid).toBe(true);
        });
    });

    describe('Validação de Senha (Checklist de Segurança)', () => {
        function validatePasswordRules(val) {
            return {
                hasLength: val.length >= 8,
                hasUppercase: /[A-Z]/.test(val),
                hasNumber: /[0-9]/.test(val),
                hasSpecial: /[!@#$%^&*(),.?":{}|<>_+\-=\\[\]\\]/.test(val),
            };
        }

        it('deve identificar cada regra de segurança da senha', () => {
            const weak = validatePasswordRules('abc');
            expect(weak.hasLength).toBe(false);
            expect(weak.hasUppercase).toBe(false);
            expect(weak.hasNumber).toBe(false);
            expect(weak.hasSpecial).toBe(false);

            const strong = validatePasswordRules('Senha@123');
            expect(strong.hasLength).toBe(true);
            expect(strong.hasUppercase).toBe(true);
            expect(strong.hasNumber).toBe(true);
            expect(strong.hasSpecial).toBe(true);
        });
    });
});
