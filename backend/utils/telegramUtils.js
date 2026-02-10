/**
 * Utility functions for Telegram Bot API interactions
 */

/**
 * Escapes special characters for MarkdownV2 formatting in Telegram.
 * Telegram requires escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
 * @param {string} text - The text to escape
 * @returns {string} - The escaped text
 */
function escapeMarkdownV2(text) {
    if (!text) return text;

    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    let escaped = text;
    specialChars.forEach(char => {
        escaped = escaped.replace(new RegExp('\\' + char, 'g'), '\\' + char);
    });

    return escaped;
}

module.exports = {
    escapeMarkdownV2
};
