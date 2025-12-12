const axios = require('axios');
const { query, run, getOne } = require('./db');
const { sendUpdateEmail } = require('./mailer');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const BASE_URL = 'https://clinicaltrials.gov/api/v2';

async function fetchTrialsBySponsor(sponsorName) {
    let trials = [];
    let nextPageToken = null;

    try {
        do {
            const params = {
                'query.spons': sponsorName,
                'pageSize': 100, // Max page size
                // 'fields': 'NCTId,BriefTitle,LastUpdatePostDate,OverallStatus', // Removed to avoid field name errors
                'countTotal': 'false'
            };

            if (nextPageToken) {
                params.pageToken = nextPageToken;
            }

            // Construct query string manually or use axios params
            await sleep(200); // Rate limit
            const response = await axios.get(`${BASE_URL}/studies`, { params });

            if (response.data.studies) {
                trials = trials.concat(response.data.studies);
            }

            nextPageToken = response.data.nextPageToken;

            // Safety break to avoid infinite loops if something goes wrong or too many pages
            // Increased limit to 5000 to handle large sponsors like Pfizer
            if (trials.length >= 5000) break;

        } while (nextPageToken);

        return trials;
    } catch (error) {
        console.error(`Error fetching trials for sponsor ${sponsorName}:`, error.message);
        return [];
    }
}

async function checkSponsorUpdates(specificSponsorName = null) {
    console.log(`Starting sponsor check... ${specificSponsorName ? '(Target: ' + specificSponsorName + ')' : '(All)'}`);
    const db = await initDb();
    const newTrials = [];

    // Get monitored sponsors
    let sponsors = [];
    if (specificSponsorName) {
        sponsors = [{ name: specificSponsorName }];
    } else {
        sponsors = await query('SELECT * FROM sponsors');
    }

    for (const sponsor of sponsors) {
        console.log(`Checking sponsor: ${sponsor.name}`);
        const foundTrials = await fetchTrialsBySponsor(sponsor.name);

        let newCount = 0;

        for (const study of foundTrials) {
            const nctId = study.protocolSection.identificationModule.nctId;
            const title = study.protocolSection.identificationModule.briefTitle;
            const lastUpdated = study.protocolSection.statusModule.lastUpdatePostDateStruct.date;
            const primaryCompletionDate = study.protocolSection.statusModule.primaryCompletionDateStruct?.date || study.protocolSection.statusModule.completionDateStruct?.date;
            const status = study.protocolSection.statusModule.overallStatus;

            // Check if we are already monitoring this trial
            const existing = await getOne('SELECT nctId FROM trials WHERE nctId = ?', [nctId]);

            // Check if ignored
            const ignored = await getOne('SELECT nctId FROM ignored_trials WHERE nctId = ?', [nctId]);

            if (!existing && !ignored) {
                // Filtering Logic: Past 5 years or Future
                const pcd = primaryCompletionDate ? new Date(primaryCompletionDate) : null;
                const fiveYearsAgo = new Date();
                fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

                if (pcd && pcd < fiveYearsAgo) {
                    // console.log(`Skipping new trial ${nctId}: Primary Completion Date ${primaryCompletionDate} is older than 5 years.`);
                    continue;
                }

                console.log(`New trial found for ${sponsor.name}: ${nctId}`);

                // Add to monitored trials
                await run(
                    'INSERT INTO trials (nctId, lastUpdated, title, sponsor, status, primaryCompletionDate, lastChecked) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [nctId, lastUpdated, title, sponsor.name, status, primaryCompletionDate, new Date().toISOString()]
                );

                newTrials.push({
                    nctId,
                    title,
                    lastUpdated,
                    primaryCompletionDate,
                    sponsor: sponsor.name,
                    status
                });
                newCount++;
            } else if (specificSponsorName && !ignored) {
                // If checking a specific sponsor, we want to return existing trials too
                // so they can be linked to the user
                newTrials.push({
                    nctId,
                    title,
                    lastUpdated,
                    primaryCompletionDate,
                    sponsor: sponsor.name,
                    status
                });
            }
        }

        console.log(`Finished ${sponsor.name}. Found ${newCount} new trials.`);

        // Update last checked time
        await run('UPDATE sponsors SET lastChecked = ? WHERE name = ?', [new Date().toISOString(), sponsor.name]);
    }
    console.log(`Sponsor check complete. Found ${newTrials.length} total new trials.`);
    return newTrials;
}

module.exports = { checkSponsorUpdates };
