const axios = require('axios');
const { scoreItem } = require('../scoring');

// SEC asks API clients to send a descriptive User-Agent with contact
// info. Override via SEC_USER_AGENT in the environment if needed.
const USER_AGENT = process.env.SEC_USER_AGENT
    || 'Clinical-Trials-Monitor/1.0 (jhgoell@gmail.com)';

function toIso(dateStr) {
    // EDGAR filing dates are date-only (YYYY-MM-DD). Normalize to a full
    // ISO instant so it compares cleanly against the dossier "since".
    return dateStr ? `${dateStr}T00:00:00.000Z` : null;
}

// Pull recent SEC filings for one company and return scored news items
// filed within `lookbackDays`. Network failures degrade to [] (the rest
// of the dossier should still render) — consistent with the existing
// monitoring code, which logs and continues rather than throwing.
async function fetchEdgarItems({ ticker, cik }, lookbackDays = 4) {
    if (!cik) return [];
    const cikPadded = String(cik).padStart(10, '0');
    const cikPlain = String(parseInt(cik, 10));
    const url = `https://data.sec.gov/submissions/CIK${cikPadded}.json`;

    let data;
    try {
        const res = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip, deflate' },
            timeout: 15000
        });
        data = res.data;
    } catch (err) {
        console.error(`[edgar] ${ticker} (CIK ${cikPadded}) fetch failed:`, err.message);
        return [];
    }

    const recent = data && data.filings && data.filings.recent;
    if (!recent || !Array.isArray(recent.accessionNumber)) return [];

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - lookbackDays);

    const items = [];
    for (let i = 0; i < recent.accessionNumber.length; i++) {
        const filingDate = recent.filingDate[i];
        if (!filingDate || new Date(filingDate) < cutoff) continue;

        const form = recent.form[i] || '';
        const accession = recent.accessionNumber[i];
        const accessionNoDashes = accession.replace(/-/g, '');
        const primaryDoc = recent.primaryDocument[i] || '';
        const desc = recent.primaryDocDescription[i] || '';

        const filingUrl = primaryDoc
            ? `https://www.sec.gov/Archives/edgar/data/${cikPlain}/${accessionNoDashes}/${primaryDoc}`
            : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikPadded}&type=${encodeURIComponent(form)}`;

        const title = desc ? `${form} — ${desc}` : `${form} filing`;
        const base = {
            id: `edgar:${accession}`,
            ticker,
            source: 'edgar',
            type: form,
            formType: form,
            title,
            url: filingUrl,
            summary: desc,
            published: toIso(filingDate)
        };
        const { score, level, tags } = scoreItem(base);
        items.push({ ...base, score, level, tags });
    }
    return items;
}

module.exports = { fetchEdgarItems };
