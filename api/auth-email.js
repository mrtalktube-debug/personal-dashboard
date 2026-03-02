// /api/auth-email.js — Vercel Serverless Function v1.0
// Beheert cross-platform OAuth2 Refresh Tokens voor Gmail & Outlook via Vercel KV

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { action, code, email, provider } = req.body;
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;

    if (!kvUrl || !kvToken) return res.status(500).json({ error: "KV database niet geconfigureerd." });
    if (!email) return res.status(400).json({ error: "Gebruikers-email ontbreekt." });

    const dbKey = `user_${email}_email_tokens`;

    // Haal bestaande tokens op
    let savedTokens = { google: null, ms: null };
    try {
        const kvRes = await fetch(`${kvUrl}/get/${dbKey}`, { headers: { Authorization: `Bearer ${kvToken}` } });
        const kvData = await kvRes.json();
        if (kvData.result) savedTokens = typeof kvData.result === 'string' ? JSON.parse(kvData.result) : kvData.result;
    } catch (e) { console.error("KV Read Error:", e); }

    // ACTION: Opslaan van nieuwe auth codes (Login)
    if (action === 'save_code') {
        try {
            let tokenData = null;
            if (provider === 'google') {
                const r = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        code,
                        client_id: process.env.GOOGLE_CLIENT_ID,
                        client_secret: process.env.GOOGLE_CLIENT_SECRET,
                        redirect_uri: 'postmessage', // Vereist voor Google Identity Services
                        grant_type: 'authorization_code'
                    })
                });
                tokenData = await r.json();
                if (tokenData.refresh_token) savedTokens.google = tokenData.refresh_token;
            } 
            else if (provider === 'ms') {
                const r = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: process.env.MS_CLIENT_ID,
                        client_secret: process.env.MS_CLIENT_SECRET,
                        code,
                        redirect_uri: process.env.NEXT_PUBLIC_BASE_URL, 
                        grant_type: 'authorization_code'
                    })
                });
                tokenData = await r.json();
                if (tokenData.refresh_token) savedTokens.ms = tokenData.refresh_token;
            }

            // Sla nieuwe refresh tokens op in KV
            await fetch(`${kvUrl}/set/${dbKey}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(savedTokens)
            });

            return res.status(200).json({ success: true, provider });
        } catch (error) {
            return res.status(500).json({ error: 'Token exchange mislukt', details: error.message });
        }
    }

    // ACTION: Ophalen van tijdelijke Access Tokens voor de frontend
    if (action === 'get_access_tokens') {
        const accessTokens = { google: null, ms: null };

        if (savedTokens.google) {
            try {
                const r = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: process.env.GOOGLE_CLIENT_ID,
                        client_secret: process.env.GOOGLE_CLIENT_SECRET,
                        refresh_token: savedTokens.google,
                        grant_type: 'refresh_token'
                    })
                });
                const d = await r.json();
                accessTokens.google = d.access_token;
            } catch(e) {}
        }

        if (savedTokens.ms) {
            try {
                const r = await fetch(`https://login.microsoftonline.com/common/oauth2/v2.0/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: process.env.MS_CLIENT_ID,
                        client_secret: process.env.MS_CLIENT_SECRET,
                        refresh_token: savedTokens.ms,
                        grant_type: 'refresh_token'
                    })
                });
                const d = await r.json();
                accessTokens.ms = d.access_token;
            } catch(e) {}
        }

        return res.status(200).json(accessTokens);
    }

    return res.status(400).json({ error: 'Ongeldige actie' });
}
