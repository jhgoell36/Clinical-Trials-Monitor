const axios = require('axios');
const { scoreItem } = require('../scoring');

const BASE_URL = 'https://clinicaltrials.gov/api/v2';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const STATUS_CHANGE = new Set([
    'TERMINATED', 'WITHDRAWN', 'SUSPENDED', 'COMPLETED'
]);

function toIso(dateStr) {
    return dateStr ? `${dateStr}T00:00:00.000Z` : null;
}

// Recently-updated trials where the company is the lead sponsor,
// classified into a change kind the materiality engine understands.
// Sponsor name is matched on the SEC company name; CT.gov's query.spons
// is a fuzzy term match, so we keep only leadSponsor hits to avoid
// surfacing trials where the company is merely a collaborator.
async function fetchCtItems({ ticker, companyName }, lookbackDays = 4) {
    if (!companyName) return [];

    let studies = [];
    try {
        await sleep(200); // be polite to the CT.gov API
        const res = await axios.get(`${BASE_URL}/studies`, {
            params: {
                'query.spons': companyName,
                'sort': 'LastUpdatePostDate:desc',
                'pageSize': 50,
                'countTotal': 'false'
            },
            timeout: 15000
        });
        studies = res.data.studies || [];
    } catch (err) {
        console.error(`[clinicaltrials] ${ticker} (${companyName}) fetch failed:`, err.message);
        return [];
    }

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - lookbackDays);
    const wanted = companyName.toLowerCase();

    const items = [];
    for (const study of studies) {
        const ps = study.protocolSection;
        if (!ps) continue;

        const lead = ps.sponsorCollaboratorsModule?.leadSponsor?.name || '';
        if (!lead.toLowerCase().includes(wanted) && !wanted.includes(lead.toLowerCase())) {
            continue;
        }

        const lastUpdated = ps.statusModule?.lastUpdatePostDateStruct?.date;
        if (!lastUpdated || new Date(lastUpdated) < cutoff) continue;

        const nctId = ps.identificationModule?.nctId;
        const title = ps.identificationModule?.briefTitle || nctId;
        const status = (ps.statusModule?.overallStatus || '').toUpperCase();

        const ctChange = STATUS_CHANGE.has(status)
            ? { kind: 'status', newStatus: status }
            : { kind: 'update' };

        const base = {
            id: `ct:${nctId}:${lastUpdated}`,
            ticker,
            source: 'clinicaltrials',
            type: ctChange.kind === 'status' ? `Status: ${status}` : 'Trial update',
            title: `${nctId} — ${title}`,
            url: `https://clinicaltrials.gov/study/${nctId}`,
            summary: `Status: ${status}. Updated ${lastUpdated}.`,
            published: toIso(lastUpdated),
            ctChange
        };
        const { score, level, tags } = scoreItem(base);
        items.push({ ...base, score, level, tags });
    }
    return items;
}

module.exports = { fetchCtItems };
