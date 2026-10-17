document.addEventListener('DOMContentLoaded', () => {
    const el = id => document.getElementById(id);
    let user = null;
    let party = null;
    let attendees = [];
    let authMode = 'login';

    async function api(path, options = {}) {
        const response = await fetch(`/api/${path}`, {
            ...options,
            headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        const result = await response.json();
        if (!response.ok) {
            const error = new Error(result.error || 'Anfrage fehlgeschlagen.');
            error.status = response.status;
            throw error;
        }
        return result;
    }

    function message(id, text, type = 'error') {
        const target = el(id);
        target.textContent = text;
        target.className = text ? `message ${type}` : 'hidden message';
    }

    function updatePasswordFeedback() {
        const password = el('password');
        const value = password.value;
        const checks = [
            ['requireLength', value.length >= 12],
            ['requireUpper', /\p{Lu}/u.test(value)],
            ['requireLower', /\p{Ll}/u.test(value)],
            ['requireNumber', /\p{Nd}/u.test(value)],
            ['requireSpecial', /[^\p{L}\p{N}\s]/u.test(value)]
        ];
        let fulfilled = 0;
        for (const [id, met] of checks) {
            el(id).classList.toggle('is-met', met);
            if (met) fulfilled++;
        }
        const level = !value ? 'empty' : fulfilled === 5 ? 'strong' : fulfilled >= 3 ? 'medium' : 'weak';
        const label = { empty: 'Noch kein Passwort', weak: 'Schwach', medium: 'Mittel', strong: 'Stark' }[level];
        el('passwordStrength').textContent = `Passwortstärke: ${label}`;
        el('strengthFill').style.width = `${fulfilled * 20}%`;
        el('strengthFill').dataset.level = level;
        password.setCustomValidity(authMode === 'register' && value && fulfilled !== 5
            ? 'Das Passwort benötigt mindestens 12 Zeichen, Groß- und Kleinbuchstaben, eine Zahl und ein Sonderzeichen.' : '');
        updateConfirmation();
    }

    function updateConfirmation() {
        const confirmation = el('confirmPassword');
        const mismatch = authMode === 'register' && Boolean(confirmation.value) && confirmation.value !== el('password').value;
        confirmation.setCustomValidity(mismatch ? 'Die Passwörter stimmen nicht überein.' : '');
        const hint = el('confirmHint');
        hint.textContent = !confirmation.value ? '' : mismatch
            ? 'Die Passwörter stimmen nicht überein.' : 'Die Passwörter stimmen überein.';
        hint.classList.toggle('hidden', !confirmation.value);
        hint.classList.toggle('is-error', mismatch);
        hint.classList.toggle('is-success', Boolean(confirmation.value) && !mismatch);
    }

    function setAuthMode(mode) {
        if (authMode !== mode) {
            el('password').value = '';
            el('confirmPassword').value = '';
        }
        authMode = mode;
        const registering = mode === 'register';
        el('loginModeBtn').setAttribute('aria-pressed', String(!registering));
        el('registerModeBtn').setAttribute('aria-pressed', String(registering));
        el('authTitle').textContent = registering ? 'Schön, dass du dabei bist' : 'Willkommen zurück';
        el('authDescription').textContent = registering
            ? 'Erstelle ein Konto, um deine Teilnahme einzutragen.'
            : 'Mit deinem Konto kannst du deine Rückmeldung verwalten.';
        el('authSubmitBtn').textContent = registering ? 'Konto erstellen' : 'Anmelden';
        el('registrationFields').classList.toggle('hidden', !registering);
        el('password').autocomplete = registering ? 'new-password' : 'current-password';
        el('password').minLength = registering ? 12 : 0;
        if (registering) el('password').setAttribute('aria-describedby', 'passwordStrength');
        else el('password').removeAttribute('aria-describedby');
        el('confirmPassword').disabled = !registering;
        el('confirmPassword').required = registering;
        updatePasswordFeedback();
        message('authMessage', '');
    }

    function showApp() {
        el('authContainer').classList.toggle('hidden', Boolean(user));
        el('rsvpContainer').classList.toggle('hidden', !user);
        document.title = user ? 'Grillabend – Deine Rückmeldung' : 'Grillabend – Anmeldung';
        if (!user) {
            el('deleteModal').classList.add('hidden');
            el('showName').checked = false;
            message('visibilityMessage', '');
            if (el('settingsDialog').open) el('settingsDialog').close();
            return;
        }
        el('loggedInUser').textContent = user.username;
        el('adminBtn').classList.toggle('hidden', !user.is_admin);
        el('showName').checked = user.show_name;
    }

    function showParty() {
        if (!party) return;
        el('displayDate').textContent = party.date || 'Noch nicht festgelegt';
        el('displayLocationName').textContent = party.location_name || 'Noch nicht festgelegt';
        el('displayLocationAddress').textContent = party.location_address;
        const link = el('displayMapsLink');
        let safeLink = '';
        try {
            const url = new URL(party.maps_url);
            if (url.protocol === 'https:' && ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl'].includes(url.hostname)) safeLink = url.href;
        } catch { /* Existing data may not contain a valid link. */ }
        link.classList.toggle('hidden', !safeLink);
        if (safeLink) link.href = safeLink;
        else link.removeAttribute('href');

        const hasPin = Number.isFinite(party.latitude) && Number.isFinite(party.longitude);
        const address = party.location_address.trim();
        el('mapSection').classList.toggle('hidden', !hasPin && !address);
        if (hasPin) el('mapFrame').src = `https://www.google.com/maps?q=${party.latitude},${party.longitude}&output=embed`;
        else if (address) el('mapFrame').src = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
        else el('mapFrame').removeAttribute('src');
        for (const key of ['info', 'rules']) {
            el(key === 'info' ? 'displayInfo' : 'displayRules').textContent = party[key];
            el(key === 'info' ? 'infoSection' : 'rulesSection').classList.toggle('hidden', !party[key]);
        }
    }

    function updateChoices() {
        if (!user || !party) return;
        const attendance = document.querySelector('input[name="kommt"]:checked')?.value;
        const existing = attendees.find(row => row.is_self === 1);
        const others = attendees.filter(row => row.is_self !== 1 && row.kommt === 'Ja');
        const cabinFull = others.filter(row => row.huette === 'Ja').length >= party.max_cabin_capacity;
        const luftFull = others.filter(row => row.huette === 'Ja' && row.luftmatratze === 'Ja').length >= party.max_luftmatratze;
        const bettzeugFull = others.filter(row => row.huette === 'Ja' && row.bettzeug === 'Ja').length >= party.max_bettzeug;
        const canBook = attendance === 'Ja';
        el('huette_ja').disabled = !canBook || (cabinFull && existing?.huette !== 'Ja');
        el('huette_nein').disabled = !canBook;
        el('huetteVollHint').classList.toggle('hidden', !cabinFull);
        el('vielleichtHint').classList.toggle('hidden', attendance !== 'Vielleicht');
        el('cabinGroup').classList.toggle('disabled-group', !canBook);
        if (!canBook) el('huette_nein').checked = true;
        const sleeps = canBook && el('huette_ja').checked;
        el('luftmatratzeGroup').classList.toggle('hidden', !sleeps);
        el('bettzeugGroup').classList.toggle('hidden', !sleeps);
        el('luftmatratze_ja').disabled = !sleeps || (luftFull && existing?.luftmatratze !== 'Ja');
        el('bettzeug_ja').disabled = !sleeps || (bettzeugFull && existing?.bettzeug !== 'Ja');
        el('luftmatratzeVollHint').classList.toggle('hidden', !luftFull);
        el('bettzeugVollHint').classList.toggle('hidden', !bettzeugFull);
        if (!sleeps) { el('luftmatratze_nein').checked = true; el('bettzeug_nein').checked = true; }
    }

    function addBadge(container, label, color) {
        const badge = document.createElement('span');
        badge.className = `badge ${color}`;
        badge.textContent = label;
        container.append(badge);
    }

    function showAttendees(resetForm = true) {
        const list = el('attendeeList');
        list.replaceChildren();
        for (const person of attendees) {
            const item = document.createElement('li');
            item.className = `attendee-item${person.is_self === 1 ? ' is-current' : ''}`;
            const block = document.createElement('div');
            block.className = 'attendee-info';
            const name = document.createElement('span');
            name.className = 'attendee-name';
            name.textContent = person.is_self === 1 ? `${person.username} (Du)` : person.username;
            const badges = document.createElement('div');
            badges.className = 'attendee-badges';
            addBadge(badges, person.kommt, person.kommt === 'Ja' ? 'ja' : person.kommt === 'Nein' ? 'nein' : 'vielleicht');
            if (person.kommt === 'Ja' && person.huette === 'Ja') {
                addBadge(badges, '🛏️ Hütte', 'huette');
                if (person.luftmatratze === 'Ja') addBadge(badges, '🛌 Luftmatratze', 'huette');
                if (person.bettzeug === 'Ja') addBadge(badges, '🧺 Bettzeug', 'huette');
            }
            block.append(name, badges);
            item.append(block);
            list.append(item);
        }
        if (!attendees.length) {
            const empty = document.createElement('li');
            empty.className = 'attendee-item';
            empty.textContent = 'Noch keine Einträge.';
            list.append(empty);
        }
        el('count_ja').textContent = attendees.filter(row => row.kommt === 'Ja').length;
        el('count_vielleicht').textContent = attendees.filter(row => row.kommt === 'Vielleicht').length;
        el('count_huette').textContent = `${attendees.filter(row => row.kommt === 'Ja' && row.huette === 'Ja').length}/${party.max_cabin_capacity}`;
        el('count_luftmatratze').textContent = `${attendees.filter(row => row.kommt === 'Ja' && row.huette === 'Ja' && row.luftmatratze === 'Ja').length}/${party.max_luftmatratze}`;
        el('count_bettzeug').textContent = `${attendees.filter(row => row.kommt === 'Ja' && row.huette === 'Ja' && row.bettzeug === 'Ja').length}/${party.max_bettzeug}`;
        const existing = attendees.find(row => row.is_self === 1);
        el('deleteBtn').classList.toggle('hidden', !existing);
        el('submitBtn').textContent = existing ? 'Änderungen speichern' : 'Antwort speichern';
        if (resetForm) {
            el('rsvpForm').reset();
            if (existing) {
                el(existing.kommt === 'Ja' ? 'kommt_ja' : existing.kommt === 'Nein' ? 'kommt_nein' : 'kommt_vielleicht').checked = true;
                el(existing.huette === 'Ja' ? 'huette_ja' : 'huette_nein').checked = true;
                el(existing.luftmatratze === 'Ja' ? 'luftmatratze_ja' : 'luftmatratze_nein').checked = true;
                el(existing.bettzeug === 'Ja' ? 'bettzeug_ja' : 'bettzeug_nein').checked = true;
            }
        }
        updateChoices();
    }

    async function reload() {
        [party, attendees] = await Promise.all([api('party-info'), api('attendees')]);
        showParty();
        showAttendees();
    }

    async function authenticate() {
        if (authMode === 'register') updatePasswordFeedback();
        if (!el('authForm').reportValidity()) return;
        const path = authMode;
        const submit = el('authSubmitBtn');
        submit.disabled = true;
        el('loginModeBtn').disabled = true;
        el('registerModeBtn').disabled = true;
        submit.textContent = path === 'register' ? 'Konto wird erstellt…' : 'Anmeldung läuft…';
        try {
            user = await api(path, { method: 'POST', body: { username: el('username').value.trim(), password: el('password').value } });
            el('password').value = '';
            el('confirmPassword').value = '';
            showApp();
            await reload();
            message('authMessage', '');
        } catch (error) { message(user ? 'rsvpMessage' : 'authMessage', error.message); }
        finally {
            submit.disabled = false;
            el('loginModeBtn').disabled = false;
            el('registerModeBtn').disabled = false;
            submit.textContent = path === 'register' ? 'Konto erstellen' : 'Anmelden';
        }
    }

    el('authForm').addEventListener('submit', event => { event.preventDefault(); authenticate(); });
    el('loginModeBtn').addEventListener('click', () => setAuthMode('login'));
    el('registerModeBtn').addEventListener('click', () => setAuthMode('register'));
    el('password').addEventListener('input', updatePasswordFeedback);
    el('confirmPassword').addEventListener('input', updateConfirmation);
    const settingsDialog = el('settingsDialog');
    el('settingsToggle').addEventListener('click', () => {
        if (!user) return;
        el('newUsername').value = user.username;
        for (const id of ['visibilityMessage', 'usernameMessage', 'passwordMessage']) message(id, '');
        settingsDialog.showModal();
        el('settingsToggle').setAttribute('aria-expanded', 'true');
    });
    el('closeSettings').addEventListener('click', () => settingsDialog.close());
    settingsDialog.addEventListener('click', event => {
        if (event.target !== settingsDialog) return;
        const bounds = settingsDialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) settingsDialog.close();
    });
    settingsDialog.addEventListener('close', () => {
        el('settingsToggle').setAttribute('aria-expanded', 'false');
        el('usernameForm').reset();
        el('passwordForm').reset();
        el('repeatSettingsPassword').setCustomValidity('');
        if (user) el('settingsToggle').focus();
    });
    el('showName').addEventListener('change', async () => {
        const checkbox = el('showName');
        const currentUser = user;
        const showName = checkbox.checked;
        checkbox.disabled = true;
        try {
            const saved = await api('profile/visibility', { method: 'PUT', body: { show_name: showName } });
            if (user !== currentUser) return;
            user.show_name = saved.show_name;
            attendees = await api('attendees');
            showAttendees(false);
            message('visibilityMessage', 'Namensanzeige gespeichert.', 'success');
        } catch (error) {
            if (user === currentUser) {
                checkbox.checked = user.show_name;
                message('visibilityMessage', error.message);
            }
        } finally { checkbox.disabled = false; }
    });
    el('usernameForm').addEventListener('submit', async event => {
        event.preventDefault();
        const button = el('saveUsername');
        button.disabled = true;
        try {
            const changed = await api('profile/username', { method: 'PUT', body: {
                username: el('newUsername').value.trim(), current_password: el('usernamePassword').value
            } });
            user.username = changed.username;
            el('loggedInUser').textContent = changed.username;
            el('newUsername').value = changed.username;
            attendees = await api('attendees');
            showAttendees(false);
            message('usernameMessage', 'Benutzername geändert.', 'success');
        } catch (error) { message('usernameMessage', error.message); }
        finally {
            el('usernamePassword').value = '';
            button.disabled = false;
        }
    });
    el('repeatSettingsPassword').addEventListener('input', () => el('repeatSettingsPassword').setCustomValidity(''));
    el('newSettingsPassword').addEventListener('input', () => el('repeatSettingsPassword').setCustomValidity(''));
    el('passwordForm').addEventListener('submit', async event => {
        event.preventDefault();
        const confirmation = el('repeatSettingsPassword');
        confirmation.setCustomValidity(confirmation.value === el('newSettingsPassword').value ? '' : 'Die neuen Passwörter stimmen nicht überein.');
        if (!el('passwordForm').reportValidity()) return;
        const button = el('savePassword');
        button.disabled = true;
        try {
            await api('profile/password', { method: 'PUT', body: {
                current_password: el('currentSettingsPassword').value, new_password: el('newSettingsPassword').value
            } });
            el('passwordForm').reset();
            message('passwordMessage', 'Passwort geändert. Andere Sitzungen wurden beendet.', 'success');
        } catch (error) {
            el('currentSettingsPassword').value = '';
            el('newSettingsPassword').value = '';
            confirmation.value = '';
            message('passwordMessage', error.message);
        } finally { button.disabled = false; }
    });
    el('logoutBtn').addEventListener('click', async () => {
        try {
            await api('logout', { method: 'POST' });
        } catch (error) {
            if (error.status !== 401) return message('rsvpMessage', error.message);
        }
        user = null;
        party = null;
        attendees = [];
        el('mapFrame').removeAttribute('src');
        el('password').value = '';
        setAuthMode('login');
        message('rsvpMessage', '');
        showApp();
    });
    document.querySelectorAll('input[name="kommt"], input[name="huette"]').forEach(input => input.addEventListener('change', updateChoices));
    el('rsvpForm').addEventListener('submit', async event => {
        event.preventDefault();
        const kommt = document.querySelector('input[name="kommt"]:checked')?.value;
        if (!kommt) return message('rsvpMessage', 'Bitte Teilnahme wählen.');
        const huette = kommt === 'Ja' ? document.querySelector('input[name="huette"]:checked')?.value : 'Nein';
        if (!huette) return message('rsvpMessage', 'Bitte Hüttenschlaf wählen.');
        const luftmatratze = huette === 'Ja' && el('luftmatratze_ja').checked ? 'Ja' : 'Nein';
        const bettzeug = huette === 'Ja' && el('bettzeug_ja').checked ? 'Ja' : 'Nein';
        try {
            await api('rsvp', { method: 'POST', body: { kommt, huette, luftmatratze, bettzeug } });
            await reload();
            message('rsvpMessage', 'Eintrag gespeichert.', 'success');
        } catch (error) { message('rsvpMessage', error.message); }
    });
    el('deleteBtn').addEventListener('click', () => {
        el('deleteModal').classList.remove('hidden');
        el('cancelDeleteBtn').focus();
    });
    el('cancelDeleteBtn').addEventListener('click', () => {
        el('deleteModal').classList.add('hidden');
        el('deleteBtn').focus();
    });
    el('confirmDeleteBtn').addEventListener('click', async () => {
        try {
            await api('rsvp', { method: 'DELETE' });
            el('deleteModal').classList.add('hidden');
            await reload();
            message('rsvpMessage', 'Eintrag gelöscht.', 'success');
        } catch (error) { message('rsvpMessage', error.message); }
    });
    api('session').then(async result => {
        if (!result.username) return;
        user = result;
        showApp();
        try { await reload(); }
        catch { user = null; showApp(); message('authMessage', 'Daten konnten nicht geladen werden.'); }
    }).catch(() => message('authMessage', 'Verbindung zum Server fehlgeschlagen.'));
});
