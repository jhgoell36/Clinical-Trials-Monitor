const axios = require('axios');

const BASE_URL = 'https://clinicaltrials.gov/api/v2';

async function fetchTrial(nctId) {
    try {
        const response = await axios.get(`${BASE_URL}/studies/${nctId}`);
        // The API v2 structure: response.data is the study object directly or wrapped?
        // Based on docs, it returns the study structure.
        // We need protocolSection.identificationModule.nctId
        // and protocolSection.statusModule.lastUpdatePostDateStruct.date
        // or derivedSection.miscInfoModule.versionHolder (which changes on update)

        // Let's inspect the response structure more carefully in dev if needed.
        // For now, assuming standard v2 structure.

        const study = response.data;
        const protocol = study.protocolSection;

        if (!protocol) {
            throw new Error('Invalid API response structure');
        }

        const title = protocol.identificationModule?.officialTitle || protocol.identificationModule?.briefTitle;
        const lastUpdateDate = protocol.statusModule?.lastUpdatePostDateStruct?.date;
        const primaryCompletionDate = protocol.statusModule?.primaryCompletionDateStruct?.date || protocol.statusModule?.completionDateStruct?.date;
        const status = protocol.statusModule?.overallStatus;

        return {
            nctId: protocol.identificationModule.nctId,
            title: title,
            lastUpdated: lastUpdateDate,
            primaryCompletionDate: primaryCompletionDate,
            status: status,
            raw: study
        };
    } catch (error) {
        console.error(`Error fetching trial ${nctId}:`, error.message);
        throw error;
    }
}

module.exports = { fetchTrial };
