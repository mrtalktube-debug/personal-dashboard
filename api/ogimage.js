// /api/ogimage.js — Vercel Serverless Function
// Haalt og:image meta tags op van artikelpagina's (batch)
// Gebruikt door de nieuws-widget om afbeeldingen te tonen

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { urls } = req.body;
    if (!urls || !Array.isArray(urls)) return res.status(400).json({ error: 'urls array required' });

    const results = {};
    const limit = Math.min(urls.length, 15);
    const urlsToProcess = urls.slice(0, limit);

    const fetchOgImage = async (url) => {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);

            const r = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'nl,en;q=0.9',
                },
                redirect: 'follow'
            });
            clearTimeout(timeout);

            if (!r.ok) return null;

            const html = await r.text();
            // Zoek alleen in de eerste 50KB (og:image zit in <head>)
            const head = html.substring(0, 50000);

            // 1. og:image (beide attribuut-volgordes)
            const ogMatch = head.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                || head.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
            if (ogMatch && ogMatch[1] && ogMatch[1].startsWith('http')) return ogMatch[1];

            // 2. twitter:image
            const twMatch = head.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
                || head.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
            if (twMatch && twMatch[1] && twMatch[1].startsWith('http')) return twMatch[1];

            // 3. Eerste grote afbeelding in de pagina (laatste redmiddel)
            const imgMatch = head.match(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/i);
            if (imgMatch) return imgMatch[1];

            return null;
        } catch (e) {
            return null;
        }
    };

    // Alle URLs parallel ophalen voor maximale snelheid
    const batchResults = await Promise.allSettled(urlsToProcess.map(fetchOgImage));

    urlsToProcess.forEach((url, idx) => {
        const result = batchResults[idx];
        if (result.status === 'fulfilled' && result.value) {
            results[url] = result.value;
        }
    });

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    return res.status(200).json(results);
}
