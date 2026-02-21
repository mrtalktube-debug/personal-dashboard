export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { symbols, mode } = req.body;
    const apiKey = process.env.FINNHUB_KEY;

    if (!apiKey) return res.status(500).json({ error: 'FINNHUB_KEY niet geconfigureerd' });

    // === MODE: recommendations — haal top aanbevelingen op ===
    if (mode === 'recommendations') {
        try {
            // Brede lijst populaire aandelen voor scan
            const scanList = [
                // Tech
                'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD', 'CRM', 'ADBE',
                'ORCL', 'INTC', 'QCOM', 'AVGO', 'NFLX', 'SHOP', 'UBER', 'SQ', 'PLTR', 'SNOW',
                // EU (Finnhub tickers)
                'ASML', 'NVO', 'SAP', 'SHEL', 'TTE', 'AZN', 'UL', 'DEO', 'SNY', 'EQNR',
                // Finance
                'JPM', 'V', 'MA', 'BAC', 'GS', 'BLK', 'AXP', 'MS',
                // Healthcare
                'UNH', 'JNJ', 'LLY', 'PFE', 'ABBV', 'MRK', 'TMO',
                // Consumer
                'KO', 'PEP', 'MCD', 'NKE', 'SBUX', 'DIS', 'COST',
                // Industrial / Energy
                'CAT', 'BA', 'GE', 'XOM', 'CVX', 'LMT', 'RTX',
                // ETFs
                'SPY', 'QQQ', 'VTI', 'ARKK', 'XLF', 'XLE'
            ];

            const recommendations = [];

            // Haal recommendations op — max 20 om ruim onder de 60/min limiet te blijven!
            const batch = scanList.slice(0, 20);

            await Promise.all(batch.map(async (symbol) => {
                try {
                    const [recRes, quoteRes] = await Promise.all([
                        fetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${apiKey}`),
                        fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`)
                    ]);

                    const recData = await recRes.json();
                    const quoteData = await quoteRes.json();

                    if (!quoteData || !quoteData.c || quoteData.c === 0) return;
                    if (!Array.isArray(recData) || recData.length === 0) return;

                    const latest = recData[0]; // Meest recente maand

                    // Bereken score: strongBuy=5, buy=4, hold=3, sell=2, strongSell=1
                    const total = latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
                    if (total === 0) return;

                    const score = (
                        (latest.strongBuy * 5) +
                        (latest.buy * 4) +
                        (latest.hold * 3) +
                        (latest.sell * 2) +
                        (latest.strongSell * 1)
                    ) / total;

                    // Bereken buy percentage
                    const buyPct = ((latest.strongBuy + latest.buy) / total) * 100;

                    // Consensus label
                    let consensus = 'Hold';
                    if (score >= 4.3) consensus = 'Strong Buy';
                    else if (score >= 3.7) consensus = 'Buy';
                    else if (score >= 2.5) consensus = 'Hold';
                    else if (score >= 1.8) consensus = 'Sell';
                    else consensus = 'Strong Sell';

                    recommendations.push({
                        name: symbol,
                        price: quoteData.c,
                        currency: 'USD',
                        score: Math.round(score * 100) / 100,
                        buyPct: Math.round(buyPct),
                        consensus,
                        analysts: total,
                        detail: {
                            strongBuy: latest.strongBuy,
                            buy: latest.buy,
                            hold: latest.hold,
                            sell: latest.sell,
                            strongSell: latest.strongSell
                        },
                        tr: {
                            d: quoteData.dp || 0,
                            w: 0,
                            m: 0,
                            y: 0
                        }
                    });
                } catch (e) { /* skip */ }
            }));

            // Sorteer op score (hoogste eerst)
            recommendations.sort((a, b) => b.score - a.score);

            return res.status(200).json(recommendations);

        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // === MODE: default — haal quotes op voor specifieke symbolen in Watchlist ===
    if (!symbols || !Array.isArray(symbols)) {
        return res.status(400).json({ error: 'Geen symbolen ontvangen' });
    }

    try {
        const results = await Promise.all(symbols.map(async (symbol) => {
            try {
                let name = symbol.toUpperCase().trim();
                let tickersToTry = [name];

                if (name.includes('ASML')) tickersToTry = ['ASML', 'ASML.AS'];
                if (name.includes('NOVO')) tickersToTry = ['NVO', 'NOVOB.CO'];
                if (name.includes('VUSA') || name.includes('S&P')) tickersToTry = ['VUSA.AS', 'VUSA.L', 'SPY'];
                if (name.includes('SHELL')) tickersToTry = ['SHELL.AS', 'SHEL'];

                let data = null;
                let foundTicker = '';

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
                    // Echte historische candles ophalen voor w/m/y trends
                    const now = Math.floor(Date.now() / 1000);
                    let wTrend = 0, mTrend = 0, yTrend = 0;

                    try {
                        const candleRes = await fetch(
                            `https://finnhub.io/api/v1/stock/candle?symbol=${foundTicker}&resolution=D&from=${now - 31536000}&to=${now}&token=${apiKey}`
                        );
                        const candles = await candleRes.json();

                        if (candles && candles.s === 'ok' && candles.c && candles.c.length > 0) {
                            const closes = candles.c;
                            const current = closes[closes.length - 1];

                            const getReturn = (daysAgo) => {
                                const idx = Math.max(0, closes.length - 1 - daysAgo);
                                const old = closes[idx];
                                return old > 0 ? ((current - old) / old) * 100 : 0;
                            };

                            wTrend = getReturn(5);   // ~5 handelsdagen
                            mTrend = getReturn(22);  // ~22 handelsdagen
                            yTrend = getReturn(252); // ~252 handelsdagen
                        }
                    } catch (e) { /* candles niet beschikbaar, gebruik 0 */ }

                    return {
                        name: symbol,
                        price: data.c,
                        currency: foundTicker.includes('.AS') ? 'EUR' : foundTicker.includes('.CO') ? 'DKK' : 'USD',
                        tr: {
                            d: data.dp || 0,
                            w: Math.round(wTrend * 100) / 100,
                            m: Math.round(mTrend * 100) / 100,
                            y: Math.round(yTrend * 100) / 100
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
