document.addEventListener('DOMContentLoaded', () => {
    const el = id => document.getElementById(id);
    const fields = {
        date: 'adminDate', location_name: 'adminLocationName', location_address: 'adminLocationAddress',
        maps_url: 'adminMapsUrl', max_cabin_capacity: 'adminMaxCabin', max_bettgarnitur: 'adminMaxBett',
        info: 'adminInfo', rules: 'adminRules'
    };
    const map = L.map('pinMap', { scrollWheelZoom: false }).setView([51.1657, 10.4515], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    }).addTo(map);
    L.DomEvent.disableClickPropagation(el('pinSearch'));
    L.DomEvent.disableScrollPropagation(el('pinSearch'));
    let marker = null;
    let selectedPin = null;
    let lastSearchAt = 0;

    function message(text, type = 'error') {
        el('adminMessage').textContent = text;
        el('adminMessage').className = text ? `message ${type}` : 'hidden message';
    }

    const columnHelp = {
        username: 'Registrierter Benutzername. Auch Konten ohne Teilnahmeantwort werden angezeigt.',
        kommt: 'Die aktuelle Teilnahmeantwort: Ja, Nein oder Vielleicht. „Keine Antwort“ bedeutet, dass noch kein Eintrag gespeichert wurde.',
        huette: 'Ob ein Schlafplatz in der Hütte gewünscht ist (Ja/Nein). Ohne Teilnahmeantwort steht hier „–“.',
        bettgarnitur: 'Ob eine Bettgarnitur gewünscht ist (Ja/Nein). Ohne Teilnahmeantwort steht hier „–“.',
        updated_at: 'Wann die Teilnahmeantwort zuletzt gespeichert oder geändert wurde. Ohne Antwort steht „–“. Das ist nicht das Registrierungsdatum.'
    };
    const helpTooltip = el('columnHelpTooltip');
    let activeHelp = null;
    function closeHelp() {
        if (!activeHelp) return;
        activeHelp.setAttribute('aria-expanded', 'false');
        activeHelp.removeAttribute('aria-describedby');
        helpTooltip.classList.add('hidden');
        activeHelp = null;
    }
    for (const button of document.querySelectorAll('.column-help')) {
        button.addEventListener('click', event => {
            event.stopPropagation();
            if (activeHelp === button) return closeHelp();
            closeHelp();
            activeHelp = button;
            helpTooltip.textContent = columnHelp[button.dataset.help];
            helpTooltip.classList.remove('hidden');
            button.setAttribute('aria-expanded', 'true');
            button.setAttribute('aria-describedby', helpTooltip.id);
            const rect = button.getBoundingClientRect();
            helpTooltip.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - helpTooltip.offsetWidth - 12))}px`;
            helpTooltip.style.top = `${rect.bottom + helpTooltip.offsetHeight + 12 > window.innerHeight ?
                Math.max(12, rect.top - helpTooltip.offsetHeight - 8) : rect.bottom + 8}px`;
        });
        button.addEventListener('blur', closeHelp);
    }
    document.addEventListener('click', closeHelp);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && activeHelp) {
            const button = activeHelp;
            closeHelp();
            button.focus();
        }
    });
    window.addEventListener('scroll', closeHelp, true);
    window.addEventListener('resize', closeHelp);

    const tabs = [el('eventTab'), el('usersTab')];
    function selectTab(tab, focus = false) {
        for (const choice of tabs) {
            const selected = choice === tab;
            choice.setAttribute('aria-selected', String(selected));
            choice.tabIndex = selected ? 0 : -1;
            el(choice.getAttribute('aria-controls')).classList.toggle('hidden', !selected);
        }
        if (focus) tab.focus();
        if (tab === el('eventTab')) {
            setExportOpen(false);
            window.requestAnimationFrame(() => map.invalidateSize());
        }
        else loadUsers();
    }

    for (const tab of tabs) {
        tab.addEventListener('click', () => selectTab(tab));
        tab.addEventListener('keydown', event => {
            const index = tabs.indexOf(tab);
            const target = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length] :
                event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length] :
                    event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : null;
            if (target) { event.preventDefault(); selectTab(target, true); }
        });
    }

    let users = [];
    let filteredUsers = [];
    let exportBusy = false;
    let exportNoticeTimer = null;
    const exportToggle = el('exportToggle');
    const exportOptions = el('exportOptions');
    function setExportOpen(open) {
        if (!open && exportOptions.contains(document.activeElement)) exportToggle.focus();
        exportOptions.classList.toggle('is-open', open);
        exportOptions.inert = !open;
        exportOptions.setAttribute('aria-hidden', String(!open));
        exportToggle.setAttribute('aria-expanded', String(open));
        exportToggle.setAttribute('aria-label', open ? 'Exportoptionen schließen' : 'Exportoptionen anzeigen');
        exportToggle.title = open ? 'Exportoptionen schließen' : 'Exportoptionen anzeigen';
    }
    exportToggle.addEventListener('click', () => setExportOpen(exportToggle.getAttribute('aria-expanded') !== 'true'));
    const exportButtons = [...document.querySelectorAll('[data-export]')];
    function updateExportButtons() {
        for (const button of exportButtons) button.disabled = exportBusy || !filteredUsers.length;
    }

    exportOptions.addEventListener('click', async event => {
        const button = event.target.closest('[data-export]');
        if (!button || exportBusy || !filteredUsers.length) return;
        const status = el('exportMessage');
        window.clearTimeout(exportNoticeTimer);
        exportNoticeTimer = null;
        exportBusy = true;
        updateExportButtons();
        status.textContent = 'Export wird erstellt …';
        status.className = 'form-note admin-export-status';
        try {
            await window.AdminExports.download(button.dataset.export, filteredUsers.slice());
            setExportOpen(false);
            status.textContent = 'Download gestartet.';
            status.className = 'message success admin-export-status';
            exportNoticeTimer = window.setTimeout(() => {
                status.textContent = '';
                status.className = 'hidden message admin-export-status';
                exportNoticeTimer = null;
            }, 3000);
        } catch (error) {
            status.textContent = error.message || 'Export fehlgeschlagen.';
            status.className = 'message error admin-export-status';
        } finally {
            exportBusy = false;
            updateExportButtons();
        }
    });

    function matchesChoice(value, choice) {
        return !choice || (choice === 'none' ? value === null : value === choice);
    }

    function renderUsers() {
        const name = el('userNameFilter').value.trim().toLocaleLowerCase('de-DE');
        filteredUsers = users.filter(user =>
            user.username.toLocaleLowerCase('de-DE').includes(name) &&
            matchesChoice(user.kommt, el('userAttendanceFilter').value) &&
            matchesChoice(user.huette, el('userCabinFilter').value) &&
            matchesChoice(user.bettgarnitur, el('userBeddingFilter').value));
        const body = el('usersTableBody');
        body.replaceChildren();
        for (const user of filteredUsers) {
            const row = document.createElement('tr');
            const values = [user.username, user.kommt || 'Keine Antwort', user.huette || '–', user.bettgarnitur || '–'];
            for (const value of values) {
                const cell = document.createElement('td');
                cell.textContent = value;
                if (value === 'Keine Antwort') cell.classList.add('no-answer');
                row.append(cell);
            }
            const dateCell = document.createElement('td');
            if (user.updated_at) {
                const time = document.createElement('time');
                time.dateTime = user.updated_at;
                const date = new Date(user.updated_at);
                time.textContent = Number.isNaN(date.getTime()) ? user.updated_at :
                    new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date);
                dateCell.append(time);
            } else dateCell.textContent = '–';
            row.append(dateCell);
            body.append(row);
        }
        el('usersMessage').textContent = !users.length ? 'Noch keine User vorhanden.' :
            filteredUsers.length ? `${filteredUsers.length} von ${users.length} Usern angezeigt` : 'Keine User für diese Filter gefunden.';
        updateExportButtons();
    }

    el('usersFilters').addEventListener('submit', event => event.preventDefault());
    el('usersFilters').addEventListener('input', renderUsers);
    el('usersFilters').addEventListener('change', renderUsers);
    el('resetUsersFilters').addEventListener('click', () => {
        el('usersFilters').reset();
        renderUsers();
    });

    async function loadUsers() {
        const status = el('usersMessage');
        status.textContent = 'Lade User …';
        status.className = 'form-note';
        filteredUsers = [];
        updateExportButtons();
        try {
            const response = await fetch('/api/admin/users');
            if (response.status === 401 || response.status === 403) {
                window.location.assign('/');
                return;
            }
            if (!response.ok) throw new Error('User konnten nicht geladen werden.');
            users = await response.json();
            renderUsers();
        } catch (error) {
            users = [];
            filteredUsers = [];
            el('usersTableBody').replaceChildren();
            status.textContent = error.message;
            status.className = 'message error';
            updateExportButtons();
        }
    }

    function showMapsLink() {
        let safeLink = '';
        try {
            const url = new URL(el('adminMapsUrl').value);
            if (url.protocol === 'https:' && ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl'].includes(url.hostname)) safeLink = url.href;
        } catch { /* Alt-Daten müssen keinen gültigen Link enthalten. */ }
        const link = el('previewMapsLink');
        link.classList.toggle('hidden', !safeLink);
        if (safeLink) link.href = safeLink;
        else link.removeAttribute('href');
    }

    function setPin(latitude, longitude, clearLink = false) {
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            selectedPin = { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) };
            const point = [selectedPin.latitude, selectedPin.longitude];
            if (marker) marker.setLatLng(point);
            else marker = L.circleMarker(point, { radius: 9, color: '#f0f0f5', weight: 2, fillColor: '#ff2a85', fillOpacity: 1 }).addTo(map);
            map.setView(point, Math.max(map.getZoom(), 15));
            el('pinStatus').textContent = `Pin: ${selectedPin.latitude}, ${selectedPin.longitude}`;
            el('adminMapsUrl').value = `https://www.google.com/maps?q=${selectedPin.latitude},${selectedPin.longitude}`;
        } else {
            selectedPin = null;
            if (marker) { marker.remove(); marker = null; }
            el('pinStatus').textContent = 'Noch kein Pin gesetzt.';
            if (clearLink) el('adminMapsUrl').value = '';
        }
        showMapsLink();
    }

    function show(data) {
        for (const [name, id] of Object.entries(fields)) el(id).value = data[name];
        setPin(data.latitude, data.longitude);
        window.requestAnimationFrame(() => map.invalidateSize());
        el('usedCabin').textContent = `${data.occupancy.cabin}/${data.max_cabin_capacity}`;
        el('usedBedding').textContent = `${data.occupancy.bedding}/${data.max_bettgarnitur}`;
        el('previewDate').textContent = data.date || 'Noch nicht festgelegt';
        el('previewLocation').textContent = data.location_name || 'Noch nicht festgelegt';
        el('previewAddress').textContent = data.location_address;
        el('previewInfo').textContent = data.info || 'Keine Informationen hinterlegt.';
        el('previewRules').textContent = data.rules || 'Keine Regeln hinterlegt.';

    }

    async function request(method, body) {
        const response = await fetch('/api/admin/party-info', {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined
        });
        const result = await response.json();
        if (response.status === 401 || response.status === 403) {
            window.location.assign('/');
            throw new Error('Admin-Anmeldung erforderlich.');
        }
        if (!response.ok) throw new Error(result.error || 'Anfrage fehlgeschlagen.');
        return result;
    }

    Promise.all([
        fetch('/api/session').then(response => response.json()),
        request('GET')
    ]).then(([session, party]) => {
        el('adminUser').textContent = session.username || '';
        show(party);
    }).catch(error => message(error.message));

    map.on('click', event => {
        setPin(event.latlng.lat, event.latlng.lng);
        message('Pin ausgewählt. Bitte Änderungen speichern.', 'success');
    });

    function searchMessage(text) {
        el('pinSearchStatus').textContent = text;
        el('pinSearchStatus').classList.toggle('hidden', !text);
    }

    async function searchPlace() {
        const query = el('pinSearchQuery').value.trim();
        if (query.length < 2 || query.length > 120) return searchMessage('Bitte mindestens 2 und höchstens 120 Zeichen eingeben.');
        const button = el('pinSearchBtn');
        if (button.disabled) return;
        if (Date.now() - lastSearchAt < 1100) return searchMessage('Bitte kurz warten und dann erneut suchen.');
        lastSearchAt = Date.now();
        button.disabled = true;
        const results = el('pinSearchResults');
        results.replaceChildren();
        results.classList.add('hidden');
        searchMessage('Suche läuft …');
        try {
            // Only user-triggered searches: no background requests or autocomplete to the public service.
            const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5' });
            const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) throw new Error('Suche derzeit nicht erreichbar.');
            const places = await response.json();
            if (!Array.isArray(places)) throw new Error('Ungültige Suchantwort.');
            for (const place of places) {
                const latitude = Number(place.lat);
                const longitude = Number(place.lon);
                if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
                    !Number.isFinite(longitude) || longitude < -180 || longitude > 180) continue;
                const item = document.createElement('li');
                const choice = document.createElement('button');
                choice.type = 'button';
                choice.textContent = place.display_name;
                choice.addEventListener('click', () => {
                    map.flyTo([latitude, longitude], 15);
                    results.replaceChildren();
                    results.classList.add('hidden');
                    searchMessage('Ort gefunden. Klicke den genauen Treffpunkt auf der Karte an.');
                });
                item.append(choice);
                results.append(item);
            }
            results.classList.toggle('hidden', !results.children.length);
            searchMessage(results.children.length ? 'Suchergebnis wählen und anschließend den Pin setzen.' : 'Kein Ort gefunden.');
        } catch {
            searchMessage('Ortssuche derzeit nicht erreichbar. Bitte später erneut versuchen oder die Karte direkt bewegen.');
        } finally {
            button.disabled = false;
        }
    }

    el('pinSearchBtn').addEventListener('click', searchPlace);
    el('pinSearchQuery').addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            searchPlace();
        }
    });
    el('clearPinBtn').addEventListener('click', () => {
        setPin(null, null, true);
        message('Pin und Link entfernt. Bitte Änderungen speichern.', 'success');
    });

    el('adminForm').addEventListener('submit', async event => {
        event.preventDefault();
        const body = {};
        for (const [name, id] of Object.entries(fields)) {
            body[name] = name.startsWith('max_') ? Number(el(id).value) : el(id).value;
        }
        body.latitude = selectedPin?.latitude ?? null;
        body.longitude = selectedPin?.longitude ?? null;
        const saveButton = el('saveAdminBtn');
        saveButton.disabled = true;
        try {
            show(await request('PUT', body));
            message('Änderungen gespeichert.', 'success');
        } catch (error) {
            message(error.message);
        } finally {
            saveButton.disabled = false;
        }
    });
});
