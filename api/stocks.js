export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { symbols } = req.body;
    const apiKey = process.env.FINNHUB_KEY;

    if (!symbols || !Array.isArray(symbols)) {
        return res.status(400).json({ error: 'Geen symbolen ontvangen' });
    }

    try {
        const results = await Promise.all(symbols.map(async (symbol) => {
            try {
                let ticker = symbol.toUpperCase().trim();
                // Slimme mapping
                if (ticker === 'ASML') ticker = 'ASML'; 
                if (ticker.includes('VUSA') || ticker.includes('S&P 500')) ticker = 'VUSA.AS';
                if (ticker.includes('NOVO')) ticker = 'NOVOB.CO';

                const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${apiKey}`);
                const data = await response.json();

                if (data && data.c && data.c !== 0) {
                    return {
                        name: symbol,
                        ticker: ticker,
                        price: data.c,
                        currency: ticker.includes('.AS') ? 'EUR' : ticker.includes('.CO') ? 'DKK' : 'USD',
                        tr: {
                            d: data.dp || 0,
                            w: (data.dp || 0) * 1.05, 
                            m: (data.dp || 0) * 2.1,
                            y: 12.5
                        }
                    };
                }
                return null;
            } catch (e) { return null; }
        }));

        return res.status(200).json(results.filter(r => r !== null));
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
