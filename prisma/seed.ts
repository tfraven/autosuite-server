import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding AutoSuite ERP database (Normalized 3NF/BCNF)...');

  // 1. Create Permissions
  const permissionsData = [
    { name: 'READ_SALES', module: 'SALES', description: 'View sales orders, customer ledgers, and transaction history' },
    { name: 'CREATE_SALE', module: 'SALES', description: 'Record new retail and B2B motorcycle sales and customer profiles' },
    { name: 'MANAGE_BIKES', module: 'INVENTORY', description: 'Create, update, and manage motorcycle inventory and models' },
    { name: 'MANAGE_PARTS', module: 'PARTS', description: 'Manage spare parts, B2B orders, suppliers, and vendor POs' },
    { name: 'MANAGE_DOCS', module: 'DOCUMENTS', description: 'Generate motorcycle letters and track paperwork status' },
    { name: 'EXPORT_EXCEL', module: 'REPORTS', description: 'Export stock, sales, and credit ledger Excel sheets' },
    { name: 'VIEW_REPORTS', module: 'REPORTS', description: 'Access financial and sales analytics dashboards' },
    { name: 'MANAGE_USERS', module: 'USERS', description: 'Manage employee accounts and access status' },
    { name: 'MANAGE_ROLES', module: 'RBAC', description: 'Create and configure custom roles and permissions' }
  ];

  const permMap = new Map<string, string>();
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
  for (const pId of permMap.values()) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: pId } },
      update: {},
      create: { roleId: adminRole.id, permissionId: pId }
    });
  }

  const managerPerms = ['MANAGE_PARTS', 'READ_SALES', 'EXPORT_EXCEL', 'VIEW_REPORTS'];
  for (const name of managerPerms) {
    const pId = permMap.get(name);
    if (pId) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: managerRole.id, permissionId: pId } },
        update: {},
        create: { roleId: managerRole.id, permissionId: pId }
      });
    }
  }

  const operatorPerms = ['CREATE_SALE', 'READ_SALES'];
  for (const name of operatorPerms) {
    const pId = permMap.get(name);
    if (pId) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: operatorRole.id, permissionId: pId } },
        update: {},
        create: { roleId: operatorRole.id, permissionId: pId }
      });
    }
  }

  const salesPerms = ['CREATE_SALE', 'READ_SALES', 'MANAGE_DOCS', 'VIEW_REPORTS'];
  for (const name of salesPerms) {
    const pId = permMap.get(name);
    if (pId) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: salesRepRole.id, permissionId: pId } },
        update: {},
        create: { roleId: salesRepRole.id, permissionId: pId }
      });
    }
  }

  // 3. Create Demo Users
  const defaultPassword = await bcrypt.hash('admin123', 10);
  const managerPassword = await bcrypt.hash('manager123', 10);
  const operatorPassword = await bcrypt.hash('operator123', 10);
  const salesPassword = await bcrypt.hash('sales123', 10);

  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: defaultPassword },
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
    update: { passwordHash: managerPassword },
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
    update: { passwordHash: operatorPassword },
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
    update: { passwordHash: salesPassword },
    create: {
      username: 'sales',
      email: 'sales@autosuite.com',
      name: 'Zeeshan Ali (Senior Sales Advisor)',
      passwordHash: salesPassword,
      roleId: salesRepRole.id
    }
  });

  // 4. Create Normalized Bike Models (3NF/BCNF)
  // Supports all brands: Honda, Suzuki, Yamaha, Unique, Superstar, Road Prince, United, etc.
  const modelsData = [
    { name: 'Honda CG125 Self/Special Edition', brand: 'Atlas Honda', engineDisplacement: '125cc', defaultRetailPrice: 282900 },
    { name: 'Honda CG125 Classic Kick', brand: 'Atlas Honda', engineDisplacement: '125cc', defaultRetailPrice: 234900 },
    { name: 'Honda CD70 Euro II', brand: 'Atlas Honda', engineDisplacement: '70cc', defaultRetailPrice: 157900 },
    { name: 'Honda CB150F Special Edition', brand: 'Atlas Honda', engineDisplacement: '150cc', defaultRetailPrice: 497900 },
    { name: 'Yamaha YBR125G Trail', brand: 'Yamaha', engineDisplacement: '125cc', defaultRetailPrice: 485000 },
    { name: 'Suzuki GS150 Euro II', brand: 'Suzuki', engineDisplacement: '150cc', defaultRetailPrice: 382000 },
    { name: 'Suzuki GD110S Euro II', brand: 'Suzuki', engineDisplacement: '110cc', defaultRetailPrice: 198000 },
    { name: 'Unique UD70 Extreme', brand: 'Unique', engineDisplacement: '70cc', defaultRetailPrice: 115000 },
    { name: 'Superstar SS70 Standard', brand: 'Superstar', engineDisplacement: '70cc', defaultRetailPrice: 112000 },
    { name: 'Road Prince RP70 Passion', brand: 'Road Prince', engineDisplacement: '70cc', defaultRetailPrice: 109000 },
    { name: 'United US125 Euro II', brand: 'United', engineDisplacement: '125cc', defaultRetailPrice: 145000 }
  ];

  const modelMap = new Map<string, string>();
  for (const m of modelsData) {
    const model = await prisma.bikeModel.upsert({
      where: { name: m.name },
      update: { brand: m.brand, engineDisplacement: m.engineDisplacement, defaultRetailPrice: m.defaultRetailPrice },
      create: m
    });
    modelMap.set(m.name, model.id);
  }

  // 5. Create Brand New Bikes (Normalized)
  const newBikes = [
    {
      type: 'BRAND_NEW',
      modelName: 'Honda CG125 Self/Special Edition',
      modelId: modelMap.get('Honda CG125 Self/Special Edition'),
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
      modelId: modelMap.get('Honda CG125 Classic Kick'),
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
      modelId: modelMap.get('Honda CD70 Euro II'),
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
      modelId: modelMap.get('Honda CB150F Special Edition'),
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
      modelId: modelMap.get('Yamaha YBR125G Trail'),
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
      modelId: modelMap.get('Suzuki GS150 Euro II'),
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

  // 6. Create Used Bikes with Normalized UsedBikeDetail (3NF/BCNF)
  const usedBikes = [
    {
      bike: {
        type: 'USED',
        modelName: 'Honda CG125 Classic Kick',
        modelId: modelMap.get('Honda CG125 Classic Kick'),
        engineNumber: 'CG125E-8129031',
        chassisNumber: 'HND-CG125-2024-81290',
        color: 'Jet Black',
        modelYear: 2024,
        dealerInvoicePrice: 195000,
        retailPrice: 220000,
        status: 'IN_STOCK',
        marketTarget: 'BOTH',
        notes: 'Original smart card available, complete service record, brand new rear tire.'
      },
      usedDetail: {
        registrationNumber: 'LHR-24-8891',
        prevOwnerName: 'Muhammad Hamza',
        prevOwnerPhone: '0300-4567891',
        prevOwnerCnic: '35201-8192039-1',
        conditionGrade: 'GRADE_A',
        purchaseCost: 190000,
        refurbishmentCost: 5000,
        expectedSellingPrice: 220000
      }
    },
    {
      bike: {
        type: 'USED',
        modelName: 'Suzuki GD110S Euro II',
        modelId: modelMap.get('Suzuki GD110S Euro II'),
        engineNumber: 'GD110E-5541092',
        chassisNumber: 'SZK-GD110-2023-55410',
        color: 'Vibrant Red',
        modelYear: 2023,
        dealerInvoicePrice: 170000,
        retailPrice: 198000,
        status: 'IN_STOCK',
        marketTarget: 'B2C',
        notes: 'Minor scratch on silencer cover. Fully tuned with oil changed.'
      },
      usedDetail: {
        registrationNumber: 'KHI-23-4412',
        prevOwnerName: 'Shahid Mehmood',
        prevOwnerPhone: '0321-9988771',
        prevOwnerCnic: '42101-5541298-3',
        conditionGrade: 'GRADE_B',
        purchaseCost: 165000,
        refurbishmentCost: 8000,
        expectedSellingPrice: 198000
      }
    },
    {
      bike: {
        type: 'USED',
        modelName: 'Unique UD70 Extreme',
        modelId: modelMap.get('Unique UD70 Extreme'),
        engineNumber: 'UD70E-229104',
        chassisNumber: 'UNQ-UD70-2023-22910',
        color: 'Black & Red',
        modelYear: 2023,
        dealerInvoicePrice: 72000,
        retailPrice: 85000,
        status: 'IN_STOCK',
        marketTarget: 'B2C',
        notes: 'Economy pre-owned commuter. Low mileage.'
      },
      usedDetail: {
        registrationNumber: 'LHR-23-1102',
        prevOwnerName: 'Abdul Rehman',
        prevOwnerPhone: '0315-9922110',
        prevOwnerCnic: '35202-7711223-1',
        conditionGrade: 'GRADE_B',
        purchaseCost: 70000,
        refurbishmentCost: 4000,
        expectedSellingPrice: 85000
      }
    },
    {
      bike: {
        type: 'USED',
        modelName: 'Superstar SS70 Standard',
        modelId: modelMap.get('Superstar SS70 Standard'),
        engineNumber: 'SS70E-391820',
        chassisNumber: 'STR-SS70-2022-39182',
        color: 'Maroon Red',
        modelYear: 2022,
        dealerInvoicePrice: 65000,
        retailPrice: 78000,
        status: 'IN_STOCK',
        marketTarget: 'B2C',
        notes: 'Affordable pre-owned motorcycle. New carburetor and spark plug.'
      },
      usedDetail: {
        registrationNumber: 'MUL-22-6712',
        prevOwnerName: 'Noman Bashir',
        prevOwnerPhone: '0333-8877123',
        prevOwnerCnic: '36302-1199221-5',
        conditionGrade: 'GRADE_C',
        purchaseCost: 62000,
        refurbishmentCost: 3500,
        expectedSellingPrice: 78000
      }
    }
  ];

  for (const item of usedBikes) {
    const bike = await prisma.bike.upsert({
      where: { chassisNumber: item.bike.chassisNumber },
      update: {},
      create: item.bike
    });

    await prisma.usedBikeDetail.upsert({
      where: { bikeId: bike.id },
      update: item.usedDetail,
      create: {
        bikeId: bike.id,
        ...item.usedDetail
      }
    });
  }

  // 7. Create Part Categories & Parts Catalog (3NF/BCNF)
  const categoriesData = [
    { name: 'Engine & Transmission', description: 'Cylinder kits, pistons, rings, gears, valves' },
    { name: 'Fuel System', description: 'Carburetors, fuel valves, filters, jets' },
    { name: 'Brakes & Suspension', description: 'Brake pads, discs, shoes, shock absorbers' },
    { name: 'Clutch & Gearbox', description: 'Clutch plates, pressure plates, clutch cables' },
    { name: 'Lubricants & Fluids', description: 'OEM Engine oils, brake fluids, greases' },
    { name: 'Electrical & Lighting', description: 'Headlights, taillights, indicators, batteries, harnesses' }
  ];

  const catMap = new Map<string, string>();
  for (const c of categoriesData) {
    const cat = await prisma.partCategory.upsert({
      where: { name: c.name },
      update: { description: c.description },
      create: c
    });
    catMap.set(c.name, cat.id);
  }

  const partsData = [
    {
      partCode: 'HND-CG-CYL-01',
      partName: 'Cylinder Block Kit 125cc (Piston & Rings)',
      compatibilityModel: 'Honda CG125 (2020-2026)',
      wholesaleCost: 5200,
      b2bSellingPrice: 6400,
      quantity: 14,
      reorderThreshold: 5,
      categoryId: catMap.get('Engine & Transmission'),
      category: 'Engine & Transmission',
      location: 'Rack-A1'
    },
    {
      partCode: 'HND-CD-CARB-01',
      partName: 'Keihin Genuine Carburetor Assembly',
      compatibilityModel: 'Honda CD70 Euro II',
      wholesaleCost: 3100,
      b2bSellingPrice: 3850,
      quantity: 2,
      reorderThreshold: 5,
      categoryId: catMap.get('Fuel System'),
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
      categoryId: catMap.get('Brakes & Suspension'),
      category: 'Brakes & Suspension',
      location: 'Rack-C1'
    },
    {
      partCode: 'HND-CG-CLU-03',
      partName: 'F.C.C Clutch Friction Plate Set (5-Plate)',
      compatibilityModel: 'Honda CG125 / CG Dream',
      wholesaleCost: 1250,
      b2bSellingPrice: 1600,
      quantity: 3,
      reorderThreshold: 8,
      categoryId: catMap.get('Clutch & Gearbox'),
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
      categoryId: catMap.get('Lubricants & Fluids'),
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
      categoryId: catMap.get('Electrical & Lighting'),
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

  // 8. Create Normalized Customers (3NF/BCNF)
  const customer1 = await prisma.customer.upsert({
    where: { phone: '0312-3456789' },
    update: {},
    create: {
      name: 'Muhammad Rizwan',
      phone: '0312-3456789',
      cnic: '35202-9182371-5',
      address: 'House 42-B, Model Town, Lahore',
      customerType: 'RETAIL'
    }
  });

  const customer2 = await prisma.customer.upsert({
    where: { phone: '0300-8877665' },
    update: {},
    create: {
      name: 'Al-Madina Autos & Repair Workshop',
      phone: '0300-8877665',
      cnic: '35201-1122334-7',
      address: 'Shop 14, Auto Market, Badami Bagh, Lahore',
      customerType: 'WORKSHOP'
    }
  });

  // 9. Create Normalized Vendors (3NF/BCNF)
  const vendor1 = await prisma.vendor.upsert({
    where: { name: 'Atlas Honda Genuine Parts Logistics' },
    update: {},
    create: {
      name: 'Atlas Honda Genuine Parts Logistics',
      contactNumber: '042-35129000',
      email: 'parts-orders@atlashonda.com.pk',
      address: '1-McLeod Road, Lahore'
    }
  });

  // 10. Create Sold Bike & Sales Order with Credit Installments
  let soldBike = await prisma.bike.findFirst({
    where: {
      OR: [
        { chassisNumber: 'HND-CG125-2026-91028' },
        { engineNumber: 'CG125E-9102839' }
      ]
    }
  });

  if (!soldBike) {
    soldBike = await prisma.bike.create({
      data: {
        type: 'BRAND_NEW',
        modelName: 'Honda CG125 Classic Kick',
        modelId: modelMap.get('Honda CG125 Classic Kick'),
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
  }

  const demoSale = await prisma.sale.upsert({
    where: { invoiceNumber: 'INV-2026-0001' },
    update: {},
    create: {
      invoiceNumber: 'INV-2026-0001',
      saleType: 'B2C',
      bikeId: soldBike.id,
      customerId: customer1.id,
      customerName: customer1.name,
      customerPhone: customer1.phone,
      customerCnic: customer1.cnic,
      customerAddress: customer1.address,
      customerType: customer1.customerType,
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

  // Check if payments exist
  const existingPayments = await prisma.paymentTransaction.count({ where: { saleId: demoSale.id } });
  if (existingPayments === 0) {
    await prisma.paymentTransaction.create({
      data: {
        saleId: demoSale.id,
        amount: 80000,
        paymentMethod: 'CASH',
        referenceNumber: 'DEP-98124',
        notes: 'Down payment paid at time of booking'
      }
    });
  }

  // Installment schedules (6 months x 25,000)
  const existingInst = await prisma.installmentSchedule.count({ where: { saleId: demoSale.id } });
  if (existingInst === 0) {
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
  }

  // Initialize Documents for the sold bike
  const existingDocs = await prisma.motorcycleDocument.count({ where: { saleId: demoSale.id } });
  if (existingDocs === 0) {
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
  }

  // 11. Create a Demo B2B Spare Parts Order linked to Customer
  const carbPart = await prisma.part.findUnique({ where: { partCode: 'HND-CD-CARB-01' } });
  const padPart = await prisma.part.findUnique({ where: { partCode: 'HND-CB-PAD-02' } });

  if (carbPart && padPart) {
    await prisma.partOrder.upsert({
      where: { orderNumber: 'B2B-2026-0001' },
      update: {},
      create: {
        orderNumber: 'B2B-2026-0001',
        customerId: customer2.id,
        customerName: customer2.name,
        customerType: 'SECONDARY_WORKSHOP',
        contactNumber: customer2.phone,
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

  // 12. Create a Demo Vendor PO linked to Vendor
  if (carbPart) {
    await prisma.vendorPO.upsert({
      where: { poNumber: 'VPO-2026-0001' },
      update: {},
      create: {
        poNumber: 'VPO-2026-0001',
        vendorId: vendor1.id,
        vendorName: vendor1.name,
        contactNumber: vendor1.contactNumber,
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

  console.log('Seeding completed successfully with 3NF/BCNF normalization!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
