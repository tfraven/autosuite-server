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

// GET /api/reports/dashboard - Aggregated stats for the dashboard
router.get('/dashboard', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const [
      totalBikes,
      inStockBikes,
      soldBikes,
      totalSalesCount,
      salesData,
      lowStockPartsCount,
      pendingPaperworkCount,
      recentSales
    ] = await Promise.all([
      prisma.bike.count(),
      prisma.bike.count({ where: { status: 'IN_STOCK' } }),
      prisma.bike.count({ where: { status: 'SOLD' } }),
      prisma.sale.count(),
      prisma.sale.findMany({
        select: {
          finalAmount: true,
          remainingBalance: true,
          paymentType: true,
          saleType: true,
          saleDate: true,
          bike: { select: { modelName: true, type: true } }
        }
      }),
      prisma.part.findMany().then((parts) => parts.filter((p) => p.quantity <= p.reorderThreshold).length),
      prisma.motorcycleDocument.count({
        where: { paperworkStatus: { not: 'DELIVERED' } }
      }),
      prisma.sale.findMany({
        take: 5,
        orderBy: { saleDate: 'desc' },
        include: { bike: true }
      })
    ]);

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
      .slice(0, 5);

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
      orderBy: { partName: 'asc' }
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AutoSuite ERP';
    const worksheet = workbook.addWorksheet('Spare Parts Stock');

    worksheet.columns = [
      { header: 'Part Code', key: 'partCode', width: 18 },
      { header: 'Part Name', key: 'partName', width: 28 },
      { header: 'Category', key: 'category', width: 16 },
      { header: 'Compatible Models', key: 'compatibilityModel', width: 24 },
      { header: 'Quantity in Stock', key: 'quantity', width: 16 },
      { header: 'Reorder Level', key: 'reorderThreshold', width: 14 },
      { header: 'Wholesale Cost', key: 'wholesaleCost', width: 16 },
      { header: 'B2B Selling Price', key: 'b2bSellingPrice', width: 16 },
      { header: 'Stock Status', key: 'stockStatus', width: 16 },
      { header: 'Bin Location', key: 'location', width: 14 }
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
        wholesaleCost: p.wholesaleCost,
        b2bSellingPrice: p.b2bSellingPrice,
        stockStatus: p.quantity <= p.reorderThreshold ? 'LOW STOCK' : 'HEALTHY',
        location: p.location || '-'
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=AutoSuite_Spare_Parts_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('Excel parts export error:', err);
    res.status(500).json({ error: 'Failed to export parts excel sheet' });
  }
});

// GET /api/reports/export/sales - Export Sales Register
router.get('/export/sales', requirePermission('EXPORT_EXCEL'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { saleType, paymentMode, startDate, endDate } = req.query;

    const where: any = {};
    if (saleType) where.saleType = String(saleType);
    if (paymentMode) where.paymentType = String(paymentMode);
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
    const worksheet = workbook.addWorksheet('Sales Register');

    worksheet.columns = [
      { header: 'Invoice #', key: 'invoiceNumber', width: 18 },
      { header: 'Sale Date', key: 'saleDate', width: 16 },
      { header: 'Sale Type', key: 'saleType', width: 12 },
      { header: 'Customer Name', key: 'customerName', width: 22 },
      { header: 'Customer Phone', key: 'customerPhone', width: 18 },
      { header: 'Bike Model', key: 'bikeModel', width: 20 },
      { header: 'Chassis Number', key: 'chassisNumber', width: 22 },
      { header: 'Engine Number', key: 'engineNumber', width: 22 },
      { header: 'Sale Price', key: 'salePrice', width: 14 },
      { header: 'Discount', key: 'discount', width: 12 },
      { header: 'Final Amount', key: 'finalAmount', width: 16 },
      { header: 'Payment Mode', key: 'paymentType', width: 18 },
      { header: 'Paid Upfront', key: 'initialDeposit', width: 16 },
      { header: 'Remaining Due', key: 'remainingBalance', width: 16 },
      { header: 'Sales Agent', key: 'agent', width: 18 }
    ];

    formatHeaderRow(worksheet.getRow(1));

    sales.forEach((s) => {
      worksheet.addRow({
        invoiceNumber: s.invoiceNumber,
        saleDate: s.saleDate.toISOString().split('T')[0],
        saleType: s.saleType,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        bikeModel: s.bike.modelName,
        chassisNumber: s.bike.chassisNumber,
        engineNumber: s.bike.engineNumber,
        salePrice: s.salePrice,
        discount: s.discount,
        finalAmount: s.finalAmount,
        paymentType: s.paymentType.replace('_', ' '),
        initialDeposit: s.initialDeposit,
        remainingBalance: s.remainingBalance,
        agent: s.createdBy.name
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=AutoSuite_Sales_Register_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('Excel sales export error:', err);
    res.status(500).json({ error: 'Failed to export sales register' });
  }
});

// GET /api/reports/export/credit-ledger - Export Credit & Installment Ledger
router.get('/export/credit-ledger', requirePermission('EXPORT_EXCEL'), async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const creditSales = await prisma.sale.findMany({
      where: {
        paymentType: 'CREDIT_INSTALLMENT',
        remainingBalance: { gt: 0 }
      },
      include: {
        bike: true,
        installments: {
          orderBy: { installmentNumber: 'asc' }
        }
      },
      orderBy: { remainingBalance: 'desc' }
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AutoSuite ERP';
    const worksheet = workbook.addWorksheet('Outstanding Credit Ledger');

    worksheet.columns = [
      { header: 'Invoice #', key: 'invoiceNumber', width: 18 },
      { header: 'Customer Name', key: 'customerName', width: 22 },
      { header: 'Phone', key: 'customerPhone', width: 16 },
      { header: 'CNIC', key: 'customerCnic', width: 18 },
      { header: 'Motorcycle', key: 'bike', width: 22 },
      { header: 'Chassis No', key: 'chassisNumber', width: 22 },
      { header: 'Total Value', key: 'finalAmount', width: 16 },
      { header: 'Initial Deposit', key: 'initialDeposit', width: 16 },
      { header: 'Outstanding Balance', key: 'remainingBalance', width: 20 },
      { header: 'Pending Installments', key: 'pendingCount', width: 20 },
      { header: 'Next Due Date', key: 'nextDueDate', width: 16 }
    ];

    formatHeaderRow(worksheet.getRow(1));

    creditSales.forEach((s) => {
      const pendingInst = s.installments.filter((i) => i.status !== 'PAID');
      const nextInst = pendingInst[0];

      worksheet.addRow({
        invoiceNumber: s.invoiceNumber,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        customerCnic: s.customerCnic || '-',
        bike: `${s.bike.modelName} (${s.bike.color})`,
        chassisNumber: s.bike.chassisNumber,
        finalAmount: s.finalAmount,
        initialDeposit: s.initialDeposit,
        remainingBalance: s.remainingBalance,
        pendingCount: `${pendingInst.length} of ${s.installments.length}`,
        nextDueDate: nextInst ? nextInst.dueDate.toISOString().split('T')[0] : 'None'
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=AutoSuite_Credit_Ledger_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    console.error('Excel credit ledger export error:', err);
    res.status(500).json({ error: 'Failed to export credit ledger' });
  }
});

export default router;
