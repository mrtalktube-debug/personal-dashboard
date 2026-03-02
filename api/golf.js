// /api/golf.js — Vercel Serverless Function
// Proxy voor ESPN Golf API (CORS-blokkade omzeilen)
// Ondersteunt: PGA Tour ('pga') en DP World Tour ('eur')

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { tour } = req.body || {};
    const validTours = ['pga', 'eur'];
    const selectedTour = validTours.includes(tour) ? tour : 'pga';

    const headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; DashboardBot/1.0)',
        'Accept': 'application/json'
    };

    try {
        const [scoreboardRes, leaderboardRes] = await Promise.all([
            fetch(`https://site.api.espn.com/apis/site/v2/sports/golf/${selectedTour}/scoreboard`, { headers }),
            fetch(`https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=${selectedTour}`, { headers }).catch(() => null)
        ]);

        if (!scoreboardRes.ok) throw new Error(`ESPN scoreboard returned ${scoreboardRes.status}`);

        const data = await scoreboardRes.json();

        if (leaderboardRes && leaderboardRes.ok) {
            try {
                const lbData = await leaderboardRes.json();
                const lbEvents = lbData?.events || [];
                const sbEvents = data?.events || [];

                for (const sbEvent of sbEvents) {
                    const matchLb = lbEvents.find(e => e.id === sbEvent.id);
                    if (!matchLb) continue;
                    const lbCompetitors = matchLb.competitions?.[0]?.competitors || [];
                    const sbCompetitors = sbEvent.competitions?.[0]?.competitors || [];

                    for (const sbC of sbCompetitors) {
                        const lbC = lbCompetitors.find(c => c.athlete?.id === sbC.athlete?.id);
                        if (lbC) {
                            sbC.earnings = lbC.earnings || lbC.prize || null;
                        }
                    }
                }
            } catch (e) {
                console.warn('Leaderboard merge failed:', e.message);
            }
        }

        res.status(200).json(data);
    } catch (error) {
        console.error(`Golf API error (${selectedTour}):`, error.message);
        res.status(502).json({ error: 'Golf data ophalen mislukt', detail: error.message, events: [] });
    }
}
