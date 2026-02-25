export default async function handler(req, res) {
    const { q, hl = 'nl', gl = 'NL' } = req.query;
    
    if (!q) {
        return res.status(400).json({ error: 'Missing query parameter' });
    }

    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Google News API responded with status: ${response.status}`);
        }
        
        const xml = await response.text();
        
        res.setHeader('Content-Type', 'text/xml');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
        
        res.status(200).send(xml);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch news', details: error.message });
    }
}
