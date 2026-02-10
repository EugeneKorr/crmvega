# Отправка файлов с кнопками и URL

## Проблема
При отправке файлов (изображений, документов) с шаблонами, содержащими кнопки и URL, они не отображались в Telegram. Поле `caption` отправлялось как простой текст без обработки JSON.

## Решение
Добавлена обработка JSON в поле `caption` для файлов, аналогично текстовым сообщениям. Теперь поддерживаются:

- ✅ **URL кнопки** (Inline Keyboard) - кнопки с ссылками
- ✅ **Action кнопки** (Reply Keyboard) - кнопки для выбора действий
- ✅ **MarkdownV2 форматирование** для текста caption
- ✅ **Автоматический retry** без форматирования при ошибках парсинга

## Формат caption

### Простой текст
```javascript
caption: "Описание файла"
```

### JSON с текстом и кнопками
```javascript
caption: JSON.stringify({
  text: "Описание файла",
  buttons: [
    {
      text: "Открыть сайт",
      type: "url",
      url: "https://example.com"
    },
    {
      text: "Выбрать опцию",
      type: "action"
    }
  ]
})
```

## Как работает

1. **Парсинг JSON**: Проверяет, начинается ли caption с `{`
2. **Извлечение текста и кнопок**: Достаёт `text` и `buttons` из JSON
3. **Разделение кнопок**:
   - URL кнопки → Inline Keyboard (под сообщением)
   - Action кнопки → Reply Keyboard (внизу экрана)
4. **Форматирование**: Применяет MarkdownV2 к тексту
5. **Отправка**: Файл + caption + кнопки
6. **Retry на ошибке**: Если ошибка парсинга → повторная отправка без форматирования

## Изменения в коде

### Файл: `routes/orderMessages.js`

**Функция**: `POST /:orderId/client/file`

**Что изменилось**:
1. Добавлен парсинг JSON из `caption`
2. Добавлена обработка кнопок (URL и Action)
3. Добавлено MarkdownV2 форматирование
4. Добавлена обработка ошибок с retry

## Примеры использования

### Отправка изображения с URL кнопкой
```javascript
const formData = new FormData();
formData.append('file', imageFile);
formData.append('caption', JSON.stringify({
  text: "Наша новая коллекция!",
  buttons: [{
    text: "Купить",
    type: "url",
    url: "https://shop.example.com"
  }]
}));

await axios.post('/api/orders/123/client/file', formData);
```

### Отправка документа с Action кнопками
```javascript
const formData = new FormData();
formData.append('file', pdfFile);
formData.append('caption', JSON.stringify({
  text: "Ваш счёт готов",
  buttons: [
    { text: "Оплатить", type: "action" },
    { text: "Отложить", type: "action" }
  ]
}));

await axios.post('/api/orders/123/client/file', formData);
```

### Отправка с URL и Action кнопками
```javascript
formData.append('caption', JSON.stringify({
  text: "Новый продукт доступен!",
  buttons: [
    { text: "Смотреть", type: "url", url: "https://example.com" },
    { text: "Купить", type: "action" },
    { text: "Позже", type: "action" }
  ]
}));
```

**Примечание**: Если есть и URL и Action кнопки, URL отправляются с файлом, а Action кнопки отправляются отдельным сообщением.

## Совместимость с Bubble

Action кнопки отправляются как Reply Keyboard, чтобы Bubble мог их обработать как обычные текстовые сообщения через webhook.

## Обработка ошибок

Если в caption есть специальные символы, которые нельзя экранировать в MarkdownV2:
1. Первая попытка: отправка с MarkdownV2 и экранированием
2. При ошибке: автоматическая повторная отправка без форматирования, но **с кнопками**

Это гарантирует, что сообщение всегда будет доставлено, даже если форматирование не сработало.
