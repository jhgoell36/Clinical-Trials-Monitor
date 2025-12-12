const { query, run, upsertTrial } = require('./db');
const { fetchTrial } = require('./api_client');
const { sendUpdateEmail } = require('./mailer');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function checkUpdates() {
    console.log('Starting update check...');
    const updates = [];
    // Get all monitored trials
    const trials = await query('SELECT * FROM trials');

    for (const trial of trials) {
        await sleep(200); // Rate limit: 5 requests/second
        try {
            const currentData = await fetchTrial(trial.nctId);
            const now = new Date().toISOString();

            // Filtering Logic: Past 5 years or Future
            const pcd = currentData.primaryCompletionDate ? new Date(currentData.primaryCompletionDate) : null;
            const fiveYearsAgo = new Date();
            fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

            // If pcd exists and is older than 5 years, skip update (unless it was already monitored, but user said "only update trials that...")
            // Let's interpret "only update" as "stop updating if it falls out of range".
            // But we should probably still update the DB record to reflect the new status/date, just maybe not notify?
            // User request: "only update trials that have a primary completion date within the past 5 years or at some point in the future"
            // This implies we should NOT update the DB if it's outside this range.

            let shouldUpdate = true;
            if (pcd && pcd < fiveYearsAgo) {
                shouldUpdate = false;
                // console.log(`Skipping update for ${trial.nctId}: Primary Completion Date ${currentData.primaryCompletionDate} is older than 5 years.`);
            }

            const dateChanged = currentData.lastUpdated !== trial.lastUpdated;
            const statusChanged = currentData.status !== trial.status;

            if (shouldUpdate && (dateChanged || statusChanged)) {
                console.log(`Update detected for ${trial.nctId}. Date: ${trial.lastUpdated}->${currentData.lastUpdated}, Status: ${trial.status}->${currentData.status}`);

                // Update DB
                await run(
                    'UPDATE trials SET lastUpdated = ?, title = ?, status = ?, primaryCompletionDate = ?, lastChecked = ? WHERE nctId = ?',
                    [currentData.lastUpdated, currentData.title, currentData.status, currentData.primaryCompletionDate, now, trial.nctId]
                );

                // Add to updates list if it's a "real" update (date changed) or status changed
                // User wants summary of changes.
                updates.push({
                    ...currentData,
                    oldLastUpdated: trial.lastUpdated,
                    oldStatus: trial.status,
                    changeType: dateChanged ? 'Update' : 'Status Change'
                });
            } else {
                // Just update lastChecked
                // Also backfill primaryCompletionDate if it's missing in DB but we have it now
                if (!trial.primaryCompletionDate && currentData.primaryCompletionDate) {
                    await run('UPDATE trials SET lastChecked = ?, primaryCompletionDate = ? WHERE nctId = ?', [now, currentData.primaryCompletionDate, trial.nctId]);
                } else {
                    await run('UPDATE trials SET lastChecked = ? WHERE nctId = ?', [now, trial.nctId]);
                }
                // console.log(`No update for ${trial.nctId}`);
            }
        } catch (error) {
            console.error(`Failed to check ${trial.nctId}:`, error.message);
        }
    }
    console.log(`Update check complete. Found ${updates.length} updates.`);
    return updates;
}

module.exports = { checkUpdates };
