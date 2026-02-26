// /api/golf.js — Vercel Serverless Function
// Proxy voor ESPN Golf API (CORS-blokkade omzeilen)
// Ondersteunt: PGA Tour ('pga') en DP World Tour ('eur')

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { tour } = req.body || {};
    const validTours = ['pga', 'eur'];
    const selectedTour = validTours.includes(tour) ? tour : 'pga';

    try {
        // ESPN scoreboard bevat kalender + recente resultaten + competitors
        const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/golf/${selectedTour}/scoreboard`;

        const response = await fetch(scoreboardUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; DashboardBot/1.0)',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`ESPN API returned ${response.status}`);
        }

        const data = await response.json();

        // Stuur het volledige ESPN response door — frontend doet de mapping
        res.status(200).json(data);

    } catch (error) {
        console.error(`Golf API error (${selectedTour}):`, error.message);
        res.status(502).json({ 
            error: 'Golf data ophalen mislukt', 
            detail: error.message,
            events: [] 
        });
    }
}
