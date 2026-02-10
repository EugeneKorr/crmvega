const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const BUBBLE_API_TOKEN = process.env.BUBBLE_API_TOKEN || 'b897577858b2a032515db52f77e15e38';
const BUBBLE_API_URL = 'https://vega-ex.com/version-live/api/1.1/obj/User';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function syncUsers() {
    let cursor = 0;
    const limit = 50;
    let totalUpserted = 0;
    let totalProcessed = 0;
    let totalFoundBubble = 0;
    let hasMore = true;

    console.log('--- Starting Bubble -> CRM Full Sync (Upsert) ---');
    console.log(`Using Bubble API: ${BUBBLE_API_URL}`);

    while (hasMore) {
        try {
            console.log(`Fetching batch starting at cursor ${cursor}...`);
            const response = await axios.get(BUBBLE_API_URL, {
                headers: { Authorization: `Bearer ${BUBBLE_API_TOKEN}` },
                params: {
                    limit: limit,
                    cursor: cursor
                },
                timeout: 30000
            });

            const users = response.data.response.results || [];
            const remaining = response.data.response.remaining || 0;

            if (users.length === 0) {
                hasMore = false;
                break;
            }

            totalFoundBubble += users.length;

            for (const bubbleUser of users) {
                totalProcessed++;
                const tgId = bubbleUser.TelegramID;
                const name = bubbleUser.amo_name || bubbleUser.AmoName || bubbleUser.FirstName || 'Unknown User';

                if (tgId) {
                    const tgIdStr = String(tgId).trim();

                    const contactData = {
                        telegram_user_id: tgIdStr,
                        name: name,
                        telegram_username: bubbleUser.TelegramUsername || null,
                        email: bubbleUser.authentication?.email?.email || null,
                        first_name: bubbleUser.FirstName || null,
                        last_name: bubbleUser.LastName || null,
                        bubble_id: bubbleUser._id,
                        status: 'active'
                    };

                    // Upsert logic: if telegram_user_id exists, update. Else insert.
                    const { data, error } = await supabase
                        .from('contacts')
                        .upsert(contactData, { onConflict: 'telegram_user_id' })
                        .select('id');

                    if (!error && data) {
                        totalUpserted++;
                        if (totalUpserted % 20 === 0) {
                            console.log(`[Progress] Synced ${totalUpserted} contacts... (Last: ${tgIdStr} -> ${name})`);
                        }
                    } else if (error) {
                        // console.error(`Error syncing contact ${tgIdStr}:`, error.message);
                    }
                }
            }

            console.log(`Finished batch. Total synced so far: ${totalUpserted}. Total fetched so far: ${totalFoundBubble}`);

            cursor += users.length;
            if (remaining === 0 || users.length < limit) {
                hasMore = false;
            }

            await new Promise(r => setTimeout(r, 100));

        } catch (error) {
            console.error('Error in sync loop:', error.message);
            if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                console.log('API timed out, retrying this batch in 5 seconds...');
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            if (error.response && error.response.status === 429) {
                console.log('Rate limited. Waiting 30 seconds...');
                await new Promise(r => setTimeout(r, 30000));
                continue;
            }
            hasMore = false;
        }
    }

    console.log('--- Full Sync Completed ---');
    console.log(`Total Bubble users fetched: ${totalFoundBubble}`);
    console.log(`Total CRM contacts synced: ${totalUpserted}`);
}

syncUsers();
