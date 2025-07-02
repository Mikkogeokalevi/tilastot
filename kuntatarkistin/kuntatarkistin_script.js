/*
  MIKKOKALEVIN KUNTATARKISTIN
  Versio 12.0 - Parannettu versio - Modulaarinen
*/

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

let map;
let marker;
let currentTileLayer;
let etaisyysPisteet = [];
let etaisyysMarkerit = [];
let etaisyysViiva;
let sijaintiHistoria = [];

// --- TAPAHTUMANKUUNTELIJAT ---
document.addEventListener('DOMContentLoaded', initMap);
haeSijaintiNappi.addEventListener('click', haeGPSsijainti);
naytaKoordinaatitNappi.addEventListener('click', haeManuaalisesti);
karttaTyyli.addEventListener('change', vaihdaKarttaTyyli);
tyhjennaPisteetNappi.addEventListener('click', tyhjennaEtaisyysPisteet);
tyhjennaHistoriaNappi.addEventListener('click', tyhjennaHistoria);

function setButtonsDisabled(disabled) {
    haeSijaintiNappi.disabled = disabled;
    naytaKoordinaatitNappi.disabled = disabled;
}

function naytaViesti(viesti, tyyppi = 'info') {
    const div = document.createElement('div');
    div.className = tyyppi === 'error' ? 'virhe-viesti' : 'onnistui-viesti';
    div.textContent = viesti;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

// --- KARTAN JA APUFUNKTIOIDEN ALUSTUS ---
function initMap() {
    map = L.map('kartta-container').setView([60.98, 25.66], 10);
    
    // Karttatasot - oletuksena CartoDB Light (toimivampi kuin dark)
    currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    
    currentTileLayer.addTo(map);
    map.on('click', onMapClick);
}

function vaihdaKarttaTyyli() {
    map.removeLayer(currentTileLayer);
    
    switch(karttaTyyli.value) {
        case 'cartodb':
            currentTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            });
            break;
        case 'satellite':
            currentTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            });
            break;
        case 'terrain':
            currentTileLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
            });
            break;
        default:
            currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            });
    }
    
    currentTileLayer.addTo(map);
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
        if (navigator.clipboard) {
            navigator.clipboard.writeText(teksti).then(() => {
                naytaViesti('Kopioitu leikepöydälle!', 'success');
            }).catch(() => {
                naytaViesti('Kopiointi epäonnistui', 'error');
            });
        } else {
            // Vanha tapa jos clipboard API ei ole käytettävissä
            const textArea = document.createElement('textarea');
            textArea.value = teksti;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                naytaViesti('Kopioitu leikepöydälle!', 'success');
            } catch (err) {
                naytaViesti('Kopiointi epäonnistui', 'error');
            }
            document.body.removeChild(textArea);
        }
    };
    return nappi;
}

function laskeEtaisyys(lat1, lon1, lat2, lon2) {
    const R = 6371; // Maapallon säde kilometreissä
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function lisaaHistoriaan(kunta, koordinaatit, tyyppi) {
    const uusiSijainti = {
        kunta,
        koordinaatit,
        tyyppi,
        aika: new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
    };
    
    sijaintiHistoria.unshift(uusiSijainti);
    if (sijaintiHistoria.length > 5) sijaintiHistoria.pop();
    
    paivitaHistoria();
}

function paivitaHistoria() {
    if (sijaintiHistoria.length === 0) {
        historiaLista.innerHTML = '<p>Ei vielä haettuja sijainteja</p>';
        return;
    }

    historiaLista.innerHTML = sijaintiHistoria.map((item, index) => 
        `<div class="historia-item" onclick="siirryHistoriaSijaintiin(${index})">
            <strong>${item.kunta}</strong><br>
            ${item.koordinaatit} - ${item.tyyppi} (${item.aika})
        </div>`
    ).join('');
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
    paivitaHistoria();
    naytaViesti('Historia tyhjennetty');
}

function tyhjennaEtaisyysPisteet() {
    etaisyysPisteet = [];
    etaisyysMarkerit.forEach(m => map.removeLayer(m));
    etaisyysMarkerit = [];
    if (etaisyysViiva) {
        map.removeLayer(etaisyysViiva);
        etaisyysViiva = null;
    }
    etaisyysTulos.innerHTML = '';
    document.getElementById('etaisyys-pisteet').innerHTML = '<p>Klikkaa karttaa kahdesti etäisyyden laskemiseksi</p>';
}

// --- PÄÄTOIMINNOT ---
function haeGPSsijainti() {
    if (!("geolocation" in navigator)) {
        naytaViesti('GPS ei ole käytettävissä', 'error');
        return;
    }
    setButtonsDisabled(true);
    tulosAlue.innerHTML = '<p style="text-align: center;">Haetaan GPS-sijaintia...</p>';
    
    // Parannettu GPS-lupa käsittely
    navigator.geolocation.getCurrentPosition(onGPSSuccess, onGPSError, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
    });
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
    const lat = position.coords.latitude, lon = position.coords.longitude;
    map.setView([lat, lon], 13);
    paivitaSijaintitiedot(lat, lon, "Oma sijainti");
}

function onMapClick(e) {
    const lat = e.latlng.lat, lon = e.latlng.lng;
    
    // Etäisyyslaskuri
    if (etaisyysPisteet.length < 2) {
        etaisyysPisteet.push([lat, lon]);
        const marker = L.marker([lat, lon], {
            icon: L.divIcon({
                className: 'etaisyys-marker',
                html: `<div style="background: red; color: white; border-radius: 50%; width: 20px; height: 20px; text-align: center; line-height: 20px; font-weight: bold;">${etaisyysPisteet.length}</div>`,
                iconSize: [20, 20]
            })
        }).addTo(map);
        etaisyysMarkerit.push(marker);
        
        document.getElementById('etaisyys-pisteet').innerHTML = 
            `<p>Piste ${etaisyysPisteet.length}/2 asetettu</p>`;
        
        if (etaisyysPisteet.length === 2) {
            const [lat1, lon1] = etaisyysPisteet[0];
            const [lat2, lon2] = etaisyysPisteet[1];
            const etaisyys = laskeEtaisyys(lat1, lon1, lat2, lon2);
            
            etaisyysViiva = L.polyline(etaisyysPisteet, {color: 'red', weight: 3}).addTo(map);
            
            etaisyysTulos.innerHTML = 
                `<div class="etaisyys-tulos">
                    <strong>Etäisyys: ${etaisyys.toFixed(2)} km</strong><br>
                    Piste 1: ${formatCoordinatesToDDM(lat1, lon1)}<br>
                    Piste 2: ${formatCoordinatesToDDM(lat2, lon2)}
                </div>`;
            
            document.getElementById('etaisyys-pisteet').innerHTML = 
                '<p>Kaksi pistettä asetettu - etäisyys laskettu</p>';
        }
    }
    
    // Tavallinen sijaintihaku
    paivitaSijaintitiedot(lat, lon, "Klikattu sijainti");
}

async function paivitaSijaintitiedot(lat, lon, paikanNimi) {
    setButtonsDisabled(true);
    tulosAlue.innerHTML = '<p style="text-align: center;">Haetaan osoitetietoja...</p>';
    
    if (marker) {
        marker.setLatLng([lat, lon]);
    } else {
        marker = L.marker([lat, lon]).addTo(map);
    }
    marker.bindPopup(`<b>${paikanNimi}</b><br>${formatCoordinatesToDDM(lat, lon)}`).openPopup();
    
    const apiUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=fi`;

    try {
        const response = await fetch(apiUrl, {
            headers: { 'User-Agent': 'MikkokalevinKuntatarkistin/1.0' }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        
        const data = await response.json();
        const address = data.address;
        
        let htmlOutput = '';
        
        // KUNTA ON TÄRKEIN TIETO!
        let paatinimi = 'Kuntaa ei löytynyt';
        if (data.display_name) {
            paatinimi = data.display_name.split(',')[0].trim();
        } else {
            paatinimi = address.municipality || address.city || address.town || address.village || 'Kuntaa ei löytynyt';
        }

        htmlOutput += `<p class="kunta-iso">${paatinimi}</p>`;
        
        // Koordinaatit kopiointimahdollisuudella
        const koordinaatitDDM = formatCoordinatesToDDM(lat, lon);
        const koordinaatitDD = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        
        htmlOutput += `<div class="koordinaatti-rivi">
            <strong>Koordinaatit (DDM):</strong> ${koordinaatitDDM}
        </div>`;
        
        htmlOutput += `<div class="koordinaatti-rivi">
            <strong>Koordinaatit (DD):</strong> ${koordinaatitDD}
        </div>`;
        
        // Muut tiedot
        const tie = address.road;
        const postinumero = address.postcode;
        const kunta = address.municipality || address.city || address.town || address.village;
        const maa = address.country || 'Ei saatavilla';

        if (tie) htmlOutput += `<p><strong>Katu:</strong> ${tie}</p>`;
        if (postinumero) htmlOutput += `<p><strong>Postinumero:</strong> ${postinumero}</p>`;
        if (kunta && kunta !== paatinimi) htmlOutput += `<p><strong>Kunta:</strong> ${kunta}</p>`;
        
        htmlOutput += `<p><strong>Maa:</strong> ${maa}</p>`;
        
        const kokoNimi = data.display_name || 'Ei saatavilla';
        htmlOutput += `<hr style="border-color: #90EE9044; border-style: dashed;"><p><strong>Tarkka sijainti:</strong> ${kokoNimi}</p>`;
        
        // Kopiointinappien lisäys
        const kopioiDDM = luoKopioiNappi(koordinaatitDDM);
        const kopioiDD = luoKopioiNappi(koordinaatitDD);
        
        tulosAlue.innerHTML = htmlOutput;
        
        // Lisää kopiointinappien event listenerit
        const koordinaattiRivit = tulosAlue.querySelectorAll('.koordinaatti-rivi');
        if (koordinaattiRivit.length >= 2) {
            koordinaattiRivit[0].appendChild(kopioiDDM);
            koordinaattiRivit[1].appendChild(kopioiDD);
        }
        
        // Lisää historiaan
        lisaaHistoriaan(paatinimi, koordinaatitDDM, paikanNimi);

    } catch (error) {
        console.error("Virhe haettaessa tietoja:", error);
        tulosAlue.innerHTML = '<p>Virhe haettaessa tietoja. Yritä uudelleen.</p>';
        naytaViesti('Virhe haettaessa sijaintitietoja', 'error');
    } finally {
        setButtonsDisabled(false);
    }
}

function onGPSError(error) {
    let virheViesti = 'Tapahtui tuntematon virhe.';
    switch (error.code) {
        case error.PERMISSION_DENIED: 
            virheViesti = 'Et antanut lupaa sijainnin käyttöön.'; 
            break;
        case error.POSITION_UNAVAILABLE: 
            virheViesti = 'Sijaintitieto ei ole saatavilla.'; 
            break;
        case error.TIMEOUT: 
            virheViesti = 'Sijainnin haku kesti liian kauan.'; 
            break;
    }
    tulosAlue.innerHTML = `<p>${virheViesti}</p>`;
    naytaViesti(virheViesti, 'error');
    setButtonsDisabled(false);
}
