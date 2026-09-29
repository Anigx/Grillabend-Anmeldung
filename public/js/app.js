document.addEventListener('DOMContentLoaded', () => {
    const el = id => document.getElementById(id);
    let user = null;
    let party = null;
    let attendees = [];

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

    function showApp() {
        el('authContainer').classList.toggle('hidden', Boolean(user));
        el('rsvpContainer').classList.toggle('hidden', !user);
        if (!user) {
            el('deleteModal').classList.add('hidden');
            return;
        }
        el('loggedInUser').textContent = `👤 ${user.username}`;
        el('adminBtn').classList.toggle('hidden', !user.is_admin);
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
        const existing = attendees.find(row => row.username === user.username);
        const others = attendees.filter(row => row.username !== user.username && row.kommt === 'Ja');
        const cabinFull = others.filter(row => row.huette === 'Ja').length >= party.max_cabin_capacity;
        const bedFull = others.filter(row => row.huette === 'Ja' && row.bettgarnitur === 'Ja').length >= party.max_bettgarnitur;
        const canBook = attendance === 'Ja';
        el('huette_ja').disabled = !canBook || (cabinFull && existing?.huette !== 'Ja');
        el('huette_nein').disabled = !canBook;
        el('huetteVollHint').classList.toggle('hidden', !cabinFull);
        el('vielleichtHint').classList.toggle('hidden', attendance !== 'Vielleicht');
        el('cabinGroup').classList.toggle('disabled-group', !canBook);
        if (!canBook) el('huette_nein').checked = true;
        const sleeps = canBook && el('huette_ja').checked;
        el('bettgarniturGroup').classList.toggle('hidden', !sleeps);
        el('bett_ja').disabled = !sleeps || (bedFull && existing?.bettgarnitur !== 'Ja');
        el('bettVollHint').classList.toggle('hidden', !bedFull);
        if (!sleeps) el('bett_nein').checked = true;
    }

    function addBadge(container, label, color) {
        const badge = document.createElement('span');
        badge.className = `badge ${color}`;
        badge.textContent = label;
        container.append(badge);
    }

    function showAttendees() {
        const list = el('attendeeList');
        list.replaceChildren();
        for (const person of attendees) {
            const item = document.createElement('li');
            item.className = `attendee-item${person.username === user.username ? ' is-current' : ''}`;
            const block = document.createElement('div');
            block.className = 'attendee-info';
            const name = document.createElement('span');
            name.className = 'attendee-name';
            name.textContent = person.username === user.username ? `${person.username} (Du)` : person.username;
            const badges = document.createElement('div');
            badges.className = 'attendee-badges';
            addBadge(badges, person.kommt, person.kommt === 'Ja' ? 'ja' : person.kommt === 'Nein' ? 'nein' : 'vielleicht');
            if (person.kommt === 'Ja' && person.huette === 'Ja') {
                addBadge(badges, '🛏️ Hütte', 'huette');
                if (person.bettgarnitur === 'Ja') addBadge(badges, '🛌 Bettgarnitur', 'huette');
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
        el('count_bettgarnitur').textContent = `${attendees.filter(row => row.kommt === 'Ja' && row.huette === 'Ja' && row.bettgarnitur === 'Ja').length}/${party.max_bettgarnitur}`;
        const existing = attendees.find(row => row.username === user.username);
        el('deleteBtn').classList.toggle('hidden', !existing);
        el('submitBtn').textContent = existing ? 'Eintrag ändern 📝' : 'Eintragen 🐾';
        el('rsvpForm').reset();
        if (existing) {
            el(existing.kommt === 'Ja' ? 'kommt_ja' : existing.kommt === 'Nein' ? 'kommt_nein' : 'kommt_vielleicht').checked = true;
            el(existing.huette === 'Ja' ? 'huette_ja' : 'huette_nein').checked = true;
            el(existing.bettgarnitur === 'Ja' ? 'bett_ja' : 'bett_nein').checked = true;
        }
        updateChoices();
    }

    async function reload() {
        [party, attendees] = await Promise.all([api('party-info'), api('attendees')]);
        showParty();
        showAttendees();
    }

    async function authenticate(path) {
        if (!el('authForm').reportValidity()) return;
        try {
            user = await api(path, { method: 'POST', body: { username: el('username').value.trim(), password: el('password').value } });
            el('password').value = '';
            showApp();
            await reload();
            message('authMessage', '');
        } catch (error) { message(user ? 'rsvpMessage' : 'authMessage', error.message); }
    }

    el('authForm').addEventListener('submit', event => { event.preventDefault(); authenticate('login'); });
    el('registerBtn').addEventListener('click', () => authenticate('register'));
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
        showApp();
    });
    document.querySelectorAll('input[name="kommt"], input[name="huette"]').forEach(input => input.addEventListener('change', updateChoices));
    el('rsvpForm').addEventListener('submit', async event => {
        event.preventDefault();
        const kommt = document.querySelector('input[name="kommt"]:checked')?.value;
        if (!kommt) return message('rsvpMessage', 'Bitte Teilnahme wählen.');
        const huette = kommt === 'Ja' ? document.querySelector('input[name="huette"]:checked')?.value : 'Nein';
        if (!huette) return message('rsvpMessage', 'Bitte Hüttenschlaf wählen.');
        const bettgarnitur = huette === 'Ja' && el('bett_ja').checked ? 'Ja' : 'Nein';
        try {
            await api('rsvp', { method: 'POST', body: { kommt, huette, bettgarnitur } });
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
