export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL ontbreekt' });
    }

    // Converteer webcal:// naar https://
    const fetchUrl = url.replace(/^webcal:\/\//i, 'https://');

    try {
        const response = await fetch(fetchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; PersonalDashboard/1.0)',
                'Accept': 'text/calendar, text/plain, */*',
            },
            redirect: 'follow',
        });

        if (!response.ok) {
            return res.status(502).json({ 
                error: `Kon feed niet ophalen: ${response.status} ${response.statusText}` 
            });
        }

        const text = await response.text();

        if (!text.includes('BEGIN:VCALENDAR')) {
            return res.status(422).json({ 
                error: 'Geen geldige iCal data ontvangen' 
            });
        }

        // Stuur ruwe iCal tekst terug
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.status(200).send(text);

    } catch (error) {
        return res.status(500).json({ 
            error: `Fout bij ophalen: ${error.message}` 
        });
    }
}
