"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSettingsSchema = exports.createRoleSchema = exports.updateUserSchema = exports.createUserSchema = exports.createVendorPOSchema = exports.createPartOrderSchema = exports.updatePartSchema = exports.createPartSchema = exports.recordPaymentSchema = exports.createSaleSchema = exports.updateBikeSchema = exports.createBikeSchema = exports.updateBikeModelSchema = exports.createBikeModelSchema = exports.updateVendorSchema = exports.createVendorSchema = exports.updateCustomerSchema = exports.createCustomerSchema = exports.profileUpdateSchema = exports.changePasswordSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
// ================= AUTH SCHEMAS =================
exports.loginSchema = zod_1.z.object({
    username: zod_1.z.string().min(1, 'Username is required').trim(),
    password: zod_1.z.string().min(1, 'Password is required')
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, 'Current password is required'),
    newPassword: zod_1.z.string().min(6, 'New password must be at least 6 characters long')
});
exports.profileUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Name is required').trim().optional(),
    email: zod_1.z.string().email('Invalid email address').trim().optional()
});
// ================= CUSTOMER SCHEMAS (3NF/BCNF) =================
exports.createCustomerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Customer name is required').trim(),
    phone: zod_1.z.string().min(1, 'Phone number is required').trim(),
    cnic: zod_1.z.string().trim().optional().nullable(),
    address: zod_1.z.string().trim().optional().nullable(),
    customerType: zod_1.z.enum(['RETAIL', 'DEALER', 'WORKSHOP', 'MECHANIC']).default('RETAIL'),
    notes: zod_1.z.string().trim().optional().nullable()
});
exports.updateCustomerSchema = exports.createCustomerSchema.partial();
// ================= VENDOR SCHEMAS (3NF/BCNF) =================
exports.createVendorSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Vendor name is required').trim(),
    contactNumber: zod_1.z.string().trim().optional().nullable(),
    email: zod_1.z.string().email('Invalid email address').trim().optional().nullable(),
    address: zod_1.z.string().trim().optional().nullable(),
    notes: zod_1.z.string().trim().optional().nullable()
});
exports.updateVendorSchema = exports.createVendorSchema.partial();
// ================= BIKE MODEL SCHEMAS (3NF/BCNF) =================
exports.createBikeModelSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Model name is required').trim(),
    brand: zod_1.z.string().min(1, 'Brand is required').trim().default('Atlas Honda'), // Can be Honda, Unique, Superstar, Suzuki, Yamaha, etc.
    engineDisplacement: zod_1.z.string().trim().optional().nullable(),
    defaultRetailPrice: zod_1.z.coerce.number().min(0).default(0)
});
exports.updateBikeModelSchema = exports.createBikeModelSchema.partial();
// ================= BIKE SCHEMAS (3NF/BCNF) =================
exports.createBikeSchema = zod_1.z.object({
    type: zod_1.z.enum(['BRAND_NEW', 'USED']).default('BRAND_NEW'),
    modelId: zod_1.z.string().optional().nullable(),
    modelName: zod_1.z.string().min(1, 'Model name is required').trim(),
    brand: zod_1.z.string().trim().optional(), // Can be Honda, Unique, Superstar, Suzuki, Yamaha, or any custom brand
    engineNumber: zod_1.z.string().min(1, 'Engine number is required').trim(),
    chassisNumber: zod_1.z.string().min(1, 'Chassis number is required').trim(),
    color: zod_1.z.string().min(1, 'Color is required').trim(),
    modelYear: zod_1.z.coerce.number().int().min(1980).max(2050, 'Invalid model year'),
    batchNumber: zod_1.z.string().trim().optional().nullable(),
    dealerInvoicePrice: zod_1.z.coerce.number().min(0, 'Dealer price must be non-negative').default(0),
    retailPrice: zod_1.z.coerce.number().min(0, 'Retail price must be non-negative').default(0),
    status: zod_1.z.enum(['IN_STOCK', 'RESERVED', 'SOLD', 'PENDING_DELIVERY']).default('IN_STOCK'),
    marketTarget: zod_1.z.enum(['B2B', 'B2C', 'BOTH']).default('BOTH'),
    // Used bike pre-owned fields (normalized into UsedBikeDetail in 3NF)
    registrationNumber: zod_1.z.string().trim().optional().nullable(),
    prevOwnerName: zod_1.z.string().trim().optional().nullable(),
    prevOwnerPhone: zod_1.z.string().trim().optional().nullable(),
    prevOwnerCnic: zod_1.z.string().trim().optional().nullable(),
    conditionGrade: zod_1.z.enum(['GRADE_A', 'GRADE_B', 'GRADE_C']).optional().nullable(),
    purchaseCost: zod_1.z.coerce.number().min(0).optional().nullable(),
    refurbishmentCost: zod_1.z.coerce.number().min(0).optional().nullable(),
    expectedSellingPrice: zod_1.z.coerce.number().min(0).optional().nullable(),
    receivedDate: zod_1.z.string().trim().optional().nullable(),
    notes: zod_1.z.string().trim().optional().nullable()
});
exports.updateBikeSchema = exports.createBikeSchema.partial();
// ================= SALE SCHEMAS (3NF/BCNF) =================
exports.createSaleSchema = zod_1.z.object({
    bikeId: zod_1.z.string().min(1, 'Motorcycle selection is required'),
    saleType: zod_1.z.enum(['B2C', 'B2B']).default('B2C'),
    // Normalized customer reference OR inline customer data (auto-linked or created)
    customerId: zod_1.z.string().optional().nullable(),
    customerName: zod_1.z.string().min(1, 'Customer name is required').trim(),
    customerPhone: zod_1.z.string().min(1, 'Customer phone number is required').trim(),
    customerCnic: zod_1.z.string().trim().optional().nullable(),
    customerAddress: zod_1.z.string().trim().optional().nullable(),
    customerType: zod_1.z.enum(['RETAIL', 'DEALER', 'WORKSHOP', 'MECHANIC']).default('RETAIL'),
    salePrice: zod_1.z.coerce.number().positive('Sale price must be greater than zero'),
    discount: zod_1.z.coerce.number().min(0).default(0),
    tax: zod_1.z.coerce.number().min(0).default(0),
    paymentType: zod_1.z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_INSTALLMENT']).default('CASH'),
    initialDeposit: zod_1.z.coerce.number().min(0).default(0),
    paymentReference: zod_1.z.string().trim().optional().nullable(),
    installmentsCount: zod_1.z.coerce.number().int().min(0).max(60).default(0),
    installmentIntervalMonths: zod_1.z.coerce.number().int().min(1).max(12).default(1),
    firstInstallmentDueDate: zod_1.z.string().optional().nullable(),
    saleDate: zod_1.z.string().trim().optional().nullable(),
    notes: zod_1.z.string().trim().optional().nullable()
});
exports.recordPaymentSchema = zod_1.z.object({
    amount: zod_1.z.coerce.number().positive('Payment amount must be greater than zero'),
    paymentMethod: zod_1.z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE']).default('CASH'),
    paymentDate: zod_1.z.string().trim().optional().nullable(),
    installmentId: zod_1.z.string().optional().nullable(),
    referenceNumber: zod_1.z.string().trim().optional().nullable(),
    notes: zod_1.z.string().trim().optional().nullable()
});
// ================= PARTS & INVENTORY SCHEMAS =================
exports.createPartSchema = zod_1.z.object({
    partCode: zod_1.z.string().min(1, 'Part code is required').trim().toUpperCase(),
    partName: zod_1.z.string().min(1, 'Part name is required').trim(),
    compatibilityModel: zod_1.z.string().min(1, 'Model compatibility is required').trim(),
    wholesaleCost: zod_1.z.coerce.number().min(0, 'Wholesale cost must be non-negative'),
    b2bSellingPrice: zod_1.z.coerce.number().min(0, 'Selling price must be non-negative'),
    quantity: zod_1.z.coerce.number().int().min(0, 'Quantity cannot be negative').default(0),
    reorderThreshold: zod_1.z.coerce.number().int().min(0).default(5),
    categoryId: zod_1.z.string().optional().nullable(),
    category: zod_1.z.string().trim().optional().nullable(),
    location: zod_1.z.string().trim().optional().nullable()
});
exports.updatePartSchema = exports.createPartSchema.partial();
exports.createPartOrderSchema = zod_1.z.object({
    customerId: zod_1.z.string().optional().nullable(),
    customerName: zod_1.z.string().min(1, 'Customer name is required').trim(),
    contactNumber: zod_1.z.string().min(1, 'Contact number is required').trim(),
    customerType: zod_1.z.enum(['SECONDARY_WORKSHOP', 'MECHANIC', 'PARTNER_DEALER', 'RETAIL', 'DEALER', 'WORKSHOP']).default('SECONDARY_WORKSHOP'),
    notes: zod_1.z.string().trim().optional().nullable(),
    items: zod_1.z.array(zod_1.z.object({
        partId: zod_1.z.string().min(1, 'Part ID is required'),
        quantity: zod_1.z.coerce.number().int().positive('Quantity must be at least 1'),
        unitPrice: zod_1.z.coerce.number().min(0, 'Unit price must be non-negative')
    })).min(1, 'Order must contain at least one part item')
});
exports.createVendorPOSchema = zod_1.z.object({
    vendorId: zod_1.z.string().optional().nullable(),
    vendorName: zod_1.z.string().min(1, 'Vendor name is required').trim(),
    contactNumber: zod_1.z.string().trim().optional().nullable(),
    notes: zod_1.z.string().trim().optional().nullable(),
    items: zod_1.z.array(zod_1.z.object({
        partId: zod_1.z.string().min(1, 'Part ID is required'),
        quantityOrdered: zod_1.z.coerce.number().int().positive('Quantity must be at least 1'),
        unitCost: zod_1.z.coerce.number().min(0, 'Unit cost must be non-negative')
    })).min(1, 'Purchase order must contain at least one item')
});
// ================= USER & RBAC SCHEMAS =================
exports.createUserSchema = zod_1.z.object({
    username: zod_1.z.string().min(3, 'Username must be at least 3 characters').trim().toLowerCase(),
    email: zod_1.z.string().email('Invalid email address').trim().toLowerCase(),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
    name: zod_1.z.string().min(1, 'Full name is required').trim(),
    roleId: zod_1.z.string().min(1, 'Role assignment is required')
});
exports.updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).trim().optional(),
    email: zod_1.z.string().email().trim().toLowerCase().optional(),
    roleId: zod_1.z.string().min(1).optional(),
    active: zod_1.z.boolean().optional(),
    password: zod_1.z.string().min(6).optional().nullable()
});
exports.createRoleSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Role name is required').trim(),
    description: zod_1.z.string().trim().optional().nullable(),
    permissionIds: zod_1.z.array(zod_1.z.string()).default([])
});
// ================= SETTINGS SCHEMA =================
exports.updateSettingsSchema = zod_1.z.object({
    dealershipName: zod_1.z.string().min(1).optional(),
    dealershipBranch: zod_1.z.string().optional(),
    currency: zod_1.z.string().min(1).optional(),
    invoicePrefix: zod_1.z.string().min(1).optional(),
    defaultTaxRate: zod_1.z.coerce.number().min(0).max(100).optional(),
    lowStockThreshold: zod_1.z.coerce.number().int().min(0).optional(),
    timezone: zod_1.z.string().optional(),
    contactPhone: zod_1.z.string().optional(),
    ntnNumber: zod_1.z.string().optional(),
    logRetentionDays: zod_1.z.coerce.number().int().min(1).optional()
}).passthrough();
