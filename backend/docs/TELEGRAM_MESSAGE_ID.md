# Сохранение telegram_message_id при отправке сообщений

## Проблема
Ранее при отправке сообщений из CRM через Telegram Bot API не сохранялся `telegram_message_id` (поле `message_id_tg` в таблице `messages`). Это делало невозможным удаление отправленных сообщений через API Telegram.

## Решение
Обновлена функция `sendMessageToUser` в `routes/bot.js` и код в `routes/messages.js` для сохранения `message_id` при отправке.

### Изменения в `routes/bot.js`

**До:**
```javascript
async function sendMessageToUser(telegramUserId, message, options = {}) {
  // ...
  await axios.post(`...`, requestBody);
  return true; // Только boolean
}
```

**После:**
```javascript
async function sendMessageToUser(telegramUserId, message, options = {}) {
  // ...
  const response = await axios.post(`...`, requestBody);
  const messageId = response.data?.result?.message_id || null;
  return { success: true, messageId }; // Возвращаем объект с messageId
}
```

### Изменения в `routes/messages.js`

**До:**
```javascript
const success = await sendMessageToUser(contact.telegram_user_id, content);
if (!success) {
  messageStatus = 'error';
}
// telegramMessageId остается null
```

**После:**
```javascript
const { success, messageId } = await sendMessageToUser(contact.telegram_user_id, content);
if (!success) {
  messageStatus = 'error';
} else {
  telegramMessageId = messageId; // Сохраняем message_id
}
```

## Проверка
После изменений все новые сообщения, отправленные через:
- `/api/messages/contact/:contactId` (POST)
- `/api/orders/:orderId/client` (POST)
- `/api/orders/:orderId/client/file` (POST)
- `/api/orders/:orderId/client/voice` (POST)

будут иметь заполненное поле `message_id_tg` в таблице `messages`.

## Удаление сообщений
Теперь можно удалять отправленные сообщения, используя сохраненный `message_id_tg`:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/deleteMessage" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": <CHAT_ID>,
    "message_id": <MESSAGE_ID_TG>
  }'
```

**Ограничения Telegram API:**
- Можно удалить сообщение в течение 48 часов в личных чатах
- Можно удалить любое сообщение в группах, где бот - администратор
- Удаление не гарантирует, что пользователь не успел прочитать сообщение

## Скрипт для проверки
Создан скрипт `backend/scripts/checkMessageIds.js` для проверки сохранения `telegram_message_id`:

```bash
cd backend
node scripts/checkMessageIds.js
```

Скрипт показывает:
- Последние 10 сообщений с `telegram_message_id` ✅
- Последние 5 сообщений менеджеров БЕЗ `telegram_message_id` ⚠️

## Примечания
- Старые сообщения (отправленные до обновления кода) не имеют `message_id_tg` и не могут быть удалены
- Сообщения от клиентов (входящие) всегда имеют `message_id_tg`, так как этот код работал корректно
- Системные сообщения и сообщения бота не имеют `message_id_tg`, так как они не отправляются через Telegram API
