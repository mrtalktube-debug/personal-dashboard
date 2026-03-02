// /api/ogimage.js — Vercel Serverless Function v2
// Haalt og:image meta tags op van artikelpagina's (batch)
// Volgt redirects en handelt Google News URLs af

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
            const timeout = setTimeout(() => controller.abort(), 5000);

            const r = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'nl,en;q=0.9',
                },
                redirect: 'follow'
            });
            clearTimeout(timeout);

            if (!r.ok) return null;

            const contentType = r.headers.get('content-type') || '';
            if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return null;

            const html = await r.text();
            const headEnd = html.indexOf('</head>');
            const head = headEnd > 0 ? html.substring(0, headEnd + 7) : html.substring(0, 50000);

            // 1. og:image
            let match = head.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                || head.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
            if (match?.[1]?.startsWith('http')) return match[1];

            // 2. twitter:image
            match = head.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i)
                || head.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i);
            if (match?.[1]?.startsWith('http')) return match[1];

            // 3. Schema.org image
            match = head.match(/<meta[^>]+itemprop=["']image["'][^>]+content=["']([^"']+)["']/i);
            if (match?.[1]?.startsWith('http')) return match[1];

            // 4. Link rel image_src
            match = head.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
            if (match?.[1]?.startsWith('http')) return match[1];

            return null;
        } catch (e) {
            return null;
        }
    };

    // Parallel ophalen in batches van 5
    const batchSize = 5;
    for (let i = 0; i < urlsToProcess.length; i += batchSize) {
        const batch = urlsToProcess.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(batch.map(fetchOgImage));
        batch.forEach((url, idx) => {
            if (batchResults[idx].status === 'fulfilled' && batchResults[idx].value) {
                results[url] = batchResults[idx].value;
            }
        });
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
    return res.status(200).json(results);
}
