"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_js_1 = require("../lib/prisma.js");
const auth_js_1 = require("../middleware/auth.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticateToken);
// Helper to generate Invoice Number (e.g. INV-2026-0001)
async function generateInvoiceNumber() {
    const count = await prisma_js_1.prisma.sale.count();
    const year = new Date().getFullYear();
    const seq = String(count + 1).padStart(4, '0');
    return `INV-${year}-${seq}`;
}
// GET /api/sales - List sales with filters
router.get('/', (0, auth_js_1.requirePermission)('READ_SALES'), async (req, res) => {
    try {
        const { saleType, paymentType, status, startDate, endDate, search } = req.query;
        const where = {};
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
                { invoiceNumber: { contains: q } },
                { customerName: { contains: q } },
                { customerPhone: { contains: q } },
                { customerCnic: { contains: q } },
                { bike: { chassisNumber: { contains: q } } },
                { bike: { engineNumber: { contains: q } } },
                { bike: { modelName: { contains: q } } }
            ];
        }
        const sales = await prisma_js_1.prisma.sale.findMany({
            where,
            orderBy: { saleDate: 'desc' },
            include: {
                bike: true,
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
        res.json(sales);
    }
    catch (err) {
        console.error('Error fetching sales:', err);
        res.status(500).json({ error: 'Failed to retrieve sales' });
    }
});
// GET /api/sales/customers - Aggregated Customer Records with Ledger & Stats
router.get('/customers', (0, auth_js_1.requirePermission)('READ_SALES'), async (req, res) => {
    try {
        const { search, customerType, status } = req.query;
        const sales = await prisma_js_1.prisma.sale.findMany({
            orderBy: { saleDate: 'desc' },
            include: {
                bike: true,
                createdBy: {
                    select: { id: true, name: true, username: true }
                },
                installments: {
                    orderBy: { installmentNumber: 'asc' }
                },
                payments: {
                    orderBy: { paymentDate: 'desc' }
                }
            }
        });
        const customerMap = new Map();
        for (const sale of sales) {
            const key = (sale.customerPhone || sale.customerName || sale.id).trim().toLowerCase();
            if (!customerMap.has(key)) {
                customerMap.set(key, {
                    id: key,
                    name: sale.customerName,
                    phone: sale.customerPhone,
                    cnic: sale.customerCnic || '',
                    address: sale.customerAddress || '',
                    customerType: sale.customerType || 'RETAIL',
                    saleType: sale.saleType,
                    totalPurchases: 0,
                    totalSpent: 0,
                    totalPaid: 0,
                    remainingBalance: 0,
                    hasOverdue: false,
                    firstPurchaseDate: sale.saleDate,
                    lastPurchaseDate: sale.saleDate,
                    purchasedBikes: [],
                    sales: []
                });
            }
            const cust = customerMap.get(key);
            cust.totalPurchases += 1;
            cust.totalSpent += Number(sale.finalAmount || 0);
            cust.remainingBalance += Number(sale.remainingBalance || 0);
            cust.totalPaid += Number((sale.finalAmount || 0) - (sale.remainingBalance || 0));
            if (new Date(sale.saleDate) > new Date(cust.lastPurchaseDate)) {
                cust.lastPurchaseDate = sale.saleDate;
            }
            if (new Date(sale.saleDate) < new Date(cust.firstPurchaseDate)) {
                cust.firstPurchaseDate = sale.saleDate;
            }
            const now = new Date();
            if (sale.installments?.some(i => i.status !== 'PAID' && new Date(i.dueDate) < now)) {
                cust.hasOverdue = true;
            }
            if (sale.bike) {
                cust.purchasedBikes.push({
                    id: sale.bike.id,
                    modelName: sale.bike.modelName,
                    chassisNumber: sale.bike.chassisNumber,
                    engineNumber: sale.bike.engineNumber,
                    color: sale.bike.color,
                    modelYear: sale.bike.modelYear,
                    saleDate: sale.saleDate,
                    invoiceNumber: sale.invoiceNumber
                });
            }
            cust.sales.push({
                id: sale.id,
                invoiceNumber: sale.invoiceNumber,
                saleDate: sale.saleDate,
                saleType: sale.saleType,
                paymentType: sale.paymentType,
                finalAmount: sale.finalAmount,
                remainingBalance: sale.remainingBalance,
                status: sale.status,
                bike: sale.bike,
                installments: sale.installments,
                payments: sale.payments
            });
        }
        let customers = Array.from(customerMap.values());
        if (search) {
            const q = String(search).toLowerCase().trim();
            customers = customers.filter(c => c.name.toLowerCase().includes(q) ||
                c.phone.toLowerCase().includes(q) ||
                c.cnic.toLowerCase().includes(q) ||
                c.purchasedBikes.some((b) => b.chassisNumber.toLowerCase().includes(q) ||
                    b.modelName.toLowerCase().includes(q)));
        }
        if (customerType) {
            customers = customers.filter(c => c.customerType === String(customerType));
        }
        if (status === 'DUES') {
            customers = customers.filter(c => c.remainingBalance > 0);
        }
        else if (status === 'SETTLED') {
            customers = customers.filter(c => c.remainingBalance <= 0);
        }
        customers.sort((a, b) => new Date(b.lastPurchaseDate).getTime() - new Date(a.lastPurchaseDate).getTime());
        const totalCustomers = customers.length;
        const totalRevenue = customers.reduce((acc, c) => acc + c.totalSpent, 0);
        const totalOutstanding = customers.reduce((acc, c) => acc + c.remainingBalance, 0);
        const debtorsCount = customers.filter(c => c.remainingBalance > 0).length;
        const dealerCount = customers.filter(c => c.customerType === 'DEALER' || c.saleType === 'B2B').length;
        res.json({
            customers,
            summary: {
                totalCustomers,
                totalRevenue,
                totalOutstanding,
                debtorsCount,
                dealerCount
            }
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
                bike: true,
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
        if (!sale) {
            res.status(404).json({ error: 'Sale record not found' });
            return;
        }
        res.json(sale);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to fetch sale details' });
    }
});
// POST /api/sales - Create a sale transaction
router.post('/', (0, auth_js_1.requirePermission)('CREATE_SALE'), async (req, res) => {
    try {
        const { bikeId, saleType, // B2C or B2B
        customerName, customerPhone, customerCnic, customerAddress, customerType, salePrice, discount = 0, tax = 0, paymentType, // CASH, BANK_TRANSFER, CHEQUE, CREDIT_INSTALLMENT
        initialDeposit = 0, paymentReference, installmentsCount = 0, installmentIntervalMonths = 1, firstInstallmentDueDate, notes } = req.body;
        if (!bikeId || !customerName || !customerPhone || !salePrice || !paymentType) {
            res.status(400).json({ error: 'Missing required sale transaction fields' });
            return;
        }
        // Verify bike is in stock
        const bike = await prisma_js_1.prisma.bike.findUnique({ where: { id: bikeId } });
        if (!bike) {
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
        // Use Prisma transaction to atomically create sale, update bike status, create initial payment, installments & documents
        const result = await prisma_js_1.prisma.$transaction(async (tx) => {
            // 1. Update bike status to SOLD
            await tx.bike.update({
                where: { id: bikeId },
                data: { status: 'SOLD' }
            });
            // 2. Create Sale record
            const sale = await tx.sale.create({
                data: {
                    invoiceNumber,
                    saleType: saleType || 'B2C',
                    bikeId,
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
                    createdById: userId
                }
            });
            // 3. If there is an initial deposit, record the payment transaction
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
            // 4. If Credit/Installment sale, generate installment schedules
            if (paymentType === 'CREDIT_INSTALLMENT' && installmentsCount > 0 && remainingBalance > 0) {
                const count = Number(installmentsCount);
                const monthlyAmount = Math.round((remainingBalance / count) * 100) / 100;
                let runningBalance = remainingBalance;
                const baseDate = firstInstallmentDueDate ? new Date(firstInstallmentDueDate) : new Date();
                for (let i = 1; i <= count; i++) {
                    const dueDate = new Date(baseDate);
                    dueDate.setMonth(dueDate.getMonth() + (i - 1) * (installmentIntervalMonths || 1));
                    // Adjust last installment for rounding discrepancies
                    const instAmount = i === count ? runningBalance : monthlyAmount;
                    runningBalance -= instAmount;
                    await tx.installmentSchedule.create({
                        data: {
                            saleId: sale.id,
                            installmentNumber: i,
                            dueDate,
                            amount: instAmount,
                            paidAmount: 0,
                            status: 'PENDING'
                        }
                    });
                }
            }
            // 5. Auto-initialize the 5 standard official paperwork templates for tracking
            const docTypes = [
                'SALES_CERTIFICATE',
                'DELIVERY_LETTER_GATE_PASS',
                'BOOK_TRANSFER_REQUEST',
                'ALLOTMENT_LETTER',
                'REGISTRATION_APPLICATION'
            ];
            for (const docType of docTypes) {
                await tx.motorcycleDocument.create({
                    data: {
                        saleId: sale.id,
                        docType,
                        paperworkStatus: 'PENDING_MANUFACTURER',
                        statusNotes: 'Automatic registration pipeline initiated.'
                    }
                });
            }
            return sale;
        });
        await (0, auth_js_1.logAuditEvent)(userId, 'CREATE_SALE', 'SALES', `Issued ${result.invoiceNumber} for bike ${bike.modelName} (Chassis: ${bike.chassisNumber}) to ${customerName} for ${finalAmount}`, req.ip);
        // Fetch newly created sale with all relations
        const fullSale = await prisma_js_1.prisma.sale.findUnique({
            where: { id: result.id },
            include: {
                bike: true,
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
router.post('/:id/payments', (0, auth_js_1.requirePermission)('CREATE_SALE'), async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, paymentMethod, referenceNumber, installmentId, notes } = req.body;
        const payAmount = Number(amount);
        if (!payAmount || payAmount <= 0) {
            res.status(400).json({ error: 'Payment amount must be greater than zero' });
            return;
        }
        const sale = await prisma_js_1.prisma.sale.findUnique({
            where: { id },
            include: { installments: true }
        });
        if (!sale) {
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
            // 2. If an installment was selected, update its paid amount and status
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
            // 3. Update remaining balance on sale
            const newBalance = Math.max(0, sale.remainingBalance - payAmount);
            await tx.sale.update({
                where: { id: sale.id },
                data: {
                    remainingBalance: newBalance,
                    status: newBalance <= 0 ? 'COMPLETED' : 'PENDING_PAYMENT'
                }
            });
        });
        await (0, auth_js_1.logAuditEvent)(req.user?.userId, 'RECORD_PAYMENT', 'SALES', `Recorded payment of ${payAmount} for Invoice ${sale.invoiceNumber}`, req.ip);
        const updatedSale = await prisma_js_1.prisma.sale.findUnique({
            where: { id },
            include: {
                bike: true,
                installments: { orderBy: { installmentNumber: 'asc' } },
                payments: { orderBy: { paymentDate: 'desc' } }
            }
        });
        res.json(updatedSale);
    }
    catch (err) {
        console.error('Error recording payment:', err);
        res.status(500).json({ error: 'Failed to record payment' });
    }
});
exports.default = router;
