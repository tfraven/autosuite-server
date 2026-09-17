import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requirePermission, requireRole, AuthenticatedRequest, logAuditEvent } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createSaleSchema, recordPaymentSchema } from '../validation/schemas.js';

const router = Router();
router.use(authenticateToken);

// Helper to generate Invoice Number (e.g. INV-2026-0001)
async function generateInvoiceNumber(): Promise<string> {
  const count = await prisma.sale.count();
  const year = new Date().getFullYear();
  const seq = String(count + 1).padStart(4, '0');
  return `INV-${year}-${seq}`;
}

// GET /api/sales - List sales with filters and optional pagination
router.get('/', requirePermission('READ_SALES'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { saleType, paymentType, status, startDate, endDate, search, page, limit = '20', includeDeleted } = req.query;

    const where: any = {};
    if (includeDeleted !== 'true') {
      where.isDeleted = false;
    }
    if (saleType) where.saleType = String(saleType);
    if (paymentType) where.paymentType = String(paymentType);
    if (status) where.status = String(status);

    if (startDate || endDate) {
      where.saleDate = {};
      if (startDate) where.saleDate.gte = new Date(String(startDate));
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
        { bike: { chassisNumber: { contains: q, mode: 'insensitive' } } },
        { bike: { engineNumber: { contains: q, mode: 'insensitive' } } },
        { bike: { modelName: { contains: q, mode: 'insensitive' } } }
      ];
    }

    const totalCount = await prisma.sale.count({ where });

    const queryOptions: any = {
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
    };

    if (page) {
      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const limitNum = Math.max(1, parseInt(String(limit), 10) || 20);
      queryOptions.skip = (pageNum - 1) * limitNum;
      queryOptions.take = limitNum;

      const sales = await prisma.sale.findMany(queryOptions);
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

    const sales = await prisma.sale.findMany(queryOptions);
    res.setHeader('X-Total-Count', totalCount.toString());
    res.json(sales);
  } catch (err: any) {
    console.error('Error fetching sales:', err);
    res.status(500).json({ error: 'Failed to retrieve sales' });
  }
});

// GET /api/sales/customer-lookup - Fast customer profile autocomplete for sales entry (Task 10)
router.get('/customer-lookup', requirePermission('READ_SALES'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { query } = req.query;
    if (!query || String(query).trim().length < 2) {
      res.json([]);
      return;
    }

    const q = String(query).trim();

    // Fetch recent non-deleted sales matching customer name, phone, or CNIC
    const matchingSales = await prisma.sale.findMany({
      where: {
        isDeleted: false,
        OR: [
          { customerPhone: { contains: q, mode: 'insensitive' } },
          { customerName: { contains: q, mode: 'insensitive' } },
          { customerCnic: { contains: q, mode: 'insensitive' } }
        ]
      },
      orderBy: { saleDate: 'desc' },
      take: 50
    });

    const customerMap = new Map<string, any>();

    for (const sale of matchingSales) {
      const key = (sale.customerPhone || sale.customerName).trim().toLowerCase();
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          name: sale.customerName,
          phone: sale.customerPhone,
          cnic: sale.customerCnic || '',
          address: sale.customerAddress || '',
          customerType: sale.customerType || 'RETAIL',
          totalPurchases: 1,
          totalSpent: sale.finalAmount,
          remainingBalance: sale.remainingBalance,
          lastPurchaseDate: sale.saleDate,
          lastInvoice: sale.invoiceNumber
        });
      } else {
        const c = customerMap.get(key);
        c.totalPurchases += 1;
        c.totalSpent += sale.finalAmount;
        c.remainingBalance += sale.remainingBalance;
      }
    }

    res.json(Array.from(customerMap.values()).slice(0, 10));
  } catch (err: any) {
    console.error('Error in customer lookup:', err);
    res.status(500).json({ error: 'Failed to lookup customers' });
  }
});

// GET /api/sales/customers - Aggregated Customer Records with Ledger & Stats
router.get('/customers', requirePermission('READ_SALES'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { search, customerType, status, page, limit = '20' } = req.query;

    const sales = await prisma.sale.findMany({
      where: { isDeleted: false },
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

    const customerMap = new Map<string, any>();

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
      if (sale.installments?.some((i) => i.status !== 'PAID' && new Date(i.dueDate) < now)) {
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
      customers = customers.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.cnic.toLowerCase().includes(q) ||
          c.purchasedBikes.some((b: any) =>
            b.chassisNumber.toLowerCase().includes(q) || b.modelName.toLowerCase().includes(q)
          )
      );
    }

    if (customerType) {
      customers = customers.filter((c) => c.customerType === String(customerType));
    }

    if (status === 'DUES') {
      customers = customers.filter((c) => c.remainingBalance > 0);
    } else if (status === 'SETTLED') {
      customers = customers.filter((c) => c.remainingBalance <= 0);
    }

    customers.sort((a, b) => new Date(b.lastPurchaseDate).getTime() - new Date(a.lastPurchaseDate).getTime());

    const totalCustomers = customers.length;
    const totalRevenue = customers.reduce((acc, c) => acc + c.totalSpent, 0);
    const totalOutstanding = customers.reduce((acc, c) => acc + c.remainingBalance, 0);
    const debtorsCount = customers.filter((c) => c.remainingBalance > 0).length;
    const dealerCount = customers.filter((c) => c.customerType === 'DEALER' || c.saleType === 'B2B').length;

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
      const paginatedCustomers = customers.slice((pageNum - 1) * limitNum, pageNum * limitNum);
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
      customers,
      summary
    });
  } catch (err: any) {
    console.error('Error retrieving customer records:', err);
    res.status(500).json({ error: 'Failed to retrieve customer records' });
  }
});

// GET /api/sales/:id - Single sale with full invoice breakdown
router.get('/:id', requirePermission('READ_SALES'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const sale = await prisma.sale.findUnique({
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

    if (!sale || sale.isDeleted) {
      res.status(404).json({ error: 'Sale record not found' });
      return;
    }

    res.json(sale);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch sale details' });
  }
});

// POST /api/sales - Create a sale transaction
router.post('/', requirePermission('CREATE_SALE'), validateBody(createSaleSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      bikeId,
      saleType,
      customerName,
      customerPhone,
      customerCnic,
      customerAddress,
      customerType,
      salePrice,
      discount = 0,
      tax = 0,
      paymentType,
      initialDeposit = 0,
      paymentReference,
      installmentsCount = 0,
      installmentIntervalMonths = 1,
      firstInstallmentDueDate,
      notes
    } = req.body;

    // Verify bike is in stock
    const bike = await prisma.bike.findUnique({ where: { id: bikeId } });
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
    const userId = req.user!.userId;

    const result = await prisma.$transaction(async (tx) => {
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
          createdById: userId,
          isDeleted: false
        }
      });

      // 3. Record initial deposit if present
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

      // 5. Auto-initialize registration paperwork
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

    await logAuditEvent(
      userId,
      'CREATE_SALE',
      'SALES',
      `Issued ${result.invoiceNumber} for bike ${bike.modelName} (Chassis: ${bike.chassisNumber}) to ${customerName} for ${finalAmount}`,
      req.ip
    );

    const fullSale = await prisma.sale.findUnique({
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
  } catch (err: any) {
    console.error('Error creating sale:', err);
    res.status(500).json({ error: 'Failed to record sale transaction' });
  }
});

// POST /api/sales/:id/payments - Record an installment / partial payment
router.post('/:id/payments', requirePermission('CREATE_SALE'), validateBody(recordPaymentSchema), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod, referenceNumber, installmentId, notes } = req.body;

    const payAmount = Number(amount);

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { installments: true }
    });

    if (!sale || sale.isDeleted) {
      res.status(404).json({ error: 'Sale record not found' });
      return;
    }

    await prisma.$transaction(async (tx) => {
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

    await logAuditEvent(
      req.user?.userId,
      'RECORD_PAYMENT',
      'SALES',
      `Recorded payment of ${payAmount} for Invoice ${sale.invoiceNumber}`,
      req.ip
    );

    const updatedSale = await prisma.sale.findUnique({
      where: { id },
      include: {
        bike: true,
        installments: { orderBy: { installmentNumber: 'asc' } },
        payments: { orderBy: { paymentDate: 'desc' } }
      }
    });

    res.json(updatedSale);
  } catch (err: any) {
    console.error('Error recording payment:', err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// DELETE /api/sales/:id - Soft delete sale and release bike back to IN_STOCK (Admin/Manager only)
router.delete('/:id', requireRole(['Admin', 'Manager']), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { bike: true }
    });

    if (!sale || sale.isDeleted) {
      res.status(404).json({ error: 'Sale record not found' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Soft delete sale
      await tx.sale.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          status: 'CANCELLED'
        }
      });

      // 2. Release bike back to IN_STOCK if not sold to someone else
      if (sale.bikeId) {
        await tx.bike.update({
          where: { id: sale.bikeId },
          data: { status: 'IN_STOCK' }
        });
      }
    });

    await logAuditEvent(
      req.user?.userId,
      'SOFT_DELETE_SALE',
      'SALES',
      `Soft deleted sale ${sale.invoiceNumber} for customer ${sale.customerName}. Reverted bike ${sale.bike?.modelName} to IN_STOCK.`,
      req.ip
    );

    res.json({ message: 'Sale transaction cancelled and soft deleted successfully', id });
  } catch (err: any) {
    console.error('Error soft deleting sale:', err);
    res.status(500).json({ error: 'Failed to cancel sale transaction' });
  }
});

export default router;
