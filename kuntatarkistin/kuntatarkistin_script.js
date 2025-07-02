/*
  MIKKOKALEVIN KUNTATARKISTIN
  Versio 16.1 - Parannettu virheenkäsittely MML-rajapinnalle
*/

// --- API-AVAIMESI ---
const MML_API_KEY = '465a275a-7100-42fc-bb99-506fc447256b';


// --- ELEMENTTIEN HAKU ---
const haeSijaintiNappi = document.getElementById('haeSijainti');
const tulosAlue = document.getElementById('tulos-alue');
const karttaContainer = document.getElementById('kartta-container');
const koordinaatitInput = document.getElementById('koordinaatit-input');
const naytaKoordinaatitNappi = document.getElementById('naytaKoordinaatit');
const karttaTyyli = document.getElementById('kartta-tyyli');
const tyhjennaPisteetNappi = document.getElementById('tyhjenna-pisteet');
const etaisyysTulos = document.getElementById('etaisyys-tulos');
const historiaLista = document.getElementById('historia-lista');
const tyhjennaHistoriaNappi = document.getElementById('tyhjenna-historia');
const tilaHakuNappi = document.getElementById('tila-haku');
const tilaEtaisyysNappi = document.getElementById('tila-etaisyys');
const etaisyysLaatikko = document.getElementById('etaisyys-laatikko');

let map;
let marker;
let currentTileLayer;
let etaisyysPisteet = [];
let etaisyysMarkerit = [];
let etaisyysViiva;
let sijaintiHistoria = [];
let kayttoTila = 'haku'; // 'haku' tai 'etaisyys'

const MAX_ETAISYYS_PISTEET = 30;

const tallennettuHistoria = localStorage.getItem('mk_kuntatarkistin_historia');
if (tallennettuHistoria) {
    sijaintiHistoria = JSON.parse(tallennettuHistoria);
}

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    paivitaHistoria();
    lueURLJaAsetaSijainti();
});
haeSijaintiNappi.addEventListener('click', haeGPSsijainti);
naytaKoordinaatitNappi.addEventListener('click', haeManuaalisesti);
karttaTyyli.addEventListener('change', vaihdaKarttaTyyli);
tyhjennaPisteetNappi.addEventListener('click', tyhjennaEtaisyysPisteet);
tyhjennaHistoriaNappi.addEventListener('click', tyhjennaHistoria);
tilaHakuNappi.addEventListener('click', () => vaihdaKayttoTila('haku'));
tilaEtaisyysNappi.addEventListener('click', () => vaihdaKayttoTila('etaisyys'));

function setButtonsDisabled(disabled) {
    haeSijaintiNappi.disabled = disabled;
    naytaKoordinaatitNappi.disabled = disabled;
}

function naytaViesti(viesti, tyyppi = 'info') {
    const div = document.createElement('div');
    div.className = tyyppi === 'error' ? 'virhe-viesti' : 'onnistui-viesti';
    div.textContent = viesti;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

function initMap() {
    map = L.map('kartta-container').setView([60.98, 25.66], 10);
    currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    map.on('click', onMapClick);
}

function vaihdaKarttaTyyli() {
    map.removeLayer(currentTileLayer);
    const tyyli = karttaTyyli.value;
    let uusiTaso;
    switch(tyyli) {
        case 'cartodb':
            uusiTaso = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' });
            break;
        case 'satellite':
            uusiTaso = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' });
            break;
        case 'terrain':
            uusiTaso = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="https://opentopomap.org">OpenTopoMap</a>' });
            break;
        default:
            uusiTaso = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
    }
    currentTileLayer = uusiTaso.addTo(map);
}

function parseCoordinates(input) {
    input = input.trim();
    const ddmRegex = /([ns])\s*(\d{1,3})[°\s]+([\d.]+)'?[\s,]*([ew])\s*(\d{1,3})[°\s]+([\d.]+)'?/i;
    const ddmMatch = input.match(ddmRegex);
    if (ddmMatch) {
        let lat_deg = parseFloat(ddmMatch[2]), lat_min = parseFloat(ddmMatch[3]), lat = lat_deg + lat_min / 60;
        if (ddmMatch[1].toUpperCase() === 'S') lat = -lat;
        let lon_deg = parseFloat(ddmMatch[5]), lon_min = parseFloat(ddmMatch[6]), lon = lon_deg + lon_min / 60;
        if (ddmMatch[4].toUpperCase() === 'W') lon = -lon;
        return { lat, lon };
    } else {
        const parts = input.split(/[,;\s]/).filter(Boolean);
        if (parts.length === 2) {
            const lat = parseFloat(parts[0]), lon = parseFloat(parts[1]);
            if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
        }
    }
    return null;
}

function formatCoordinatesToDDM(lat, lon) {
    const formatPart = (value, hemi1, hemi2) => {
        const hemisphere = value >= 0 ? hemi1 : hemi2;
        const absValue = Math.abs(value);
        const degrees = Math.floor(absValue);
        const minutes = (absValue - degrees) * 60;
        const paddedDegrees = (hemi1 === 'E') ? degrees.toString().padStart(3, '0') : degrees;
        return `${hemisphere} ${paddedDegrees}° ${minutes.toFixed(3)}'`;
    };
    return `${formatPart(lat, 'N', 'S')} ${formatPart(lon, 'E', 'W')}`;
}

function luoKopioiNappi(teksti) {
    const nappi = document.createElement('button');
    nappi.className = 'kopioi-nappi';
    nappi.textContent = 'Kopioi';
    nappi.onclick = () => {
        navigator.clipboard.writeText(teksti).then(() => naytaViesti('Kopioitu leikepöydälle!', 'success'), () => naytaViesti('Kopiointi epäonnistui', 'error'));
    };
    return nappi;
}

function laskeKahdenPisteenEtaisyys(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function paivitaEtaisyysPolkuJaTulos() {
    if (etaisyysViiva) map.removeLayer(etaisyysViiva);
    let kokonaisEtaisyys = 0;
    let segmenttiHtml = '';
    for (let i = 1; i < etaisyysPisteet.length; i++) {
        const [lat1, lon1] = etaisyysPisteet[i-1];
        const [lat2, lon2] = etaisyysPisteet[i];
        const segmentinEtaisyys = laskeKahdenPisteenEtaisyys(lat1, lon1, lat2, lon2);
        kokonaisEtaisyys += segmentinEtaisyys;
        segmenttiHtml += `<p class="segmentti-rivi">Piste ${i} &rarr; ${i + 1}: <strong>${segmentinEtaisyys.toFixed(2)} km</strong></p>`;
    }
    if (etaisyysPisteet.length > 1) {
        etaisyysViiva = L.polyline(etaisyysPisteet, {color: 'red', weight: 3}).addTo(map);
    }
    document.getElementById('etaisyys-pisteet').innerHTML = `<p>Pisteitä asetettu: ${etaisyysPisteet.length}/${MAX_ETAISYYS_PISTEET}</p>`;
    etaisyysTulos.innerHTML = kokonaisEtaisyys > 0 ? `<div class="etaisyys-tulos"><p><strong>Kokonaisetäisyys: ${kokonaisEtaisyys.toFixed(2)} km</strong></p><hr style="border-color: #90EE9044; border-style: dashed; margin: 8px 0;">${segmenttiHtml}</div>` : '';
}

function lisaaEtaisyyspiste(lat, lon) {
    if (etaisyysPisteet.length >= MAX_ETAISYYS_PISTEET) {
        naytaViesti(`Maksimimäärä (${MAX_ETAISYYS_PISTEET}) pisteitä saavutettu.`, 'error');
        return;
    }
    const pisteIndex = etaisyysPisteet.length;
    etaisyysPisteet.push([lat, lon]);
    const uusiMarker = L.marker([lat, lon], {
        draggable: true,
        icon: L.divIcon({ className: 'etaisyys-marker', html: `<div style="background: red; color: white; border-radius: 50%; width: 20px; height: 20px; text-align: center; line-height: 20px; font-weight: bold;">${pisteIndex + 1}</div>`, iconSize: [20, 20] })
    }).addTo(map).on('dragend', function(event) {
        const newPosition = event.target.getLatLng();
        etaisyysPisteet[pisteIndex] = [newPosition.lat, newPosition.lng];
        paivitaEtaisyysPolkuJaTulos();
    });
    etaisyysMarkerit.push(uusiMarker);
    paivitaEtaisyysPolkuJaTulos();
}

function lisaaHistoriaan(kunta, koordinaatit, tyyppi) {
    const uusiSijainti = { kunta, koordinaatit, tyyppi, aika: new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }) };
    sijaintiHistoria.unshift(uusiSijainti);
    if (sijaintiHistoria.length > 5) sijaintiHistoria.pop();
    localStorage.setItem('mk_kuntatarkistin_historia', JSON.stringify(sijaintiHistoria));
    paivitaHistoria();
}

function paivitaHistoria() {
    historiaLista.innerHTML = sijaintiHistoria.length === 0 ? '<p>Ei vielä haettuja sijainteja</p>' : sijaintiHistoria.map((item, index) => `<div class="historia-item" onclick="siirryHistoriaSijaintiin(${index})"><strong>${item.kunta}</strong><br>${item.koordinaatit} - ${item.tyyppi} (${item.aika})</div>`).join('');
}

window.siirryHistoriaSijaintiin = function(index) {
    const sijainti = sijaintiHistoria[index];
    const coords = parseCoordinates(sijainti.koordinaatit);
    if (coords) {
        map.setView([coords.lat, coords.lon], 13);
        paivitaSijaintitiedot(coords.lat, coords.lon, sijainti.tyyppi);
    }
}

function tyhjennaHistoria() {
    sijaintiHistoria = [];
    localStorage.removeItem('mk_kuntatarkistin_historia');
    paivitaHistoria();
    naytaViesti('Historia tyhjennetty');
}

function tyhjennaEtaisyysPisteet() {
    etaisyysPisteet = [];
    etaisyysMarkerit.forEach(m => map.removeLayer(m));
    etaisyysMarkerit = [];
    if (etaisyysViiva) map.removeLayer(etaisyysViiva);
    etaisyysTulos.innerHTML = '';
    document.getElementById('etaisyys-pisteet').innerHTML = '<p>Klikkaa karttaa lisätäksesi reittipisteitä.</p>';
}

function vaihdaKayttoTila(uusiTila) {
    kayttoTila = uusiTila;
    if (uusiTila === 'haku') {
        tilaHakuNappi.classList.add('aktiivinen-tila');
        tilaEtaisyysNappi.classList.remove('aktiivinen-tila');
        etaisyysLaatikko.style.display = 'none';
    } else {
        tilaHakuNappi.classList.remove('aktiivinen-tila');
        tilaEtaisyysNappi.classList.add('aktiivinen-tila');
        etaisyysLaatikko.style.display = 'block';
    }
}

function haeGPSsijainti() {
    if (!("geolocation" in navigator)) return naytaViesti('GPS ei ole käytettävissä', 'error');
    setButtonsDisabled(true);
    tulosAlue.innerHTML = '<p style="text-align: center;">Haetaan GPS-sijaintia...</p>';
    navigator.geolocation.getCurrentPosition(onGPSSuccess, onGPSError, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

function haeManuaalisesti() {
    const coords = parseCoordinates(koordinaatitInput.value);
    if (coords) {
        map.setView([coords.lat, coords.lon], 14);
        paivitaSijaintitiedot(coords.lat, coords.lon, "Manuaalinen haku");
    } else {
        naytaViesti("Koordinaattien muoto on virheellinen", 'error');
    }
}

function onGPSSuccess(position) {
    const { latitude: lat, longitude: lon } = position.coords;
    map.setView([lat, lon], 13);
    paivitaSijaintitiedot(lat, lon, "Oma sijainti");
}

function onMapClick(e) {
    const { lat, lng: lon } = e.latlng;
    if (kayttoTila === 'etaisyys') {
        lisaaEtaisyyspiste(lat, lon);
    } else {
        paivitaSijaintitiedot(lat, lon, "Klikattu sijainti");
    }
}

async function paivitaSijaintitiedot(lat, lon, paikanNimi) {
    setButtonsDisabled(true);
    tulosAlue.innerHTML = '<p style="text-align: center;">Haetaan sijaintitietoja...</p>';
    
    if (marker) marker.setLatLng([lat, lon]);
    else marker = L.marker([lat, lon]).addTo(map);
    
    const koordinaatitDDM = formatCoordinatesToDDM(lat, lon);
    marker.bindPopup(`<b>${paikanNimi}</b><br>${koordinaatitDDM}`).openPopup();
    
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=fi`;
    const mmlUrl = `https://avoin-paikkatieto.maanmittauslaitos.fi/geocoding/v1/reverse?lat=${lat}&lon=${lon}&limit=1&lang=fi&api-key=${MML_API_KEY}`;

    try {
        if (MML_API_KEY.startsWith('LISÄÄ TÄHÄN')) {
            throw new Error("Maanmittauslaitoksen API-avain puuttuu. Lisää se kuntatarkistin_script.js-tiedostoon.");
        }

        const [nominatimResponse, mmlResponse] = await Promise.all([
            fetch(nominatimUrl, { headers: { 'User-Agent': 'MikkokalevinKuntatarkistin/1.0' } }),
            fetch(mmlUrl)
        ]);

        if (!mmlResponse.ok) {
            let mmlErrorMsg = `MML-rajapintavirhe (status: ${mmlResponse.status}). `;
            if (mmlResponse.status === 401 || mmlResponse.status === 403) {
                mmlErrorMsg += "Tarkista, että API-avain on oikein ja aktiivinen.";
            } else {
                mmlErrorMsg += mmlResponse.statusText;
            }
            throw new Error(mmlErrorMsg);
        }
        
        const mmlData = await mmlResponse.json();
        
        let virallinenKunta = 'Kuntaa ei löytynyt';
        if (mmlData.features && mmlData.features.length > 0) {
            virallinenKunta = mmlData.features[0].properties.municipality.name;
        }

        const nominatimData = nominatimResponse.ok ? await nominatimResponse.json() : null;
        const address = nominatimData?.address;
        const tie = address?.road;
        const postinumero = address?.postcode;
        const maa = address?.country || 'Ei saatavilla';
        const kokoNimi = nominatimData?.display_name || 'Ei lisätietoja saatavilla';
        
        let htmlOutput = `<p class="kunta-iso">${virallinenKunta}</p>`;
        htmlOutput += `<div class="koordinaatti-rivi"><strong>Koordinaatit (DDM):</strong> ${koordinaatitDDM}</div>`;
        if (tie) htmlOutput += `<p><strong>Katu:</strong> ${tie}</p>`;
        if (postinumero) htmlOutput += `<p><strong>Postinumero:</strong> ${postinumero}</p>`;
        htmlOutput += `<p><strong>Maa:</strong> ${maa}</p>`;
        htmlOutput += `<hr style="border-color: #90EE9044; border-style: dashed;"><p><strong>Tarkka sijainti (Nominatim):</strong> ${kokoNimi}</p>`;
        
        tulosAlue.innerHTML = htmlOutput;
        const koordinaattiRivi = tulosAlue.querySelector('.koordinaatti-rivi');
        if (koordinaattiRivi) koordinaattiRivi.appendChild(luoKopioiNappi(koordinaatitDDM));
        
        lisaaHistoriaan(virallinenKunta, koordinaatitDDM, paikanNimi);
        updateURL(lat, lon, map.getZoom());

    } catch (error) {
        console.error("Virhe haettaessa tietoja:", error);
        const virheviesti = `<p style="text-align: center; color: #FFB3B3;">Hups, virhe haettaessa tietoja.<br><small>${error.message}</small></p>`;
        tulosAlue.innerHTML = virheviesti;
        naytaViesti(error.message, 'error');
    } finally {
        setButtonsDisabled(false);
    }
}

function onGPSError(error) {
    let virheViesti = 'Tapahtui tuntematon virhe.';
    switch (error.code) {
        case error.PERMISSION_DENIED: virheViesti = 'Et antanut lupaa sijainnin käyttöön.'; break;
        case error.POSITION_UNAVAILABLE: virheViesti = 'Sijaintitieto ei ole saatavilla.'; break;
        case error.TIMEOUT: virheViesti = 'Sijainnin haku kesti liian kauan.'; break;
    }
    tulosAlue.innerHTML = `<p>${virheViesti}</p>`;
    naytaViesti(virheViesti, 'error');
    setButtonsDisabled(false);
}

function updateURL(lat, lon, zoom) {
    const ddmCoords = formatCoordinatesToDDM(lat, lon);
    const hash = `#${encodeURIComponent(ddmCoords)}/${zoom}`;
    if (history.replaceState) {
        history.replaceState(null, null, hash);
    } else {
        window.location.hash = hash;
    }
}

function lueURLJaAsetaSijainti() {
    if (window.location.hash) {
        try {
            const hash = decodeURIComponent(window.location.hash.substring(1));
            const parts = hash.split('/');
            if (parts.length === 2) {
                const coordsString = parts[0];
                const zoom = parseInt(parts[1], 10);
                const coords = parseCoordinates(coordsString);
                if (coords && !isNaN(zoom)) {
                    map.setView([coords.lat, coords.lon], zoom);
                    paivitaSijaintitiedot(coords.lat, coords.lon, "Jaettu sijainti");
                    naytaViesti("Sijainti ladattu jaetusta linkistä!");
                }
            }
        } catch (e) {
            console.error("Virhe URL-hajautteen lukemisessa:", e);
        }
    }
}
