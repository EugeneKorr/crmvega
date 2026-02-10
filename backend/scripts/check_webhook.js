const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../frontend/.env') }); // Try frontend .env first
if (!process.env.TELEGRAM_BOT_TOKEN) {
    require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Try backend .env
}
if (!process.env.TELEGRAM_BOT_TOKEN) {
    // Try to find ANY .env in root
    require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}

const axios = require('axios');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('No TELEGRAM_BOT_TOKEN found in env');
    process.exit(1);
}

const url = `https://api.telegram.org/bot${token}/getWebhookInfo`;

axios.get(url)
    .then(res => {
        console.log('Webhook Info:', JSON.stringify(res.data, null, 2));
    })
    .catch(err => {
        console.error('Error fetching webhook info:', err.message);
    });
