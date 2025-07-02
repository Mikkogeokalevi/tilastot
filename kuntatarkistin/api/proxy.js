// Tiedoston nimi: /api/proxy.js

export default async function handler(request, response) {
  // Otetaan haettava osoite URL-parametrista
  const targetUrl = request.query.url;

  if (!targetUrl) {
    return response.status(400).json({ error: 'URL-parametri puuttuu' });
  }

  try {
    const fetchResponse = await fetch(targetUrl);

    // Tarkistetaan, onnistuiko haku kohteeseen
    if (!fetchResponse.ok) {
      return response.status(fetchResponse.status).send(fetchResponse.statusText);
    }

    const data = await fetchResponse.json();

    // Asetetaan CORS-otsakkeet, jotta selain hyväksyy vastauksen
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Lähetetään data selaimelle
    return response.status(200).json(data);
  } catch (error) {
    return response.status(500).json({ error: 'Välityspalvelin epäonnistui noutamaan dataa.' });
  }
}