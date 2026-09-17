import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

// Helper to style excel headers
function formatHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' } // Slate 800
    };
    cell.font = {
      color: { argb: 'FFFFFFFF' },
      bold: true,
      size: 11
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  row.height = 26;
}

// GET /api/reports/dashboard - Aggregated stats for the dashboard and analytics
router.get('/dashboard', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const [
      totalBikes,
      inStockBikes,
      soldBikes,
      totalSalesCount,
      salesData,
      allParts,
      pendingPaperworkCount,
      recentSales
    ] = await Promise.all([
      prisma.bike.count({ where: { isDeleted: false } }),
      prisma.bike.count({ where: { status: 'IN_STOCK', isDeleted: false } }),
      prisma.bike.count({ where: { status: 'SOLD', isDeleted: false } }),
      prisma.sale.count({ where: { isDeleted: false } }),
      prisma.sale.findMany({
        where: { isDeleted: false },
        select: {
          finalAmount: true,
          remainingBalance: true,
          paymentType: true,
          saleType: true,
          saleDate: true,
          bike: { select: { modelName: true, type: true } }
        }
      }),
      prisma.part.findMany({ where: { isDeleted: false } }),
      prisma.motorcycleDocument.count({
        where: {
          paperworkStatus: { not: 'DELIVERED' },
          sale: { isDeleted: false }
        }
      }),
      prisma.sale.findMany({
        where: { isDeleted: false },
        take: 5,
        orderBy: { saleDate: 'desc' },
        include: { bike: true }
      })
    ]);

    const lowStockPartsCount = allParts.filter((p) => p.quantity <= p.reorderThreshold).length;
    const totalRevenue = salesData.reduce((sum, s) => sum + s.finalAmount, 0);
    const totalOutstandingCredit = salesData.reduce((sum, s) => sum + s.remainingBalance, 0);
    const b2cCount = salesData.filter((s) => s.saleType === 'B2C').length;
    const b2bCount = salesData.filter((s) => s.saleType === 'B2B').length;

    // Top selling models
    const modelSalesMap: Record<string, { count: number; revenue: number }> = {};
    for (const s of salesData) {
      const model = s.bike?.modelName || 'Other';
      if (!modelSalesMap[model]) {
        modelSalesMap[model] = { count: 0, revenue: 0 };
      }
      modelSalesMap[model].count += 1;
      modelSalesMap[model].revenue += s.finalAmount;
    }

    const topModels = Object.entries(modelSalesMap)
      .map(([model, data]) => ({ model, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Monthly revenue trend (last 6 months)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTrendMap: Record<string, number> = {};
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      monthlyTrendMap[key] = 0;
    }

    for (const s of salesData) {
      const d = new Date(s.saleDate);
      const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      if (monthlyTrendMap[key] !== undefined) {
        monthlyTrendMap[key] += s.finalAmount;
      }
    }

    const monthlyTrends = Object.entries(monthlyTrendMap).map(([month, revenue]) => ({
      month,
      revenue
    }));

    // Payment methods breakdown
    const paymentMethodsMap: Record<string, number> = {
      CASH: 0,
      BANK_TRANSFER: 0,
      CHEQUE: 0,
      CREDIT_INSTALLMENT: 0
    };

    for (const s of salesData) {
      if (paymentMethodsMap[s.paymentType] !== undefined) {
        paymentMethodsMap[s.paymentType] += s.finalAmount;
      } else {
        paymentMethodsMap[s.paymentType] = s.finalAmount;
      }
    }

    const paymentBreakdown = Object.entries(paymentMethodsMap).map(([method, amount]) => ({
      method,
      amount
    }));

    res.json({
      totalBikes,
      inStockBikes,
      soldBikes,
      totalSalesCount,
      totalRevenue,
      totalOutstandingCredit,
      b2cCount,
      b2bCount,
      lowStockPartsCount,
      pendingPaperworkCount,
      topModels,
      monthlyTrends,
      paymentBreakdown,
      recentSales
    });
  } catch (err: any) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to aggregate dashboard analytics' });
  }
});

// GET /api/reports/export/bikes - Export Motorcycle Stock Sheet
router.get('/export/bikes', requirePermission('EXPORT_EXCEL'), async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const bikes = await prisma.bike.findMany({
      where: { isDeleted: false },
      orderBy: [{ status: 'asc' }, { modelName: 'asc' }]
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AutoSuite ERP';
    const worksheet = workbook.addWorksheet('Motorcycle Inventory');

    worksheet.columns = [
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Model Name', key: 'modelName', width: 22 },
      { header: 'Chassis Number', key: 'chassisNumber', width: 22 },
      { header: 'Engine Number', key: 'engineNumber', width: 22 },
      { header: 'Color', key: 'color', width: 14 },
      { header: 'Year', key: 'modelYear', width: 10 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Market Target', key: 'marketTarget', width: 14 },
      { header: 'Invoice Cost', key: 'dealerInvoicePrice', width: 16 },
      { header: 'Retail Price', key: 'retailPrice', width: 16 },
      { header: 'Reg Number (Used)', key: 'registrationNumber', width: 18 },
      { header: 'Condition Grade', key: 'conditionGrade', width: 16 },
      { header: 'Prev Owner', key: 'prevOwnerName', width: 20 },
      { header: 'Owner Phone', key: 'prevOwnerPhone', width: 18 }
    ];

    formatHeaderRow(worksheet.getRow(1));

    bikes.forEach((b) => {
      worksheet.addRow({
        type: b.type === 'BRAND_NEW' ? 'Brand New' : 'Used Certified',
        modelName: b.modelName,
        chassisNumber: b.chassisNumber,
        engineNumber: b.engineNumber,
        color: b.color,
        modelYear: b.modelYear,
        status: b.status,
        marketTarget: b.marketTarget,
        dealerInvoicePrice: b.dealerInvoicePrice,
        retailPrice: b.retailPrice,
        registrationNumber: b.registrationNumber || '-',
        conditionGrade: b.conditionGrade || '-',
        prevOwnerName: b.prevOwnerName || '-',
        prevOwnerPhone: b.prevOwnerPhone || '-'
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=AutoSuite_Bikes_Stock_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('Excel bike export error:', err);
    res.status(500).json({ error: 'Failed to export bike inventory excel sheet' });
  }
});

// GET /api/reports/export/parts - Export Spare Parts Stock Sheet
router.get('/export/parts', requirePermission('EXPORT_EXCEL'), async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const parts = await prisma.part.findMany({
      where: { isDeleted: false },
      orderBy: { partName: 'asc' }
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AutoSuite ERP';
    const worksheet = workbook.addWorksheet('Spare Parts Stock');

    worksheet.columns = [
      { header: 'Part Code', key: 'partCode', width: 18 },
      { header: 'Part Name', key: 'partName', width: 28 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Compatibility Model', key: 'compatibilityModel', width: 24 },
      { header: 'Quantity in Stock', key: 'quantity', width: 18 },
      { header: 'Reorder Threshold', key: 'reorderThreshold', width: 18 },
      { header: 'Bin / Location', key: 'location', width: 16 },
      { header: 'Wholesale Cost (PKR)', key: 'wholesaleCost', width: 20 },
      { header: 'B2B Selling Price (PKR)', key: 'b2bSellingPrice', width: 22 },
      { header: 'Stock Value (PKR)', key: 'totalValue', width: 20 }
    ];

    formatHeaderRow(worksheet.getRow(1));

    parts.forEach((p) => {
      worksheet.addRow({
        partCode: p.partCode,
        partName: p.partName,
        category: p.category || 'General',
        compatibilityModel: p.compatibilityModel,
        quantity: p.quantity,
        reorderThreshold: p.reorderThreshold,
        location: p.location || 'Main Storage',
        wholesaleCost: p.wholesaleCost,
        b2bSellingPrice: p.b2bSellingPrice,
        totalValue: p.quantity * p.wholesaleCost
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=AutoSuite_Parts_Inventory_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('Excel parts export error:', err);
    res.status(500).json({ error: 'Failed to export parts inventory excel sheet' });
  }
});

// GET /api/reports/export/sales - Export Sales and Billing Register
router.get('/export/sales', requirePermission('EXPORT_EXCEL'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, saleType } = req.query;
    const paymentType = req.query.paymentType || req.query.paymentMode;

    const where: any = { isDeleted: false };
    if (saleType) where.saleType = String(saleType);
    if (paymentType) where.paymentType = String(paymentType);
    if (startDate || endDate) {
      where.saleDate = {};
      if (startDate) where.saleDate.gte = new Date(String(startDate));
      if (endDate) {
        const end = new Date(String(endDate));
        end.setHours(23, 59, 59, 999);
        where.saleDate.lte = end;
      }
    }

    const sales = await prisma.sale.findMany({
      where,
      orderBy: { saleDate: 'desc' },
      include: {
        bike: true,
        createdBy: { select: { name: true } }
      }
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AutoSuite ERP';
    const worksheet = workbook.addWorksheet('Sales Billing Register');

    worksheet.columns = [
      { header: 'Invoice Number', key: 'invoiceNumber', width: 18 },
      { header: 'Sale Date', key: 'saleDate', width: 14 },
      { header: 'Channel', key: 'saleType', width: 12 },
      { header: 'Customer Name', key: 'customerName', width: 22 },
      { header: 'Phone Number', key: 'customerPhone', width: 16 },
      { header: 'CNIC', key: 'customerCnic', width: 18 },
      { header: 'Motorcycle Model', key: 'modelName', width: 22 },
      { header: 'Chassis Number', key: 'chassisNumber', width: 22 },
      { header: 'Engine Number', key: 'engineNumber', width: 22 },
      { header: 'Sale Price (PKR)', key: 'salePrice', width: 16 },
      { header: 'Discount (PKR)', key: 'discount', width: 14 },
      { header: 'Tax (PKR)', key: 'tax', width: 12 },
      { header: 'Final Amount (PKR)', key: 'finalAmount', width: 18 },
      { header: 'Payment Mode', key: 'paymentType', width: 18 },
      { header: 'Initial Deposit (PKR)', key: 'initialDeposit', width: 18 },
      { header: 'Balance Due (PKR)', key: 'remainingBalance', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Issued By', key: 'createdByName', width: 18 }
    ];

    formatHeaderRow(worksheet.getRow(1));

    sales.forEach((s) => {
      worksheet.addRow({
        invoiceNumber: s.invoiceNumber,
        saleDate: s.saleDate.toISOString().split('T')[0],
        saleType: s.saleType,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        customerCnic: s.customerCnic || '-',
        modelName: s.bike.modelName,
        chassisNumber: s.bike.chassisNumber,
        engineNumber: s.bike.engineNumber,
        salePrice: s.salePrice,
        discount: s.discount,
        tax: s.tax,
        finalAmount: s.finalAmount,
        paymentType: s.paymentType,
        initialDeposit: s.initialDeposit,
        remainingBalance: s.remainingBalance,
        status: s.status,
        createdByName: s.createdBy.name
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=AutoSuite_Sales_Register_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('Excel sales export error:', err);
    res.status(500).json({ error: 'Failed to export sales register excel sheet' });
  }
});

// GET /api/reports/export/credit-ledger - Export Customer Installments and Receivables Ledger
router.get('/export/credit-ledger', requirePermission('EXPORT_EXCEL'), async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const creditSales = await prisma.sale.findMany({
      where: {
        isDeleted: false,
        paymentType: 'CREDIT_INSTALLMENT'
      },
      orderBy: { saleDate: 'desc' },
      include: {
        bike: true,
        installments: {
          orderBy: { installmentNumber: 'asc' }
        },
        createdBy: { select: { name: true } }
      }
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AutoSuite ERP';
    const worksheet = workbook.addWorksheet('Installment Credit Ledger');

    worksheet.columns = [
      { header: 'Invoice Number', key: 'invoiceNumber', width: 18 },
      { header: 'Sale Date', key: 'saleDate', width: 14 },
      { header: 'Customer Name', key: 'customerName', width: 22 },
      { header: 'Phone Number', key: 'customerPhone', width: 16 },
      { header: 'CNIC', key: 'customerCnic', width: 18 },
      { header: 'Motorcycle Model', key: 'modelName', width: 22 },
      { header: 'Chassis Number', key: 'chassisNumber', width: 22 },
      { header: 'Total Price (PKR)', key: 'finalAmount', width: 18 },
      { header: 'Down Payment (PKR)', key: 'initialDeposit', width: 18 },
      { header: 'Balance Due (PKR)', key: 'remainingBalance', width: 18 },
      { header: 'Total Installments', key: 'totalInstallments', width: 18 },
      { header: 'Paid Installments', key: 'paidInstallments', width: 18 },
      { header: 'Pending / Overdue', key: 'pendingInstallments', width: 18 },
      { header: 'Next Due Date', key: 'nextDueDate', width: 16 },
      { header: 'Account Status', key: 'status', width: 16 }
    ];

    formatHeaderRow(worksheet.getRow(1));

    creditSales.forEach((s) => {
      const totalInst = s.installments.length;
      const paidInst = s.installments.filter((i) => i.status === 'PAID').length;
      const pendingInst = totalInst - paidInst;
      const nextPending = s.installments.find((i) => i.status !== 'PAID');
      const nextDueDateStr = nextPending ? nextPending.dueDate.toISOString().split('T')[0] : 'All Paid';

      worksheet.addRow({
        invoiceNumber: s.invoiceNumber,
        saleDate: s.saleDate.toISOString().split('T')[0],
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        customerCnic: s.customerCnic || '-',
        modelName: s.bike?.modelName || '-',
        chassisNumber: s.bike?.chassisNumber || '-',
        finalAmount: s.finalAmount,
        initialDeposit: s.initialDeposit,
        remainingBalance: s.remainingBalance,
        totalInstallments: totalInst,
        paidInstallments: paidInst,
        pendingInstallments: pendingInst,
        nextDueDate: nextDueDateStr,
        status: s.remainingBalance <= 0 ? 'SETTLED' : 'ACTIVE_DUES'
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=AutoSuite_Credit_Ledger_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('Excel credit ledger export error:', err);
    res.status(500).json({ error: 'Failed to export installment credit ledger excel sheet' });
  }
});

export default router;
