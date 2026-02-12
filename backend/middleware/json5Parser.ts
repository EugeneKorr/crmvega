import { Request, Response, NextFunction } from 'express';
import json5 from 'json5';
import { jsonrepair } from 'jsonrepair';

/**
 * Middleware to parse bodies that standard express.json() fails on.
 * Specifically useful for Bubble.io webhooks which may send:
 * - Unquoted keys ({ key: "value" })
 * - Trailing commas
 * - Single quotes
 * - Unescaped double quotes inside string values (e.g. { "msg": "Hello "world"" })
 * - Unquoted booleans (yes/no/да/нет)
 */
const json5Parser = (req: Request, res: Response, next: NextFunction) => {
    // If body is already parsed (object), skip
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        return next();
    }

    // If body is string (e.g. from express.text()), try to parse it
    if (typeof req.body === 'string' && req.body.trim().length > 0) {
        let currentBody = req.body;

        try {
            // 1. Try standard JSON5 parse first
            req.body = json5.parse(currentBody);
            return next();
        } catch (err) {
            // Parsing failed. Let's try a series of fixes in order.

            // 2. Fix unescaped quotes
            try {
                // Heuristic: Escape quotes that are NOT structural
                currentBody = currentBody.replace(/(?<!\\)"/g, (match: string, offset: number, fullStr: string) => {
                    const before = fullStr.substring(0, offset);
                    const after = fullStr.substring(offset + 1);

                    // Check 1: Start of key (preceded by { or , or [ )
                    if (/[{\[,]\s*$/.test(before)) return match;
                    // Check 2: End of key (followed by :)
                    if (/^\s*:/.test(after)) return match;
                    // Check 3: Start of value (preceded by :)
                    if (/:\s*$/.test(before)) return match;
                    // Check 4: End of value (followed by , or } or ])
                    if (/^\s*[,}\]]/.test(after)) return match;

                    // If none of the above, it's an inner quote. Escape it.
                    return '\\"';
                });

                // Try parsing after quote fix
                req.body = json5.parse(currentBody);
                return next();
            } catch (err2) {
                // 3. Fix unquoted booleans (yes/no/да/нет)
                // We apply this ON TOP of the quote fix (currentBody)
                try {
                    currentBody = currentBody
                        .replace(/:\s*no\b/g, ': false')
                        .replace(/:\s*yes\b/g, ': true')
                        .replace(/:\s*нет\b/g, ': "нет"')
                        .replace(/:\s*да\b/g, ': "да"');

                    req.body = json5.parse(currentBody);
                    return next();
                } catch (err3) {
                    // 4. Final resort: jsonrepair
                    // Use the potentially partially fixed body, or start fresh?
                    // Usually currentBody is best as it has our quote fixes which jsonrepair might not handle well.
                    try {
                        const repaired = jsonrepair(currentBody);
                        req.body = JSON.parse(repaired);
                        return next();
                    } catch (err4) {
                        try {
                            // Try jsonrepair on ORIGINAL body as fallback?
                            const repairedOriginal = jsonrepair(req.body);
                            req.body = JSON.parse(repairedOriginal);
                            return next();
                        } catch (err5: any) {
                            console.error('[JSON5] All parsing attempts failed.');
                            // Proceed with raw body
                            return next();
                        }
                    }
                }
            }
        }
    }

    next();
};

export default json5Parser;
