require('dotenv').config();
const { sendUpdateEmail } = require('./mailer');

const testTrial = {
    nctId: 'TEST-VERIFICATION',
    title: 'System Verification Test',
    lastUpdated: new Date().toISOString().split('T')[0]
};

// Send to the sender address itself for verification
const toEmail = process.env.SMTP_USER;

if (!toEmail) {
    console.error('Error: SMTP_USER not found in environment variables.');
    process.exit(1);
}

console.log(`Attempting to send test email to ${toEmail}...`);

sendUpdateEmail(toEmail, testTrial)
    .then(() => {
        console.log('Test email sent successfully!');
        process.exit(0);
    })
    .catch(err => {
        console.error('Failed to send test email:', err);
        process.exit(1);
    });
