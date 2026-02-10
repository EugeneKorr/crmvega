const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const auth = require('../middleware/auth');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const { notifyErrorSubscribers } = require('../utils/notifyError');
const { convertToOgg } = require('../utils/audioConverter');

const { clearCache } = require('../utils/cache');
const { logError } = require('../utils/logger');

const router = express.Router();

// Helper to create and emit system message
// Helper to create and emit system message
async function createAndEmitSystemMessage(supabase, io, orderId, mainId, content, contactId = null) {
  try {
    // 1. Insert into messages
    const { data: sysMsg, error } = await supabase
      .from('messages')
      .insert({
        main_id: mainId,
        content: content,
        author_type: 'system',
        message_type: 'system',
        'Created Date': new Date().toISOString(),
        user: 'System',
        is_read: true,
        status: 'delivered'
      })
      .select()
      .single();

    if (error) throw error;

    // 2. Link to order
    await supabase.from('order_messages').upsert({
      order_id: parseInt(orderId),
      message_id: sysMsg.id
    }, { onConflict: 'order_id,message_id' });

    // 3. Emit socket event
    if (io) {
      console.log(`[SystemMessage] Emitting events for Order ${orderId}, Main ${mainId}, Contact ${contactId}`);
      io.to(`order_${orderId}`).emit('new_client_message', sysMsg);
      if (mainId) {
        if (mainId) io.to(`main_${mainId}`).emit('new_client_message', sysMsg);
        if (order.contact_id) io.to(`contact_${order.contact_id}`).emit('new_client_message', sysMsg);
      }
      if (contactId) {
        console.log(`[SystemMessage] Emitting contact_message to contact ${contactId}`);
        io.emit('contact_message', { contact_id: contactId, message: sysMsg });
      } else {
        console.warn(`[SystemMessage] NO contactId provided, skipping contact_message emit`);
      }
    } else {
      console.error(`[SystemMessage] IO instance missing!`);
    }
  } catch (err) {
    console.error('[SystemMessage] Error creating system message:', err);
  }
}
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Настройка multer для загрузки файлов в память
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// ==============================================
// СООБЩЕНИЯ КЛИЕНТУ (из Telegram через Bubble или напрямую)
// ==============================================

// Получить все сообщения заявки
router.get('/:orderId/client', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { limit = 200, offset = 0 } = req.query;

    // Получаем заявку - нужен только main_id
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, main_id')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      console.error('Supabase error fetching order:', orderError);
      throw orderError;
    }

    if (!order) {
      console.warn(`Order ${orderId} not found`);
      return res.json({
        messages: [],
        total: 0,
        mainId: null,
      });
    }

    // Если нет main_id - нет сообщений
    if (!order.main_id) {
      return res.json({
        messages: [],
        total: 0,
        mainId: null,
      });
    }

    const limitNum = parseInt(limit) || 200;
    const offsetNum = parseInt(offset) || 0;

    // Один оптимизированный запрос для всех сообщений (сначала новые)
    // Используем raw запрос, если ORM вызывает проблемы
    const { data: messages, count, error: messagesError } = await supabase
      .from('messages') // Explicit .from() usually better than .select() directly on client
      .select(`
        *,
        sender:managers!manager_id(id, name, email)
      `, { count: 'exact' })
      .eq('main_id', order.main_id)
      .order('Created Date', { ascending: false }) // Try without quotes if previously failed, or keep consistent
      .range(offsetNum, offsetNum + limitNum - 1); // Use validated numbers

    if (messagesError) {
      console.error('Supabase error fetching messages:', messagesError);
      // Don't throw 400 if it's just a range error or similar - return empty?
      // But usually this means syntax error.
      // throw messagesError; 
      // Let's degrade gracefully
      return res.status(200).json({  // Return 200 but check logs
        messages: [],
        total: 0,
        mainId: order.main_id,
        error: messagesError.message
      });
    }

    // Разворачиваем для хронологического порядка
    const sortedMessages = (messages || []).reverse();

    res.json({
      messages: sortedMessages,
      total: count || 0,
      mainId: order.main_id,
      debug_time: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching order client messages [FULL]:', error);
    res.status(400).json({ error: error.message || 'Unknown error', details: error });
  }
});

// Отправить сообщение клиенту в Telegram
router.post('/:orderId/client', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { content, reply_to_message_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    // Получаем заявку
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, contact_id, main_id')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    // Находим telegram_user_id клиента
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
      return res.status(400).json({ error: 'Не найден Telegram ID клиента' });
    }

    // Отправляем в Telegram
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    let telegramMessageId = null;
    let messageStatus = 'delivered';
    let errorMessage = null;
    let systemErrorContent = null;

    if (TELEGRAM_BOT_TOKEN) {
      try {
        // Импортируем функцию экранирования
        const { escapeMarkdownV2 } = require('./bot');

        // Logic to support JSON content (text + buttons)
        let messageText = content;
        let replyMarkup = null;

        if (content && content.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(content);
            if (parsed.text || parsed.buttons) {
              messageText = parsed.text || ''; // Use parsed text for Telegram

              // Intelligent Keyboard Switching
              const urlButtons = parsed.buttons.filter(b => b.type === 'url');
              const actionButtons = parsed.buttons.filter(b => b.type !== 'url');
              let secondaryMarkup = null;

              // 1. Handle URL Buttons (Always Inline)
              if (urlButtons.length > 0) {
                const inlineKeyboard = urlButtons.map(b => ({ text: b.text, url: b.url }));
                replyMarkup = { inline_keyboard: inlineKeyboard.map(b => [b]) };
              }

              // 2. Handle Action Buttons (Always Reply Keyboard for Bubble)
              if (actionButtons.length > 0) {
                const keyboardRows = actionButtons.map(b => [{ text: b.text }]);
                const actionMarkup = {
                  keyboard: keyboardRows,
                  resize_keyboard: true,
                  one_time_keyboard: true
                };

                // If we ALREADY have replyMarkup (for URLs), we need a secondary message for actions
                if (replyMarkup) {
                  secondaryMarkup = actionMarkup;
                } else {
                  replyMarkup = actionMarkup;
                }
              }
            }
          } catch (e) {
            // Ignore parse error, treat as raw text
          }
        }

        if (!messageText.trim()) {
          if (replyMarkup) messageText = 'Сообщение';
        }

        // Apply escaping AFTER modifying messageText
        const escapedText = escapeMarkdownV2(messageText);

        const telegramPayload = {
          chat_id: telegramUserId,
          text: escapedText,
          parse_mode: 'MarkdownV2',
        };

        if (replyMarkup) {
          telegramPayload.reply_markup = replyMarkup;
        }

        if (reply_to_message_id) {
          telegramPayload.reply_to_message_id = reply_to_message_id;
        }

        const response = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
          telegramPayload
        );
        telegramMessageId = response.data?.result?.message_id;

        // Send Secondary Message (Actions) if needed
        if (typeof secondaryMarkup !== 'undefined' && secondaryMarkup) {
          try {
            await axios.post(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
              {
                chat_id: telegramUserId,
                text: escapeMarkdownV2('Выберите действие:'),
                parse_mode: 'MarkdownV2',
                reply_markup: secondaryMarkup
              }
            );
          } catch (secErr) {
            console.error('Error sending secondary action menu:', secErr.message);
          }
        }
      } catch (tgError) {
        console.error('Telegram send error:', tgError.response?.data || tgError.message);

        // Если ошибка связана с парсингом Markdown, пробуем отправить без форматирования
        if (tgError.response?.data?.description?.includes('parse')) {
          try {
            console.log('[orderMessages] Retrying without MarkdownV2 due to parse error');

            // Logic to support JSON content (text + buttons)
            let retryText = content;
            let retryMarkup = null;

            if (content && content.trim().startsWith('{')) {
              try {
                const parsed = JSON.parse(content);
                if (parsed.text) retryText = parsed.text;
                // Note: accessing "replyMarkup" variable from outer scope if defined...
                // But in this catch block, try to reconstruct or use safe defaults
                // Actually, "replyMarkup" was calculated in the try block above. 
                // Let's re-calculate to be safe or assuming "replyMarkup" is available if we use let replyMarkup = null at top.
                // Actually, scopes: replyMarkup is defined in the outer try block? No, I defined it inside "if (TELEGRAM_BOT_TOKEN) { try { ..."
                // Wait, in my previous edit, I defined "let replyMarkup = null" INSIDE "try { ... }".
                // Then used it.
                // If error happens, I am in "catch".
                // Creating "retryMarkup" again is correct.
                // But I need to extract buttons again.
                if (parsed.buttons && Array.isArray(parsed.buttons) && parsed.buttons.length > 0) {
                  const inlineKeyboard = parsed.buttons.map(btn => {
                    if (btn.type === 'url' && btn.url) return { text: btn.text, url: btn.url };
                    return { text: btn.text, callback_data: btn.text.substring(0, 20) };
                  });
                  retryMarkup = { inline_keyboard: inlineKeyboard.map(b => [b]) };
                }
              } catch (e) { }
            }

            const telegramPayload = {
              chat_id: telegramUserId,
              text: retryText, // Отправляем текст без экранирования
            };

            if (retryMarkup) {
              telegramPayload.reply_markup = retryMarkup;
            }

            if (reply_to_message_id) {
              telegramPayload.reply_to_message_id = reply_to_message_id;
            }

            const response = await axios.post(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
              telegramPayload
            );
            telegramMessageId = response.data?.result?.message_id;
          } catch (retryError) {
            console.error('Retry send error:', retryError.response?.data || retryError.message);
            // proceed to Save DB (don't return error)
            // return res.status(400).json({ error: 'Ошибка отправки в Telegram: ' + (retryError.response?.data?.description || retryError.message) });
          }
        } else {
          console.error('Telegram non-parse error, proceeding to DB save.');
          const errorCode = tgError.response?.data?.error_code;
          if (errorCode === 403) {
            messageStatus = 'blocked';
            errorMessage = 'Пользователь заблокировал бота';
            systemErrorContent = '🚫 Пользователь заблокировал бота (403)';
          } else if (errorCode === 400) {
            messageStatus = 'deleted_chat';
            errorMessage = 'Пользователь удалил чат с ботом';
            systemErrorContent = '💔 Пользователь удалил чат с ботом (400 или другая ошибка)';
          } else {
            messageStatus = 'error';
            errorMessage = tgError.response?.data?.description || tgError.message;
            systemErrorContent = '💔 Пользователь удалил чат с ботом (400 или другая ошибка)';
          }

          // Log error to DB
          logError('order_messages', `Telegram Send Error: ${errorMessage}`, {
            orderId,
            errorCode,
            telegramUserId,
            fullError: tgError.response?.data
          });

          notifyErrorSubscribers(`🔴 Ошибка отправки SMS (Order ${orderId}):\n${errorMessage}`);
        }
      }
    }

    // Get fresh manager info
    const { data: managerData } = await supabase
      .from('managers')
      .select('name, email')
      .eq('id', req.manager.id)
      .single();

    const senderName = managerData?.name || req.manager.name;
    const senderEmail = managerData?.email || req.manager.email;

    // Truncate fields to match DB constraints (varchar(20))
    const rawAuthor = senderName || 'Оператор';
    const safeAuthorType = rawAuthor.length > 20 ? rawAuthor.substring(0, 20) : rawAuthor;

    const rawUser = senderName || senderEmail || '';
    const safeUser = rawUser.length > 20 ? rawUser.substring(0, 20) : rawUser;

    // Сохраняем сообщение в базе
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: order.main_id, // Backward compatibility if needed, using main_id value
        main_id: order.main_id,
        content: content.trim(),
        author_type: safeAuthorType,
        message_type: 'text',
        message_id_tg: telegramMessageId,
        reply_to_mess_id_tg: reply_to_message_id || null,
        'Created Date': new Date().toISOString(),
        user: safeUser,
        user: safeUser,
        manager_id: req.manager.id,
        status: messageStatus,
        error_message: errorMessage
      })
      .select(`
        *,
        sender:managers!manager_id(id, name, email)
      `)
      .single();

    if (messageError) throw messageError;

    // Связываем сообщение с заявкой
    await supabase
      .from('order_messages')
      .upsert({
        order_id: parseInt(orderId),
        message_id: message.id,
      }, { onConflict: 'order_id,message_id' });

    // UPDATE CONTACT: Bump conv to top on manager reply
    if (order.contact_id) {
      await supabase
        .from('contacts')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', order.contact_id);
      clearCache('contacts');
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`order_${orderId}`).emit('new_client_message', message);
      if (order.main_id) {
        io.to(`main_${order.main_id}`).emit('new_client_message', message);
        if (order.contact_id) io.to(`contact_${order.contact_id}`).emit('new_client_message', message);
      }
      if (order.contact_id) {
        io.emit('contact_message', { contact_id: order.contact_id, message });
      }
    }

    // AUTO-READ LOGIC: If manager replies, mark all previous client messages as read
    if (order.main_id) {
      // Run asynchronously to not block response
      (async () => {
        try {
          // Use the same robust RPC for auto-read
          const { data: updatedCount, error: rpcError } = await supabase
            .rpc('mark_messages_read', { p_main_id: String(order.main_id) });

          if (!rpcError && io) {
            if (updatedCount > 0) clearCache('orders');
            io.emit('messages_read', { orderId, mainId: order.main_id, all: false });
          }
        } catch (err) {
          console.error('[OrderMessages] Auto-read update failed:', err);
        }
      })();
    }

    // Send System Message if error occurred
    if (systemErrorContent) {
      await createAndEmitSystemMessage(supabase, req.app.get('io'), orderId, order.main_id, systemErrorContent, order.contact_id);
    }

    res.json(message);
  } catch (error) {
    console.error('Error sending client message:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отметить сообщения клиента как прочитанные
router.post('/:orderId/client/read', auth, async (req, res) => {
  try {
    const { orderId } = req.params;

    // Получаем main_id заявки
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('main_id')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;
    if (!order.main_id) return res.json({ success: true });

    // Используем RPC функцию с SECURITY DEFINER для обхода RLS
    // Это гарантирует обновление, даже если не хватает прав у текущего токена
    const { data: updatedCount, error: rpcError } = await supabase
      .rpc('mark_messages_read', { p_main_id: String(order.main_id) });

    if (rpcError) throw rpcError;

    console.log(`[ReadStatus] Order ${orderId}: RPC marked ${updatedCount} messages.`);

    if (updatedCount > 0) clearCache('orders');

    // Socket.IO notification to update counters
    const io = req.app.get('io');
    if (io) {
      // Notify everyone (or specific room) that messages were read
      // This forces clients to re-fetch unread counts
      io.emit('messages_read', { orderId, mainId: order.main_id });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking client messages as read:', error);
    res.status(400).json({ error: error.message });
  }
});

// NEW: Отметить ВСЕ сообщения всех клиентов как прочитанные
router.post('/read-all', auth, async (req, res) => {
  try {
    console.log('[OrderMessages] Marking ALL messages as read by user:', req.manager.email);

    // 1. Отмечаем абсолютно ВСЕ непрочитанные сообщения как прочитанные
    // Без фильтрации по автору, чтобы убрать "зависшие" уведомления от менеджеров или тестов
    const { data, error, count } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('is_read', false)
      .select('id', { count: 'exact' });

    if (error) throw error;

    console.log(`[OrderMessages] Marked ${count || 0} messages as read.`);

    if (count > 0) {
      clearCache('orders');
      clearCache('messages');
    }

    // 2. Отправляем сокет-событие, чтобы у всех обновились счетчики
    const io = req.app.get('io');
    if (io) {
      io.emit('messages_read', { all: true });
    }

    res.json({ success: true, count });
  } catch (error) {
    console.error('Error marking ALL messages as read:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить файл клиенту
router.post('/:orderId/client/file', auth, upload.single('file'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { caption, reply_to_message_id } = req.body;

    console.log(`[OrderMessages File] Starting file upload for order ${orderId}`);
    console.log(`[OrderMessages File] File received:`, {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size
    });

    if (!req.file) {
      console.error('[OrderMessages File] No file in request');
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    // Получаем заявку
    console.log(`[OrderMessages File] Fetching order ${orderId}...`);
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, contact_id, main_id')
      .eq('id', orderId)
      .single();

    if (orderError) {
      console.error('[OrderMessages File] Order fetch error:', orderError);
      throw orderError;
    }
    console.log(`[OrderMessages File] Order found:`, { id: order.id, contact_id: order.contact_id, main_id: order.main_id });

    let telegramUserId = null;

    if (order.contact_id) {
      console.log(`[OrderMessages File] Fetching contact ${order.contact_id}...`);
      const { data: contact } = await supabase
        .from('contacts')
        .select('telegram_user_id')
        .eq('id', order.contact_id)
        .single();
      telegramUserId = contact?.telegram_user_id;
      console.log(`[OrderMessages File] Contact TG ID:`, telegramUserId);
    }

    if (!telegramUserId) {
      console.error('[OrderMessages File] No Telegram ID found for contact');
      return res.status(400).json({ error: 'Не найден Telegram ID клиента' });
    }

    // Загружаем файл в Supabase Storage
    console.log(`[OrderMessages File] Uploading to Supabase Storage...`);
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const ext = originalName.split('.').pop();
    const fileName = `${Date.now()}_file.${ext}`;
    const filePath = `order_files/${orderId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
      });

    if (uploadError) {
      console.error('[OrderMessages File] ❌ Storage upload error:', uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }
    console.log(`[OrderMessages File] ✅ File uploaded to storage: ${filePath}`);

    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);

    const fileUrl = urlData?.publicUrl;
    console.log(`[OrderMessages File] Public URL:`, fileUrl);

    // Отправляем в Telegram
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    let telegramMessageId = null;
    let systemErrorContent = null;

    if (TELEGRAM_BOT_TOKEN) {
      try {
        console.log(`[OrderMessages File] Sending to Telegram user ${telegramUserId}...`);

        // Импортируем функцию экранирования
        const { escapeMarkdownV2 } = require('./bot');

        // Обрабатываем caption так же, как content в текстовых сообщениях
        let captionText = caption || '';
        let replyMarkup = null;
        let parseMode = null;

        // Проверяем, является ли caption JSON с кнопками
        if (caption && caption.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(caption);
            console.log('[OrderMessages File] 📋 Parsed caption JSON:', JSON.stringify(parsed, null, 2));

            if (parsed.text || parsed.buttons) {
              captionText = parsed.text || '';

              // Intelligent Keyboard Switching (как в текстовых сообщениях)
              const urlButtons = parsed.buttons?.filter(b => b.type === 'url') || [];
              const actionButtons = parsed.buttons?.filter(b => b.type !== 'url') || [];

              console.log('[OrderMessages File] 🔗 URL Buttons found:', urlButtons.length, JSON.stringify(urlButtons));
              console.log('[OrderMessages File] ⚡ Action Buttons found:', actionButtons.length, JSON.stringify(actionButtons));

              // 1. Handle URL Buttons (Always Inline)
              if (urlButtons.length > 0) {
                const inlineKeyboard = urlButtons.map(b => ({ text: b.text, url: b.url }));
                replyMarkup = { inline_keyboard: inlineKeyboard.map(b => [b]) };
                console.log('[OrderMessages File] ✅ Created Inline Keyboard:', JSON.stringify(replyMarkup));
              }

              // 2. Handle Action Buttons (Only if no URL buttons - URL buttons have priority)
              if (actionButtons.length > 0 && !replyMarkup) {
                const keyboardRows = actionButtons.map(b => [{ text: b.text }]);
                replyMarkup = {
                  keyboard: keyboardRows,
                  resize_keyboard: true,
                  one_time_keyboard: true
                };
                console.log('[OrderMessages File] ✅ Created Reply Keyboard:', JSON.stringify(replyMarkup));
              }
            }
          } catch (e) {
            // Ignore parse error, treat as raw text
            console.log('[OrderMessages File] Caption is not valid JSON, using as plain text');
          }
        }

        // Применяем экранирование к тексту caption, если он не пустой
        if (captionText && captionText.trim()) {
          // Пробуем с MarkdownV2
          parseMode = 'MarkdownV2';
          captionText = escapeMarkdownV2(captionText);
        }

        const formData = new FormData();
        formData.append('chat_id', telegramUserId);

        const fileOptions = {
          filename: originalName,
          contentType: req.file.mimetype,
        };

        // Определяем, это изображение или документ
        const isImage = req.file.mimetype.startsWith('image/');
        const endpoint = isImage ? 'sendPhoto' : 'sendDocument';
        const fieldName = isImage ? 'photo' : 'document';

        console.log(`[OrderMessages File] 📷 File type: ${req.file.mimetype}, using ${endpoint}`);

        formData.append(fieldName, req.file.buffer, fileOptions);

        if (captionText && captionText.trim()) {
          formData.append('caption', captionText);
          if (parseMode) {
            formData.append('parse_mode', parseMode);
          }
        }

        if (reply_to_message_id) {
          formData.append('reply_to_message_id', reply_to_message_id);
        }

        if (replyMarkup) {
          formData.append('reply_markup', JSON.stringify(replyMarkup));
          console.log('[OrderMessages File] 📨 Sending with reply_markup:', JSON.stringify(replyMarkup));
        } else {
          console.log('[OrderMessages File] ⚠️ No reply_markup to send');
        }

        const response = await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${endpoint}`,
          formData,
          { headers: formData.getHeaders() }
        );
        telegramMessageId = response.data?.result?.message_id;
        console.log(`[OrderMessages File] ✅ Sent to Telegram, message_id: ${telegramMessageId}`);

        // Removed secondary message - now showing only URL buttons (Inline) or Action buttons (Reply Keyboard)
      } catch (tgError) {
        console.error('[OrderMessages File] ❌ Telegram send error:', tgError.response?.data || tgError.message);

        // Если ошибка связана с парсингом Markdown, пробуем отправить без форматирования
        if (tgError.response?.data?.description?.includes('parse')) {
          try {
            console.log('[OrderMessages File] Retrying without MarkdownV2 due to parse error');

            // Re-parse caption без экранирования
            let retryCaptionText = caption || '';
            let retryReplyMarkup = null;

            if (caption && caption.trim().startsWith('{')) {
              try {
                const parsed = JSON.parse(caption);
                if (parsed.text) retryCaptionText = parsed.text;

                // Восстанавливаем кнопки
                if (parsed.buttons && Array.isArray(parsed.buttons) && parsed.buttons.length > 0) {
                  const urlButtons = parsed.buttons.filter(b => b.type === 'url');
                  const actionButtons = parsed.buttons.filter(b => b.type !== 'url');

                  if (urlButtons.length > 0) {
                    const inlineKeyboard = urlButtons.map(b => ({ text: b.text, url: b.url }));
                    retryReplyMarkup = { inline_keyboard: inlineKeyboard.map(b => [b]) };
                  } else if (actionButtons.length > 0) {
                    const keyboardRows = actionButtons.map(b => [{ text: b.text }]);
                    retryReplyMarkup = {
                      keyboard: keyboardRows,
                      resize_keyboard: true,
                      one_time_keyboard: true
                    };
                  }
                }
              } catch (e) { }
            }

            const retryFormData = new FormData();
            retryFormData.append('chat_id', telegramUserId);

            // Используем те же endpoint и fieldName, что и в основной отправке
            const isImage = req.file.mimetype.startsWith('image/');
            const retryEndpoint = isImage ? 'sendPhoto' : 'sendDocument';
            const retryFieldName = isImage ? 'photo' : 'document';

            retryFormData.append(retryFieldName, req.file.buffer, {
              filename: originalName,
              contentType: req.file.mimetype,
            });

            if (retryCaptionText && retryCaptionText.trim()) {
              retryFormData.append('caption', retryCaptionText); // Без парсинга
            }

            if (reply_to_message_id) {
              retryFormData.append('reply_to_message_id', reply_to_message_id);
            }

            if (retryReplyMarkup) {
              retryFormData.append('reply_markup', JSON.stringify(retryReplyMarkup));
            }

            const retryResponse = await axios.post(
              `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${retryEndpoint}`,
              retryFormData,
              { headers: retryFormData.getHeaders() }
            );
            telegramMessageId = retryResponse.data?.result?.message_id;
            console.log(`[OrderMessages File] ✅ Retry successful, message_id: ${telegramMessageId}`);
          } catch (retryError) {
            console.error('[OrderMessages File] ❌ Retry send error:', retryError.response?.data || retryError.message);
            // Продолжаем сохранять в БД даже после неудачной повторной попытки
          }
        } else {
          // Не parse ошибка - обрабатываем как раньше
          const errorCode = tgError.response?.data?.error_code;
          if (errorCode === 403) {
            systemErrorContent = '🚫 Пользователь заблокировал бота (403)';
          } else {
            // Default to generic error message for 400 or others
            systemErrorContent = '💔 Пользователь удалил чат с ботом (400 или другая ошибка)';
          }
        }

        // Don't return here - we still want to save to DB even if TG fails
        // But we'll note the error
        console.warn('[OrderMessages File] Continuing to save in DB despite TG error...');
      }
    }

    // ID для привязки
    const storeLeadId = order.main_id || order.lead_id;

    // Сохраняем сообщение
    console.log(`[OrderMessages File] Saving message to DB...`);

    // Truncate fields to match DB varchar(20) constraints
    const authorType = (req.manager.name || 'Оператор').substring(0, 20);
    const userField = (req.manager.name || req.manager.email || '').substring(0, 20);

    const messagePayload = {
      lead_id: storeLeadId,
      main_id: order.main_id,
      content: caption ? caption.trim() : '',
      author_type: authorType,
      message_type: 'file',
      message_id_tg: telegramMessageId,
      reply_to_mess_id_tg: reply_to_message_id || null,
      file_url: fileUrl,
      file_name: originalName,
      'Created Date': new Date().toISOString(),
      user: userField,
    };
    console.log(`[OrderMessages File] Message payload:`, messagePayload);

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert(messagePayload)
      .select()
      .single();

    if (messageError) {
      console.error('[OrderMessages File] ❌ DB insert error:', messageError);
      console.error('[OrderMessages File] Error details:', JSON.stringify(messageError, null, 2));
      throw messageError;
    }
    console.log(`[OrderMessages File] ✅ Message saved to DB, id: ${message.id}`);

    console.log(`[OrderMessages File] Linking message to order...`);
    await supabase
      .from('order_messages')
      .upsert({
        order_id: parseInt(orderId),
        message_id: message.id,
      }, { onConflict: 'order_id,message_id' });

    const io = req.app.get('io');
    io.to(`order_${orderId}`).emit('new_client_message', message);
    if (order.contact_id) {
      io.emit('contact_message', { contact_id: order.contact_id, message });
    }
    console.log(`[OrderMessages File] ✅ Socket event emitted`);

    if (systemErrorContent) {
      await createAndEmitSystemMessage(supabase, io, orderId, order.main_id, systemErrorContent, order.contact_id);
    }

    console.log(`[OrderMessages File] ✅ File send complete`);
    res.json(message);
  } catch (error) {
    console.error('[OrderMessages File] ❌ FINAL ERROR:', error);
    console.error('[OrderMessages File] Error stack:', error.stack);
    res.status(400).json({ error: error.message });
  }
});

router.post('/:orderId/client/voice', auth, (req, res, next) => {
  // res.setHeader('X-App-Version', '2.2.0-ffmpeg'); // Optional: keep or remove
  upload.single('voice')(req, res, next);
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не найден' });
  }

  try {
    const { orderId } = req.params;
    const { duration, reply_to_message_id } = req.body;

    // 1. Convert to OGG/Opus
    let finalBuffer = req.file.buffer;
    let finalContentType = 'audio/ogg';
    let finalFileName = `${Date.now()}_voice.ogg`;

    try {
      finalBuffer = await convertToOgg(req.file.buffer, req.file.originalname);
    } catch (convError) {
      console.error('[Voice] Conversion failed:', convError);
    }

    // 2. Fetch Order Info
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, contact_id, main_id')
      .eq('id', orderId)
      .single();

    if (orderError) throw orderError;

    // 3. Upload to Supabase (using converted file)
    const filePath = `order_files/${orderId}/${finalFileName}`;
    await supabase.storage
      .from('attachments')
      .upload(filePath, finalBuffer, { contentType: finalContentType });

    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);

    const fileUrl = urlData?.publicUrl;

    // 4. Send to Telegram
    let telegramMessageId = null;
    let telegramUserId = null;
    let messageStatus = 'delivered';
    let errorMessage = null;
    let systemErrorContent = null;

    if (order.contact_id) {
      const { data: c } = await supabase.from('contacts').select('telegram_user_id').eq('id', order.contact_id).single();
      telegramUserId = c?.telegram_user_id;
    }

    if (telegramUserId && process.env.TELEGRAM_BOT_TOKEN) {
      const form = new FormData();
      form.append('chat_id', telegramUserId);
      // ALWAYS sendVoice because we converted it to OGG/Opus!
      form.append('voice', finalBuffer, { filename: 'voice.ogg', contentType: 'audio/ogg' });
      if (duration) form.append('duration', duration);
      if (reply_to_message_id) form.append('reply_to_message_id', reply_to_message_id);

      try {
        const tgResponse = await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendVoice`,
          form,
          { headers: form.getHeaders() }
        );
        telegramMessageId = tgResponse.data?.result?.message_id;
      } catch (tgError) {
        console.error('[Voice] Telegram Error:', tgError.response?.data || tgError.message);
        const errorCode = tgError.response?.data?.error_code;
        if (errorCode === 403) {
          messageStatus = 'blocked';
          errorMessage = 'Пользователь заблокировал бота';
          systemErrorContent = '🚫 Пользователь заблокировал бота (403)';
        } else if (errorCode === 400) {
          messageStatus = 'deleted_chat';
          errorMessage = 'Пользователь удалил чат с ботом';
          systemErrorContent = '💔 Пользователь удалил чат с ботом (400 или другая ошибка)';
        } else {
          messageStatus = 'error';
          errorMessage = tgError.response?.data?.description || tgError.message;
          systemErrorContent = '💔 Пользователь удалил чат с ботом (400 или другая ошибка)';
        }
        notifyErrorSubscribers(`🔴 Ошибка отправки Voice (Order ${orderId}):\n${errorMessage}`);
      }
    }

    // 5. Save to DB
    const storeLeadId = order.main_id;

    // Truncate fields to match DB varchar(20) constraints
    const authorType = (req.manager.name || 'Оператор').substring(0, 20);
    const userField = (req.manager.name || req.manager.email || '').substring(0, 20);

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        lead_id: storeLeadId,
        main_id: order.main_id,
        content: '🎤 Голосовое сообщение',
        author_type: authorType,
        message_type: 'voice',
        message_id_tg: telegramMessageId,
        reply_to_mess_id_tg: reply_to_message_id || null,
        file_url: fileUrl,
        voice_duration: duration ? parseInt(duration) : null,
        'Created Date': new Date().toISOString(),
        user: userField,
        status: messageStatus,
        error_message: errorMessage
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Связываем сообщение с заявкой
    await supabase
      .from('order_messages')
      .upsert({
        order_id: parseInt(orderId),
        message_id: message.id,
      }, { onConflict: 'order_id,message_id' });

    const io = req.app.get('io');
    if (io) {
      io.to(`order_${orderId}`).emit('new_client_message', message);
      if (order.main_id) {
        io.to(`main_${order.main_id}`).emit('new_client_message', message);
        if (order.contact_id) io.to(`contact_${order.contact_id}`).emit('new_client_message', message);
      }
      if (order.contact_id) {
        io.emit('contact_message', { contact_id: order.contact_id, message });
      }
    }

    if (systemErrorContent) {
      await createAndEmitSystemMessage(supabase, io, orderId, order.main_id, systemErrorContent, order.contact_id);
    }

    res.json(message);
  } catch (error) {
    console.error('Error sending voice:', error);
    res.status(400).json({ error: error.message });
  }
});

// ==============================================
// ЕДИНАЯ ЛЕНТА (TIMELINE)
// ==============================================

router.get('/:orderId/timeline', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { limit = 50, before } = req.query;
    const limitNum = parseInt(limit) || 50;

    // 1. Получаем инфо о текущей сделке и контакте
    const { data: currentOrder, error: orderError } = await supabase
      .from('orders')
      .select('id, contact_id, main_id')
      .eq('id', orderId)
      .single();

    if (orderError || !currentOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // 2. Находим ВСЕ связанные ID (все сделки этого контакта)
    // 2. Находим ВСЕ связанные ID (все сделки этого контакта)
    let allMainIds = [];
    let allOrderIds = [parseInt(orderId)];

    if (currentOrder.contact_id) {
      const { data: relatedOrders } = await supabase
        .from('orders')
        .select('id, main_id')
        .eq('contact_id', currentOrder.contact_id);

      if (relatedOrders) {
        allOrderIds = relatedOrders.map(o => o.id);
        allMainIds = relatedOrders
          .map(o => o.main_id)
          .filter(id => id); // Filter nulls
      }
    }

    if (currentOrder.main_id) {
      allMainIds.push(currentOrder.main_id);
    }

    // Убираем дубликаты
    allMainIds = [...new Set(allMainIds)];
    allOrderIds = [...new Set(allOrderIds)];

    console.log(`[Timeline] Order ${orderId}, Contact ${currentOrder.contact_id}, MainIds: ${allMainIds.length}, OrderIds: ${allOrderIds.length}`);

    // 3. Запрос сообщений клиента (Messages)
    let clientQuery = supabase
      .from('messages')
      .select(`
        *,
        sender:managers!manager_id(id, name, email)
      `)
      .in('main_id', allMainIds)
      .order('Created Date', { ascending: false })
      .limit(limitNum);

    if (before) {
      clientQuery = clientQuery.lt('Created Date', before);
    }

    // 4. Запрос внутренних сообщений (Internal Messages)
    // ВАЖНО: Системные сообщения (attachment_type='system') должны быть только для текущего ордера!
    // Обычные внутренние сообщения - для всех ордеров контакта

    // 4a. Обычные внутренние сообщения (для всех ордеров контакта)
    let regularInternalQuery = supabase
      .from('internal_messages')
      .select(`
        *,
        sender:managers(id, name, email),
        reply_to:internal_messages!reply_to_id(
          id,
          content,
          sender:managers(name)
        )
      `)
      .in('order_id', allOrderIds)
      .or('attachment_type.is.null,attachment_type.neq.system') // Только НЕ системные
      .order('created_at', { ascending: false })
      .limit(limitNum);

    if (before) {
      regularInternalQuery = regularInternalQuery.lt('created_at', before);
    }

    // 4b. Системные сообщения (ТОЛЬКО для текущего ордера)
    let systemMessagesQuery = supabase
      .from('internal_messages')
      .select(`
        *,
        sender:managers(id, name, email),
        reply_to:internal_messages!reply_to_id(
          id,
          content,
          sender:managers(name)
        )
      `)
      .eq('order_id', parseInt(orderId)) // ТОЛЬКО текущий ордер!
      .eq('attachment_type', 'system')
      .order('created_at', { ascending: false })
      .limit(limitNum);

    if (before) {
      systemMessagesQuery = systemMessagesQuery.lt('created_at', before);
    }

    // Выполняем запросы параллельно
    const [clientRes, regularInternalRes, systemMessagesRes] = await Promise.all([
      allMainIds.length > 0 ? clientQuery : { data: [] },
      allOrderIds.length > 0 ? regularInternalQuery : { data: [] },
      systemMessagesQuery
    ]);

    if (clientRes.error) console.error('[Timeline] Client error:', clientRes.error);
    if (regularInternalRes.error) console.error('[Timeline] Regular Internal error:', regularInternalRes.error);
    if (systemMessagesRes.error) console.error('[Timeline] System Messages error:', systemMessagesRes.error);

    const clientMsgs = clientRes.data || [];
    const regularInternalMsgs = regularInternalRes.data || [];
    const systemMsgs = systemMessagesRes.data || [];

    // Объединяем обычные и системные internal messages
    const internalMsgs = [...regularInternalMsgs, ...systemMsgs];

    // 5. Нормализация и объединение
    const normalizedClient = clientMsgs.map(m => ({
      ...m,
      source_type: 'client',
      // Нормализуем дату для сортировки
      sort_date: m['Created Date'] || m.created_at,
      // Адаптируем поля для единого интерфейса, если нужно
      display_author: m.author_type === 'user' || m.author_type === 'Клиент' ? 'Клиент' : (m.sender?.name || m.author_type),
    }));

    const normalizedInternal = internalMsgs.map(m => ({
      ...m,
      source_type: 'internal',
      sort_date: m.created_at,
      // Внутренние сообщения могут быть системными
      is_system: m.attachment_type === 'system',
      display_author: m.sender?.name || 'Система',
      author_type: m.sender?.name || 'Manager', // Populate author_type for frontend Avatars
    }));

    // Объединяем
    const combined = [...normalizedClient, ...normalizedInternal];

    // 6. Сортировка по убыванию даты (от новых к старым)
    combined.sort((a, b) => new Date(b.sort_date) - new Date(a.sort_date));

    // 7. Обрезаем до лимита (так как мы брали N + N)
    const result = combined.slice(0, limitNum);

    res.json({
      messages: result,
      meta: {
        total_fetched: combined.length,
        limit: limitNum,
        has_more: combined.length > limitNum // Rough estimate
      }
    });

  } catch (error) {
    console.error('[Timeline] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==============================================
// ВНУТРЕННЯЯ ПЕРЕПИСКА (между сотрудниками)
// ==============================================

// Получить внутренние сообщения заявки
router.get('/:orderId/internal', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { limit = 200, offset = 0 } = req.query;

    const { data, error } = await supabase
      .from('internal_messages')
      .select(`
        *,
        sender:managers(id, name, email),
        reply_to:internal_messages!reply_to_id(
          id,
          content,
          sender:managers(name)
        )
      `)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw error;

    const { count } = await supabase
      .from('internal_messages')
      .select('id', { count: 'exact' })
      .eq('order_id', orderId);

    res.json({
      messages: (data || []).reverse(),
      total: count || 0,
    });
  } catch (error) {
    console.error('Error fetching internal messages:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить внутреннее сообщение
router.post('/:orderId/internal', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { content, reply_to_id } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    const { data, error } = await supabase
      .from('internal_messages')
      .insert({
        order_id: parseInt(orderId),
        sender_id: req.manager.id,
        content: content.trim(),
        reply_to_id: reply_to_id || null,
      })
      .select(`
        *,
        sender:managers(id, name, email),
        reply_to:internal_messages!reply_to_id(
          id,
          content,
          sender:managers(name)
        )
      `)
      .single();

    if (error) throw error;

    const io = req.app.get('io');
    if (io) {
      io.to(`order_${orderId}`).emit('new_internal_message', data);
      io.emit('internal_message', { order_id: orderId, message: data });
    }

    res.json(data);
  } catch (error) {
    console.error('Error sending internal message:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить внутренний файл
router.post('/:orderId/internal/file', auth, upload.single('file'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reply_to_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const fileName = `${Date.now()}_${req.file.originalname}`;
    const filePath = `internal_files/${orderId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
    }

    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);

    const fileUrl = urlData?.publicUrl;

    const { data, error } = await supabase
      .from('internal_messages')
      .insert({
        order_id: parseInt(orderId),
        sender_id: req.manager.id,
        content: `📎 ${req.file.originalname}`,
        reply_to_id: reply_to_id || null,
        attachment_url: fileUrl,
        attachment_type: req.file.mimetype.startsWith('image/') ? 'image' : 'file',
        attachment_name: req.file.originalname,
      })
      .select(`
        *,
        sender:managers(id, name, email)
      `)
      .single();

    if (error) throw error;

    const io = req.app.get('io');
    if (io) {
      io.to(`order_${orderId}`).emit('new_internal_message', data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error sending internal file:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отправить внутреннее голосовое сообщение
router.post('/:orderId/internal/voice', auth, (req, res, next) => {
  upload.single('voice')(req, res, next);
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не найден' });
  }

  try {
    const { orderId } = req.params;
    const { duration } = req.body;

    // 1. Convert to OGG/Opus
    let finalBuffer = req.file.buffer;
    let finalContentType = 'audio/ogg';
    let finalFileName = `${Date.now()}_voice_internal.ogg`;

    try {
      finalBuffer = await convertToOgg(req.file.buffer, req.file.originalname);
    } catch (convError) {
      console.error('[InternalVoice] Conversion failed:', convError);
    }

    // 2. Upload to Supabase
    const filePath = `internal_files/${orderId}/${finalFileName}`;
    await supabase.storage
      .from('attachments')
      .upload(filePath, finalBuffer, { contentType: finalContentType });

    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(filePath);

    const fileUrl = urlData?.publicUrl;

    // 3. Save to DB
    const { data, error } = await supabase
      .from('internal_messages')
      .insert({
        order_id: parseInt(orderId),
        sender_id: req.manager.id,
        content: '🎤 Голосовое сообщение',
        attachment_url: fileUrl,
        attachment_type: 'voice',
        // attachment_name: 'voice.ogg', // Optional
        // voice_duration: duration ? parseInt(duration) : null // internal_messages table might need this column if we want to store duration
      })
      .select(`
        *,
        sender:managers(id, name, email)
      `)
      .single();

    if (error) throw error;

    const io = req.app.get('io');
    if (io) {
      io.to(`order_${orderId}`).emit('new_internal_message', data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error sending internal voice:', error);
    res.status(400).json({ error: error.message });
  }
});

// Отметить внутренние сообщения как прочитанные
router.post('/:orderId/internal/read', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { message_ids } = req.body;

    let query = supabase
      .from('internal_messages')
      .update({ is_read: true })
      .eq('order_id', orderId);

    if (message_ids && message_ids.length > 0) {
      query = query.in('id', message_ids);
    }

    query = query.neq('sender_id', req.manager.id);

    const { error } = await query;

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(400).json({ error: error.message });
  }
});

// Получить количество непрочитанных внутренних сообщений
router.get('/:orderId/internal/unread', auth, async (req, res) => {
  try {
    const { orderId } = req.params;

    const { count, error } = await supabase
      .from('internal_messages')
      .select('id', { count: 'exact' }) // Changed from head:true to simple select id to avoid header overflow issues on HEAD
      .eq('order_id', orderId)
      .eq('is_read', false)
      .neq('sender_id', req.manager.id);

    if (error) throw error;

    res.json({ count: count || 0 });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
