export default async function handler(req, res) {
    const { q, hl = 'nl' } = req.query;
    
    if (!q) {
        return res.status(400).json({ error: 'Missing query parameter' });
    }

    const mkt = hl === 'nl' ? 'nl-NL' : 'en-US';
    // Bing News RSS is veel stabieler en blokkeert servers niet
    const url = `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&setmkt=${mkt}&format=rss`;
    
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
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
