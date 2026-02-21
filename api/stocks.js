export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { symbols, mode } = req.body;
    const apiKey = process.env.FINNHUB_KEY;

    if (!apiKey) return res.status(500).json({ error: 'FINNHUB_KEY niet geconfigureerd' });

    // Helper: Pauzeer functie om rate limits (60/min) te voorkomen
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // === MODE: recommendations — haal top aanbevelingen op ===
    if (mode === 'recommendations') {
        try {
            const scanList = [
                'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD', 'CRM', 'ADBE',
                'ASML', 'NVO', 'SAP', 'SHEL', 'TTE', 'AZN', 'JPM', 'V', 'MA', 'UNH'
            ];

            const recommendations = [];
            const batchSize = 3; // Verwerk 3 tegelijk om burst-limieten te vermijden

            for (let i = 0; i < scanList.length; i += batchSize) {
                const batch = scanList.slice(i, i + batchSize);
                
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

                        const latest = recData[0];
                        const total = latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
                        if (total === 0) return;

                        const score = ((latest.strongBuy * 5) + (latest.buy * 4) + (latest.hold * 3) + (latest.sell * 2) + (latest.strongSell * 1)) / total;
                        const buyPct = ((latest.strongBuy + latest.buy) / total) * 100;

                        let consensus = 'Hold';
                        if (score >= 4.3) consensus = 'Strong Buy';
                        else if (score >= 3.7) consensus = 'Buy';
                        else if (score >= 2.5) consensus = 'Hold';
                        else if (score >= 1.8) consensus = 'Sell';
                        else consensus = 'Strong Sell';

                        recommendations.push({
                            name: symbol,
                            ticker: symbol, // FIX: Voeg expliciet ticker toe voor Yahoo links
                            price: quoteData.c,
                            currency: 'USD',
                            score: Math.round(score * 100) / 100,
                            buyPct: Math.round(buyPct),
                            consensus,
                            analysts: total,
                            detail: {
                                strongBuy: latest.strongBuy, buy: latest.buy, hold: latest.hold,
                                sell: latest.sell, strongSell: latest.strongSell
                            },
                            tr: { d: quoteData.dp || 0, w: 0, m: 0, y: 0 }
                        });
                    } catch (e) { /* skip */ }
                }));

                // Wacht even voor de volgende batch
                if (i + batchSize < scanList.length) await delay(300);
            }

            recommendations.sort((a, b) => b.score - a.score);
            return res.status(200).json(recommendations);

        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    // === MODE: default — haal quotes op voor specifieke symbolen in Watchlist ===
    if (!symbols || !Array.isArray(symbols)) return res.status(400).json({ error: 'Geen symbolen ontvangen' });

    try {
        const results = [];
        const batchSize = 3; // Ook hier batches gebruiken

        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            
            const batchResults = await Promise.all(batch.map(async (symbol) => {
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
                        const now = Math.floor(Date.now() / 1000);
                        let wTrend = 0, mTrend = 0, yTrend = 0;

                        try {
                            const candleRes = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${foundTicker}&resolution=D&from=${now - 31536000}&to=${now}&token=${apiKey}`);
                            const candles = await candleRes.json();

                            if (candles && candles.s === 'ok' && candles.c && candles.c.length > 0) {
                                const closes = candles.c;
                                const current = closes[closes.length - 1];
                                const getReturn = (daysAgo) => {
                                    const idx = Math.max(0, closes.length - 1 - daysAgo);
                                    const old = closes[idx];
                                    return old > 0 ? ((current - old) / old) * 100 : 0;
                                };
                                wTrend = getReturn(5); mTrend = getReturn(22); yTrend = getReturn(252);
                            }
                        } catch (e) {}

                        return {
                            name: symbol,
                            ticker: foundTicker, // FIX: Geef gevonden ticker terug
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

            results.push(...batchResults.filter(r => r !== null));
            if (i + batchSize < symbols.length) await delay(300);
        }

        return res.status(200).json(results);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
