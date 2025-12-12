const cron = require('node-cron');
const { checkUpdates } = require('./checker');
const { checkSponsorUpdates } = require('./sponsor_monitor');
const { sendSummaryEmail } = require('./mailer');
const { query, run } = require('./db');

async function runMonitoringCycle() {
    console.log('Starting monitoring cycle...');
    // const db = await initDb();

    // 1. Run Global Checks
    // These functions update the main 'trials' and 'sponsors' tables
    // and return lists of what changed globally.
    const updatedTrials = await checkUpdates();
    const newTrials = await checkSponsorUpdates();

    console.log(`Global checks complete. Updated: ${updatedTrials.length}, New: ${newTrials.length}`);

    if (updatedTrials.length === 0 && newTrials.length === 0) {
        console.log('No changes detected globally.');
        return;
    }

    // 2. Get all users
    const users = await query('SELECT * FROM users');

    // 3. Process notifications for each user
    for (const user of users) {
        if (!user.email) continue;

        // Filter updated trials for this user
        // Find trials in updatedTrials that this user is watching
        const userUpdatedTrials = [];
        if (updatedTrials.length > 0) {
            const userWatchedIds = await query(
                'SELECT nctId FROM user_trials WHERE user_id = ?',
                [user.id]
            );
            const watchedSet = new Set(userWatchedIds.map(r => r.nctId));

            for (const trial of updatedTrials) {
                if (watchedSet.has(trial.nctId)) {
                    userUpdatedTrials.push(trial);
                }
            }
        }

        // Filter new trials for this user
        // Find trials in newTrials where the sponsor is watched by this user
        const userNewTrials = [];
        if (newTrials.length > 0) {
            const userWatchedSponsors = await query(
                'SELECT sponsor_name FROM user_sponsors WHERE user_id = ?',
                [user.id]
            );
            const watchedSponsorSet = new Set(userWatchedSponsors.map(r => r.sponsor_name));

            for (const trial of newTrials) {
                if (watchedSponsorSet.has(trial.sponsor)) {
                    userNewTrials.push(trial);

                    // Also automatically link this new trial to the user?
                    // Yes, if they watch the sponsor, they should watch the trial.
                    await run(
                        'INSERT OR IGNORE INTO user_trials (user_id, nctId) VALUES (?, ?)',
                        [user.id, trial.nctId]
                    );
                }
            }
        }

        // Send email if this user has relevant changes
        if (userUpdatedTrials.length > 0 || userNewTrials.length > 0) {
            console.log(`Sending summary email to ${user.email} (New: ${userNewTrials.length}, Updated: ${userUpdatedTrials.length})`);
            await sendSummaryEmail(user.email, userNewTrials, userUpdatedTrials);
        }
    }

    console.log('Monitoring cycle complete.');
}

function startScheduler() {
    // Schedule to run hourly from 5am to 10pm ET
    cron.schedule('0 5-22 * * *', async () => {
        await runMonitoringCycle();
    }, {
        timezone: "America/New_York"
    });

    console.log('Scheduler started: Hourly checks 5am-10pm ET.');
}

module.exports = { startScheduler, runMonitoringCycle };
