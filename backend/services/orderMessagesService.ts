import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { escapeMarkdownV2 } from '../utils/telegramUtils';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

interface MessagePayload {
    orderId: string | number;
    content: string;
    replyToMessageId?: string | number;
    managerId: string | number;
}

interface FilePayload {
    orderId: string | number;
    file: Express.Multer.File; // or any valid file interface with path, originalname, mimetype
    caption?: string;
    duration?: number;
    replyToMessageId?: string | number;
    replyToId?: string | number; // for internal
    managerId: string | number;
}

class OrderMessagesService {

    // --- Client Messages ---

    private async resolveOrderId(orderId: string | number): Promise<{ id: number, main_id: string | null, contact_id: number | null } | null> {
        const numericId = parseInt(String(orderId));
        let lookupField = 'id';
        if (numericId > 1000000000) lookupField = 'main_id';

        const { data: order } = await supabase
            .from('orders')
            .select('id, main_id, contact_id')
            .eq(lookupField, orderId)
            .maybeSingle();

        return order || null;
    }

    private async getAllRelatedLeadIds(orderId?: string | number, contactId?: number): Promise<{ leadIds: string[], contactId: number | null, internalId: number | null, currentMainId: string | null, allRelatedOrderIds: number[], telegramUserIds: string[] }> {
        let order = orderId ? await this.resolveOrderId(orderId) : null;
        let effectiveContactId = contactId || order?.contact_id || null;

        const leadIds = new Set<string>();
        const telegramUserIds = new Set<string>();
        const allRelatedOrderIds: number[] = [];

        if (order?.main_id) leadIds.add(String(order.main_id));
        if (order?.id) allRelatedOrderIds.push(order.id);

        if (effectiveContactId) {
            const { data: contact } = await supabase
                .from('contacts')
                .select('id, telegram_user_id, orders(id, main_id)')
                .eq('id', effectiveContactId)
                .single();

            if (contact) {
                if (contact.telegram_user_id) telegramUserIds.add(String(contact.telegram_user_id));
                const otherOrders = (contact as any).orders || [];
                otherOrders.forEach((o: any) => {
                    if (o.main_id) leadIds.add(String(o.main_id));
                    if (o.id) allRelatedOrderIds.push(o.id);
                });
            }
        }
        return {
            leadIds: Array.from(leadIds),
            contactId: effectiveContactId || null,
            internalId: order?.id || null,
            currentMainId: order?.main_id ? String(order.main_id) : null,
            allRelatedOrderIds: Array.from(new Set(allRelatedOrderIds)),
            telegramUserIds: Array.from(telegramUserIds)
        };
    }

    async getClientMessages(orderId: string | number, limit = 200, offset = 0) {
        const { leadIds, contactId, telegramUserIds } = await this.getAllRelatedLeadIds(orderId);
        if (leadIds.length === 0 && telegramUserIds.length === 0) return { messages: [], total: 0, mainId: null };

        const orFilters: string[] = [];
        if (leadIds.length > 0) {
            orFilters.push(...leadIds.map(id => `main_id.eq.${id}`));
        }
        if (telegramUserIds.length > 0) {
            orFilters.push(...telegramUserIds.map(id => `telegram_user_id.eq.${id}`));
        }

        const { data: messages, count, error: messagesError } = await supabase
            .from('messages')
            .select(`
        *,
        sender:managers!manager_id(id, name, email)
      `, { count: 'exact' })
            .or(orFilters.join(','))
            .order('Created Date', { ascending: false })
            .range(offset, offset + limit - 1);

        if (messagesError) throw messagesError;

        return {
            messages: (messages || []).reverse(),
            total: count || 0,
            mainId: leadIds[0] || null
        };
    }

    async sendClientMessage({ orderId, content, replyToMessageId, managerId }: MessagePayload) {
        if (!content || !content.trim()) throw new Error('Сообщение не может быть пустым');

        const order = await this.resolveOrderId(orderId);
        if (!order) throw new Error('Заявка не найдена');

        let messageStatus = 'delivered';
        let errorMessage: string | null = null;

        let telegramUserId = null;
        if (order.contact_id) {
            const { data: contact } = await supabase
                .from('contacts')
                .select('telegram_user_id')
                .eq('id', order.contact_id)
                .single();
            telegramUserId = contact?.telegram_user_id;
        }

        if (!telegramUserId) {
            console.warn('Cannot send Telegram message: telegramUserId is missing for contact');
            messageStatus = 'error';
            errorMessage = 'Не найден Telegram ID клиента';
        }

        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        let telegramMessageId = null;

        if (telegramUserId && TELEGRAM_BOT_TOKEN) {
            try {
                let messageText = content;
                let replyMarkup: any = null;

                if (content.trim().startsWith('{')) {
                    try {
                        const parsed = JSON.parse(content);
                        if (parsed.text || parsed.buttons) {
                            messageText = parsed.text || '';
                            if (parsed.buttons && Array.isArray(parsed.buttons)) {
                                const urlButtons = parsed.buttons.filter((b: any) => b.type === 'url');
                                if (urlButtons.length > 0) {
                                    const inlineKeyboard = urlButtons.map((b: any) => ({ text: b.text, url: b.url }));
                                    replyMarkup = { inline_keyboard: inlineKeyboard.map((b: any) => [b]) };
                                }
                            }
                        }
                    } catch (e) { }
                }

                // Use MarkdownV2 with proper escaping
                const telegramPayload: any = {
                    chat_id: telegramUserId,
                    text: escapeMarkdownV2(messageText || content || 'Сообщение'),
                    parse_mode: 'MarkdownV2'
                };
                if (replyMarkup) telegramPayload.reply_markup = replyMarkup;
                if (replyToMessageId) telegramPayload.reply_to_message_id = replyToMessageId;

                const response = await axios.post(
                    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                    telegramPayload
                );
                telegramMessageId = response.data?.result?.message_id;

            } catch (tgError: any) {
                console.error('Telegram send error:', tgError.response?.data || tgError.message);
                if (tgError.response?.data?.description?.includes('parse')) {
                    try {
                        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                            chat_id: telegramUserId,
                            text: content,
                            reply_to_message_id: replyToMessageId
                        });
                    } catch (retryErr) {
                        console.error('Retry failed', retryErr);
                    }
                } else {
                    messageStatus = 'error';
                    errorMessage = tgError.message;
                }
            }
        }

        const { data: savedMessage, error: saveError } = await supabase
            .from('messages')
            .insert({
                main_id: order.main_id,
                content: content,
                author_type: 'manager',
                message_type: 'text',
                manager_id: managerId,
                is_read: true,
                message_id_tg: telegramMessageId,
                reply_to_mess_id_tg: replyToMessageId,
                status: messageStatus,
                error_message: errorMessage
            })
            .select(`*, sender:managers!manager_id(id, name, email)`)
            .single();

        if (saveError) throw saveError;

        await supabase.from('order_messages').insert({
            order_id: order.id,
            message_id: savedMessage.id
        });

        return savedMessage;
    }

    async sendClientFile({ orderId, file, caption, replyToMessageId, managerId }: FilePayload) {
        const order = await this.resolveOrderId(orderId);
        if (!order) throw new Error('Заявка не найдена');

        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const ext = path.extname(originalName);
        const fileName = `${Date.now()}_file${ext}`;
        const filePath = `order_files/${orderId}/${fileName}`;

        const fileContent = fs.readFileSync(file.path);
        const { error: uploadError } = await supabase.storage
            .from('attachments')
            .upload(filePath, fileContent, { contentType: file.mimetype });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
        const fileUrl = urlData.publicUrl;

        let telegramMessageId = null;
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

        if (TELEGRAM_BOT_TOKEN && order.contact_id) {
            const { data: contact } = await supabase.from('contacts').select('telegram_user_id').eq('id', order.contact_id).single();
            if (contact?.telegram_user_id) {
                try {
                    const formData = new FormData();
                    formData.append('chat_id', contact.telegram_user_id);

                    const isImage = file.mimetype.startsWith('image');
                    const method = isImage ? 'sendPhoto' : 'sendDocument';
                    const fileField = isImage ? 'photo' : 'document';

                    formData.append(fileField, fs.createReadStream(file.path), { filename: originalName, contentType: file.mimetype });

                    let finalCaption = caption;
                    let replyMarkup: any = null;

                    if (caption && caption.trim().startsWith('{')) {
                        try {
                            const parsed = JSON.parse(caption);
                            if (parsed.text || parsed.buttons) {
                                finalCaption = parsed.text || '';
                                if (parsed.buttons && Array.isArray(parsed.buttons)) {
                                    const urlButtons = parsed.buttons.filter((b: any) => b.type === 'url');
                                    if (urlButtons.length > 0) {
                                        const inlineKeyboard = urlButtons.map((b: any) => ({ text: b.text, url: b.url }));
                                        replyMarkup = { inline_keyboard: inlineKeyboard.map((b: any) => [b]) };
                                    }
                                }
                            }
                        } catch (e) {
                            // Valid JSON check failed, treat as raw text
                        }
                    }

                    if (finalCaption) formData.append('caption', finalCaption);
                    if (replyMarkup) formData.append('reply_markup', JSON.stringify(replyMarkup));
                    if (replyToMessageId) formData.append('reply_to_message_id', replyToMessageId);

                    const tgResponse = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, formData, {
                        headers: formData.getHeaders()
                    });
                    telegramMessageId = tgResponse.data?.result?.message_id;
                } catch (e) {
                    console.error('Telegram file send error', e);
                }
            }
        }

        const { data: savedMessage, error: saveError } = await supabase
            .from('messages')
            .insert({
                main_id: order.main_id,
                content: caption || (file.mimetype.startsWith('image') ? '📷 Изображение' : '📎 Файл'),
                author_type: 'manager',
                message_type: file.mimetype.startsWith('image') ? 'image' : 'file',
                manager_id: managerId,
                is_read: true,
                message_id_tg: telegramMessageId,
                reply_to_mess_id_tg: replyToMessageId,
                status: telegramMessageId ? 'delivered' : 'error',
                file_url: fileUrl,
                file_name: originalName
            })
            .select('*, sender:managers!manager_id(id, name, email)')
            .single();

        if (saveError) throw saveError;

        await supabase.from('order_messages').insert({ order_id: order.id, message_id: savedMessage.id });

        return savedMessage;
    }

    async sendClientVoice({ orderId, file, duration, replyToMessageId, managerId }: FilePayload) {
        const order = await this.resolveOrderId(orderId);
        if (!order) throw new Error('Заявка не найдена');

        const inputBuffer = fs.readFileSync(file.path);
        const finalBuffer = inputBuffer;
        const finalContentType = file.mimetype || 'audio/ogg'; // Default to OGG if missing
        const finalFileName = `${Date.now()}_voice.ogg`;

        const filePath = `order_files/${orderId}/${finalFileName}`;
        const { error: uploadError } = await supabase.storage
            .from('attachments')
            .upload(filePath, finalBuffer, { contentType: finalContentType });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
        const fileUrl = urlData.publicUrl;

        let telegramMessageId = null;
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

        if (TELEGRAM_BOT_TOKEN && order.contact_id) {
            const { data: contact } = await supabase.from('contacts').select('telegram_user_id').eq('id', order.contact_id).single();
            if (contact?.telegram_user_id) {
                try {
                    const formData = new FormData();
                    formData.append('chat_id', contact.telegram_user_id);
                    formData.append('voice', finalBuffer, { filename: 'voice.ogg', contentType: 'audio/ogg' });
                    if (duration) formData.append('duration', duration);
                    if (replyToMessageId) formData.append('reply_to_message_id', replyToMessageId);

                    const tgResponse = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVoice`, formData, {
                        headers: formData.getHeaders()
                    });
                    telegramMessageId = tgResponse.data?.result?.message_id;
                } catch (e) {
                    console.error('Telegram voice send error', e);
                }
            }
        }

        const { data: savedMessage, error: saveError } = await supabase
            .from('messages')
            .insert({
                main_id: order.main_id,
                content: '🎤 Голосовое сообщение',
                author_type: 'manager',
                message_type: 'voice',
                manager_id: managerId,
                is_read: true,
                message_id_tg: telegramMessageId,
                reply_to_mess_id_tg: replyToMessageId,
                status: telegramMessageId ? 'delivered' : 'error',
                file_url: fileUrl,
                voice_duration: duration
            })
            .select('*, sender:managers!manager_id(id, name, email)')
            .single();

        if (saveError) throw saveError;

        await supabase.from('order_messages').insert({ order_id: order.id, message_id: savedMessage.id });

        return savedMessage;
    }

    async markClientMessagesRead(orderId: string | number) {
        const { leadIds, allRelatedOrderIds, telegramUserIds } = await this.getAllRelatedLeadIds(orderId);
        if (leadIds.length === 0 && telegramUserIds.length === 0) return;

        const orFilters: string[] = [];
        if (leadIds.length > 0) {
            orFilters.push(...leadIds.map(id => `main_id.eq.${id}`));
        }
        if (telegramUserIds.length > 0) {
            orFilters.push(...telegramUserIds.map(id => `telegram_user_id.eq.${id}`));
        }

        await supabase
            .from('messages')
            .update({ is_read: true })
            .or(orFilters.join(','))
            .eq('is_read', false)
            .neq('author_type', 'manager');

        // Reset unread count for all related orders
        if (allRelatedOrderIds.length > 0) {
            await Promise.all(allRelatedOrderIds.map(id =>
                supabase.rpc('reset_order_unread_count', { order_id_input: id })
            ));
        }
    }

    async markAllRead() {
        // Logic from original file to mark everything as read
        await supabase.from('messages').update({ is_read: true }).eq('is_read', false).neq('author_type', 'manager');
        return { success: true };
    }

    // --- Internal Messages ---

    async getInternalMessages(orderId: string | number, limit = 200, offset = 0) {
        const order = await this.resolveOrderId(orderId);
        if (!order) return { messages: [], total: 0 };
        const internalId = order.id;

        const { data, error } = await supabase
            .from('internal_messages')
            .select(`
              *,
              sender:managers(id, name, email),
              reply_to:internal_messages!reply_to_id(id, content, sender:managers(name))
          `)
            .eq('order_id', internalId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        const { count } = await supabase.from('internal_messages').select('id', { count: 'exact' }).eq('order_id', internalId);

        return { messages: (data || []).reverse(), total: count || 0 };
    }

    async sendInternalMessage({ orderId, content, replyToId, managerId }: { orderId: string | number; content: string; replyToId?: string | number; managerId: string | number }) {
        const order = await this.resolveOrderId(orderId);
        if (!order) throw new Error('Заявка не найдена');

        const { data, error } = await supabase
            .from('internal_messages')
            .insert({
                order_id: order.id,
                main_id: order.main_id,
                sender_id: managerId,
                content: content.trim(),
                reply_to_id: replyToId || null
            })
            .select(`
              *,
              sender:managers(id, name, email),
              reply_to:internal_messages!reply_to_id(id, content, sender:managers(name))
          `)
            .single();

        if (error) throw error;

        return data;
    }

    async sendInternalFile({ orderId, file, replyToId, managerId }: FilePayload) {
        const order = await this.resolveOrderId(orderId);
        if (!order) throw new Error('Заявка не найдена');

        const fileName = `${Date.now()}_${file.originalname}`;
        const filePath = `internal_files/${order.id}/${fileName}`;

        const fileContent = fs.readFileSync(file.path);
        const { error: uploadError } = await supabase.storage
            .from('attachments')
            .upload(filePath, fileContent, { contentType: file.mimetype });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);

        const { data, error } = await supabase
            .from('internal_messages')
            .insert({
                order_id: order.id,
                main_id: order.main_id,
                sender_id: managerId,
                content: `📎 ${file.originalname}`,
                reply_to_id: replyToId || null,
                attachment_url: urlData.publicUrl,
                attachment_type: file.mimetype.startsWith('image') ? 'image' : 'file',
                attachment_name: file.originalname,
            })
            .select(`*, sender:managers(id, name, email)`)
            .single();

        if (error) throw error;

        return data;
    }

    async sendInternalVoice({ orderId, file, duration, managerId }: FilePayload) {
        const order = await this.resolveOrderId(orderId);
        if (!order) throw new Error('Заявка не найдена');

        const inputBuffer = fs.readFileSync(file.path);
        const finalBuffer = inputBuffer;
        const finalContentType = file.mimetype || 'audio/ogg';
        const finalFileName = `${Date.now()}_voice_internal.ogg`;

        const filePath = `internal_files/${order.id}/${finalFileName}`;
        await supabase.storage.from('attachments').upload(filePath, finalBuffer, { contentType: finalContentType });
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);

        const { data, error } = await supabase
            .from('internal_messages')
            .insert({
                order_id: order.id,
                main_id: order.main_id,
                sender_id: managerId,
                content: '🎤 Голосовое сообщение',
                attachment_url: urlData.publicUrl,
                attachment_type: 'voice',
            })
            .select(`*, sender:managers(id, name, email)`)
            .single();

        if (error) throw error;

        return data;
    }

    async markInternalMessagesRead(orderId: string | number, managerId: string | number) {
        const order = await this.resolveOrderId(orderId);
        if (!order) return;

        await supabase
            .from('internal_messages')
            .update({ is_read: true })
            .eq('order_id', order.id)
            .neq('sender_id', managerId);
    }

    async getUnreadInternalCount(orderId: string | number, managerId: string | number) {
        const order = await this.resolveOrderId(orderId);
        if (!order) return 0;

        const { count, error } = await supabase
            .from('internal_messages')
            .select('id', { count: 'exact' })
            .eq('order_id', order.id)
            .eq('is_read', false)
            .neq('sender_id', managerId);
        if (error) throw error;
        return count || 0;
    }

    async getTimeline(params: { orderId?: string | number, contactId?: number }, limit = 50, before: string | null = null) {
        const { leadIds, internalId, currentMainId, allRelatedOrderIds, telegramUserIds } = await this.getAllRelatedLeadIds(params.orderId, params.contactId);
        if (leadIds.length === 0 && telegramUserIds.length === 0 && allRelatedOrderIds.length === 0) return { messages: [], meta: { total_fetched: 0, limit, has_more: false } };

        // Fetch Client Messages
        let clientQuery = supabase
            .from('messages')
            .select('*')
            .order('Created Date', { ascending: false })
            .limit(limit);

        const orFilters: string[] = [];
        if (leadIds.length > 0) {
            orFilters.push(...leadIds.map(id => `main_id.eq.${id}`));
        }
        if (telegramUserIds.length > 0) {
            orFilters.push(...telegramUserIds.map(id => `telegram_user_id.eq.${id}`));
        }

        if (orFilters.length > 0) {
            clientQuery = clientQuery.or(orFilters.join(','));
        } else {
            clientQuery = clientQuery.eq('id', -1); // Force empty
        }

        if (before) clientQuery = clientQuery.lt('Created Date', before);

        const { data: clientMsgs } = await clientQuery;

        // Fetch Internal Messages
        let internalQuery = supabase
            .from('internal_messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (currentMainId || allRelatedOrderIds.length > 0) {
            const filters: string[] = [];
            if (currentMainId) filters.push(`main_id.eq.${currentMainId}`);
            if (allRelatedOrderIds.length > 0) filters.push(...allRelatedOrderIds.map(id => `order_id.eq.${id}`));
            internalQuery = internalQuery.or(filters.join(','));
        } else {
            internalQuery = internalQuery.eq('id', -1);
        }

        if (before) internalQuery = internalQuery.lt('created_at', before);

        const { data: internalMsgs } = await internalQuery;

        // Normalize and Merge
        const allMessages = [
            ...(clientMsgs || []).map((m: any) => {
                const rawDate = m['Created Date'] || m.created_at;
                // Created Date is timestamp without timezone from Bubble, usually UTC or the one we want to treat as such
                const isoDate = rawDate ? (typeof rawDate === 'string' && !rawDate.includes('Z') && !rawDate.includes('+') ? rawDate.replace(' ', 'T') + 'Z' : new Date(rawDate).toISOString()) : new Date().toISOString();
                return {
                    ...m,
                    source_type: 'client',
                    date: isoDate,
                    sort_date: isoDate
                };
            }),
            ...(internalMsgs || [])
                .map((m: any) => {
                    const isoDate = new Date(m.created_at).toISOString();
                    return {
                        ...m,
                        source_type: 'internal',
                        date: isoDate,
                        sort_date: isoDate,
                        message_type: m.attachment_type === 'system' ? 'system' : 'text',
                        is_system: m.attachment_type === 'system'
                    };
                })
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const messages = allMessages.slice(0, limit);

        const has_more = allMessages.length > limit || (clientMsgs?.length === limit) || (internalMsgs?.length === limit);

        return {
            messages,
            meta: {
                total_fetched: messages.length,
                limit,
                has_more
            }
        };
    }
}

export default new OrderMessagesService();
