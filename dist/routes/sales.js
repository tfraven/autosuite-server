"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const validate_js_1 = require("../middleware/validate.js");
const schemas_js_1 = require("../validation/schemas.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
// Helper to generate Invoice Number (e.g. INV-2026-0001)
async function generateInvoiceNumber() {
    const count = await prisma_js_1.prisma.sale.count();
    const year = new Date().getFullYear();
    const seq = String(count + 1).padStart(4, '0');
    return `INV-${year}-${seq}`;
}
// GET /api/sales - List sales with filters and optional pagination
router.get('/', (0, auth_js_1.requirePermission)('READ_SALES'), async (req, res) => {
    try {
        const { saleType, paymentType, status, startDate, endDate, search, page, limit = '20', includeDeleted } = req.query;
        const where = {};
        if (includeDeleted !== 'true') {
            where.isDeleted = false;
        }
        if (saleType)
            where.saleType = String(saleType);
        if (paymentType)
            where.paymentType = String(paymentType);
        if (status)
            where.status = String(status);
        if (startDate || endDate) {
            where.saleDate = {};
            if (startDate)
                where.saleDate.gte = new Date(String(startDate));
            if (endDate) {
                const end = new Date(String(endDate));
                end.setHours(23, 59, 59, 999);
                where.saleDate.lte = end;
            }
        }
        if (search) {
            const q = String(search).trim();
            where.OR = [
                { invoiceNumber: { contains: q, mode: 'insensitive' } },
                { customerName: { contains: q, mode: 'insensitive' } },
                { customerPhone: { contains: q, mode: 'insensitive' } },
                { customerCnic: { contains: q, mode: 'insensitive' } },
                { customer: { name: { contains: q, mode: 'insensitive' } } },
                { customer: { phone: { contains: q, mode: 'insensitive' } } },
                { bike: { chassisNumber: { contains: q, mode: 'insensitive' } } },
                { bike: { engineNumber: { contains: q, mode: 'insensitive' } } },
                { bike: { modelName: { contains: q, mode: 'insensitive' } } }
            ];
        }
        const totalCount = await prisma_js_1.prisma.sale.count({ where });
        const queryOptions = {
            where,
            orderBy: { saleDate: 'desc' },
            include: {
                customer: true,
                bike: {
                    include: {
                        model: true,
                        usedDetail: true
                    }
                },
                createdBy: {
                    select: { id: true, name: true, username: true }
                },
                installments: {
                    orderBy: { installmentNumber: 'asc' }
                },
                payments: {
                    orderBy: { paymentDate: 'desc' }
                },
                documents: true
            }
        };
        if (page) {
            const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
            const limitNum = Math.max(1, parseInt(String(limit), 10) || 20);
            queryOptions.skip = (pageNum - 1) * limitNum;
            queryOptions.take = limitNum;
            const sales = await prisma_js_1.prisma.sale.findMany(queryOptions);
            const totalPages = Math.ceil(totalCount / limitNum);
            res.json({
                data: sales,
                sales,
                pagination: {
                    total: totalCount,
                    page: pageNum,
                    limit: limitNum,
                    totalPages,
                    hasNext: pageNum < totalPages,
                    hasPrev: pageNum > 1
                }
            });
            return;
        }
        const sales = await prisma_js_1.prisma.sale.findMany(queryOptions);
        res.setHeader('X-Total-Count', totalCount.toString());
        res.json(sales);
    }
    catch (err) {
        console.error('Error fetching sales:', err);
        res.status(500).json({ error: 'Failed to retrieve sales' });
    }
});
// GET /api/sales/customer-lookup - Fast customer profile autocomplete for sales entry (3NF/BCNF)
router.get('/customer-lookup', (0, auth_js_1.requirePermission)('READ_SALES'), async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || String(query).trim().length < 2) {
            res.json([]);
            return;
        }
        const q = String(query).trim();
        // Query normalized Customer table directly
        const matchingCustomers = await prisma_js_1.prisma.customer.findMany({
            where: {
                isDeleted: false,
                OR: [
                    { phone: { contains: q, mode: 'insensitive' } },
                    { name: { contains: q, mode: 'insensitive' } },
                    { cnic: { contains: q, mode: 'insensitive' } }
                ]
            },
            include: {
                sales: {
                    where: { isDeleted: false },
                    orderBy: { saleDate: 'desc' },
                    take: 5
                }
            },
            take: 10
        });
        const results = matchingCustomers.map((c) => {
            const totalPurchases = c.sales.length;
            const totalSpent = c.sales.reduce((sum, s) => sum + s.finalAmount, 0);
            const remainingBalance = c.sales.reduce((sum, s) => sum + s.remainingBalance, 0);
            const lastSale = c.sales[0];
            return {
                id: c.id,
                name: c.name,
                phone: c.phone,
                cnic: c.cnic || '',
                address: c.address || '',
                customerType: c.customerType || 'RETAIL',
                totalPurchases,
                totalSpent,
                remainingBalance,
                lastPurchaseDate: lastSale?.saleDate || c.createdAt,
                lastInvoice: lastSale?.invoiceNumber || null
            };
        });
        res.json(results);
    }
    catch (err) {
        console.error('Error in customer lookup:', err);
        res.status(500).json({ error: 'Failed to lookup customers' });
    }
});
// GET /api/sales/customers - Backwards-compatible route for aggregated Customer Records with Ledger & Stats
router.get('/customers', (0, auth_js_1.requirePermission)('READ_SALES'), async (req, res) => {
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
                }
            }
        });
        const now = new Date();
        let formatted = customers.map((c) => {
            const totalPurchases = c.sales.length;
            const totalSpent = c.sales.reduce((sum, s) => sum + s.finalAmount, 0);
            const remainingBalance = c.sales.reduce((sum, s) => sum + s.remainingBalance, 0);
            const totalPaid = Math.max(0, totalSpent - remainingBalance);
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
                status: s.status
            }));
            return {
                id: c.id,
                name: c.name,
                phone: c.phone,
                cnic: c.cnic || '',
                address: c.address || '',
                customerType: c.customerType,
                saleType: c.sales[0]?.saleType || (c.customerType === 'DEALER' ? 'B2B' : 'B2C'),
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
        });
        if (status === 'DUES') {
            formatted = formatted.filter((c) => c.remainingBalance > 0);
        }
        else if (status === 'SETTLED') {
            formatted = formatted.filter((c) => c.remainingBalance <= 0);
        }
        const totalCustomers = formatted.length;
        const totalRevenue = formatted.reduce((acc, c) => acc + c.totalSpent, 0);
        const totalOutstanding = formatted.reduce((acc, c) => acc + c.remainingBalance, 0);
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
        console.error('Error retrieving customer records:', err);
        res.status(500).json({ error: 'Failed to retrieve customer records' });
    }
});
// GET /api/sales/:id - Single sale with full invoice breakdown
router.get('/:id', (0, auth_js_1.requirePermission)('READ_SALES'), async (req, res) => {
    try {
        const { id } = req.params;
        const sale = await prisma_js_1.prisma.sale.findUnique({
            where: { id },
            include: {
                customer: true,
                bike: {
                    include: {
                        model: true,
                        usedDetail: true
                    }
                },
                createdBy: {
                    select: { id: true, name: true, username: true }
                },
                installments: {
                    orderBy: { installmentNumber: 'asc' }
                },
                payments: {
                    orderBy: { paymentDate: 'desc' }
                },
                documents: true
            }
        });
        if (!sale || sale.isDeleted) {
            res.status(404).json({ error: 'Sale record not found' });
            return;
        }
        res.json(sale);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch sale details' });
    }
});
// POST /api/sales - Create a sale transaction (Normalized 3NF/BCNF Customer linkage)
router.post('/', (0, auth_js_1.requirePermission)('CREATE_SALE'), (0, validate_js_1.validateBody)(schemas_js_1.createSaleSchema), async (req, res) => {
    try {
        const { bikeId, saleType, customerId, customerName, customerPhone, customerCnic, customerAddress, customerType, salePrice, discount = 0, tax = 0, paymentType, initialDeposit = 0, paymentReference, installmentsCount = 0, installmentIntervalMonths = 1, firstInstallmentDueDate, notes } = req.body;
        // Verify bike is in stock
        const bike = await prisma_js_1.prisma.bike.findUnique({ where: { id: bikeId } });
        if (!bike || bike.isDeleted) {
            res.status(404).json({ error: 'Selected motorcycle not found' });
            return;
        }
        if (bike.status !== 'IN_STOCK' && bike.status !== 'RESERVED') {
            res.status(400).json({ error: `Motorcycle is not available for sale (Current status: ${bike.status})` });
            return;
        }
        const priceNum = Number(salePrice);
        const discNum = Number(discount) || 0;
        const taxNum = Number(tax) || 0;
        const finalAmount = Math.max(0, priceNum - discNum + taxNum);
        const depositNum = Number(initialDeposit) || 0;
        const remainingBalance = Math.max(0, finalAmount - depositNum);
        const invoiceNumber = await generateInvoiceNumber();
        const userId = req.user.userId;
        const result = await prisma_js_1.prisma.$transaction(async (tx) => {
            // 1. Resolve or Create normalized Customer record (3NF/BCNF)
            let resolvedCustomerId = customerId;
            if (!resolvedCustomerId && customerPhone) {
                const cleanPhone = customerPhone.trim();
                const existingCust = await tx.customer.findUnique({
                    where: { phone: cleanPhone }
                });
                if (existingCust) {
                    resolvedCustomerId = existingCust.id;
                    if (customerCnic || customerAddress) {
                        await tx.customer.update({
                            where: { id: existingCust.id },
                            data: {
                                ...(customerCnic ? { cnic: customerCnic.trim() } : {}),
                                ...(customerAddress ? { address: customerAddress.trim() } : {})
                            }
                        });
                    }
                }
                else {
                    const newCust = await tx.customer.create({
                        data: {
                            name: customerName.trim(),
                            phone: cleanPhone,
                            cnic: customerCnic?.trim() || null,
                            address: customerAddress?.trim() || null,
                            customerType: customerType || (saleType === 'B2B' ? 'DEALER' : 'RETAIL')
                        }
                    });
                    resolvedCustomerId = newCust.id;
                }
            }
            // 2. Update bike status to SOLD
            await tx.bike.update({
                where: { id: bikeId },
                data: { status: 'SOLD' }
            });
            // 3. Create Sale record linked to normalized Customer
            const sale = await tx.sale.create({
                data: {
                    invoiceNumber,
                    saleType: saleType || 'B2C',
                    bikeId,
                    customerId: resolvedCustomerId || null,
                    customerName: customerName.trim(),
                    customerPhone: customerPhone.trim(),
                    customerCnic: customerCnic?.trim() || null,
                    customerAddress: customerAddress?.trim() || null,
                    customerType: customerType || (saleType === 'B2B' ? 'DEALER' : 'RETAIL'),
                    salePrice: priceNum,
                    discount: discNum,
                    tax: taxNum,
                    finalAmount,
                    paymentType,
                    initialDeposit: depositNum,
                    remainingBalance,
                    status: remainingBalance > 0 ? 'PENDING_PAYMENT' : 'COMPLETED',
                    createdById: userId,
                    isDeleted: false
                }
            });
            // 4. Record initial deposit if present
            if (depositNum > 0) {
                await tx.paymentTransaction.create({
                    data: {
                        saleId: sale.id,
                        amount: depositNum,
                        paymentMethod: paymentType === 'CREDIT_INSTALLMENT' ? 'CASH' : paymentType,
                        referenceNumber: paymentReference || null,
                        notes: paymentType === 'CREDIT_INSTALLMENT' ? 'Down Payment / Initial Deposit' : 'Full / Upfront Payment'
                    }
                });
            }
            // 5. If Credit/Installment sale, batch generate installment schedules
            if (paymentType === 'CREDIT_INSTALLMENT' && installmentsCount > 0 && remainingBalance > 0) {
                const count = Number(installmentsCount);
                const monthlyAmount = Math.round((remainingBalance / count) * 100) / 100;
                let runningBalance = remainingBalance;
                const baseDate = firstInstallmentDueDate ? new Date(firstInstallmentDueDate) : new Date();
                const installmentsData = [];
                for (let i = 1; i <= count; i++) {
                    const dueDate = new Date(baseDate);
                    dueDate.setMonth(dueDate.getMonth() + (i - 1) * (installmentIntervalMonths || 1));
                    const instAmount = i === count ? runningBalance : monthlyAmount;
                    runningBalance -= instAmount;
                    installmentsData.push({
                        saleId: sale.id,
                        installmentNumber: i,
                        dueDate,
                        amount: instAmount,
                        paidAmount: 0,
                        status: 'PENDING'
                    });
                }
                await tx.installmentSchedule.createMany({
                    data: installmentsData
                });
            }
            // 6. Batch auto-initialize registration paperwork
            const docTypes = [
                'SALES_CERTIFICATE',
                'DELIVERY_LETTER_GATE_PASS',
                'BOOK_TRANSFER_REQUEST',
                'ALLOTMENT_LETTER',
                'REGISTRATION_APPLICATION'
            ];
            await tx.motorcycleDocument.createMany({
                data: docTypes.map((docType) => ({
                    saleId: sale.id,
                    docType,
                    paperworkStatus: 'PENDING_MANUFACTURER',
                    statusNotes: 'Automatic registration pipeline initiated.'
                }))
            });
            return sale;
        }, {
            maxWait: 15000,
            timeout: 30000
        });
        await (0, auth_js_1.logAuditEvent)(userId, 'CREATE_SALE', 'SALES', `Issued ${result.invoiceNumber} for bike ${bike.modelName} (Chassis: ${bike.chassisNumber}) to ${customerName} for ${finalAmount}`, req.ip);
        const fullSale = await prisma_js_1.prisma.sale.findUnique({
            where: { id: result.id },
            include: {
                customer: true,
                bike: {
                    include: {
                        model: true,
                        usedDetail: true
                    }
                },
                createdBy: { select: { id: true, name: true, username: true } },
                installments: true,
                payments: true,
                documents: true
            }
        });
        res.status(201).json(fullSale);
    }
    catch (err) {
        console.error('Error creating sale:', err);
        res.status(500).json({ error: 'Failed to record sale transaction' });
    }
});
// POST /api/sales/:id/payments - Record an installment / partial payment
router.post('/:id/payments', (0, auth_js_1.requirePermission)('CREATE_SALE'), (0, validate_js_1.validateBody)(schemas_js_1.recordPaymentSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, paymentMethod, referenceNumber, installmentId, notes } = req.body;
        const payAmount = Number(amount);
        const sale = await prisma_js_1.prisma.sale.findUnique({
            where: { id },
            include: { installments: true }
        });
        if (!sale || sale.isDeleted) {
            res.status(404).json({ error: 'Sale record not found' });
            return;
        }
        await prisma_js_1.prisma.$transaction(async (tx) => {
            // 1. Record payment transaction
            await tx.paymentTransaction.create({
                data: {
                    saleId: sale.id,
                    installmentId: installmentId || null,
                    amount: payAmount,
                    paymentMethod: paymentMethod || 'CASH',
                    referenceNumber: referenceNumber || null,
                    notes: notes || null
                }
            });
            // 2. If installment selected, update status
            if (installmentId) {
                const inst = await tx.installmentSchedule.findUnique({ where: { id: installmentId } });
                if (inst) {
                    const newPaid = inst.paidAmount + payAmount;
                    const isFullyPaid = newPaid >= inst.amount;
                    await tx.installmentSchedule.update({
                        where: { id: installmentId },
                        data: {
                            paidAmount: newPaid,
                            status: isFullyPaid ? 'PAID' : 'PENDING',
                            paidDate: isFullyPaid ? new Date() : inst.paidDate
                        }
                    });
                }
            }
            // 3. Update remaining balance
            const newBalance = Math.max(0, sale.remainingBalance - payAmount);
            await tx.sale.update({
                where: { id: sale.id },
                data: {
                    remainingBalance: newBalance,
                    status: newBalance <= 0 ? 'COMPLETED' : 'PENDING_PAYMENT'
                }
            });
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'RECORD_PAYMENT', 'SALES', `Recorded payment of PKR ${payAmount} for Invoice ${sale.invoiceNumber} via ${paymentMethod}`, req.ip);
        const updatedSale = await prisma_js_1.prisma.sale.findUnique({
            where: { id },
            include: {
                customer: true,
                bike: {
                    include: { model: true, usedDetail: true }
                },
                createdBy: { select: { id: true, name: true, username: true } },
                installments: { orderBy: { installmentNumber: 'asc' } },
                payments: { orderBy: { paymentDate: 'desc' } },
                documents: true
            }
        });
        res.json(updatedSale);
    }
    catch (err) {
        console.error('Error recording payment:', err);
        res.status(500).json({ error: 'Failed to record payment' });
    }
});
// DELETE /api/sales/:id - Soft Delete a sale & restore bike status
router.delete('/:id', (0, auth_js_1.requirePermission)('CREATE_SALE'), async (req, res) => {
    try {
        const { id } = req.params;
        const sale = await prisma_js_1.prisma.sale.findUnique({
            where: { id },
            include: { bike: true }
        });
        if (!sale || sale.isDeleted) {
            res.status(404).json({ error: 'Sale record not found' });
            return;
        }
        await prisma_js_1.prisma.$transaction(async (tx) => {
            // Soft delete the sale
            await tx.sale.update({
                where: { id },
                data: {
                    isDeleted: true,
                    deletedAt: new Date(),
                    status: 'CANCELLED'
                }
            });
            // Restore motorcycle status to IN_STOCK
            await tx.bike.update({
                where: { id: sale.bikeId },
                data: { status: 'IN_STOCK' }
            });
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'DELETE_SALE', 'SALES', `Cancelled/Soft-deleted Sale ${sale.invoiceNumber} and returned Bike ${sale.bike?.modelName} to stock`, req.ip);
        res.json({ message: 'Sale cancelled and soft-deleted successfully', id });
    }
    catch (err) {
        console.error('Error deleting sale:', err);
        res.status(500).json({ error: 'Failed to delete sale record' });
    }
});
exports.default = router;
