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

    // Telegram MarkdownV2 special characters that need escaping
    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!', '\\'];

    let escaped = String(text);
    specialChars.forEach(char => {
        // Escape the character for regex, then replace all occurrences
        const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        escaped = escaped.split(char).join('\\' + char);
    });

    return escaped;
}

module.exports = {
    escapeMarkdownV2
};
