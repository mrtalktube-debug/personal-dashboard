const crypto = require('crypto');

export default async function handler(req, res) {
    // Alleen POST-requests toestaan voor veiligheid
    if (req.method !== 'POST') return res.status(405).json({error: 'Method Not Allowed'});
    
    const { key, secret } = req.body;
    if (!key || !secret) return res.status(400).json({ error: 'API keys ontbreken' });

    const timestamp = Date.now();
    const stringToSign = timestamp + 'GET' + '/v2/balance';
    const signature = crypto.createHmac('sha256', secret).update(stringToSign).digest('hex');

    try {
        // 1. Haal je saldo op bij Bitvavo
        const balReq = await fetch('https://api.bitvavo.com/v2/balance', {
            headers: {
                'Bitvavo-Access-Key': key,
                'Bitvavo-Access-Signature': signature,
                'Bitvavo-Access-Timestamp': timestamp.toString(),
                'Bitvavo-Access-Window': '10000'
            }
        });
        const balanceData = await balReq.json();

        if (balanceData.errorCode) {
            return res.status(400).json({ error: 'Bitvavo Auth fout: Check je API keys.' });
        }

        // 2. Haal de actuele live koersen op
        const priceReq = await fetch('https://api.bitvavo.com/v2/ticker/price');
        const priceData = await priceReq.json();

        // 3. Filter lege munten eruit
        const activeBalances = balanceData.filter(b => parseFloat(b.available) > 0 || parseFloat(b.inOrder) > 0);

        res.status(200).json({ balances: activeBalances, prices: priceData });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
