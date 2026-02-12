CREATE OR REPLACE FUNCTION get_unread_main_ids()
RETURNS TABLE (main_id numeric)
LANGUAGE sql
AS $$
    SELECT DISTINCT main_id
    FROM messages
    WHERE is_read = false
    AND author_type IN ('user', 'User', 'bubbleUser', 'customer', 'client', 'Client', 'Клиент', 'Telegram', 'bot', 'бот', 'анна', 'ирина', 'константин', 'никита', 'станислав', 'александрфи', 'александрва', 'александрбе')
    AND main_id IS NOT NULL;
$$;
