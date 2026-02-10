const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './backend/.env' });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkOrder() {
    console.log('Checking order #4036...');

    // Check by ID
    const { data: byId, error: errId } = await supabase
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
    const { data: byMainId, error: errMain } = await supabase
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
