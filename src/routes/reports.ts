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

// GET /api/reports/heatmaps - Aggregated matrix and calendar data for sales & user activity heatmaps
router.get('/heatmaps', async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // 1. Fetch sales data (last 90 days or all valid sales)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    ninetyDaysAgo.setHours(0, 0, 0, 0);

    const [sales, auditLogs] = await Promise.all([
      prisma.sale.findMany({
        where: {
          isDeleted: false,
          saleDate: { gte: ninetyDaysAgo }
        },
        select: {
          id: true,
          saleDate: true,
          finalAmount: true,
          invoiceNumber: true
        }
      }),
      prisma.auditLog.findMany({
        where: {
          createdAt: { gte: ninetyDaysAgo }
        },
        select: {
          id: true,
          action: true,
          module: true,
          createdAt: true,
          userId: true,
          user: { select: { username: true, name: true } }
        }
      })
    ]);

    // Build 7 x 24 hourly matrices (0: Sun, 1: Mon, ... 6: Sat)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const salesHourlyMatrix: { day: number; dayName: string; hour: number; count: number; revenue: number }[] = [];
    const auditHourlyMatrix: { day: number; dayName: string; hour: number; count: number }[] = [];

    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        salesHourlyMatrix.push({ day: d, dayName: dayNames[d], hour: h, count: 0, revenue: 0 });
        auditHourlyMatrix.push({ day: d, dayName: dayNames[d], hour: h, count: 0 });
      }
    }

    const salesDailyMap: Record<string, { count: number; revenue: number }> = {};
    const auditDailyMap: Record<string, { count: number }> = {};

    // Generate consecutive 90 days dates
    const dailyCalendar: { date: string; dayOfWeek: number; dayName: string; salesCount: number; salesRevenue: number; auditCount: number }[] = [];
    const now = new Date();
    for (let i = 89; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(now.getDate() - i);
      const ymd = dt.toISOString().split('T')[0];
      const dow = dt.getDay();
      salesDailyMap[ymd] = { count: 0, revenue: 0 };
      auditDailyMap[ymd] = { count: 0 };
      dailyCalendar.push({
        date: ymd,
        dayOfWeek: dow,
        dayName: dayNames[dow],
        salesCount: 0,
        salesRevenue: 0,
        auditCount: 0
      });
    }

    // Populate Sales
    let maxSalesHourlyCount = 0;
    let maxSalesHourlyRev = 0;
    let totalSalesRevenue = 0;

    for (const s of sales) {
      const d = new Date(s.saleDate);
      const day = d.getDay();
      const hour = d.getHours();
      const ymd = d.toISOString().split('T')[0];

      const idx = day * 24 + hour;
      if (salesHourlyMatrix[idx]) {
        salesHourlyMatrix[idx].count += 1;
        salesHourlyMatrix[idx].revenue += s.finalAmount;
        if (salesHourlyMatrix[idx].count > maxSalesHourlyCount) maxSalesHourlyCount = salesHourlyMatrix[idx].count;
        if (salesHourlyMatrix[idx].revenue > maxSalesHourlyRev) maxSalesHourlyRev = salesHourlyMatrix[idx].revenue;
      }

      totalSalesRevenue += s.finalAmount;
      if (salesDailyMap[ymd]) {
        salesDailyMap[ymd].count += 1;
        salesDailyMap[ymd].revenue += s.finalAmount;
      }
    }

    // Populate Audit
    let maxAuditHourlyCount = 0;
    const userAuditCounts: Record<string, { name: string; username: string; count: number }> = {};
    const actionCounts: Record<string, number> = {};

    for (const a of auditLogs) {
      const d = new Date(a.createdAt);
      const day = d.getDay();
      const hour = d.getHours();
      const ymd = d.toISOString().split('T')[0];

      const idx = day * 24 + hour;
      if (auditHourlyMatrix[idx]) {
        auditHourlyMatrix[idx].count += 1;
        if (auditHourlyMatrix[idx].count > maxAuditHourlyCount) maxAuditHourlyCount = auditHourlyMatrix[idx].count;
      }

      if (auditDailyMap[ymd]) {
        auditDailyMap[ymd].count += 1;
      }

      if (a.user) {
        const uId = a.userId || a.user.username;
        if (!userAuditCounts[uId]) {
          userAuditCounts[uId] = { name: a.user.name, username: a.user.username, count: 0 };
        }
        userAuditCounts[uId].count += 1;
      }

      actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
    }

    // Fill daily calendar
    for (const entry of dailyCalendar) {
      if (salesDailyMap[entry.date]) {
        entry.salesCount = salesDailyMap[entry.date].count;
        entry.salesRevenue = salesDailyMap[entry.date].revenue;
      }
      if (auditDailyMap[entry.date]) {
        entry.auditCount = auditDailyMap[entry.date].count;
      }
    }

    // Identify peak day of week & hour
    let peakSalesDay = { dayName: 'Monday', count: 0, revenue: 0 };
    for (let d = 0; d < 7; d++) {
      const daySlice = salesHourlyMatrix.filter((m) => m.day === d);
      const dayCount = daySlice.reduce((sum, c) => sum + c.count, 0);
      const dayRev = daySlice.reduce((sum, c) => sum + c.revenue, 0);
      if (dayCount > peakSalesDay.count) {
        peakSalesDay = { dayName: dayNames[d], count: dayCount, revenue: dayRev };
      }
    }

    let peakSalesHour = { hour: 12, label: '12:00 PM', count: 0, revenue: 0 };
    for (let h = 0; h < 24; h++) {
      const hourSlice = salesHourlyMatrix.filter((m) => m.hour === h);
      const hCount = hourSlice.reduce((sum, c) => sum + c.count, 0);
      const hRev = hourSlice.reduce((sum, c) => sum + c.revenue, 0);
      if (hCount > peakSalesHour.count) {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        peakSalesHour = { hour: h, label: `${displayH}:00 ${ampm}`, count: hCount, revenue: hRev };
      }
    }

    res.json({
      sales: {
        hourlyMatrix: salesHourlyMatrix,
        dailyCalendar,
        totalSales: sales.length,
        totalRevenue: totalSalesRevenue,
        maxHourlyCount: maxSalesHourlyCount,
        maxHourlyRevenue: maxSalesHourlyRev,
        peakDay: peakSalesDay,
        peakHour: peakSalesHour
      },
      userActivity: {
        hourlyMatrix: auditHourlyMatrix,
        dailyCalendar,
        totalActions: auditLogs.length,
        maxHourlyCount: maxAuditHourlyCount,
        topUsers: Object.values(userAuditCounts).sort((a, b) => b.count - a.count).slice(0, 5),
        topActions: Object.entries(actionCounts).map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count).slice(0, 5)
      }
    });
  } catch (err: any) {
    console.error('Heatmaps generation error:', err);
    res.status(500).json({ error: 'Failed to aggregate heatmap metrics' });
  }
});

// GET /api/reports/export/bikes - Export Motorcycle Stock Sheet
router.get('/export/bikes', requirePermission('EXPORT_EXCEL'), async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const bikes = await prisma.bike.findMany({
      where: { isDeleted: false },
      orderBy: [{ status: 'asc' }, { modelName: 'asc' }],
      include: {
        model: true,
        usedDetail: true
      }
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AutoSuite ERP';
    const worksheet = workbook.addWorksheet('Motorcycle Inventory');

    worksheet.columns = [
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Model Name', key: 'modelName', width: 22 },
      { header: 'Brand', key: 'brand', width: 16 },
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
        brand: b.model?.brand || 'Atlas Honda',
        chassisNumber: b.chassisNumber,
        engineNumber: b.engineNumber,
        color: b.color,
        modelYear: b.modelYear,
        status: b.status,
        marketTarget: b.marketTarget,
        dealerInvoicePrice: b.dealerInvoicePrice,
        retailPrice: b.retailPrice,
        registrationNumber: b.usedDetail?.registrationNumber || '-',
        conditionGrade: b.usedDetail?.conditionGrade || '-',
        prevOwnerName: b.usedDetail?.prevOwnerName || '-',
        prevOwnerPhone: b.usedDetail?.prevOwnerPhone || '-'
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
      orderBy: { partName: 'asc' },
      include: { categoryRef: true }
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
        category: p.categoryRef?.name || p.category || 'General',
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
