export default async function handler(req, res) {
    // Beveiliging: Alleen jij mag bij deze data
    const email = req.query.email || req.body?.email;
    if (email !== 'diabaas3@gmail.com') {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    // Ondersteunt nu zowel Vercel KV als Upstash Redis integraties
    const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!KV_URL || !KV_TOKEN) {
        return res.status(500).json({ error: 'Geen Database Keys gevonden in Vercel' });
    }

    // Haal de schuine streep weg aan het eind van de URL als die er staat
    const baseUrl = KV_URL.replace(/\/$/, '');
    const key = `dash_settings_${email}`;

    if (req.method === 'GET') {
        try {
            const response = await fetch(`${baseUrl}/get/${key}`, {
                headers: { Authorization: `Bearer ${KV_TOKEN}` }
            });
            const data = await response.json();
            return res.status(200).json(data.result ? JSON.parse(data.result) : {});
        } catch (error) {
            return res.status(500).json({ error: 'Fout bij ophalen uit cloud' });
        }
    } 
    
    if (req.method === 'POST') {
        try {
            const settings = req.body.settings;
            await fetch(`${baseUrl}/set/${key}`, {
                method: 'POST',
                headers: { 
                    Authorization: `Bearer ${KV_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(JSON.stringify(settings))
            });
            return res.status(200).json({ success: true });
        } catch (error) {
            return res.status(500).json({ error: 'Fout bij opslaan in cloud' });
        }
    }

    res.status(405).json({ error: 'Method not allowed' });
}
