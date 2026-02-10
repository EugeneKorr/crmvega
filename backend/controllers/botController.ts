import { Request, Response } from 'express';
import botService from '../services/botService';
import { sendMessageToUser } from '../utils/telegramUtils';
import axios from 'axios';

class BotController {
    async webhook(req: Request, res: Response) {
        try {
            const update = req.body;
            const io = req.app.get('io');

            // --- Обработка входящего сообщения ---
            if (update.message) {
                const telegramUserId = update.message.from.id;
                const messageId = update.message.message_id;
                const telegramUserInfo = update.message.from;

                let messageText = update.message.text || update.message.caption || '';
                console.log(`[bot.js] Received message using refactored logic. Text/caption: "${messageText}"`);

                let messageType = 'text';
                let attachmentData: any = null;
                let replyToMessageId = null;

                if (update.message.reply_to_message) {
                    replyToMessageId = update.message.reply_to_message.message_id;
                }

                // Определение типа контента и скачивание файлов
                if (update.message.voice) {
                    messageType = 'voice';
                    if (!messageText) messageText = update.message.caption || '[Голосовое сообщение]';
                    attachmentData = await botService.processTelegramFile({
                        fileId: update.message.voice.file_id,
                        type: 'voice',
                        mimeType: 'audio/ogg',
                        ext: 'ogg'
                    });
                } else if (update.message.photo) {
                    messageType = 'image';
                    if (!messageText) messageText = update.message.caption || '[Фото]';
                    const photo = update.message.photo[update.message.photo.length - 1]; // Берем лучшее качество
                    attachmentData = await botService.processTelegramFile({
                        fileId: photo.file_id,
                        type: 'photo',
                        mimeType: 'image/jpeg',
                        ext: 'jpg'
                    });
                } else if (update.message.document) {
                    messageType = 'file';
                    if (!messageText) messageText = update.message.caption || '[Файл]';
                    const doc = update.message.document;
                    attachmentData = await botService.processTelegramFile({
                        fileId: doc.file_id,
                        type: 'document',
                        mimeType: doc.mime_type || 'application/octet-stream',
                        ext: doc.file_name ? doc.file_name.split('.').pop() : 'bin'
                    });
                } else if (update.message.sticker) {
                    messageType = 'image';
                    messageText = '[Стикер]';
                    attachmentData = await botService.processTelegramFile({
                        fileId: update.message.sticker.file_id,
                        type: 'sticker',
                        mimeType: 'image/webp',
                        ext: 'webp'
                    });
                } else if (update.message.video) {
                    messageType = 'video';
                    if (!messageText) messageText = update.message.caption || '[Видео]';
                    attachmentData = await botService.processTelegramFile({
                        fileId: update.message.video.file_id,
                        type: 'video',
                        mimeType: update.message.video.mime_type || 'video/mp4',
                        ext: 'mp4'
                    });
                } else if (update.message.video_note) {
                    messageType = 'video_note';
                    messageText = '[Видеообращение]';
                    attachmentData = await botService.processTelegramFile({
                        fileId: update.message.video_note.file_id,
                        type: 'video_note',
                        mimeType: 'video/mp4',
                        ext: 'mp4'
                    });
                }

                // Обработка команд
                if (messageText && messageText.startsWith('/')) {
                    if (messageText === '/start') {
                        await sendMessageToUser(telegramUserId, 'Привет! Я бот поддержки CRM системы. Напишите ваше сообщение, и менеджер свяжется с вами.');
                    }
                    return res.status(200).end();
                }

                // Отправка в CRM
                const leadId = await botService.sendMessageToCRM(
                    telegramUserId,
                    messageText,
                    telegramUserInfo,
                    io,
                    messageType,
                    attachmentData,
                    replyToMessageId,
                    messageId
                );

                if (!leadId) {
                    await sendMessageToUser(telegramUserId, 'Произошла ошибка при отправке сообщения. Попробуйте позже.');
                }
            }

            // --- Обработка callback (нажатие кнопок) ---
            if (update.callback_query) {
                const callbackQuery = update.callback_query;
                const telegramUserId = callbackQuery.from.id;
                const messageText = callbackQuery.data;
                const telegramUserInfo = callbackQuery.from;

                console.log(`[bot.js] Received callback_query: "${messageText}" from user ${telegramUserId}`);

                const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
                if (TELEGRAM_BOT_TOKEN) {
                    // Убираем часики загрузки
                    axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                        callback_query_id: callbackQuery.id
                    }).catch(err => console.error('[bot.js] Error answering callback:', err.message));

                    // Эхо сообщения в чат для наглядности действия
                    axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                        chat_id: telegramUserId,
                        text: messageText
                    }).catch(err => console.error('[bot.js] Error echoing callback:', err.message));
                }

                await botService.sendMessageToCRM(telegramUserId, messageText, telegramUserInfo, io);
            }

            // --- Обработка реакций ---
            if (update.message_reaction) {
                await botService.handleReaction(update.message_reaction, io);
            }

            res.status(200).end();
        } catch (error: any) {
            console.error('Webhook error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    testWebhook(req: Request, res: Response) {
        res.json({ status: 'ok', message: 'Telegram webhook endpoint' });
    }
}

export default new BotController();
