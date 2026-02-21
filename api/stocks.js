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
                let name = symbol.toUpperCase().trim();
                let tickersToTry = [name];

                // Slimme mapping: voeg variaties toe voor populaire assets
                if (name.includes('ASML')) tickersToTry = ['ASML', 'ASML.AS'];
                if (name.includes('NOVO')) tickersToTry = ['NVO', 'NOVOB.CO'];
                if (name.includes('VUSA') || name.includes('S&P')) tickersToTry = ['VUSA.AS', 'VUSA.L'];
                if (name.includes('SHELL')) tickersToTry = ['SHELL.AS', 'SHEL'];

                let data = null;
                let foundTicker = '';

                // Probeer de tickers één voor één tot we beet hebben
                for (let t of tickersToTry) {
                    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${t}&token=${apiKey}`);
                    const json = await response.json();
                    if (json && json.c && json.c !== 0) {
                        data = json;
                        foundTicker = t;
                        break;
                    }
                }

                if (data) {
                    return {
                        name: symbol, // Behoud de naam zoals de gebruiker hem invoerde
                        price: data.c,
                        currency: foundTicker.includes('.AS') ? 'EUR' : foundTicker.includes('.CO') ? 'DKK' : 'USD',
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
