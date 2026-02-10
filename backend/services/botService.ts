import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import { Server } from 'socket.io';
import { sendMessageToUser } from '../utils/telegramUtils';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

interface TelegramFile {
    fileId: string;
    type: string;
    mimeType?: string;
    ext?: string;
}

interface AttachmentData {
    buffer: Buffer;
    mimeType: string;
    ext: string;
}

class BotService {
    async processTelegramFile({ fileId, type, mimeType, ext }: TelegramFile): Promise<AttachmentData | null> {
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

        try {
            const fileInfoRes = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);

            if (fileInfoRes.data.ok && fileInfoRes.data.result.file_path) {
                const filePath = fileInfoRes.data.result.file_path;
                console.log(`[processTelegramFile] Downloading ${type} from ${filePath}...`);

                // Extract extension from filePath if possible, fallback to provided ext
                const detectedExt = filePath.split('.').pop();
                const finalExt = detectedExt && detectedExt !== filePath ? detectedExt : ext;

                // Explicitly set mime type for common video formats to ensure playback
                const mimeMap: Record<string, string> = {
                    'mp4': 'video/mp4',
                    'mov': 'video/quicktime',
                    'webm': 'video/webm'
                };
                const finalMimeType = (type === 'video' || type === 'video_note') && finalExt && mimeMap[finalExt]
                    ? mimeMap[finalExt]
                    : mimeType || 'application/octet-stream';

                const fileRes = await axios.get(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`, {
                    responseType: 'arraybuffer',
                    maxContentLength: 50 * 1024 * 1024, // 50MB limit
                    maxBodyLength: 50 * 1024 * 1024
                });

                console.log(`[processTelegramFile] Downloaded ${type}, size: ${fileRes.data.length} bytes, ext: ${finalExt}, mime: ${finalMimeType}`);
                return {
                    buffer: Buffer.from(fileRes.data),
                    mimeType: finalMimeType,
                    ext: finalExt || 'bin'
                };
            } else {
                console.error(`[processTelegramFile] Failed to get file path for ${type}:`, fileInfoRes.data);
                return null;
            }
        } catch (e: any) {
            console.error(`[processTelegramFile] Error processing ${type}:`, e.message, e.response?.data);
            return null;
        }
    }

    async findOrCreateContact(telegramUserId: number, telegramUserInfo: any) {
        // 1. Ищем существующий контакт
        const { data: existingContact, error: contactError } = await supabase
            .from('contacts')
            .select('*')
            .eq('telegram_user_id', telegramUserId.toString())
            .maybeSingle();

        if (contactError && contactError.code !== 'PGRST116') {
            throw contactError;
        }

        // Определяем лучшее имя
        const firstName = telegramUserInfo?.first_name || '';
        const lastName = telegramUserInfo?.last_name || '';
        const username = telegramUserInfo?.username ? `@${telegramUserInfo.username}` : '';

        let contactName = [firstName, lastName].filter(Boolean).join(' ');
        if (!contactName && username) contactName = username;
        if (!contactName) contactName = `Пользователь ${telegramUserId}`;

        let contact;

        if (!existingContact) {
            // Создаем новый контакт
            const { data: newContact, error: createContactError } = await supabase
                .from('contacts')
                .insert({
                    name: contactName,
                    phone: null,
                    email: null,
                    telegram_user_id: telegramUserId.toString(),
                    status: 'active',
                    comment: 'Автоматически создан из Telegram бота'
                })
                .select()
                .single();

            if (createContactError) throw createContactError;
            contact = newContact;
        } else {
            contact = existingContact;

            // Проверяем возможность обновления имени
            const isGenericName = !contact.name ||
                contact.name.startsWith('User ') ||
                contact.name.startsWith('Пользователь ') ||
                contact.name === telegramUserId.toString();

            const validNewName = contactName && !contactName.startsWith('Пользователь ');

            if (isGenericName && validNewName) {
                console.log(`[bot.js] Updating contact name from "${contact.name}" to "${contactName}"`);
                const { data: updatedContact, error: updateError } = await supabase
                    .from('contacts')
                    .update({ name: contactName })
                    .eq('id', contact.id)
                    .select()
                    .single();

                if (!updateError && updatedContact) {
                    contact = updatedContact;
                }
            }
        }

        // Обновляем last_message_at
        await supabase
            .from('contacts')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', contact.id);

        return contact;
    }

    generateMainId() {
        return parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
    }

    async findOrCreateOrder(contact: any, io: Server | undefined) {
        const terminalStatuses = ['completed', 'scammer', 'client_rejected', 'lost'];

        // Ищем активную заявку
        const { data: activeOrder } = await supabase
            .from('orders')
            .select('*')
            .eq('contact_id', contact.id)
            .not('status', 'in', `(${terminalStatuses.join(',')})`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (activeOrder) {
            let currentOrder = activeOrder;
            // Если по какой-то причине нет main_id, добавляем его
            if (!currentOrder.main_id) {
                const newId = this.generateMainId();
                const { data: updatedOrder } = await supabase
                    .from('orders')
                    .update({ main_id: newId })
                    .eq('id', currentOrder.id)
                    .select()
                    .single();
                if (updatedOrder) currentOrder = updatedOrder;
            }
            return { order: currentOrder, isNew: false };
        } else {
            // Создаем новую заявку
            const newMainId = this.generateMainId();
            const { data: newOrder, error: createOrderError } = await supabase
                .from('orders')
                .insert({
                    contact_id: contact.id,
                    title: `Заявка от ${contact.name}`,
                    amount: 0,
                    currency: 'RUB',
                    status: 'unsorted',
                    type: 'inquiry',
                    source: 'telegram_bot',
                    description: 'Автоматически созданная заявка из Telegram бота',
                    created_at: new Date().toISOString(),
                    main_id: newMainId
                })
                .select()
                .single();

            if (createOrderError) throw createOrderError;

            // Сообщаем о новой заявке через сокеты
            if (io) {
                io.emit('new_order', newOrder);
            }

            return { order: newOrder, isNew: true };
        }
    }

    async uploadAttachment(orderId: string | number, attachmentData: AttachmentData) {
        if (!attachmentData || !attachmentData.buffer) return null;

        const fileName = `${Date.now()}_file.${attachmentData.ext || 'bin'}`;
        const filePath = `order_files/${orderId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('attachments')
            .upload(filePath, attachmentData.buffer, {
                contentType: attachmentData.mimeType || 'audio/ogg',
            });

        if (uploadError) {
            console.error('Storage upload error:', uploadError);
            return null;
        }

        const { data: urlData } = supabase.storage
            .from('attachments')
            .getPublicUrl(filePath);

        return urlData?.publicUrl;
    }

    async createMessage(order: any, content: string, telegramMessageId: number, replyToMessageId: number | null, messageType: string, fileUrl: string | null, io: Server | undefined) {
        const linkId = order.main_id;

        const { data: savedMessage, error: messageError } = await supabase
            .from('messages')
            .insert({
                lead_id: linkId,
                main_id: linkId,
                content: content,
                message_id_tg: telegramMessageId,
                reply_to_mess_id_tg: replyToMessageId,
                author_type: 'user',
                message_type: messageType,
                file_url: fileUrl,
                'Created Date': new Date().toISOString()
            })
            .select()
            .single();

        if (messageError) throw messageError;

        // Связываем через order_messages
        await supabase.from('order_messages').insert({
            order_id: order.id,
            message_id: savedMessage.id
        });

        // Отправляем события через Socket.IO
        if (io && savedMessage) {
            const socketPayload = {
                ...savedMessage,
                order_status: order.status
            };

            io.to(`order_${order.id}`).emit('new_client_message', savedMessage);
            // Legacy room support
            io.to(`lead_${linkId}`).emit('new_message', savedMessage);
            // Global emit for Inbox
            io.emit('new_message_global', socketPayload);
            // Emit for specific contact
            io.emit('contact_message', { contact_id: order.contact_id, message: savedMessage });
        }

        return linkId;
    }

    async sendMessageToCRM(
        telegramUserId: number,
        content: string,
        telegramUserInfo: any,
        io: Server | undefined,
        messageType: string = 'text',
        attachmentData: AttachmentData | null = null,
        replyToMessageId: number | null = null,
        telegramMessageId: number | null = null
    ) {
        try {
            // 1. Ищем или создаем контакт
            const contact = await this.findOrCreateContact(telegramUserId, telegramUserInfo);

            // 2. Ищем или создаем сделку
            const { order } = await this.findOrCreateOrder(contact, io);

            // 3. Загружаем файл, если есть
            let finalAttachmentUrl: string | null = null;
            if (attachmentData) {
                finalAttachmentUrl = await this.uploadAttachment(order.id, attachmentData);
            }

            // 4. Создаем сообщение
            const resultId = await this.createMessage(order, content, telegramMessageId || 0, replyToMessageId, messageType, finalAttachmentUrl, io);

            return resultId;

        } catch (error: any) {
            console.error('Error sending message to CRM:', error);
            return null;
        }
    }

    async handleReaction(reaction: any, io: Server | undefined) {
        const tgMessageId = reaction.message_id;
        const newReactions = reaction.new_reaction;

        const { data: messageData } = await supabase
            .from('messages')
            .select('id, lead_id, content, reactions')
            .eq('message_id_tg', tgMessageId)
            .maybeSingle();

        if (messageData) {
            const currentReactions: any[] = messageData.reactions || [];
            const otherReactions = Array.isArray(currentReactions)
                ? currentReactions.filter(r => r.author && r.author !== 'Client' && r.author !== 'Клиент')
                : [];

            const clientReactions = newReactions.map((r: any) => ({
                emoji: r.emoji,
                type: r.type,
                author: 'Client',
                created_at: new Date().toISOString()
            }));

            const mergedReactions = [...otherReactions, ...clientReactions];

            const { error: updateError } = await supabase
                .from('messages')
                .update({ reactions: mergedReactions })
                .eq('id', messageData.id);

            if (!updateError) {
                // Fetch fresh message separately to ensure data integrity
                const { data: freshMessage } = await supabase
                    .from('messages')
                    .select('*')
                    .eq('id', messageData.id)
                    .single();

                if (freshMessage) {
                    // Safety fallback: if fresh content is somehow missing/null, use original
                    if (!freshMessage.content && messageData.content) {
                        console.warn(`[bot.js] Content missing in fresh fetch! Restoring original content for msg ${messageData.id}`);
                        freshMessage.content = messageData.content;
                    }

                    console.log(`[bot.js] Updated reactions for message ${messageData.id}. Content: "${freshMessage.content}"`);

                    if (io) {
                        io.emit('message_updated', freshMessage);
                        if (freshMessage.lead_id) {
                            io.to(`lead_${freshMessage.lead_id}`).emit('message_updated', freshMessage);
                        }
                    }
                }
            }
        }
    }
}

export default new BotService();
