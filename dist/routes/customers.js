"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const validate_js_1 = require("../middleware/validate.js");
const schemas_js_1 = require("../validation/schemas.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
function formatCustomerLedger(c) {
    const totalPurchases = c.sales.length;
    const totalSpent = c.sales.reduce((sum, s) => sum + s.finalAmount, 0);
    const remainingBalance = c.sales.reduce((sum, s) => sum + s.remainingBalance, 0);
    const totalPaid = Math.max(0, totalSpent - remainingBalance);
    const now = new Date();
    const hasOverdue = c.sales.some((s) => s.installments?.some((i) => i.status !== 'PAID' && new Date(i.dueDate) < now));
    const firstPurchaseDate = c.sales.length > 0 ? c.sales[c.sales.length - 1].saleDate : c.createdAt;
    const lastPurchaseDate = c.sales.length > 0 ? c.sales[0].saleDate : c.createdAt;
    const purchasedBikes = c.sales
        .filter((s) => s.bike)
        .map((s) => ({
        id: s.bike.id,
        modelName: s.bike.modelName,
        chassisNumber: s.bike.chassisNumber,
        engineNumber: s.bike.engineNumber,
        color: s.bike.color,
        modelYear: s.bike.modelYear,
        saleDate: s.saleDate,
        invoiceNumber: s.invoiceNumber
    }));
    const salesList = c.sales.map((s) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        saleDate: s.saleDate,
        saleType: s.saleType,
        paymentType: s.paymentType,
        finalAmount: s.finalAmount,
        remainingBalance: s.remainingBalance,
        status: s.status,
        bikeModel: s.bike?.modelName,
        bikeChassis: s.bike?.chassisNumber,
        bike: s.bike
            ? {
                id: s.bike.id,
                modelName: s.bike.modelName,
                chassisNumber: s.bike.chassisNumber,
                engineNumber: s.bike.engineNumber,
                color: s.bike.color,
                modelYear: s.bike.modelYear
            }
            : null,
        installments: s.installments || []
    }));
    return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        cnic: c.cnic || '',
        address: c.address || '',
        customerType: c.customerType,
        saleType: c.sales[0]?.saleType || (c.customerType === 'DEALER' ? 'B2B' : 'B2C'),
        notes: c.notes,
        totalPurchases,
        totalSpent,
        totalPaid,
        remainingBalance,
        hasOverdue,
        firstPurchaseDate,
        lastPurchaseDate,
        purchasedBikes,
        sales: salesList
    };
}
// GET /api/customers - List customers with server-side pagination, search, and ledger stats
router.get('/', (0, auth_js_1.requirePermission)('READ_SALES'), async (req, res) => {
    try {
        const { search, customerType, status, page, limit = '20' } = req.query;
        const where = { isDeleted: false };
        if (customerType) {
            where.customerType = String(customerType);
        }
        if (search) {
            const q = String(search).trim();
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
                { cnic: { contains: q, mode: 'insensitive' } },
                { address: { contains: q, mode: 'insensitive' } }
            ];
        }
        // Fetch customers with their sales and bikes
        const customers = await prisma_js_1.prisma.customer.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                sales: {
                    where: { isDeleted: false },
                    include: {
                        bike: true,
                        installments: { orderBy: { installmentNumber: 'asc' } },
                        payments: { orderBy: { paymentDate: 'desc' } }
                    },
                    orderBy: { saleDate: 'desc' }
                },
                partOrders: {
                    where: { isDeleted: false }
                }
            }
        });
        let formatted = customers.map((c) => formatCustomerLedger(c));
        // Apply status filter: DUES vs SETTLED
        if (status === 'DUES') {
            formatted = formatted.filter((c) => c.remainingBalance > 0);
        }
        else if (status === 'SETTLED') {
            formatted = formatted.filter((c) => c.remainingBalance <= 0);
        }
        const totalCustomers = formatted.length;
        const totalRevenue = formatted.reduce((sum, c) => sum + c.totalSpent, 0);
        const totalOutstanding = formatted.reduce((sum, c) => sum + c.remainingBalance, 0);
        const debtorsCount = formatted.filter((c) => c.remainingBalance > 0).length;
        const dealerCount = formatted.filter((c) => c.customerType === 'DEALER' || c.saleType === 'B2B').length;
        const summary = {
            totalCustomers,
            totalRevenue,
            totalOutstanding,
            debtorsCount,
            dealerCount
        };
        if (page) {
            const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
            const limitNum = Math.max(1, parseInt(String(limit), 10) || 20);
            const paginatedCustomers = formatted.slice((pageNum - 1) * limitNum, pageNum * limitNum);
            const totalPages = Math.ceil(totalCustomers / limitNum);
            res.json({
                customers: paginatedCustomers,
                data: paginatedCustomers,
                summary,
                pagination: {
                    total: totalCustomers,
                    page: pageNum,
                    limit: limitNum,
                    totalPages,
                    hasNext: pageNum < totalPages,
                    hasPrev: pageNum > 1
                }
            });
            return;
        }
        res.json({
            customers: formatted,
            summary
        });
    }
    catch (err) {
        console.error('Error fetching customers:', err);
        res.status(500).json({ error: 'Failed to retrieve customers' });
    }
});
// GET /api/customers/:id - Single customer profile & history
router.get('/:id', (0, auth_js_1.requirePermission)('READ_SALES'), async (req, res) => {
    try {
        const { id } = req.params;
        const c = await prisma_js_1.prisma.customer.findUnique({
            where: { id },
            include: {
                sales: {
                    where: { isDeleted: false },
                    include: {
                        bike: true,
                        installments: { orderBy: { installmentNumber: 'asc' } },
                        payments: { orderBy: { paymentDate: 'desc' } }
                    },
                    orderBy: { saleDate: 'desc' }
                },
                partOrders: {
                    where: { isDeleted: false },
                    include: {
                        items: { include: { part: true } }
                    }
                }
            }
        });
        if (!c || c.isDeleted) {
            res.status(404).json({ error: 'Customer not found' });
            return;
        }
        res.json(formatCustomerLedger(c));
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch customer profile' });
    }
});
// POST /api/customers - Create new customer
router.post('/', (0, auth_js_1.requirePermission)('CREATE_SALE'), (0, validate_js_1.validateBody)(schemas_js_1.createCustomerSchema), async (req, res) => {
    try {
        const { name, phone, cnic, address, customerType, notes } = req.body;
        const existing = await prisma_js_1.prisma.customer.findUnique({ where: { phone } });
        if (existing) {
            res.status(409).json({ error: `Customer with phone number '${phone}' already exists` });
            return;
        }
        const customer = await prisma_js_1.prisma.customer.create({
            data: {
                name: name.trim(),
                phone: phone.trim(),
                cnic: cnic?.trim() || null,
                address: address?.trim() || null,
                customerType: customerType || 'RETAIL',
                notes: notes?.trim() || null
            }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'CREATE_CUSTOMER', 'CUSTOMERS', `Created customer ${customer.name} (${customer.phone})`, req.ip);
        res.status(201).json(customer);
    }
    catch (err) {
        console.error('Error creating customer:', err);
        res.status(500).json({ error: 'Failed to create customer' });
    }
});
// PUT /api/customers/:id - Update customer details
router.put('/:id', (0, auth_js_1.requirePermission)('CREATE_SALE'), (0, validate_js_1.validateBody)(schemas_js_1.updateCustomerSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body;
        const existing = await prisma_js_1.prisma.customer.findUnique({ where: { id } });
        if (!existing || existing.isDeleted) {
            res.status(404).json({ error: 'Customer not found' });
            return;
        }
        const updated = await prisma_js_1.prisma.customer.update({
            where: { id },
            data: {
                ...(body.name ? { name: body.name.trim() } : {}),
                ...(body.phone ? { phone: body.phone.trim() } : {}),
                ...(body.cnic !== undefined ? { cnic: body.cnic?.trim() || null } : {}),
                ...(body.address !== undefined ? { address: body.address?.trim() || null } : {}),
                ...(body.customerType ? { customerType: body.customerType } : {}),
                ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {})
            }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'UPDATE_CUSTOMER', 'CUSTOMERS', `Updated customer ${updated.name} (${updated.phone})`, req.ip);
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to update customer' });
    }
});
// DELETE /api/customers/:id - Soft delete customer
router.delete('/:id', (0, auth_js_1.requirePermission)('CREATE_SALE'), async (req, res) => {
    try {
        const { id } = req.params;
        const customer = await prisma_js_1.prisma.customer.findUnique({
            where: { id },
            include: {
                sales: { where: { isDeleted: false } }
            }
        });
        if (!customer || customer.isDeleted) {
            res.status(404).json({ error: 'Customer not found' });
            return;
        }
        if (customer.sales.length > 0) {
            res.status(400).json({ error: 'Cannot delete customer with active sales records' });
            return;
        }
        await prisma_js_1.prisma.customer.update({
            where: { id },
            data: { isDeleted: true, deletedAt: new Date() }
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'DELETE_CUSTOMER', 'CUSTOMERS', `Soft deleted customer ${customer.name}`, req.ip);
        res.json({ message: 'Customer soft deleted successfully', id });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to delete customer' });
    }
});
exports.default = router;
