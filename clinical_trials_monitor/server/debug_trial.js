const { query } = require('./src/db');
const { fetchTrial } = require('./src/api_client');

async function debug() {
    const nctId = 'NCT02251821';

    console.log('--- DB Record ---');
    const dbRecord = await query('SELECT * FROM trials WHERE nctId = ?', [nctId]);
    console.log(JSON.stringify(dbRecord, null, 2));

    console.log('\n--- API Client Result ---');
    try {
        const apiResult = await fetchTrial(nctId);
        console.log(JSON.stringify(apiResult, null, 2));
    } catch (e) {
        console.error(e);
    }
}

debug();
