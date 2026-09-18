import { z } from 'zod';

// ================= AUTH SCHEMAS =================
export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').trim(),
  password: z.string().min(1, 'Password is required')
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters long')
});

export const profileUpdateSchema = z.object({
  name: z.string().min(1, 'Name is required').trim().optional(),
  email: z.string().email('Invalid email address').trim().optional()
});

// ================= CUSTOMER SCHEMAS (3NF/BCNF) =================
export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').trim(),
  phone: z.string().min(1, 'Phone number is required').trim(),
  cnic: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  customerType: z.enum(['RETAIL', 'DEALER', 'WORKSHOP', 'MECHANIC']).default('RETAIL'),
  notes: z.string().trim().optional().nullable()
});

export const updateCustomerSchema = createCustomerSchema.partial();

// ================= VENDOR SCHEMAS (3NF/BCNF) =================
export const createVendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required').trim(),
  contactNumber: z.string().trim().optional().nullable(),
  email: z.string().email('Invalid email address').trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable()
});

export const updateVendorSchema = createVendorSchema.partial();

// ================= BIKE MODEL SCHEMAS (3NF/BCNF) =================
export const createBikeModelSchema = z.object({
  name: z.string().min(1, 'Model name is required').trim(),
  brand: z.string().min(1, 'Brand is required').trim().default('Atlas Honda'), // Can be Honda, Unique, Superstar, Suzuki, Yamaha, etc.
  engineDisplacement: z.string().trim().optional().nullable(),
  defaultRetailPrice: z.coerce.number().min(0).default(0)
});

export const updateBikeModelSchema = createBikeModelSchema.partial();

// ================= BIKE SCHEMAS (3NF/BCNF) =================
export const createBikeSchema = z.object({
  type: z.enum(['BRAND_NEW', 'USED']).default('BRAND_NEW'),
  modelId: z.string().optional().nullable(),
  modelName: z.string().min(1, 'Model name is required').trim(),
  brand: z.string().trim().optional(), // Can be Honda, Unique, Superstar, Suzuki, Yamaha, or any custom brand
  engineNumber: z.string().min(1, 'Engine number is required').trim(),
  chassisNumber: z.string().min(1, 'Chassis number is required').trim(),
  color: z.string().min(1, 'Color is required').trim(),
  modelYear: z.coerce.number().int().min(1980).max(2050, 'Invalid model year'),
  batchNumber: z.string().trim().optional().nullable(),
  dealerInvoicePrice: z.coerce.number().min(0, 'Dealer price must be non-negative').default(0),
  retailPrice: z.coerce.number().min(0, 'Retail price must be non-negative').default(0),
  status: z.enum(['IN_STOCK', 'RESERVED', 'SOLD', 'PENDING_DELIVERY']).default('IN_STOCK'),
  marketTarget: z.enum(['B2B', 'B2C', 'BOTH']).default('BOTH'),

  // Used bike pre-owned fields (normalized into UsedBikeDetail in 3NF)
  registrationNumber: z.string().trim().optional().nullable(),
  prevOwnerName: z.string().trim().optional().nullable(),
  prevOwnerPhone: z.string().trim().optional().nullable(),
  prevOwnerCnic: z.string().trim().optional().nullable(),
  conditionGrade: z.enum(['GRADE_A', 'GRADE_B', 'GRADE_C']).optional().nullable(),
  purchaseCost: z.coerce.number().min(0).optional().nullable(),
  refurbishmentCost: z.coerce.number().min(0).optional().nullable(),
  expectedSellingPrice: z.coerce.number().min(0).optional().nullable(),
  receivedDate: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable()
});

export const updateBikeSchema = createBikeSchema.partial();

// ================= SALE SCHEMAS (3NF/BCNF) =================
export const createSaleSchema = z.object({
  bikeId: z.string().min(1, 'Motorcycle selection is required'),
  saleType: z.enum(['B2C', 'B2B']).default('B2C'),
  
  // Normalized customer reference OR inline customer data (auto-linked or created)
  customerId: z.string().optional().nullable(),
  customerName: z.string().min(1, 'Customer name is required').trim(),
  customerPhone: z.string().min(1, 'Customer phone number is required').trim(),
  customerCnic: z.string().trim().optional().nullable(),
  customerAddress: z.string().trim().optional().nullable(),
  customerType: z.enum(['RETAIL', 'DEALER', 'WORKSHOP', 'MECHANIC']).default('RETAIL'),
  
  salePrice: z.coerce.number().positive('Sale price must be greater than zero'),
  discount: z.coerce.number().min(0).default(0),
  tax: z.coerce.number().min(0).default(0),
  paymentType: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT_INSTALLMENT']).default('CASH'),
  initialDeposit: z.coerce.number().min(0).default(0),
  paymentReference: z.string().trim().optional().nullable(),
  installmentsCount: z.coerce.number().int().min(0).max(60).default(0),
  installmentIntervalMonths: z.coerce.number().int().min(1).max(12).default(1),
  firstInstallmentDueDate: z.string().optional().nullable(),
  saleDate: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable()
});

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE']).default('CASH'),
  paymentDate: z.string().trim().optional().nullable(),
  installmentId: z.string().optional().nullable(),
  referenceNumber: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable()
});

// ================= PARTS & INVENTORY SCHEMAS =================
export const createPartSchema = z.object({
  partCode: z.string().min(1, 'Part code is required').trim().toUpperCase(),
  partName: z.string().min(1, 'Part name is required').trim(),
  compatibilityModel: z.string().min(1, 'Model compatibility is required').trim(),
  wholesaleCost: z.coerce.number().min(0, 'Wholesale cost must be non-negative'),
  b2bSellingPrice: z.coerce.number().min(0, 'Selling price must be non-negative'),
  quantity: z.coerce.number().int().min(0, 'Quantity cannot be negative').default(0),
  reorderThreshold: z.coerce.number().int().min(0).default(5),
  categoryId: z.string().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  location: z.string().trim().optional().nullable()
});

export const updatePartSchema = createPartSchema.partial();

export const createPartOrderSchema = z.object({
  customerId: z.string().optional().nullable(),
  customerName: z.string().min(1, 'Customer name is required').trim(),
  contactNumber: z.string().min(1, 'Contact number is required').trim(),
  customerType: z.enum(['SECONDARY_WORKSHOP', 'MECHANIC', 'PARTNER_DEALER', 'RETAIL', 'DEALER', 'WORKSHOP']).default('SECONDARY_WORKSHOP'),
  notes: z.string().trim().optional().nullable(),
  items: z.array(z.object({
    partId: z.string().min(1, 'Part ID is required'),
    quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
    unitPrice: z.coerce.number().min(0, 'Unit price must be non-negative')
  })).min(1, 'Order must contain at least one part item')
});

export const createVendorPOSchema = z.object({
  vendorId: z.string().optional().nullable(),
  vendorName: z.string().min(1, 'Vendor name is required').trim(),
  contactNumber: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  items: z.array(z.object({
    partId: z.string().min(1, 'Part ID is required'),
    quantityOrdered: z.coerce.number().int().positive('Quantity must be at least 1'),
    unitCost: z.coerce.number().min(0, 'Unit cost must be non-negative')
  })).min(1, 'Purchase order must contain at least one item')
});

// ================= USER & RBAC SCHEMAS =================
export const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').trim().toLowerCase(),
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(1, 'Full name is required').trim(),
  roleId: z.string().min(1, 'Role assignment is required')
});

export const updateUserSchema = z.object({
  name: z.string().min(1).trim().optional(),
  email: z.string().email().trim().toLowerCase().optional(),
  roleId: z.string().min(1).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional().nullable()
});

export const createRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required').trim(),
  description: z.string().trim().optional().nullable(),
  permissionIds: z.array(z.string()).default([])
});

// ================= SETTINGS SCHEMA =================
export const updateSettingsSchema = z.object({
  dealershipName: z.string().min(1).optional(),
  dealershipBranch: z.string().optional(),
  currency: z.string().min(1).optional(),
  invoicePrefix: z.string().min(1).optional(),
  defaultTaxRate: z.coerce.number().min(0).max(100).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  timezone: z.string().optional(),
  contactPhone: z.string().optional(),
  ntnNumber: z.string().optional(),
  logRetentionDays: z.coerce.number().int().min(1).optional()
}).passthrough();
