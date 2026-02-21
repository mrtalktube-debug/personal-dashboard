export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!kvUrl || !kvToken) {
        return res.status(500).json({ error: "Vercel KV variabelen ontbreken. Controleer de database koppeling in Vercel." });
    }

    try {
        if (req.method === 'GET') {
            const email = req.query.email;
            if (!email) return res.status(400).json({ error: 'Email ontbreekt' });
            
            const fetchRes = await fetch(`${kvUrl}/get/user_${email}`, {
                headers: { Authorization: `Bearer ${kvToken}` }
            });
            const data = await fetchRes.json();
            
            let parsed = data.result;
            if (typeof parsed === 'string') {
                try { parsed = JSON.parse(parsed); } catch(e){}
            }
            return res.status(200).json(parsed || {});
        } 
        else if (req.method === 'POST') {
            const { email, settings } = req.body;
            if (!email || !settings) return res.status(400).json({ error: 'Data ontbreekt' });
            
            const fetchRes = await fetch(`${kvUrl}/set/user_${email}`, {
                method: 'POST',
                headers: { 
                    Authorization: `Bearer ${kvToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings) 
            });
            
            const data = await fetchRes.json();
            if (data.error) throw new Error(data.error);

            return res.status(200).json({ success: true });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
