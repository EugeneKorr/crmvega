import { createClient } from '@supabase/supabase-js';
import { runAutomations } from './automationRunner';
import { mapStatus } from '../utils/statusMapping';
import { uploadAvatarFromUrl } from '../utils/storage';
// Not used in this file but imported in original
// import { notifyErrorSubscribers } from '../utils/notifyError'; 
import { BUBBLE_ID_TO_STATUS } from '../utils/bubbleWebhook';
import axios from 'axios';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

interface BubbleMessagePayload {
    lead_id?: string | number | null;
    content?: string | null;
    'Created Date'?: string;
    author_type?: string;
    message_type?: string;
    message_id_tg?: string | number;
    timestamp?: string;
    'Modified Date'?: string;
    'Created By'?: string;
    author_amojo_id?: string;
    message_id_amo?: string;
    user?: string;
    reply_to_mess_id_tg?: string | number;
    caption?: string;
    order_status?: string;
    main_ID?: string | number;
    telegram_user_id?: string | number;
    reactions?: any[];
    file_url?: string;
    file_name?: string;
    [key: string]: any; // Allow loose access
}

class BubbleService {

    // --- Helpers ---
    sanitizeNumeric(val: any): string | null {
        if (!val) return null;
        // Check if string "null"
        if (String(val).toLowerCase() === 'null') return null;
        const num = parseFloat(val);
        if (isNaN(num)) return null;
        return String(num);
    }

    cleanNull(val: any): string | null {
        if (val == null || val === 'null') return null;
        const str = String(val).trim();
        return str === 'null' || str === '' ? null : str;
    }

    parseNumeric(value: any): number | null {
        if (value === null || value === undefined || String(value) === 'null' || String(value) === '') return null;
        const parsed = parseFloat(value);
        return isNaN(parsed) ? null : parsed;
    }

    // --- Message Processing ---
    async processMessage(payload: BubbleMessagePayload) {
        console.log('[Bubble Service] Incoming message payload:', JSON.stringify(payload, null, 2));
        const {
            lead_id, content, 'Created Date': createdDate, author_type, message_type,
            message_id_tg, timestamp, 'Modified Date': modifiedDate, 'Created By': createdBy,
            author_amojo_id, message_id_amo, user, reply_to_mess_id_tg, caption,
            order_status, main_ID, telegram_user_id, reactions, file_url, file_name
        } = payload;

        const finalMainId = this.sanitizeNumeric(main_ID);
        console.log('[Bubble Service] Resolved main_id:', finalMainId);
        const processedContent = this.cleanNull(content);
        const finalFileUrl = this.cleanNull(file_url);
        const finalFileName = this.cleanNull(file_name);
        const finalReactions = reactions;
        let finalOrderId: string | number | null = null;
        let finalContactId: string | number | null = null;

        let normalizedAuthorType = 'client';
        if (author_type) {
            const lower = String(author_type).toLowerCase();
            if (lower.includes('manager') || lower.includes('менеджер')) normalizedAuthorType = 'manager';
            else if (lower.includes('client') || lower.includes('клиент')) normalizedAuthorType = 'client';
            else normalizedAuthorType = lower;
        }

        let finalMessageType = message_type || 'text';
        if (finalFileUrl && (!message_type || message_type === 'text')) {
            finalMessageType = 'file';
        }

        // Resolve Contact and Order
        if (finalMainId) {
            const { data: order } = await supabase.from('orders').select('id, contact_id').eq('main_id', finalMainId).maybeSingle();
            if (order) {
                finalOrderId = order.id;
                finalContactId = order.contact_id;
            } else {
                // Fallback: try to find contact directly via any order that might have this main_id or lead_id
                const { data: anyOrder } = await supabase.from('orders').select('contact_id').eq('main_id', finalMainId).limit(1).maybeSingle();
                if (anyOrder) finalContactId = anyOrder.contact_id;
            }
        }

        if (!finalContactId && telegram_user_id) {
            const { data: contact } = await supabase.from('contacts').select('id').eq('telegram_user_id', String(telegram_user_id)).maybeSingle();
            if (contact) finalContactId = contact.id;
        }

        if (!finalContactId && lead_id) {
            const { data: orderById } = await supabase.from('orders').select('contact_id').eq('main_id', this.sanitizeNumeric(lead_id)).limit(1).maybeSingle();
            if (orderById) finalContactId = orderById.contact_id;
        }

        console.log('[Bubble Service] Final resolved contact_id:', finalContactId);

        const safeContent = (processedContent === 'null' || !processedContent) ? '' : processedContent;
        let autoFileUrl = finalFileUrl;
        let autoMessageType = finalMessageType;
        let finalPayloadContent = safeContent;

        const fileRegex = /\.(jpg|jpeg|png|gif|webp|pdf|mp4|webm|mov|ogg|wav)$/i;
        const isPureLink = /^https?:\/\/[^\s]+$/i.test(safeContent.trim());

        if (!autoFileUrl && isPureLink && fileRegex.test(safeContent.trim())) {
            autoFileUrl = safeContent.trim();
            autoMessageType = 'file';
            finalPayloadContent = '';
        }

        // Используем значение напрямую как оно приходит из Bubble (число)
        const finalTelegramUserId = payload.telegram_user_id || null;
        console.log('[Bubble Service] Final Telegram User ID for DB:', finalTelegramUserId);

        const messageData: any = {
            lead_id: this.sanitizeNumeric(lead_id) || (finalMainId ? String(finalMainId).trim() : null),
            main_id: finalMainId,
            content: finalPayloadContent,
            'Created Date': createdDate || new Date().toISOString(),
            author_type: normalizedAuthorType,
            message_type: autoMessageType,
            message_id_tg: this.sanitizeNumeric(message_id_tg),
            timestamp: this.cleanNull(timestamp),
            'Modified Date': modifiedDate || new Date().toISOString(),
            'Created By': this.cleanNull(createdBy),
            author_amojo_id: this.cleanNull(author_amojo_id),
            message_id_amo: this.cleanNull(message_id_amo),
            user: this.cleanNull(user),
            reply_to_mess_id_tg: this.sanitizeNumeric(reply_to_mess_id_tg),
            caption: this.cleanNull(caption),
            order_status: order_status || null,
            file_url: autoFileUrl,
            file_name: finalFileName,
            telegram_user_id: finalTelegramUserId,
            ...(finalReactions !== undefined && { reactions: finalReactions }),
        };

        let existingMessage: any = null;
        if (message_id_amo && String(message_id_amo) !== 'null') {
            const { data } = await supabase.from('messages').select('id, content, reactions').eq('message_id_amo', message_id_amo).maybeSingle();
            existingMessage = data;
        }

        if (!existingMessage && message_id_tg && String(message_id_tg) !== '0') {
            const { data } = await supabase.from('messages').select('id, content, reactions').eq('message_id_tg', message_id_tg).maybeSingle();
            existingMessage = data;
        }

        let result;
        if (existingMessage) {
            const payloadToUpdate: any = { ...messageData };
            if (message_type === 'reaction') {
                const currentReactions: any[] = existingMessage.reactions || [];
                const newReaction = { emoji: content, author: 'Client', created_at: new Date().toISOString() };
                payloadToUpdate.reactions = [...currentReactions, newReaction];
                Object.keys(payloadToUpdate).forEach(key => {
                    if (key !== 'reactions') delete payloadToUpdate[key];
                });
            } else {
                if (!payloadToUpdate.content && existingMessage.content) delete payloadToUpdate.content;
            }

            const { data, error } = await supabase.from('messages').update(payloadToUpdate).eq('id', existingMessage.id).select().single();
            if (error) throw error;
            result = data;
        } else {
            const { data, error } = await supabase.from('messages').insert(messageData).select().single();
            if (error) throw error;
            result = data;

            if (finalOrderId && result.id) {
                // Handle Promise without .catch
                const { error: linkError } = await supabase.from('order_messages').insert({ order_id: finalOrderId, message_id: result.id });
                if (linkError) console.error('[Bubble Service] Link order error', linkError);
            }
        }

        if (!existingMessage) {
            runAutomations('message_received', result).catch(e => console.error('Auto error', e));
        }

        if (finalContactId && message_type !== 'reaction') {
            await supabase.from('contacts').update({ last_message_at: createdDate || new Date().toISOString() }).eq('id', finalContactId);
        }

        return result;
    }

    async updateMessage(id: string | number, body: any) {
        const updateData = { ...body };
        delete updateData.id;

        const { data, error } = await supabase.from('messages').update(updateData).eq('id', id).select().single();
        if (error) throw error;

        return data;
    }

    // --- Order Processing ---
    async processOrder(payload: any) {
        let data = payload;
        if (data.response?.results?.[0]) data = data.response.results[0];

        // Contact Resolution
        let contactId: string | number | null = null;
        let telegramId: string | number | null = null;
        const rawUserValue = data.User || data.bubbleUser;

        if (rawUserValue) {
            const userStr = String(rawUserValue);
            const cleanDigits = userStr.replace(/\D/g, '');
            if (cleanDigits.length >= 5) {
                telegramId = cleanDigits;
            } else if (userStr.length > 15 && (userStr.includes('x') || userStr.match(/[a-f]/i))) {
                try {
                    const userRes = await axios.get(`https://vega-ex.com/version-live/api/1.1/obj/User/${rawUserValue}`, {
                        headers: { Authorization: `Bearer ${process.env.BUBBLE_API_TOKEN || 'b897577858b2a032515db52f77e15e38'}` }
                    });
                    if (userRes.data?.response?.TelegramID) telegramId = userRes.data.response.TelegramID;
                } catch (e: any) { console.error('Bubble API User fetch failed', e.message); }
            }
        }

        if (!telegramId && data.tg_amo && data.tg_amo.includes('ID:')) {
            const match = data.tg_amo.match(/ID:\s*(\d+)/);
            if (match) telegramId = match[1];
        }

        if (telegramId) {
            const { data: c } = await supabase.from('contacts').select('id').eq('telegram_user_id', String(telegramId)).maybeSingle();
            if (c) contactId = c.id;
        }

        if (!contactId) {
            let validPhone = (data.client_phone && data.client_phone !== '123' && data.client_phone.length > 5) ? data.client_phone : null;
            let name = data.client_name || (data.tg_amo ? data.tg_amo.split(',')[0] : null) || `User ${telegramId || rawUserValue || 'Unknown'}`;

            const { data: newContact, error } = await supabase.from('contacts').insert({
                name, phone: validPhone, telegram_user_id: telegramId ? String(telegramId) : null, status: 'active'
            }).select().single();

            if (newContact) contactId = newContact.id;
        }

        const orderData = {
            contact_id: contactId,
            external_id: data.external_id || data.order_id || data._id || data.ID || null,
            main_id: data.main_ID || null,
            OrderName: data.OrderName || data.title || `Order from Bubble ${data.order_id || data.ID || ''}`,
            type: 'exchange',
            OrderStatus: data.OrderStatus || data.status,
            status: mapStatus(data.status || data.OrderStatus),
            created_at: data.created_at || new Date().toISOString(),
            OrderDate: data.OrderDate || data.date || data.order_date,
            Comment: data.Comment || data.description || data.comment || null,
            // ... Mappings
            CurrPair1: data.currPair1 || data.CurrPair1 || data.currency_give,
            CurrPair2: data.currPair2 || data.CurrPair2 || data.currency_get,
            SumInput: this.parseNumeric(data.sumInput || data.SumInput || data.amount_give),
            SumOutput: this.parseNumeric(data.sumOutput || data.SumOutput || data.amount_get),
            BankRus01: data.bankRus01 || data.BankRus01 || data.bank_1,
            BankRus02: data.bankRus02 || data.BankRus02 || data.bank_2,
            CityRus01: data.cityRus01 || data.CityRus01 || data.city_1,
            CityEsp02: data.cityEsp02 || data.CityEsp02 || data.city_2,
            DeliveryTime: data.deliveryTime || data.DeliveryTime || data.delivery_time,
            OrderPaid: data.orderPaid || data.OrderPaid || data['OrderPaid?'] || data.is_paid,
            PayNow: data.payNow || data.PayNow || data['PayNow?'] || data.payment_timing,
            Remote: data.remote || data.Remote || data['Remote?'] || data.is_remote,
            NextDay: data.nextDay || data.NextDay || data.delivery_day_type,
            ATM_Esp: data.atmEsp || data.ATM_Esp,
            BankEsp: data.bankEsp || data.BankEsp,
            Card_NumberOrSBP: data.cardNumberOrSBP || data.Card_NumberOrSBP,
            CityEsp01: data.cityEsp01 || data.CityEsp01,
            CityRus02: data.cityRus02 || data.CityRus02,
            ClientCryptoWallet: data.clientCryptoWallet || data.ClientCryptoWallet,
            ClientIBAN: data.clientIBAN || data.ClientIBAN,
            Location2: data.location2 || data.Location2 || data.location_url,
            MessageIBAN: data.messageIBAN || data.MessageIBAN,
            NetworkUSDT01: data.networkUSDT01 || data.NetworkUSDT01,
            NetworkUSDT02: data.networkUSDT02 || data.NetworkUSDT02,
            Ordertime: data.ordertime || data.Ordertime,
            PayeeName: data.payeeName || data.PayeeName,
            CashbackEUR: this.parseNumeric(data.cashbackEUR || data.CashbackEUR),
            CashbackUSDT: this.parseNumeric(data.cashbackUSDT || data.CashbackUSDT),
            SumPartly: this.parseNumeric(data.sumPartly || data.SumPartly || data.amount_partly_paid),
            BubbleUser: data.bubbleUser || data.BubbleUser || data.User || data.external_user_id,
            lead_id: data.lead_id,
            client_phone: data.mobilePhone || data.client_phone || data.MobilePhone,
            MobilePhone: data.mobilePhone || data.MobilePhone || data.client_phone,
            source: 'bubble',
            label_color: data.label_color || data.color,
            mongo_id: data.mongo_id || data._id || data.ID,
            external_updated_at: data.external_updated_at || data['Modified Date'],
            external_creator_id: data.external_creator_id || data['Created By']
        };

        const { data: newOrder, error } = await supabase.from('orders').insert(orderData).select('*, contact:contacts(name, phone, email)').single();
        if (error) throw error;

        runAutomations('order_created', newOrder).catch(e => console.error('Auto error', e));

        return newOrder;
    }

    // --- Contact Processing ---
    async processContact(payload: any) {
        let data = payload;
        if (data.response?.results?.[0]) data = data.response.results[0];

        const { name, phone, email, telegram_user_id, tg_amo, telegram_username, first_name, last_name, company, position, address, birthday, comment, status, rating, manager_id, avatar_url, photo, photo_url, profile_picture } = data;

        let telegramId = telegram_user_id;
        if (!telegramId && tg_amo && tg_amo.includes('ID:')) {
            const match = tg_amo.match(/ID:\s*(\d+)/);
            if (match) telegramId = match[1];
        }

        let existingContact: any = null;
        if (telegramId) {
            const { data } = await supabase.from('contacts').select('*').eq('telegram_user_id', telegramId).maybeSingle();
            existingContact = data;
        }
        if (!existingContact && phone && phone.length > 5) {
            const { data } = await supabase.from('contacts').select('*').eq('phone', phone).maybeSingle();
            existingContact = data;
        }
        if (!existingContact && email) {
            const { data } = await supabase.from('contacts').select('*').eq('email', email).maybeSingle();
            existingContact = data;
        }

        let finalAvatarUrl = avatar_url || photo || photo_url || profile_picture || null;
        if (finalAvatarUrl?.startsWith('http') && !finalAvatarUrl.includes('supabase.co')) {
            const up = await uploadAvatarFromUrl(finalAvatarUrl, telegramId ? `tg_${telegramId}` : null);
            if (up) finalAvatarUrl = up;
        }

        const contactData = {
            name: name || existingContact?.name || `User ${telegramId || phone || 'Unknown'}`,
            phone: (phone && phone.length > 5) ? phone : null,
            email: email || null,
            telegram_user_id: telegramId || null,
            telegram_username: telegram_username || null,
            first_name: first_name || null,
            last_name: last_name || null,
            company: company || null,
            position: position || null,
            address: address || null,
            birthday: birthday || null,
            comment: comment || null,
            status: status || 'active',
            rating: rating ? parseInt(rating) : null,
            manager_id: manager_id ? parseInt(manager_id) : null,
            avatar_url: finalAvatarUrl,
        };

        let result;
        if (existingContact) {
            const { data, error } = await supabase.from('contacts').update(contactData).eq('id', existingContact.id).select().single();
            if (error) throw error;
            result = data;
        } else {
            const { data, error } = await supabase.from('contacts').insert(contactData).select().single();
            if (error) throw error;
            result = data;
        }
        return { data: result, action: existingContact ? 'updated' : 'created' };
    }

    // --- Status Update ---
    async processStatusUpdate(leads: any) {
        if (!leads || !leads.status || !Array.isArray(leads.status)) throw new Error('Invalid payload');
        const updates: any[] = [];
        const errors: any[] = [];

        for (const item of leads.status) {
            const mainId = item.id;
            const bubbleStatusId = item.status_id;
            if (!mainId || !bubbleStatusId) { errors.push({ item, error: 'Missing id/status_id' }); continue; }

            const internalStatus = BUBBLE_ID_TO_STATUS[bubbleStatusId];
            if (!internalStatus) { errors.push({ item, error: 'Unknown mapping' }); continue; }

            const { data: order } = await supabase.from('orders').select('*').eq('main_id', mainId).maybeSingle();
            if (!order) { errors.push({ item, error: 'Not found' }); continue; }
            if (order.status === internalStatus) { updates.push({ id: order.id, status: 'skipped' }); continue; }

            const { data: updatedOrder, error } = await supabase.from('orders').update({ status: internalStatus }).eq('id', order.id).select('*, contact:contacts(name, phone, email)').single();
            if (error) { errors.push({ item, error: error.message }); continue; }

            runAutomations('order_status_changed', updatedOrder).catch(e => console.error('Auto error', e));
            updates.push({ id: updatedOrder.id, old: order.status, new: internalStatus });
        }
        return { updates, errors };
    }

    // --- Notes ---
    async processNoteToUser(user: any, note: string) {
        let contactId = null;
        let contactManagerId = null;
        const cleanDigits = String(user).replace(/\D/g, '');

        if (cleanDigits.length >= 5) {
            const { data } = await supabase.from('contacts').select('id, manager_id').eq('telegram_user_id', cleanDigits).maybeSingle();
            if (data) {
                contactId = data.id;
                contactManagerId = data.manager_id;
            }
        }

        if (!contactId && String(user).length > 15) {
            try {
                const userRes = await axios.get(`https://vega-ex.com/version-live/api/1.1/obj/User/${user}`, {
                    headers: { Authorization: `Bearer ${process.env.BUBBLE_API_TOKEN || 'b897577858b2a032515db52f77e15e38'}` }
                });
                if (userRes.data?.response?.TelegramID) {
                    const { data } = await supabase.from('contacts').select('id, manager_id').eq('telegram_user_id', userRes.data.response.TelegramID).maybeSingle();
                    if (data) {
                        contactId = data.id;
                        contactManagerId = data.manager_id;
                    }
                }
            } catch (e) { }
        }

        if (!contactId) throw new Error('Contact not found');

        const { data: orders } = await supabase.from('orders').select('id').eq('contact_id', contactId);
        const systemContent = `📝 Заметка: ${note} ${new Date().toLocaleString('ru-RU')}`;
        const createdMessages: any[] = [];

        // System manager fallback
        const finalManagerId = contactManagerId || 3;

        if (orders) {
            for (const order of orders) {
                const { data: sysMsg } = await supabase.from('internal_messages').insert({
                    order_id: order.id,
                    content: systemContent,
                    is_read: false,
                    attachment_type: 'system',
                    sender_id: finalManagerId
                }).select().single();
                if (sysMsg) {
                    createdMessages.push(sysMsg);
                }
            }
        }

        const { data: noteData, error: noteError } = await supabase.from('notes').insert({
            contact_id: contactId,
            content: note,
            priority: 'info',
            manager_id: finalManagerId
        }).select().single();

        if (noteError) {
            console.error('[Bubble Service] Note create error:', noteError);
        }

        return { contact_id: contactId, messages_created: createdMessages.length, note_created: !!noteData };
    }

    async processNoteToOrder(main_id: any, note: string) {
        const { data: order } = await supabase.from('orders')
            .select('id, manager_id, contact_id')
            .eq('main_id', main_id)
            .maybeSingle();

        if (!order) throw new Error('Order not found');

        const systemContent = `📝 Заметка: ${note} ${new Date().toLocaleString('ru-RU')}`;
        const finalManagerId = order.manager_id || 3;

        // 1. Create Internal Message (Timeline)
        const { data: sysMsg, error: msgError } = await supabase.from('internal_messages').insert({
            order_id: order.id,
            content: systemContent,
            is_read: false,
            attachment_type: 'system',
            sender_id: finalManagerId
        }).select().single();

        if (msgError) console.error('[Bubble Service] Internal message error:', msgError);

        // 2. Create Note Entry (Notes Tab)
        const { data: noteData, error: noteError } = await supabase.from('notes').insert({
            contact_id: order.contact_id,
            order_id: order.id,
            manager_id: finalManagerId,
            content: note,
            priority: 'info'
        }).select().single();

        if (noteError) console.error('[Bubble Service] Note entry error:', noteError);

        return {
            order_id: order.id,
            message_id: sysMsg?.id,
            note_id: noteData?.id,
            success: !!noteData
        };
    }
}

export default new BubbleService();
