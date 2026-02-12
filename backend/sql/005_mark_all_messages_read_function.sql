CREATE OR REPLACE FUNCTION mark_all_messages_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE messages
    SET is_read = true
    WHERE is_read = false
    AND author_type IN ('user', 'User', 'bubbleUser', 'customer', 'client', 'Client', 'Клиент', 'Telegram', 'bot', 'бот');
END;
$$;
