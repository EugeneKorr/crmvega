#!/usr/bin/env ts-node
/**
 * Импорт и синхронизация заявок из Bubble CSV экспорта.
 *
 * Запуск (dry-run по умолчанию, ничего не пишет в БД):
 *   npx ts-node backend/scripts/importBubbleCSV.ts --file export.csv
 *
 * Реальная запись:
 *   npx ts-node backend/scripts/importBubbleCSV.ts --file export.csv --no-dry-run
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌  SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY не найдены в .env');
    process.exit(1);
}

const args = process.argv.slice(2);
const fileArg = args.indexOf('--file');
const CSV_FILE = fileArg >= 0 ? args[fileArg + 1] : null;
const DRY_RUN = !args.includes('--no-dry-run');

if (!CSV_FILE || !fs.existsSync(CSV_FILE)) {
    console.error('❌  Укажи файл: --file export.csv');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Status mapping ───────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
    'Создан': 'unsorted',
    'Неразобранное': 'unsorted',
    'Принято Анна': 'accepted_anna',
    'Принято Костя': 'accepted_kostya',
    'Принято Стас': 'accepted_stas',
    'Принято Люси': 'accepted_lucy',
    'Работа с клиентом': 'in_progress',
    'Опрос': 'survey',
    'Передано Никите': 'transferred_nikita',
    'Передано Вал Александру': 'transferred_val',
    'Передано Бен Александру': 'transferred_ben',
    'Передано Фин Александру': 'transferred_fin',
    'Частично исполнена': 'partially_completed',
    'Перенос на завтра': 'postponed',
    'Отказ клиента': 'client_rejected',
    'Дубль или контакт': 'duplicate',
    'Удалена сотрудником': 'duplicate',
    'Ночной2': 'duplicate',
    'Ночной': 'duplicate',
    'no': 'duplicate',
    'Временный': 'duplicate',
    'Передан менеджеру': 'duplicate',
    'Мошенник': 'scammer',
    'На модерации': 'moderation',
    'Выполнен': 'completed',
    'Успешно реализована': 'completed',
};

// Эти статусы не переводим в duplicate даже если заявка не найдена в CSV
const PROTECTED = new Set(['completed', 'partially_completed']);

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(content: string): Record<string, string>[] {
    const rows: string[][] = [];
    let cur = '';
    let inQ = false;

    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (ch === '"') {
            if (inQ && content[i + 1] === '"') {
                cur += '""'; i++;   // escaped quote — keep for splitLine
            } else {
                inQ = !inQ;
                cur += ch;          // keep surrounding quotes for splitLine
            }
        } else if ((ch === '\n' || ch === '\r') && !inQ) {
            if (ch === '\r' && content[i + 1] === '\n') i++;
            if (cur || rows.length > 0) rows.push(splitLine(cur));
            cur = '';
        } else {
            cur += ch;
        }
    }
    if (cur.trim()) rows.push(splitLine(cur));

    if (rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1).map(vals => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
        return obj;
    });
}

function splitLine(line: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
            result.push(cur); cur = '';
        } else {
            cur += ch;
        }
    }
    result.push(cur);
    return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clean(v: string | undefined): string | null {
    const s = v?.trim();
    return s && s !== 'null' && s !== '' ? s : null;
}

function parseNum(v: string | undefined): number | null {
    if (!v?.trim()) return null;
    const s = v.trim().replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return parseFloat(s);
}

function parseBool(v: string | undefined): boolean | null {
    if (!v?.trim()) return null;
    const s = v.trim().toLowerCase();
    if (s === 'yes' || s === 'true' || s === '1') return true;
    if (s === 'no' || s === 'false' || s === '0') return false;
    return null; // любое другое значение (включая кириллицу) → null
}

function parseBubbleDate(v: string | undefined): string | null {
    if (!v?.trim()) return null;
    // Bubble exports "Jul 26, 2024 10:50 am" — JS needs uppercase AM/PM
    const normalized = v.trim().replace(/\b(am|pm)\b/, s => s.toUpperCase());
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    if (year < 2000 || year > 2100) return null;
    return d.toISOString();
}

function extractTelegramId(row: Record<string, string>): string | null {
    const user = row['User']?.trim();
    if (user && /^\d{5,}$/.test(user)) return user;
    const m = (row['tg_amo'] || '').match(/ID:\s*(\d+)/);
    return m ? m[1] : null;
}

function extractContactName(row: Record<string, string>, tgId: string): string {
    const tgAmo = row['tg_amo'] || '';
    const m = tgAmo.match(/^([^,]+),/);
    if (m && m[1] !== 'undefined') return m[1].trim();
    return `TG ${tgId}`;
}

function buildOrderName(row: Record<string, string>): string | null {
    const sumIn = row['SumInput']?.trim();
    const sumOut = row['SumOutput']?.trim();
    const c1 = clean(row['CurrPair1']);
    const c2 = clean(row['CurrPair2']);
    if (!sumIn && !sumOut) return null;
    const prefix = row['Ordertime']?.trim() === 'night' ? 'Ночная ' : '';
    return `${prefix}${sumIn || ''} ${c1 || ''} на ${sumOut || ''} ${c2 || ''}`.trim();
}

function mapRow(row: Record<string, string>, contactId: number | null, status: string) {
    return {
        main_id: clean(row['main_ID']),
        status,
        contact_id: contactId,
        source: 'bubble',
        type: 'exchange',
        OrderName: buildOrderName(row),
        CurrPair1: clean(row['CurrPair1']),
        CurrPair2: clean(row['CurrPair2']),
        SumInput: parseNum(row['SumInput']),
        SumOutput: parseNum(row['SumOutput']),
        SumEquivalentEUR: parseNum(row['SumEquivalentEUR']),
        LoyPoints: parseNum(row['LoyPoints']),
        CityEsp01: clean(row['CityEsp01']),
        CityEsp02: clean(row['CityEsp02']),
        CityRus01: clean(row['CityRus01']),
        CityRus02: clean(row['CityRus02']),
        BankRus01: clean(row['BankRus01']),
        BankRus02: clean(row['BankRus02']),
        BankEsp: clean(row['BankEsp']),
        ATM_Esp: clean(row['ATM']),
        DeliveryTime: clean(row['DeliveryTime']),
        NextDay: clean(row['NextDay']),
        Comment: clean(row['Comment']),
        NetworkUSDT01: clean(row['NetworkUSDT01']),
        NetworkUSDT02: clean(row['NetworkUSDT02']),
        Card_NumberOrSBP: clean(row['Card_NumberOrSBP']),
        Location2: clean(row['Location2']),
        lead_id: clean(row['lead_id']),
        mongo_id: clean(row['unique id']),
        MessageIBAN: clean(row['MessageIBAN']),
        ClientCryptoWallet: clean(row['СlientCryptoWallet']),
        ClientIBAN: clean(row['СlientIBAN']),
        PayeeName: clean(row['PayeeName']),
        OrderPaid: parseBool(row['OrderPaid?']),
        PayNow: clean(row['PayNow?']),
        Remote: parseBool(row['Remote?']),
        created_at: parseBubbleDate(row['Creation Date']),
    };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n🚀  Bubble CSV Import  ${DRY_RUN ? '[DRY RUN — БД не меняется]' : '[LIVE]'}`);
    console.log(`📁  ${CSV_FILE}\n`);

    // 1. Parse CSV
    const content = fs.readFileSync(CSV_FILE!, 'utf-8');
    const allRows = parseCSV(content);
    const rows = allRows.filter(r => (parseNum(r['SumInput']) ?? 0) > 1);

    console.log(`CSV строк всего:       ${allRows.length}`);
    console.log(`С SumInput > 1:        ${rows.length}`);

    const csvMap = new Map<string, Record<string, string>>();
    for (const row of rows) {
        const id = clean(row['main_ID']);
        if (id) csvMap.set(id, row);
    }

    // 2. Load Supabase orders
    process.stdout.write('\n⏳  Загружаю заявки из Supabase...');
    const { data: supaOrders, error: e1 } = await supabase
        .from('orders').select('id, main_id, status, created_at');
    if (e1) throw e1;

    const supaMap = new Map<string, { id: number; status: string; created_at: string | null }>();
    for (const o of supaOrders ?? []) {
        if (o.main_id) supaMap.set(String(o.main_id), { id: o.id, status: o.status, created_at: o.created_at ?? null });
    }
    console.log(` ${supaMap.size} заявок`);

    // 3. Load contacts
    process.stdout.write('⏳  Загружаю контакты...');
    const { data: contacts, error: e2 } = await supabase
        .from('contacts').select('id, telegram_user_id');
    if (e2) throw e2;

    const contactMap = new Map<string, number>();
    for (const c of contacts ?? []) {
        if (c.telegram_user_id) contactMap.set(String(c.telegram_user_id), c.id);
    }
    console.log(` ${contactMap.size} контактов\n`);

    // ── PASS 1: Update existing Supabase orders ──────────────────────────────

    const stats = {
        statusUpdated: 0,
        setDuplicate: 0,
        protectedSkip: 0,
        inserted: 0,
        contactsCreated: 0,
        unknownStatus: [] as string[],
        errors: [] as string[],
    };

    // Group by (new_status → ids[]) for efficient batch updates
    const updateGroups = new Map<string, number[]>();

    for (const [mainId, { id, status: currentStatus }] of supaMap) {
        if (csvMap.has(mainId)) {
            const bubbleStatus = csvMap.get(mainId)!['OrderStatus']?.trim() ?? '';
            let newStatus = STATUS_MAP[bubbleStatus];
            if (!newStatus) {
                stats.unknownStatus.push(`main_id=${mainId}: "${bubbleStatus}"`);
                newStatus = 'unsorted';
            }
            if (newStatus !== currentStatus) {
                if (!updateGroups.has(newStatus)) updateGroups.set(newStatus, []);
                updateGroups.get(newStatus)!.push(id);
                stats.statusUpdated++;
            }
        } else {
            if (PROTECTED.has(currentStatus)) {
                stats.protectedSkip++;
            } else {
                if (!updateGroups.has('duplicate')) updateGroups.set('duplicate', []);
                updateGroups.get('duplicate')!.push(id);
                stats.setDuplicate++;
            }
        }
    }

    if (!DRY_RUN) {
        process.stdout.write('📝  Обновляю статусы...');
        for (const [status, ids] of updateGroups) {
            // Batch by 500 IDs per query
            for (let i = 0; i < ids.length; i += 500) {
                const batch = ids.slice(i, i + 500);
                const { error } = await supabase
                    .from('orders')
                    .update({ status })
                    .in('id', batch);
                if (error) stats.errors.push(`Update status=${status}: ${error.message}`);
            }
        }
        console.log(' готово');
    }

    // ── PASS 1b: Fix null created_at for existing orders ─────────────────────

    if (!DRY_RUN) {
        const dateUpdates: Array<{ id: number; created_at: string }> = [];
        for (const [mainId, supa] of supaMap) {
            if (supa.created_at) continue;
            const row = csvMap.get(mainId);
            if (!row) continue;
            const dt = parseBubbleDate(row['Creation Date']);
            if (dt) dateUpdates.push({ id: supa.id, created_at: dt });
        }
        if (dateUpdates.length > 0) {
            process.stdout.write(`📅  Обновляю created_at для ${dateUpdates.length} записей...`);
            for (let i = 0; i < dateUpdates.length; i += 500) {
                const batch = dateUpdates.slice(i, i + 500);
                for (const { id, created_at } of batch) {
                    const { error } = await supabase.from('orders').update({ created_at }).eq('id', id);
                    if (error) stats.errors.push(`Update created_at id=${id}: ${error.message}`);
                }
            }
            console.log(' готово');
        }
    }

    // ── PASS 2: Insert new historical orders ─────────────────────────────────

    const toInsert: Record<string, string>[] = [];
    for (const [mainId, row] of csvMap) {
        if (!supaMap.has(mainId)) toInsert.push(row);
    }

    const INSERT_BATCH = 50;
    process.stdout.write(`➕  Вставляю ${toInsert.length} новых заявок...`);

    for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
        const batch = toInsert.slice(i, i + INSERT_BATCH);
        const records: ReturnType<typeof mapRow>[] = [];

        for (const row of batch) {
            const tgId = extractTelegramId(row);
            let contactId: number | null = null;

            if (tgId) {
                contactId = contactMap.get(tgId) ?? null;
                if (!contactId) {
                    if (!DRY_RUN) {
                        const name = extractContactName(row, tgId);
                        const { data: nc, error: ce } = await supabase
                            .from('contacts')
                            .insert({ telegram_user_id: tgId, name, status: 'active' })
                            .select('id')
                            .single();
                        if (nc) {
                            contactId = nc.id;
                            contactMap.set(tgId, contactId!);
                        } else if (ce) {
                            // Contact may already exist (race) — try to fetch
                            const { data: existing } = await supabase
                                .from('contacts')
                                .select('id')
                                .eq('telegram_user_id', tgId)
                                .maybeSingle();
                            if (existing) {
                                contactId = existing.id;
                                contactMap.set(tgId, contactId!);
                            } else {
                                stats.errors.push(`Contact tg=${tgId}: ${ce.message}`);
                            }
                        }
                    }
                    stats.contactsCreated++;
                }
            }

            const bubbleStatus = row['OrderStatus']?.trim() ?? '';
            const status = STATUS_MAP[bubbleStatus] ?? 'unsorted';
            records.push(mapRow(row, contactId, status));
        }

        stats.inserted += records.length;

        if (!DRY_RUN && records.length > 0) {
            const { error } = await supabase.from('orders').insert(records);
            if (error) stats.errors.push(`Insert batch ${i}–${i + records.length}: ${error.message}`);
        }
    }
    console.log(' готово');

    // ── Summary ───────────────────────────────────────────────────────────────

    console.log('\n' + '═'.repeat(55));
    console.log(`📊  Итог ${DRY_RUN ? '(DRY RUN — ничего не записано)' : '(LIVE)'}`);
    console.log('');
    console.log(`  Существующие заявки Supabase:`);
    console.log(`    ✅  Обновлён статус из CSV:    ${stats.statusUpdated}`);
    console.log(`    🗑️   Переведено в duplicate:    ${stats.setDuplicate}`);
    console.log(`    ⏭️   Защищено (completed):      ${stats.protectedSkip}`);
    console.log('');
    console.log(`  Новые исторические заявки:`);
    console.log(`    ➕  Создано заявок:             ${stats.inserted}`);
    console.log(`    👤  Создано новых контактов:    ${stats.contactsCreated}`);
    if (stats.unknownStatus.length > 0) {
        console.log(`\n  ⚠️   Неизвестные статусы (${stats.unknownStatus.length}):`);
        stats.unknownStatus.slice(0, 15).forEach(s => console.log(`      ${s}`));
    }
    if (stats.errors.length > 0) {
        console.log(`\n  ❌  Ошибки (${stats.errors.length}):`);
        stats.errors.slice(0, 10).forEach(e => console.log(`      ${e}`));
    }
    console.log('═'.repeat(55) + '\n');
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
