"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_js_1 = __importDefault(require("./routes/auth.js"));
const users_js_1 = __importDefault(require("./routes/users.js"));
const bikes_js_1 = __importDefault(require("./routes/bikes.js"));
const sales_js_1 = __importDefault(require("./routes/sales.js"));
const documents_js_1 = __importDefault(require("./routes/documents.js"));
const parts_js_1 = __importDefault(require("./routes/parts.js"));
const reports_js_1 = __importDefault(require("./routes/reports.js"));
const audit_js_1 = __importDefault(require("./routes/audit.js"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express_1.default.json());
// API Routes
app.use('/api/auth', auth_js_1.default);
app.use('/api/users', users_js_1.default);
app.use('/api/bikes', bikes_js_1.default);
app.use('/api/sales', sales_js_1.default);
app.use('/api/documents', documents_js_1.default);
app.use('/api/parts', parts_js_1.default);
app.use('/api/reports', reports_js_1.default);
app.use('/api/audit-logs', audit_js_1.default);
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});
app.listen(PORT, () => {
    console.log(`AutoSuite ERP Server running on http://localhost:${PORT}`);
});
