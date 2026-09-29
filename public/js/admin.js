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
