# 🎨 Redesign Ant Design v6 — План миграции

**Статус:** 🟡 Этап 1 (Theme Tokens) — в процессе

---

## 📊 Этапы работы

### ✅ Этап 0: Подготовка
- [x] Создана ветка `feature/redesign-v6`
- [x] Загружены дизайн-токены из Figma (`tokens.json`)
- [x] Установлены инструменты (Playwright для скриншотов)
- [ ] Снять эталонные скриншоты (текущее состояние)

### 🟡 Этап 1: Theme Tokens
- [x] Импортированы токены Ant Design v6
- [x] Создан `frontend/src/theme/index.ts`
- [x] Применена тема в `ConfigProvider`
- [ ] Проверить что приложение загружается без ошибок
- [ ] Запустить Guardian проверку

### ⏳ Этап 2: Очистка inline-стилей
- [ ] `SuggestionBar.tsx`
- [ ] `AgentModeToggle.tsx`
- [ ] `ClientAvatar.tsx`
- [ ] Другие простые компоненты

### ⏳ Этап 3-7: Переверстка
- [ ] Layout компоненты (MainLayout, Login)
- [ ] Простые страницы (Settings, Analytics)
- [ ] Сложные страницы (Orders, Chat, ContactDetail)
- [ ] Финализация и тестирование

---

## 🛠️ Как снять скриншоты

```bash
# 1. Убедитесь что dev-сервер работает
npm start

# 2. В другом терминале запустите скрипт для скриншотов
node scripts/screenshot-ui.js
```

Скриншоты сохранятся в папке `/screenshots/`

---

## 📋 Дизайн-токены

**Основные цвета (Light theme):**
- 🎨 Primary: `#1677ff` (blue6)
- ✅ Success: `#52c41a` (green6)
- ⚠️ Warning: `#faad14` (gold6)
- ❌ Error: `#f5222d` (red6)
- ℹ️ Info: `#13c2c2` (cyan6)

**Типография:**
- Font: System fonts (SF Pro, Segoe UI)
- Font size: 14px (base)
- Line height: 1.5

**Отступы (spacing scale):**
- XS: 8px
- SM: 12px
- MD: 16px
- LG: 24px
- XL: 32px

**Радиус:**
- Border radius: 6px (компоненты), 8px (модали)

---

## 🛡️ Redesign Guardian

Агент-хранитель проверяет что не сломана бизнес-логика при редизайне.

**Что он проверяет:**
- ❌ Бэкенд код не изменён
- ❌ Хуки не изменены
- ❌ Сервисы API не изменены
- ✅ Изменены только UI/CSS

**Как использовать:**
```bash
# После завершения этапа
git diff main...feature/redesign-v6 | claude redesign-guardian
```

---

## 📱 Responsive Breakpoints

| Название | Width | Где используется |
|----------|-------|-----------------|
| Mobile | 480px | Телефоны |
| Tablet | 768px | Планшеты |
| Desktop SM | 1024px | Ноутбуки |
| Desktop | 1440px | Большие экраны |

---

## 🚀 Быстрый старт

```bash
# Создать ветку (если еще не создана)
git checkout -b feature/redesign-v6

# Запустить dev-сервер
npm start

# Снять скриншоты (в другом терминале)
node scripts/screenshot-ui.js

# Начать редизайн (по одному компоненту за раз)
# git commit после каждого PR

# Вызвать Guardian проверку
git diff main...HEAD | npx ts-node .claude/agents/redesign-guardian.md
```

---

## ✅ Чек-лист перед завершением

- [ ] Все скриншоты совпадают с Figma макетом
- [ ] Guardian дал ✅ SAFE TO MERGE
- [ ] Нет ошибок в консоли браузера
- [ ] Функциональность не сломана (чат, сообщения, реакции, AI предложения)
- [ ] Responsive дизайн работает на всех брейкпоинтах
- [ ] Внешний вид соответствует дизайну на мобильных и десктопе

---

## 📞 Контакты

**Дизайнер:** Figma → Ant Design System v6  
**Токены:** `/frontend/src/theme/tokens.json`  
**Guardian:** `.claude/agents/redesign-guardian.md`
