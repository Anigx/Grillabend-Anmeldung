document.addEventListener('DOMContentLoaded', () => {
    const el = id => document.getElementById(id);

    function message(text, type = 'error') {
        const target = el('setupMessage');
        target.textContent = text;
        target.className = text ? `message ${type}` : 'hidden message';
    }

    function passwordChecks(value) {
        return [
            ['requireLength', value.length >= 12],
            ['requireUpper', /\p{Lu}/u.test(value)],
            ['requireLower', /\p{Ll}/u.test(value)],
            ['requireNumber', /\p{Nd}/u.test(value)],
            ['requireSpecial', /[^\p{L}\p{N}\s]/u.test(value)]
        ];
    }

    function updatePasswordFeedback() {
        const password = el('password');
        const checks = passwordChecks(password.value);
        let fulfilled = 0;
        for (const [id, met] of checks) {
            el(id).classList.toggle('is-met', met);
            if (met) fulfilled++;
        }
        const level = !password.value ? 'empty' : fulfilled === 5 ? 'strong' : fulfilled >= 3 ? 'medium' : 'weak';
        const label = { empty: 'Noch kein Passwort', weak: 'Schwach', medium: 'Mittel', strong: 'Stark' }[level];
        el('passwordStrength').textContent = `Passwortstärke: ${label}`;
        el('strengthFill').style.width = `${fulfilled * 20}%`;
        el('strengthFill').dataset.level = level;
        password.setCustomValidity(password.value && fulfilled !== 5
            ? 'Das Passwort benötigt mindestens 12 Zeichen, Groß- und Kleinbuchstaben, eine Zahl und ein Sonderzeichen.' : '');
        updateConfirmation();
    }

    function updateConfirmation() {
        const confirmation = el('confirmPassword');
        const mismatch = Boolean(confirmation.value) && confirmation.value !== el('password').value;
        confirmation.setCustomValidity(mismatch ? 'Die Passwörter stimmen nicht überein.' : '');
        const hint = el('confirmHint');
        hint.textContent = !confirmation.value ? '' : mismatch
            ? 'Die Passwörter stimmen nicht überein.' : 'Die Passwörter stimmen überein.';
        hint.classList.toggle('hidden', !confirmation.value);
        hint.classList.toggle('is-error', mismatch);
        hint.classList.toggle('is-success', Boolean(confirmation.value) && !mismatch);
    }

    el('password').addEventListener('input', updatePasswordFeedback);
    el('confirmPassword').addEventListener('input', updateConfirmation);

    el('setupForm').addEventListener('submit', async event => {
        event.preventDefault();
        updatePasswordFeedback();
        if (!el('setupForm').reportValidity()) return;
        const button = el('setupSubmitBtn');
        button.disabled = true;
        button.textContent = 'Konto wird angelegt…';
        try {
            const response = await fetch('/api/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: el('username').value.trim(), password: el('password').value })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Anlegen fehlgeschlagen.');
            el('password').value = '';
            el('confirmPassword').value = '';
            message('Admin-Konto angelegt. Weiter zur Anmeldung …', 'success');
            window.location.assign('/');
        } catch (error) {
            message(error.message);
            button.disabled = false;
            button.textContent = 'Admin-Konto anlegen';
        }
    });
});
