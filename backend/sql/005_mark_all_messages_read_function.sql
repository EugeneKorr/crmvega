CREATE OR REPLACE FUNCTION mark_all_messages_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE messages
    SET is_read = true
    WHERE is_read = false;
END;
$$;
