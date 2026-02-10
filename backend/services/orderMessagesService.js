const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');
const { escapeMarkdownV2 } = require('../utils/telegramUtils');
const { notifyErrorSubscribers } = require('../utils/notifyError');
const { convertToOgg } = require('../utils/audioConverter');
const { logError } = require('../utils/logger');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

class OrderMessagesService {

    // --- Client Messages ---

    async getClientMessages(orderId, limit = 200, offset = 0) {
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('id, main_id')
            .eq('id', orderId)
            .maybeSingle();

        if (orderError) throw orderError;
        if (!order || !order.main_id) return { messages: [], total: 0, mainId: null };

        const { data: messages, count, error: messagesError } = await supabase
            .from('messages')
            .select(`
        *,
        sender:managers!manager_id(id, name, email)
      `, { count: 'exact' })
            .eq('main_id', order.main_id)
            .order('Created Date', { ascending: false })
            .range(offset, offset + limit - 1);

        if (messagesError) throw messagesError;

        return {
            messages: (messages || []).reverse(),
            total: count || 0,
            mainId: order.main_id
        };
    }

    async sendClientMessage({ orderId, content, replyToMessageId, managerId }, io) {
        if (!content || !content.trim()) throw new Error('Сообщение не может быть пустым');

        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('id, contact_id, main_id')
            .eq('id', orderId)
            .single();

        if (orderError) throw orderError;

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
                let replyMarkup = null;

                if (content.trim().startsWith('{')) {
                    try {
                        const parsed = JSON.parse(content);
                        if (parsed.text || parsed.buttons) {
                            messageText = parsed.text || '';
                            if (parsed.buttons && Array.isArray(parsed.buttons)) {
                                const urlButtons = parsed.buttons.filter(b => b.type === 'url');
                                if (urlButtons.length > 0) {
                                    const inlineKeyboard = urlButtons.map(b => ({ text: b.text, url: b.url }));
                                    replyMarkup = { inline_keyboard: inlineKeyboard.map(b => [b]) };
                                }
                            }
                        }
                    } catch (e) { }
                }

                const escapedText = escapeMarkdownV2(messageText || 'Сообщение');
                const telegramPayload = {
                    chat_id: telegramUserId,
                    text: escapedText,
                    parse_mode: 'MarkdownV2',
                    reply_markup: replyMarkup
                };
                if (replyToMessageId) telegramPayload.reply_to_message_id = replyToMessageId;

                const response = await axios.post(
                    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
                    telegramPayload
                );
                telegramMessageId = response.data?.result?.message_id;

            } catch (tgError) {
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
                telegram_message_id: telegramMessageId,
                status: messageStatus,
                error_message: errorMessage
            })
            .select(`*, sender:managers!manager_id(id, name, email)`)
            .single();

        if (saveError) throw saveError;

        await supabase.from('order_messages').insert({
            order_id: parseInt(orderId),
            message_id: savedMessage.id
        });

        if (io) {
            const messageWithContact = { ...savedMessage, contact_id: order.contact_id };
            if (order.main_id) io.to(`main_${order.main_id}`).emit('new_message', messageWithContact);
            io.to(`order_${orderId}`).emit('new_client_message', messageWithContact);
            if (order.contact_id) io.to(`contact_${order.contact_id}`).emit('new_message', messageWithContact);
        }

        return savedMessage;
    }

    async sendClientFile({ orderId, file, caption, replyToMessageId, managerId }, io) {
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('id, contact_id, main_id')
            .eq('id', orderId)
            .single();
        if (orderError) throw orderError;

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
                    formData.append('document', fs.createReadStream(file.path), { filename: originalName, contentType: file.mimetype });
                    if (caption) formData.append('caption', caption);
                    if (replyToMessageId) formData.append('reply_to_message_id', replyToMessageId);

                    const tgResponse = await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, formData, {
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
                telegram_message_id: telegramMessageId,
                status: telegramMessageId ? 'delivered' : 'error',
                attachment_url: fileUrl,
                attachment_type: file.mimetype.startsWith('image') ? 'image' : 'file',
                attachment_name: originalName
            })
            .select('*, sender:managers!manager_id(id, name, email)')
            .single();

        if (saveError) throw saveError;

        await supabase.from('order_messages').insert({ order_id: parseInt(orderId), message_id: savedMessage.id });

        if (io) {
            if (order.main_id) io.to(`main_${order.main_id}`).emit('new_message', savedMessage);
            io.to(`order_${orderId}`).emit('new_client_message', savedMessage);
        }

        return savedMessage;
    }

    async sendClientVoice({ orderId, file, duration, replyToMessageId, managerId }, io) {
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('id, contact_id, main_id')
            .eq('id', orderId)
            .single();
        if (orderError) throw orderError;

        // Convert to OGG
        const inputBuffer = fs.readFileSync(file.path);
        let finalBuffer = inputBuffer;
        let finalContentType = 'audio/ogg';
        let finalFileName = `${Date.now()}_voice.ogg`;

        try {
            finalBuffer = await convertToOgg(inputBuffer, file.originalname);
        } catch (e) {
            console.error('Audio conversion failed', e);
        }

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
                    // We must upload BUFFER to Telegram if we converted it in memory
                    // But FormData with buffer requires options.
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
                telegram_message_id: telegramMessageId,
                status: telegramMessageId ? 'delivered' : 'error',
                attachment_url: fileUrl,
                attachment_type: 'voice',
                voice_duration: duration
            })
            .select('*, sender:managers!manager_id(id, name, email)')
            .single();

        if (saveError) throw saveError;

        await supabase.from('order_messages').insert({ order_id: parseInt(orderId), message_id: savedMessage.id });

        if (io) {
            if (order.main_id) io.to(`main_${order.main_id}`).emit('new_message', savedMessage);
            io.to(`order_${orderId}`).emit('new_client_message', savedMessage);
        }

        return savedMessage;
    }

    async markClientMessagesRead(orderId) {
        const { data: order } = await supabase.from('orders').select('main_id').eq('id', orderId).maybeSingle();
        if (!order || !order.main_id) return;

        await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('main_id', order.main_id)
            .eq('is_read', false)
            .neq('author_type', 'manager');

        // Reset unread count logic if separate table exists (orders.unread_count)
        await supabase.rpc('reset_order_unread_count', { order_id_input: orderId });
    }

    async markAllRead() {
        // Logic from original file to mark everything as read
        await supabase.from('messages').update({ is_read: true }).eq('is_read', false).neq('author_type', 'manager');
        return { success: true };
    }

    // --- Internal Messages ---

    async getInternalMessages(orderId, limit = 200, offset = 0) {
        const { data, error } = await supabase
            .from('internal_messages')
            .select(`
              *,
              sender:managers(id, name, email),
              reply_to:internal_messages!reply_to_id(id, content, sender:managers(name))
          `)
            .eq('order_id', orderId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;

        const { count } = await supabase.from('internal_messages').select('id', { count: 'exact' }).eq('order_id', orderId);

        return { messages: (data || []).reverse(), total: count || 0 };
    }

    async sendInternalMessage({ orderId, content, replyToId, managerId }, io) {
        const { data, error } = await supabase
            .from('internal_messages')
            .insert({
                order_id: parseInt(orderId),
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

        if (io) {
            io.to(`order_${orderId}`).emit('new_internal_message', data);
            io.emit('internal_message', { order_id: orderId, message: data });
        }

        return data;
    }

    async sendInternalFile({ orderId, file, replyToId, managerId }, io) {
        const fileName = `${Date.now()}_${file.originalname}`;
        const filePath = `internal_files/${orderId}/${fileName}`;

        const fileContent = fs.readFileSync(file.path);
        const { error: uploadError } = await supabase.storage
            .from('attachments')
            .upload(filePath, fileContent, { contentType: file.mimetype });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);

        const { data, error } = await supabase
            .from('internal_messages')
            .insert({
                order_id: parseInt(orderId),
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

        if (io) {
            io.to(`order_${orderId}`).emit('new_internal_message', data);
        }

        return data;
    }

    async sendInternalVoice({ orderId, file, duration, managerId }, io) {
        const inputBuffer = fs.readFileSync(file.path);
        let finalBuffer = inputBuffer;
        let finalContentType = 'audio/ogg';
        let finalFileName = `${Date.now()}_voice_internal.ogg`;

        try {
            finalBuffer = await convertToOgg(inputBuffer, file.originalname);
        } catch (e) {
            console.error('Audio conversion failed', e);
        }

        const filePath = `internal_files/${orderId}/${finalFileName}`;
        await supabase.storage.from('attachments').upload(filePath, finalBuffer, { contentType: finalContentType });
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);

        const { data, error } = await supabase
            .from('internal_messages')
            .insert({
                order_id: parseInt(orderId),
                sender_id: managerId,
                content: '🎤 Голосовое сообщение',
                attachment_url: urlData.publicUrl,
                attachment_type: 'voice',
            })
            .select(`*, sender:managers(id, name, email)`)
            .single();

        if (error) throw error;

        if (io) io.to(`order_${orderId}`).emit('new_internal_message', data);
        return data;
    }

    async markInternalMessagesRead(orderId, managerId) {
        await supabase
            .from('internal_messages')
            .update({ is_read: true })
            .eq('order_id', orderId)
            .neq('sender_id', managerId);
    }

    async getUnreadInternalCount(orderId, managerId) {
        const { count, error } = await supabase
            .from('internal_messages')
            .select('id', { count: 'exact' })
            .eq('order_id', orderId)
            .eq('is_read', false)
            .neq('sender_id', managerId);
        if (error) throw error;
        return count || 0;
    }

    async getTimeline(orderId, limit = 50, before = null) {
        // Fetch both client and internal messages, combine and sort
        // This is complex because pagination needs to be synchronized. 
        // For now, let's implement a simplified version or reuse the logic if it was in the route.
        // The previous route didn't show getTimeline implementation in snippets provided.
        // Assuming it's a standard merge sort of two arrays.

        const { data: order } = await supabase.from('orders').select('main_id').eq('id', orderId).maybeSingle();
        const mainId = order?.main_id;

        // Fetch Client Messages
        let clientQuery = supabase.from('messages').select('*').order('Created Date', { ascending: false }).limit(limit);
        if (mainId) clientQuery = clientQuery.eq('main_id', mainId);
        else clientQuery = clientQuery.eq('id', -1); // Force empty if no mainId

        if (before) clientQuery = clientQuery.lt('Created Date', before);

        const { data: clientMsgs } = await clientQuery;

        // Fetch Internal Messages
        let internalQuery = supabase.from('internal_messages').select('*').eq('order_id', orderId).order('created_at', { ascending: false }).limit(limit);
        if (before) internalQuery = internalQuery.lt('created_at', before);

        const { data: internalMsgs } = await internalQuery;

        // Normalize and Merge
        const allMessages = [
            ...(clientMsgs || []).map(m => ({ ...m, type: 'client', date: m['Created Date'] || m.created_at, sort_date: m['Created Date'] || m.created_at })),
            ...(internalMsgs || []).map(m => ({ ...m, type: 'internal', date: m.created_at, sort_date: m.created_at, message_type: 'text' })) // Internal default text
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        const messages = allMessages.slice(0, limit);

        // Simple heuristic for has_more: if we got full limit from either source, assume more exists.
        // Or better: if total fetched > limit (since we fetch limit from EACH), we definitely have more.
        // If total fetched < limit, we are done.
        // If total fetched == limit, unclear, but unlikely if we fetch limit from each.
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

module.exports = new OrderMessagesService();
