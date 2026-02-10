import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkOrder() {
    console.log('Checking order #4036...');

    // Check by ID
    const { data: byId } = await supabase
        .from('orders')
        .select('*')
        .eq('id', 4036)
        .maybeSingle();

    if (byId) {
        console.log('Found by ID 4036:', {
            id: byId.id,
            main_id: byId.main_id,
            status: byId.status
        });
    } else {
        console.log('Not found by ID 4036');
    }

    // Check by Main ID just in case
    const { data: byMainId } = await supabase
        .from('orders')
        .select('*')
        .eq('main_id', 4036)
        .maybeSingle();

    if (byMainId) {
        console.log('Found by Main ID 4036:', {
            id: byMainId.id,
            main_id: byMainId.main_id,
            status: byMainId.status
        });
    }
}

checkOrder();
