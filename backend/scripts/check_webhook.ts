import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(__dirname, '../../frontend/.env') }); // Try frontend .env first
if (!process.env.TELEGRAM_BOT_TOKEN) {
    dotenv.config({ path: path.join(__dirname, '../.env') }); // Try backend .env
}
if (!process.env.TELEGRAM_BOT_TOKEN) {
    // Try to find ANY .env in root
    dotenv.config({ path: path.join(__dirname, '../../.env') });
}

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
    .catch((err: any) => {
        console.error('Error fetching webhook info:', err.message);
    });
