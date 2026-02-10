import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import FormData from 'form-data';
import { sendMessageToUser } from '../utils/telegramUtils';

const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

class MessageService {
    private async trackOperatorResponse(leadId: string | number, content: string) {
        try {
            if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return;

            await axios.post(
                `${process.env.SUPABASE_URL}/functions/v1/track-operator-response`,
                {
                    type: 'INSERT',
                    record: {
                        lead_id: leadId,
                        content: content,
                        author_type: 'Оператор',
                        timestamp: Math.floor(Date.now() / 1000)
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                }
            );
            console.log(`[TrackResponse] Tracked operator response for lead ${leadId}`);
        } catch (error: any) {
            console.error('Error tracking operator response:', error.message);
        }
    }

    async getByLead(leadId: string, limit: number = 100, offset: number = 0) {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('main_id', leadId)
            .order('"Created Date"', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;
        return (data || []).reverse();
    }

    async getByContact(contactId: string, limit: number = 200, offset: number = 0) {
        let targetContactId = contactId;

        const { data: contactResolve } = await supabase
            .from('contacts')
            .select('id')
            .eq('telegram_user_id', contactId)
            .maybeSingle();

        if (contactResolve) {
            targetContactId = contactResolve.id;
        }

        const { data: contact, error: contactError } = await supabase
            .from('contacts')
            .select(`
                id,
                telegram_user_id,
                orders(id, main_id, OrderName)
            `)
            .eq('id', targetContactId)
            .single();

        if (contactError) throw contactError;

        const leadIds = new Set<string>();
        if (contact?.telegram_user_id) leadIds.add(String(contact.telegram_user_id));

        const orders = (contact as any).orders || [];
        orders.forEach((o: any) => {
            if (o.main_id) leadIds.add(String(o.main_id));
        });

        const leadIdsArray = Array.from(leadIds);
        let allMessages: any[] = [];
        let total = 0;

        if (leadIdsArray.length > 0) {
            const { data: messages, count, error: messagesError } = await supabase
                .from('messages')
                .select(`
                    *,
                    sender:managers!manager_id(id, name, email)
                `, { count: 'exact' })
                .or(leadIdsArray.map(id => `main_id.eq.${id}`).join(','))
                .order('"Created Date"', { ascending: false })
                .range(offset, offset + limit - 1);

            if (messagesError) throw messagesError;
            allMessages = messages || [];
            total = count || 0;
        }

        const uniqueMessages = allMessages
            .filter((msg, index, self) => index === self.findIndex(m => m.id === msg.id))
            .reverse();

        return { messages: uniqueMessages, total };
    }

    async sendToContact(contactId: string, content: string, senderType: string, manager: any) {
        let targetContactId = contactId;
        const { data: contactResolve } = await supabase.from('contacts').select('id').eq('telegram_user_id', contactId).maybeSingle();
        if (contactResolve) targetContactId = contactResolve.id;

        const { data: activeOrder } = await supabase
            .from('orders')
            .select('id, main_id')
            .eq('contact_id', targetContactId)
            .in('status', ['unsorted', 'new', 'negotiation', 'waiting', 'ready_to_close'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        let orderId = activeOrder?.id;
        let leadId = activeOrder?.main_id;

        if (!orderId) {
            const { data: newOrder, error: orderError } = await supabase
                .from('orders')
                .insert({
                    contact_id: parseInt(targetContactId),
                    title: `Сообщение от ${new Date().toLocaleDateString('ru-RU')}`,
                    status: 'new',
                    type: 'inquiry',
                    manager_id: manager.id,
                })
                .select()
                .single();

            if (orderError) throw orderError;
            orderId = newOrder.id;
        }

        if (!leadId) {
            leadId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
            await supabase.from('orders').update({ main_id: leadId }).eq('id', orderId);
        }

        let telegramMessageId = null;
        let messageStatus = 'delivered';
        let errorMessage: string | null = null;

        if (senderType === 'manager' && leadId) {
            const { data: contact } = await supabase
                .from('contacts')
                .select('telegram_user_id')
                .eq('id', targetContactId)
                .single();

            if (contact && contact.telegram_user_id) {
                const { success, messageId } = await sendMessageToUser(contact.telegram_user_id, content);
                if (!success) {
                    messageStatus = 'error';
                    errorMessage = 'Ошибка отправки в Telegram';
                } else {
                    telegramMessageId = messageId;
                }
            }

            this.trackOperatorResponse(leadId, content).catch(err => console.error(err));
        }

        const { data: managerData } = await supabase.from('managers').select('name, email').eq('id', manager.id).single();
        const senderName = managerData?.name || manager.name;
        const senderEmail = managerData?.email || manager.email;

        const rawAuthor = senderName || (senderType === 'user' ? 'user' : 'Менеджер');
        const safeAuthorType = rawAuthor.length > 20 ? rawAuthor.substring(0, 20) : rawAuthor;
        const rawUser = senderName || senderEmail || '';
        const safeUser = rawUser.length > 20 ? rawUser.substring(0, 20) : rawUser;

        const { data: message, error: messageError } = await supabase
            .from('messages')
            .insert({
                main_id: leadId,
                content,
                author_type: safeAuthorType,
                status: messageStatus,
                error_message: errorMessage,
                message_id_tg: telegramMessageId,
                'Created Date': new Date().toISOString(),
                user: safeUser,
                manager_id: manager.id
            })
            .select(`
                *,
                sender:managers!manager_id(id, name, email)
            `)
            .single();

        if (messageError) throw messageError;

        await supabase.from('contacts').update({ last_message_at: new Date().toISOString() }).eq('id', targetContactId);

        if (orderId && message) {
            await supabase.from('order_messages').upsert({ order_id: orderId, message_id: message.id }, { onConflict: 'order_id,message_id' });
        }

        return message;
    }

    async sendVoiceToContact(contactId: string, file: any, duration: string, manager: any) {
        let targetContactId = contactId;
        const { data: contactResolve } = await supabase.from('contacts').select('id').eq('telegram_user_id', contactId).maybeSingle();
        if (contactResolve) targetContactId = contactResolve.id;

        const { data: activeOrder } = await supabase
            .from('orders')
            .select('id, main_id')
            .eq('contact_id', targetContactId)
            .in('status', ['unsorted', 'new', 'negotiation', 'waiting', 'ready_to_close'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        let orderId = activeOrder?.id;
        let leadId = activeOrder?.main_id;

        if (!orderId) {
            const { data: newOrder, error: orderError } = await supabase
                .from('orders')
                .insert({
                    contact_id: parseInt(targetContactId),
                    title: `Сообщение от ${new Date().toLocaleDateString('ru-RU')}`,
                    status: 'new',
                    type: 'inquiry',
                    manager_id: manager.id,
                })
                .select()
                .single();
            if (orderError) throw orderError;
            orderId = newOrder.id;
        }

        if (!leadId) {
            leadId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
            await supabase.from('orders').update({ main_id: leadId }).eq('id', orderId);
        }

        const finalBuffer = file.buffer;
        // Assuming client sent OGG Opus
        const contentType = file.mimetype || 'audio/ogg';

        const fileName = `${Date.now()}_voice.ogg`;
        const filePath = `order_files/${orderId}/${fileName}`;
        await supabase.storage.from('attachments').upload(filePath, finalBuffer, { contentType });
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
        const fileUrl = urlData?.publicUrl;

        let telegramMessageId = null;
        const { data: contact } = await supabase.from('contacts').select('telegram_user_id').eq('id', targetContactId).single();

        if (contact && contact.telegram_user_id && process.env.TELEGRAM_BOT_TOKEN) {
            const form = new FormData();
            form.append('chat_id', contact.telegram_user_id);
            form.append('voice', finalBuffer, { filename: 'voice.ogg', contentType: 'audio/ogg' });
            if (duration) form.append('duration', duration);

            try {
                const tgRes = await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendVoice`, form, { headers: form.getHeaders() });
                telegramMessageId = tgRes.data?.result?.message_id;
            } catch (tgError: any) {
                console.error('[VoiceContact] TG Error:', tgError.response?.data || tgError.message);
            }
        }

        const { data: message, error: messageError } = await supabase
            .from('messages')
            .insert({
                main_id: leadId,
                content: '🎤 Голосовое сообщение',
                author_type: 'Оператор',
                message_type: 'voice',
                message_id_tg: telegramMessageId,
                file_url: fileUrl,
                voice_duration: duration ? parseInt(duration) : null,
                'Created Date': new Date().toISOString(),
                is_outgoing: true,
                manager_id: manager.id
            })
            .select()
            .single();

        if (messageError) throw messageError;

        await supabase.from('order_messages').upsert({ order_id: orderId, message_id: message.id }, { onConflict: 'order_id,message_id' });
        await supabase.from('contacts').update({ last_message_at: new Date().toISOString() }).eq('id', targetContactId);

        return message;
    }

    async sendFileToContact(contactId: string, file: any, caption: string, manager: any) {
        let targetContactId = contactId;
        const { data: contactResolve } = await supabase.from('contacts').select('id').eq('telegram_user_id', contactId).maybeSingle();
        if (contactResolve) targetContactId = contactResolve.id;

        const { data: activeOrder } = await supabase
            .from('orders')
            .select('id, main_id')
            .eq('contact_id', targetContactId)
            .in('status', ['unsorted', 'new', 'negotiation', 'waiting', 'ready_to_close'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        let orderId = activeOrder?.id;
        let leadId = activeOrder?.main_id;

        if (!orderId) {
            const { data: newOrder, error: orderError } = await supabase
                .from('orders')
                .insert({
                    contact_id: parseInt(targetContactId),
                    title: `Сообщение от ${new Date().toLocaleDateString('ru-RU')}`,
                    status: 'new',
                    type: 'inquiry',
                    manager_id: manager.id,
                })
                .select()
                .single();
            if (orderError) throw orderError;
            orderId = newOrder.id;
        }

        if (!leadId) {
            leadId = parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
            await supabase.from('orders').update({ main_id: leadId }).eq('id', orderId);
        }

        const fileExt = file.originalname.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `order_files/${orderId}/${fileName}`;
        const contentType = file.mimetype;

        await supabase.storage.from('attachments').upload(filePath, file.buffer, { contentType });
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(filePath);
        const fileUrl = urlData?.publicUrl;

        let telegramMessageId = null;
        const { data: contact } = await supabase.from('contacts').select('telegram_user_id').eq('id', targetContactId).single();

        if (contact && contact.telegram_user_id && process.env.TELEGRAM_BOT_TOKEN) {
            const form = new FormData();
            form.append('chat_id', contact.telegram_user_id);
            const isImage = contentType.startsWith('image/');
            const endpoint = isImage ? 'sendPhoto' : 'sendDocument';
            const fieldName = isImage ? 'photo' : 'document';
            form.append(fieldName, file.buffer, { filename: file.originalname, contentType });
            if (caption) form.append('caption', caption);

            try {
                const tgRes = await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${endpoint}`, form, { headers: form.getHeaders() });
                telegramMessageId = tgRes.data?.result?.message_id;
            } catch (tgError: any) {
                console.error('[FileContact] TG Error:', tgError.response?.data || tgError.message);
            }
        }

        const isImage = contentType.startsWith('image/');
        const { data: message, error: messageError } = await supabase
            .from('messages')
            .insert({
                main_id: leadId,
                content: caption || (isImage ? 'Картинка' : 'Файл'),
                author_type: 'Оператор',
                message_type: isImage ? 'image' : 'file',
                message_id_tg: telegramMessageId,
                file_url: fileUrl,
                file_name: file.originalname,
                caption: caption,
                'Created Date': new Date().toISOString(),
                is_outgoing: true,
                manager_id: manager.id
            })
            .select()
            .single();

        if (messageError) throw messageError;

        await supabase.from('order_messages').upsert({ order_id: orderId, message_id: message.id }, { onConflict: 'order_id,message_id' });
        await supabase.from('contacts').update({ last_message_at: new Date().toISOString() }).eq('id', targetContactId);

        return message;
    }

    async addReaction(messageId: string, emoji: string, manager: any) {
        const { data: message, error: fetchError } = await supabase
            .from('messages')
            .select('id, reactions, main_id, message_id_tg, content')
            .eq('id', messageId)
            .single();

        if (fetchError) throw fetchError;

        const currentReactions: any[] = message.reactions || [];
        const myExistingReactionIndex = currentReactions.findIndex(r => r.author_id === manager.id);
        let updatedReactions = [...currentReactions];

        if (myExistingReactionIndex >= 0) {
            const existingEmoji = currentReactions[myExistingReactionIndex].emoji;
            updatedReactions.splice(myExistingReactionIndex, 1);
            if (existingEmoji !== emoji) {
                updatedReactions.push({
                    emoji,
                    author: manager.name,
                    author_id: manager.id,
                    created_at: new Date().toISOString()
                });
            }
        } else {
            updatedReactions.push({
                emoji,
                author: manager.name,
                author_id: manager.id,
                created_at: new Date().toISOString()
            });
        }

        const { error: updateError } = await supabase.from('messages').update({ reactions: updatedReactions }).eq('id', messageId);
        if (updateError) throw updateError;

        const { data: updatedMessage, error: fetchFreshError } = await supabase.from('messages').select('*').eq('id', messageId).single();
        if (fetchFreshError || !updatedMessage) throw fetchFreshError || new Error('Failed to fetch updated message');

        if (!updatedMessage.content && message.content) updatedMessage.content = message.content;

        // TG Sync
        if (updatedMessage.message_id_tg && process.env.TELEGRAM_BOT_TOKEN) {
            try {
                let telegramUserId = null;
                if (updatedMessage.main_id) {
                    const { data: orderData } = await supabase.from('orders').select('contact_id').eq('main_id', updatedMessage.main_id).limit(1).maybeSingle();
                    if (orderData?.contact_id) {
                        const { data: contactData } = await supabase.from('contacts').select('telegram_user_id').eq('id', orderData.contact_id).single();
                        telegramUserId = contactData?.telegram_user_id;
                    }
                }

                if (!telegramUserId) {
                    const { data: orderMsgData } = await supabase.from('order_messages').select('order_id').eq('message_id', messageId).limit(1).maybeSingle();
                    if (orderMsgData?.order_id) {
                        const { data: orderData } = await supabase.from('orders').select('contact_id').eq('id', orderMsgData.order_id).single();
                        if (orderData?.contact_id) {
                            const { data: contactData } = await supabase.from('contacts').select('telegram_user_id').eq('id', orderData.contact_id).single();
                            telegramUserId = contactData?.telegram_user_id;
                        }
                    }
                }

                if (telegramUserId) {
                    const myReaction = updatedReactions.find(r => r.author_id === manager.id);
                    const reactionPayload = myReaction ? [{ type: 'emoji', emoji: myReaction.emoji }] : [];
                    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setMessageReaction`, {
                        chat_id: telegramUserId,
                        message_id: updatedMessage.message_id_tg,
                        reaction: reactionPayload
                    });
                }
            } catch (e) {
                console.error('[Reaction] TG sync error:', e);
            }
        }

        return updatedMessage;
    }
}

export default new MessageService();
