"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('Seeding AutoSuite ERP database...');
    // 1. Create Permissions
    const permissionsData = [
        { name: 'READ_SALES', module: 'SALES', description: 'View sales orders and transaction history' },
        { name: 'CREATE_SALE', module: 'SALES', description: 'Record new retail and B2B motorcycle sales' },
        { name: 'MANAGE_BIKES', module: 'INVENTORY', description: 'Create, update, and manage motorcycle inventory' },
        { name: 'MANAGE_PARTS', module: 'PARTS', description: 'Manage spare parts, B2B orders, and vendor POs' },
        { name: 'MANAGE_DOCS', module: 'DOCUMENTS', description: 'Generate motorcycle letters and track paperwork status' },
        { name: 'EXPORT_EXCEL', module: 'REPORTS', description: 'Export stock, sales, and credit ledger Excel sheets' },
        { name: 'VIEW_REPORTS', module: 'REPORTS', description: 'Access financial and sales analytics dashboards' },
        { name: 'MANAGE_USERS', module: 'USERS', description: 'Manage employee accounts and access status' },
        { name: 'MANAGE_ROLES', module: 'RBAC', description: 'Create and configure custom roles and permissions' }
    ];
    const permMap = new Map();
    for (const p of permissionsData) {
        const perm = await prisma.permission.upsert({
            where: { name: p.name },
            update: { module: p.module, description: p.description },
            create: p
        });
        permMap.set(p.name, perm.id);
    }
    // 2. Create Roles
    const adminRole = await prisma.role.upsert({
        where: { name: 'Admin' },
        update: {},
        create: {
            name: 'Admin',
            description: 'System Administrator with unrestricted access across all modules and audit logs',
            isSystem: true
        }
    });
    const managerRole = await prisma.role.upsert({
        where: { name: 'Manager' },
        update: {},
        create: {
            name: 'Manager',
            description: 'Dedicated access to B2B spare parts stock, supplier purchase orders, and parts sales logs',
            isSystem: true
        }
    });
    const operatorRole = await prisma.role.upsert({
        where: { name: 'Operator' },
        update: {},
        create: {
            name: 'Operator',
            description: 'Access restricted strictly to recording and viewing sales transactions',
            isSystem: true
        }
    });
    const salesRepRole = await prisma.role.upsert({
        where: { name: 'Sales Representative' },
        update: {},
        create: {
            name: 'Sales Representative',
            description: 'Dealership sales representative handling retail sales, inventory checks, and customer paperwork',
            isSystem: false
        }
    });
    // Assign Permissions to Roles
    // Admin gets all permissions
    for (const pId of permMap.values()) {
        await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: adminRole.id, permissionId: pId } },
            update: {},
            create: { roleId: adminRole.id, permissionId: pId }
        });
    }
    // Manager gets MANAGE_PARTS, READ_SALES, EXPORT_EXCEL, VIEW_REPORTS
    const managerPerms = ['MANAGE_PARTS', 'READ_SALES', 'EXPORT_EXCEL', 'VIEW_REPORTS'];
    for (const name of managerPerms) {
        const pId = permMap.get(name);
        await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: managerRole.id, permissionId: pId } },
            update: {},
            create: { roleId: managerRole.id, permissionId: pId }
        });
    }
    // Operator gets CREATE_SALE, READ_SALES
    const operatorPerms = ['CREATE_SALE', 'READ_SALES'];
    for (const name of operatorPerms) {
        const pId = permMap.get(name);
        await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: operatorRole.id, permissionId: pId } },
            update: {},
            create: { roleId: operatorRole.id, permissionId: pId }
        });
    }
    // Sales Rep gets CREATE_SALE, READ_SALES, MANAGE_DOCS, VIEW_REPORTS
    const salesPerms = ['CREATE_SALE', 'READ_SALES', 'MANAGE_DOCS', 'VIEW_REPORTS'];
    for (const name of salesPerms) {
        const pId = permMap.get(name);
        await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: salesRepRole.id, permissionId: pId } },
            update: {},
            create: { roleId: salesRepRole.id, permissionId: pId }
        });
    }
    // 3. Create Demo Users
    const defaultPassword = await bcryptjs_1.default.hash('admin123', 10);
    const managerPassword = await bcryptjs_1.default.hash('manager123', 10);
    const operatorPassword = await bcryptjs_1.default.hash('operator123', 10);
    const salesPassword = await bcryptjs_1.default.hash('sales123', 10);
    const adminUser = await prisma.user.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            email: 'admin@autosuite.com',
            name: 'Tariq Mehmood (General Manager)',
            passwordHash: defaultPassword,
            roleId: adminRole.id
        }
    });
    await prisma.user.upsert({
        where: { username: 'manager' },
        update: {},
        create: {
            username: 'manager',
            email: 'manager@autosuite.com',
            name: 'Kamran Ashraf (Parts & B2B Manager)',
            passwordHash: managerPassword,
            roleId: managerRole.id
        }
    });
    await prisma.user.upsert({
        where: { username: 'operator' },
        update: {},
        create: {
            username: 'operator',
            email: 'operator@autosuite.com',
            name: 'Bilal Farooq (Billing Operator)',
            passwordHash: operatorPassword,
            roleId: operatorRole.id
        }
    });
    await prisma.user.upsert({
        where: { username: 'sales' },
        update: {},
        create: {
            username: 'sales',
            email: 'sales@autosuite.com',
            name: 'Zeeshan Ali (Senior Sales Advisor)',
            passwordHash: salesPassword,
            roleId: salesRepRole.id
        }
    });
    // 4. Create Brand New Bikes
    const newBikes = [
        {
            type: 'BRAND_NEW',
            modelName: 'Honda CG125 Self/Special Edition',
            engineNumber: 'CG125E-9842104',
            chassisNumber: 'HND-CG125-2026-98421',
            color: 'Gloss Black & Gold',
            modelYear: 2026,
            batchNumber: 'BATCH-2026-Q1-01',
            dealerInvoicePrice: 268000,
            retailPrice: 282900,
            status: 'IN_STOCK',
            marketTarget: 'BOTH',
            notes: 'Brand new unit received from Honda Atlas Sheikhupura Plant.'
        },
        {
            type: 'BRAND_NEW',
            modelName: 'Honda CG125 Classic Kick',
            engineNumber: 'CG125E-9845501',
            chassisNumber: 'HND-CG125-2026-98455',
            color: 'Ruby Candy Red',
            modelYear: 2026,
            batchNumber: 'BATCH-2026-Q1-01',
            dealerInvoicePrice: 224000,
            retailPrice: 234900,
            status: 'IN_STOCK',
            marketTarget: 'B2C',
            notes: 'Pre-delivery inspection (PDI) complete and showroom ready.'
        },
        {
            type: 'BRAND_NEW',
            modelName: 'Honda CD70 Euro II',
            engineNumber: 'CD70E-4819012',
            chassisNumber: 'HND-CD70-2026-48190',
            color: 'Sporty Red',
            modelYear: 2026,
            batchNumber: 'BATCH-2026-Q1-02',
            dealerInvoicePrice: 149000,
            retailPrice: 157900,
            status: 'IN_STOCK',
            marketTarget: 'BOTH',
            notes: 'High demand daily commuter. 5 units in master crate.'
        },
        {
            type: 'BRAND_NEW',
            modelName: 'Honda CB150F Special Edition',
            engineNumber: 'CB150E-1082944',
            chassisNumber: 'HND-CB150-2026-10829',
            color: 'Matte Gunpowder Black',
            modelYear: 2026,
            batchNumber: 'BATCH-2026-Q1-03',
            dealerInvoicePrice: 465000,
            retailPrice: 497900,
            status: 'IN_STOCK',
            marketTarget: 'B2C',
            notes: 'Includes dual front disc brake, sporty alloy rims, and LED headlight.'
        },
        {
            type: 'BRAND_NEW',
            modelName: 'Yamaha YBR125G Trail',
            engineNumber: 'YBR125E-7712390',
            chassisNumber: 'YMH-YBR125-2026-77123',
            color: 'Armour Green Matte',
            modelYear: 2026,
            batchNumber: 'YMH-FEB-26',
            dealerInvoicePrice: 450000,
            retailPrice: 485000,
            status: 'IN_STOCK',
            marketTarget: 'B2C',
            notes: 'Off-road rugged fork boots and raised front mudguard.'
        },
        {
            type: 'BRAND_NEW',
            modelName: 'Suzuki GS150 Euro II',
            engineNumber: 'GS150E-3301948',
            chassisNumber: 'SZK-GS150-2026-33019',
            color: 'Silver Metallic',
            modelYear: 2026,
            batchNumber: 'SZK-JAN-26',
            dealerInvoicePrice: 362000,
            retailPrice: 382000,
            status: 'IN_STOCK',
            marketTarget: 'BOTH',
            notes: 'Touring package, electric start, 5-speed transmission.'
        }
    ];
    for (const b of newBikes) {
        await prisma.bike.upsert({
            where: { chassisNumber: b.chassisNumber },
            update: {},
            create: b
        });
    }
    // 5. Create Used Bikes
    const usedBikes = [
        {
            type: 'USED',
            modelName: 'Honda CG125 Self Edition (Certified Pre-Owned)',
            engineNumber: 'CG125E-8129031',
            chassisNumber: 'HND-CG125-2024-81290',
            color: 'Jet Black',
            modelYear: 2024,
            dealerInvoicePrice: 195000,
            retailPrice: 220000,
            status: 'IN_STOCK',
            marketTarget: 'BOTH',
            registrationNumber: 'LHR-24-8891',
            prevOwnerName: 'Muhammad Hamza',
            prevOwnerPhone: '0300-4567891',
            prevOwnerCnic: '35201-8192039-1',
            conditionGrade: 'GRADE_A',
            purchaseCost: 190000,
            refurbishmentCost: 5000,
            expectedSellingPrice: 220000,
            notes: 'Original smart card available, complete service record, brand new rear tire.'
        },
        {
            type: 'USED',
            modelName: 'Suzuki GD110S Euro II',
            engineNumber: 'GD110E-5541092',
            chassisNumber: 'SZK-GD110-2023-55410',
            color: 'Vibrant Red',
            modelYear: 2023,
            dealerInvoicePrice: 170000,
            retailPrice: 198000,
            status: 'IN_STOCK',
            marketTarget: 'B2C',
            registrationNumber: 'KHI-23-4412',
            prevOwnerName: 'Shahid Mehmood',
            prevOwnerPhone: '0321-9988771',
            prevOwnerCnic: '42101-5541298-3',
            conditionGrade: 'GRADE_B',
            purchaseCost: 165000,
            refurbishmentCost: 8000,
            expectedSellingPrice: 198000,
            notes: 'Minor scratch on silencer cover. Fully tuned with oil changed.'
        }
    ];
    for (const b of usedBikes) {
        await prisma.bike.upsert({
            where: { chassisNumber: b.chassisNumber },
            update: {},
            create: b
        });
    }
    // 6. Create Spare Parts Catalog
    const partsData = [
        {
            partCode: 'HND-CG-CYL-01',
            partName: 'Cylinder Block Kit 125cc (Piston & Rings)',
            compatibilityModel: 'Honda CG125 (2020-2026)',
            wholesaleCost: 5200,
            b2bSellingPrice: 6400,
            quantity: 14,
            reorderThreshold: 5,
            category: 'Engine & Transmission',
            location: 'Rack-A1'
        },
        {
            partCode: 'HND-CD-CARB-01',
            partName: 'Keihin Genuine Carburetor Assembly',
            compatibilityModel: 'Honda CD70 Euro II',
            wholesaleCost: 3100,
            b2bSellingPrice: 3850,
            quantity: 2, // Low stock on purpose to showcase alert!
            reorderThreshold: 5,
            category: 'Fuel System',
            location: 'Rack-B2'
        },
        {
            partCode: 'HND-CB-PAD-02',
            partName: 'Nissin Front Disc Brake Pad Set',
            compatibilityModel: 'Honda CB150F / CB125F',
            wholesaleCost: 1450,
            b2bSellingPrice: 1850,
            quantity: 22,
            reorderThreshold: 6,
            category: 'Brakes & Suspension',
            location: 'Rack-C1'
        },
        {
            partCode: 'HND-CG-CLU-03',
            partName: 'F.C.C Clutch Friction Plate Set (5-Plate)',
            compatibilityModel: 'Honda CG125 / CG Dream',
            wholesaleCost: 1250,
            b2bSellingPrice: 1600,
            quantity: 3, // Low stock demo!
            reorderThreshold: 8,
            category: 'Clutch & Gearbox',
            location: 'Rack-A3'
        },
        {
            partCode: 'HND-OIL-4T-20W50',
            partName: 'Honda Genuine 4T Engine Oil 20W-50 (0.7L)',
            compatibilityModel: 'Honda CD70 / CD Dream',
            wholesaleCost: 890,
            b2bSellingPrice: 1050,
            quantity: 48,
            reorderThreshold: 12,
            category: 'Lubricants & Fluids',
            location: 'Rack-L1'
        },
        {
            partCode: 'YMH-YBR-HL-LED',
            partName: 'Yamaha Halogen/LED Headlight Unit',
            compatibilityModel: 'Yamaha YBR125 / YBR125G',
            wholesaleCost: 4800,
            b2bSellingPrice: 5900,
            quantity: 7,
            reorderThreshold: 4,
            category: 'Electrical & Lighting',
            location: 'Rack-E2'
        }
    ];
    for (const p of partsData) {
        await prisma.part.upsert({
            where: { partCode: p.partCode },
            update: {},
            create: p
        });
    }
    // 7. Create Demo Sold Bike & Sales Order with Credit Installments
    const soldBike = await prisma.bike.create({
        data: {
            type: 'BRAND_NEW',
            modelName: 'Honda CG125 Classic Kick',
            engineNumber: 'CG125E-9102839',
            chassisNumber: 'HND-CG125-2026-91028',
            color: 'Ruby Candy Red',
            modelYear: 2026,
            dealerInvoicePrice: 224000,
            retailPrice: 234900,
            status: 'SOLD',
            marketTarget: 'BOTH',
            notes: 'Sold on 6-month installment plan.'
        }
    });
    const demoSale = await prisma.sale.create({
        data: {
            invoiceNumber: 'INV-2026-0001',
            saleType: 'B2C',
            bikeId: soldBike.id,
            customerName: 'Muhammad Rizwan',
            customerPhone: '0312-3456789',
            customerCnic: '35202-9182371-5',
            customerAddress: 'House 42-B, Model Town, Lahore',
            customerType: 'RETAIL',
            salePrice: 234900,
            discount: 4900,
            tax: 0,
            finalAmount: 230000,
            paymentType: 'CREDIT_INSTALLMENT',
            initialDeposit: 80000,
            remainingBalance: 150000,
            status: 'PENDING_PAYMENT',
            createdById: adminUser.id
        }
    });
    // Down payment transaction
    await prisma.paymentTransaction.create({
        data: {
            saleId: demoSale.id,
            amount: 80000,
            paymentMethod: 'CASH',
            referenceNumber: 'DEP-98124',
            notes: 'Down payment paid at time of booking'
        }
    });
    // Installment schedules (6 months x 25,000)
    for (let i = 1; i <= 6; i++) {
        const dueDate = new Date();
        dueDate.setMonth(dueDate.getMonth() + i);
        const isFirstPaid = i === 1;
        await prisma.installmentSchedule.create({
            data: {
                saleId: demoSale.id,
                installmentNumber: i,
                dueDate,
                amount: 25000,
                paidAmount: isFirstPaid ? 25000 : 0,
                status: isFirstPaid ? 'PAID' : 'PENDING',
                paidDate: isFirstPaid ? new Date() : null,
                notes: isFirstPaid ? 'Paid via Bank Transfer' : null
            }
        });
    }
    // Initialize Documents for the sold bike
    const docTypes = [
        { type: 'SALES_CERTIFICATE', status: 'READY_FOR_PICKUP', notes: 'Original certificate stamped and signed.' },
        { type: 'DELIVERY_LETTER_GATE_PASS', status: 'DELIVERED', notes: 'Gate pass signed by security guard at exit.' },
        { type: 'BOOK_TRANSFER_REQUEST', status: 'PROCESSING_EXCISE', notes: 'Application submitted to Lahore Excise Office.' },
        { type: 'ALLOTMENT_LETTER', status: 'DELIVERED', notes: 'Handed over to customer Muhammad Rizwan.' },
        { type: 'REGISTRATION_APPLICATION', status: 'PROCESSING_EXCISE', notes: 'Challan fee paid, awaiting computerized number plate.' }
    ];
    for (const doc of docTypes) {
        await prisma.motorcycleDocument.create({
            data: {
                saleId: demoSale.id,
                docType: doc.type,
                paperworkStatus: doc.status,
                statusNotes: doc.notes
            }
        });
    }
    // 8. Create a Demo B2B Spare Parts Order
    const carbPart = await prisma.part.findUnique({ where: { partCode: 'HND-CD-CARB-01' } });
    const padPart = await prisma.part.findUnique({ where: { partCode: 'HND-CB-PAD-02' } });
    if (carbPart && padPart) {
        await prisma.partOrder.create({
            data: {
                orderNumber: 'B2B-2026-0001',
                customerName: 'Al-Madina Autos & Repair Workshop',
                customerType: 'SECONDARY_WORKSHOP',
                contactNumber: '0300-8877665',
                totalAmount: 11400,
                status: 'COMPLETED',
                notes: 'Monthly workshop wholesale restocking.',
                items: {
                    create: [
                        {
                            partId: carbPart.id,
                            quantity: 2,
                            unitPrice: carbPart.b2bSellingPrice,
                            subtotal: carbPart.b2bSellingPrice * 2
                        },
                        {
                            partId: padPart.id,
                            quantity: 2,
                            unitPrice: padPart.b2bSellingPrice,
                            subtotal: padPart.b2bSellingPrice * 2
                        }
                    ]
                }
            }
        });
    }
    // 9. Create a Demo Vendor PO
    if (carbPart) {
        await prisma.vendorPO.create({
            data: {
                poNumber: 'VPO-2026-0001',
                vendorName: 'Atlas Honda Genuine Parts Logistics',
                contactNumber: '042-35129000',
                status: 'ORDERED',
                totalAmount: 31000,
                notes: 'Urgent restocking order for CD70 Carburetors and spark plugs.',
                orderedAt: new Date(),
                items: {
                    create: [
                        {
                            partId: carbPart.id,
                            quantityOrdered: 10,
                            unitCost: carbPart.wholesaleCost,
                            subtotal: carbPart.wholesaleCost * 10
                        }
                    ]
                }
            }
        });
    }
    console.log('Seeding completed successfully!');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
