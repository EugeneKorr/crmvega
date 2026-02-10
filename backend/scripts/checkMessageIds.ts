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

async function checkRecentMessages() {
    console.log('🔍 Проверка последних отправленных сообщений...\n');

    const { data: messages, error } = await supabase
        .from('messages')
        .select('id, content, author_type, message_id_tg, manager_id, "Created Date"')
        .not('message_id_tg', 'is', null)
        .order('"Created Date"', { ascending: false })
        .limit(10);

    if (error) {
        console.error('❌ Ошибка:', error);
        return;
    }

    console.log(`✅ Найдено ${messages?.length || 0} сообщений с telegram_message_id:\n`);

    messages?.forEach((msg: any, idx: number) => {
        console.log(`${idx + 1}. ID: ${msg.id}`);
        console.log(`   Content: "${msg.content.substring(0, 50)}..."`);
        console.log(`   Author: ${msg.author_type}`);
        console.log(`   TG Message ID: ${msg.message_id_tg} ✅`);
        console.log(`   Manager ID: ${msg.manager_id || 'NULL'}`);
        console.log(`   Date: ${msg['Created Date']}\n`);
    });

    // Проверяем сообщения БЕЗ telegram_message_id от менеджеров
    const { data: brokenMessages, error: brokenError } = await supabase
        .from('messages')
        .select('id, content, author_type, message_id_tg, manager_id, "Created Date"')
        .is('message_id_tg', null)
        .not('author_type', 'in', '(user,system,бот)')
        .order('"Created Date"', { ascending: false })
        .limit(5);

    if (brokenError) {
        console.error('❌ Ошибка:', brokenError);
        return;
    }

    if (brokenMessages && brokenMessages.length > 0) {
        console.log(`\n⚠️  Найдено ${brokenMessages.length} сообщений менеджеров БЕЗ telegram_message_id:\n`);

        brokenMessages.forEach((msg: any, idx: number) => {
            console.log(`${idx + 1}. ID: ${msg.id}`);
            console.log(`   Content: "${msg.content.substring(0, 50)}..."`);
            console.log(`   Author: ${msg.author_type}`);
            console.log(`   TG Message ID: NULL ❌`);
            console.log(`   Manager ID: ${msg.manager_id || 'NULL'}`);
            console.log(`   Date: ${msg['Created Date']}\n`);
        });
    } else {
        console.log('\n✅ Все сообщения менеджеров имеют telegram_message_id!');
    }
}

checkRecentMessages()
    .then(() => {
        console.log('\n✅ Проверка завершена');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Критическая ошибка:', err);
        process.exit(1);
    });
