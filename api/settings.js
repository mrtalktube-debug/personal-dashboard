import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // Zorg dat browsers de connectie niet blokkeren (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        if (req.method === 'GET') {
            const email = req.query.email;
            if (!email) return res.status(400).json({ error: 'Email ontbreekt' });
            
            const data = await kv.get(`settings_${email}`);
            return res.status(200).json(data || {});
        } 
        else if (req.method === 'POST') {
            const { email, settings } = req.body;
            if (!email || !settings) return res.status(400).json({ error: 'Data ontbreekt' });
            
            await kv.set(`settings_${email}`, settings);
            return res.status(200).json({ success: true });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
