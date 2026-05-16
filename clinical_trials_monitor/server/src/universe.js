const path = require('path');

// SEC ticker -> CIK/name map. Loaded once. Source file is the public
// company_tickers.json snapshot shipped with the repo (no network needed).
let tickerMap = null;

function loadTickerMap() {
    if (tickerMap) return tickerMap;
    const raw = require(path.join(__dirname, '..', 'sec_tickers.json'));
    tickerMap = new Map();
    for (const entry of Object.values(raw)) {
        if (!entry || !entry.ticker) continue;
        const ticker = String(entry.ticker).toUpperCase().trim();
        const cik = String(entry.cik_str);
        tickerMap.set(ticker, {
            ticker,
            cik,
            cikPadded: cik.padStart(10, '0'),
            name: entry.title
        });
    }
    return tickerMap;
}

function resolveTicker(ticker) {
    if (!ticker) return null;
    return loadTickerMap().get(String(ticker).toUpperCase().trim()) || null;
}

// Parse a free-form pasted universe. Accepts tickers separated by
// newlines, commas, or whitespace. An optional analyst note can follow
// a "|" on a line: "SRPT | core long, PDUFA Q3".
// Returns { resolved: [{ticker,cik,cikPadded,name,note}], unresolved: [string] }
function parseUniverseInput(text) {
    const resolved = [];
    const unresolved = [];
    const seen = new Set();

    if (!text) return { resolved, unresolved };

    for (const line of String(text).split(/\r?\n/)) {
        const [symbolsPart, ...noteParts] = line.split('|');
        const note = noteParts.join('|').trim() || null;

        const symbols = symbolsPart
            .split(/[,;\s]+/)
            .map(s => s.trim().toUpperCase())
            .filter(Boolean);

        // A note only attaches when the line is a single ticker.
        const attachNote = symbols.length === 1 ? note : null;

        for (const sym of symbols) {
            if (seen.has(sym)) continue;
            seen.add(sym);
            const match = resolveTicker(sym);
            if (match) {
                resolved.push({ ...match, note: attachNote });
            } else {
                unresolved.push(sym);
            }
        }
    }

    return { resolved, unresolved };
}

module.exports = { resolveTicker, parseUniverseInput, loadTickerMap };
