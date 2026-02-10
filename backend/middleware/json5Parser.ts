import { Request, Response, NextFunction } from 'express';
import json5 from 'json5';

/**
 * Middleware to parse bodies that standard express.json() fails on.
 * Specifically useful for Bubble.io webhooks which may send:
 * - Unquoted keys ({ key: "value" })
 * - Trailing commas
 * - Single quotes
 * 
 * It runs AFTER body-parser (express.json) has failed or ignored the body.
 * NOTE: express.json() usually captures the stream. We need to ensure we can read it.
 */
const json5Parser = (req: Request, res: Response, next: NextFunction) => {
    // If body is already parsed (object), skip
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        return next();
    }

    // If body is string (e.g. from express.text()), try to parse it
    if (typeof req.body === 'string' && req.body.trim().length > 0) {
        try {
            // Direct assignment to req.body is allowed in Express
            req.body = json5.parse(req.body);
            // console.log('[JSON5] Successfully parsed invalid JSON body');
            return next();
        } catch (err) {
            // If strict JSON5 fails, we can't do much more.
            // But maybe check if it's the specific "no" unquoted bool issue?
            // JSON5 handles unquoted alphanumeric keys, but unquoted values like `no` might be seen as strings or variables?
            // JSON5 spec: unquoted values are NOT allowed unless they are true/false/null/Infinity/NaN. 
            // Bubble sends `key: no` -> This is INVALID even in JSON5.

            // Let's try a quick patch for the "no/yes" boolean issue specifically, then retry JSON5
            try {
                const patched = (req.body as string)
                    .replace(/:\s*no\b/g, ': false')
                    .replace(/:\s*yes\b/g, ': true')
                    .replace(/:\s*нет\b/g, ': "нет"')
                    .replace(/:\s*да\b/g, ': "да"');

                req.body = json5.parse(patched);
                console.log('[JSON5] Parsed after simple boolean patch');
                return next();
            } catch (err2: any) {
                console.error('[JSON5] Formatting error:', err2.message);
                // Don't error out here, let the next handlers deal with raw body or error
                return next();
            }
        }
    }

    next();
};

export default json5Parser;
