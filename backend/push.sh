#!/bin/bash

# Add all changes
git add -A

# Commit with message
git commit -m "feat: Add telegram_message_id saving and file buttons support

- Updated sendMessageToUser to return {success, messageId}
- Save telegram_message_id when sending messages via /contact/:contactId
- Add JSON caption parsing for files (images, documents)
- Support URL buttons (Inline Keyboard) and Action buttons (Reply Keyboard)
- Add MarkdownV2 formatting for file captions
- Add automatic retry without formatting on parse errors
- Add documentation and test script"

# Push to remote
git push

echo "✅ Pushed to Git!"
