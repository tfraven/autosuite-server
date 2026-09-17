"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBody = validateBody;
exports.validateQuery = validateQuery;
const zod_1 = require("zod");
function validateBody(schema) {
    return async (req, res, next) => {
        try {
            req.body = await schema.parseAsync(req.body);
            next();
        }
        catch (err) {
            if (err instanceof zod_1.ZodError) {
                const fieldErrors = {};
                for (const issue of err.issues) {
                    const path = issue.path.join('.') || 'general';
                    fieldErrors[path] = issue.message;
                }
                res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    message: err.issues[0]?.message || 'Invalid input data',
                    details: fieldErrors
                });
                return;
            }
            next(err);
        }
    };
}
function validateQuery(schema) {
    return async (req, res, next) => {
        try {
            req.query = (await schema.parseAsync(req.query));
            next();
        }
        catch (err) {
            if (err instanceof zod_1.ZodError) {
                const fieldErrors = {};
                for (const issue of err.issues) {
                    const path = issue.path.join('.') || 'general';
                    fieldErrors[path] = issue.message;
                }
                res.status(400).json({
                    success: false,
                    error: 'Query parameter validation failed',
                    details: fieldErrors
                });
                return;
            }
            next(err);
        }
    };
}
