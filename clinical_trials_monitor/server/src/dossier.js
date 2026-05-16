const { query, upsertNewsItem } = require('./db');
const { fetchEdgarItems } = require('./sources/edgar');
const { fetchCtItems } = require('./sources/clinicaltrials');

const DEFAULT_LOOKBACK_DAYS = 4; // covers a weekend + a holiday

function defaultSinceIso(lookbackDays = DEFAULT_LOOKBACK_DAYS) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - lookbackDays);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
}

// Fetch every source for one company, score, and persist. Source
// failures are already swallowed inside each adapter, so one dead
// source never blanks the whole dossier.
async function refreshCompany(company, lookbackDays = DEFAULT_LOOKBACK_DAYS) {
    const [edgar, ct] = await Promise.all([
        fetchEdgarItems(company, lookbackDays),
        fetchCtItems({ ticker: company.ticker, companyName: company.name }, lookbackDays)
    ]);
    const items = [...edgar, ...ct];
    for (const item of items) {
        await upsertNewsItem(item);
    }
    return items.length;
}

// Refresh every company any user is watching. Sequential across
// companies to stay friendly to SEC / CT.gov rate limits.
async function refreshAllWatched(lookbackDays = DEFAULT_LOOKBACK_DAYS) {
    const companies = await query(`
        SELECT DISTINCT c.ticker, c.cik, c.name
        FROM companies c
        JOIN user_companies uc ON uc.ticker = c.ticker
    `);
    let total = 0;
    for (const c of companies) {
        try {
            total += await refreshCompany(c, lookbackDays);
        } catch (err) {
            console.error(`[dossier] refresh failed for ${c.ticker}:`, err.message);
        }
    }
    console.log(`[dossier] refreshed ${companies.length} companies, ${total} items upserted`);
    return { companies: companies.length, items: total };
}

module.exports = {
    refreshCompany,
    refreshAllWatched,
    defaultSinceIso,
    DEFAULT_LOOKBACK_DAYS
};
