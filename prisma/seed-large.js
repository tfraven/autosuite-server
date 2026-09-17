const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Helper random generators
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Pakistani Names Pool
const firstNames = [
  'Muhammad', 'Ahmed', 'Ali', 'Hamza', 'Usman', 'Bilal', 'Tariq', 'Kamran', 'Zeeshan',
  'Farhan', 'Imran', 'Rashid', 'Kashif', 'Waqas', 'Babar', 'Shahid', 'Naveed', 'Asif',
  'Junaid', 'Sajid', 'Adnan', 'Faisal', 'Rizwan', 'Shoaib', 'Haris', 'Umair', 'Arslan',
  'Hassan', 'Hussain', 'Zubair', 'Noman', 'Saqib', 'Faizan', 'Adeel', 'Tanveer', 'Irfan'
];

const lastNames = [
  'Khan', 'Ahmed', 'Ali', 'Malik', 'Chaudhry', 'Bhatti', 'Butt', 'Sheikh', 'Raza',
  'Siddiqui', 'Farooq', 'Mehmood', 'Ashraf', 'Iqbal', 'Akhtar', 'Javed', 'Mughal',
  'Qureshi', 'Ansari', 'Mirza', 'Rehman', 'Shah', 'Niazi', 'Bajwa', 'Cheema', 'Tarar',
  'Gondal', 'Warraich', 'Virk', 'Gill', 'Sandhu', 'Dar', 'Abbasi', 'Awan', 'Hashmi'
];

const cities = [
  { name: 'Lahore', areas: ['Model Town', 'Gulberg III', 'DHA Phase 5', 'Johar Town', 'Faisal Town', 'Shadman', 'Allama Iqbal Town', 'Cantt', 'Wapda Town', 'Cavalry Ground'] },
  { name: 'Karachi', areas: ['Gulshan-e-Iqbal', 'Clifton Block 4', 'PECHS Block 2', 'North Nazimabad', 'Defence Phase 6', 'Malir Cantt', 'Federal B Area', 'Korangi'] },
  { name: 'Rawalpindi', areas: ['Satellite Town', 'Saddar', 'Bahria Town Phase 4', 'Westridge', 'Chaklala Scheme III', 'Gulraiz Housing'] },
  { name: 'Islamabad', areas: ['Sector F-10/2', 'Sector G-11/3', 'Sector I-8/4', 'Sector F-7/1', 'Sector E-11', 'Sector H-13'] },
  { name: 'Faisalabad', areas: ['Madina Town', 'D-Ground Peoples Colony', 'Gulberg', 'Jinnah Colony', 'Civil Lines', 'Samanabad'] },
  { name: 'Multan', areas: ['Gulgasht Colony', 'Cantt', 'Shah Rukn-e-Alam Colony', 'New Multan', 'Bosan Road'] },
  { name: 'Gujranwala', areas: ['Model Town', 'Satellite Town', 'DC Colony', 'Wapda Town', 'Cantt'] },
  { name: 'Sialkot', areas: ['Cantt', 'Model Town', 'Ugoki', 'Paris Road', 'Khadim Ali Road'] }
];

function generateCustomer() {
  const fName = randomItem(firstNames);
  const lName = randomItem(lastNames);
  const name = `${fName} ${lName}`;
  const cityObj = randomItem(cities);
  const area = randomItem(cityObj.areas);
  const houseNum = randomNumber(1, 150);
  const streetNum = randomNumber(1, 25);
  const address = `House #${houseNum}, Street #${streetNum}, ${area}, ${cityObj.name}`;

  // Pakistani CNIC format (e.g. 35201-1234567-1)
  const cnicPrefix = randomItem(['35201', '35202', '42101', '42201', '37405', '61101', '33100', '36302']);
  const cnicMiddle = String(randomNumber(1000000, 9999999));
  const cnicSuffix = String(randomNumber(1, 9));
  const cnic = `${cnicPrefix}-${cnicMiddle}-${cnicSuffix}`;

  // Pakistani Mobile Number (e.g. 0300-1234567)
  const code = randomItem(['0300', '0301', '0302', '0321', '0322', '0333', '0334', '0345', '0346']);
  const phone = `${code}-${randomNumber(1000000, 9999999)}`;

  return { name, address, cnic, phone, city: cityObj.name };
}

// Bike catalog models
const bikeModels = [
  { brand: 'Honda', modelName: 'Honda CD70 Euro II', type: 'BRAND_NEW', invoice: 149000, retail: 157900, colors: ['Sporty Red', 'Gloss Black', 'Olympic Blue'] },
  { brand: 'Honda', modelName: 'Honda CD70 Dream', type: 'BRAND_NEW', invoice: 158000, retail: 168900, colors: ['Ruby Red', 'Carbon Black'] },
  { brand: 'Honda', modelName: 'Honda CG125 Classic Kick', type: 'BRAND_NEW', invoice: 224000, retail: 234900, colors: ['Ruby Candy Red', 'Gloss Black'] },
  { brand: 'Honda', modelName: 'Honda CG125 Self/Special Edition', type: 'BRAND_NEW', invoice: 268000, retail: 282900, colors: ['Gloss Black & Gold', 'Matte Olive Green'] },
  { brand: 'Honda', modelName: 'Honda CB125F Euro II', type: 'BRAND_NEW', invoice: 370000, retail: 390900, colors: ['Vibrant Red', 'Metallic Blue', 'Jet Black'] },
  { brand: 'Honda', modelName: 'Honda CB150F Special Edition', type: 'BRAND_NEW', invoice: 465000, retail: 497900, colors: ['Matte Gunpowder Black', 'Pearl Moonstone Silver'] },
  { brand: 'Suzuki', modelName: 'Suzuki GD110S Euro II', type: 'BRAND_NEW', invoice: 335000, retail: 352000, colors: ['Metallic Grey', 'Sporty Red', 'Cosmic Black'] },
  { brand: 'Suzuki', modelName: 'Suzuki GS150 Euro II', type: 'BRAND_NEW', invoice: 362000, retail: 382000, colors: ['Silver Metallic', 'Midnight Black'] },
  { brand: 'Suzuki', modelName: 'Suzuki GR150 Sports', type: 'BRAND_NEW', invoice: 510000, retail: 547000, colors: ['Starlight Blue', 'Gloss Red', 'Ebony Black'] },
  { brand: 'Yamaha', modelName: 'Yamaha YB125Z Euro II', type: 'BRAND_NEW', invoice: 380000, retail: 405000, colors: ['Vivid Red', 'Metallic Black'] },
  { brand: 'Yamaha', modelName: 'Yamaha YB125Z-DX Luxury', type: 'BRAND_NEW', invoice: 415000, retail: 440500, colors: ['Imperial Red', 'Phantom Black', 'Noble Blue'] },
  { brand: 'Yamaha', modelName: 'Yamaha YBR125 Sport', type: 'BRAND_NEW', invoice: 435000, retail: 466000, colors: ['Racing Blue', 'Vivid Cocktail Red', 'Metallic Black'] },
  { brand: 'Yamaha', modelName: 'Yamaha YBR125G Trail Crossover', type: 'BRAND_NEW', invoice: 450000, retail: 485000, colors: ['Armour Green Matte', 'Night Fluo Yellow', 'Vivid Black'] }
];

const sparePartsCatalog = [
  { code: 'HND-CD-CYL-01', name: 'Honda Genuine Cylinder Block Kit 70cc', model: 'Honda CD70 / Dream', cat: 'Engine & Transmission', cost: 4200, b2b: 5100, loc: 'Rack-A1' },
  { code: 'HND-CG-CYL-02', name: 'Cylinder Block & Piston Kit 125cc', model: 'Honda CG125', cat: 'Engine & Transmission', cost: 5500, b2b: 6700, loc: 'Rack-A2' },
  { code: 'HND-CB-CYL-03', name: 'Cylinder Barrel Kit 150cc', model: 'Honda CB150F', cat: 'Engine & Transmission', cost: 9500, b2b: 11800, loc: 'Rack-A3' },
  { code: 'HND-CD-CARB-01', name: 'Keihin Genuine Carburetor Unit', model: 'Honda CD70', cat: 'Fuel System', cost: 3200, b2b: 3950, loc: 'Rack-B1' },
  { code: 'HND-CG-CARB-02', name: 'CG125 Euro II Carburetor Complete', model: 'Honda CG125', cat: 'Fuel System', cost: 4100, b2b: 4950, loc: 'Rack-B2' },
  { code: 'HND-CB-PAD-01', name: 'Nissin Front Disc Brake Pad Set', model: 'Honda CB150F / CB125F', cat: 'Brakes & Suspension', cost: 1450, b2b: 1850, loc: 'Rack-C1' },
  { code: 'HND-CG-SHOE-01', name: 'OEM Rear Brake Shoe Pair', model: 'Honda CG125 / CD70', cat: 'Brakes & Suspension', cost: 650, b2b: 850, loc: 'Rack-C2' },
  { code: 'HND-CG-CLU-01', name: 'F.C.C Clutch Friction Plate Set (5-Plate)', model: 'Honda CG125', cat: 'Clutch & Gearbox', cost: 1350, b2b: 1750, loc: 'Rack-D1' },
  { code: 'HND-CD-CLU-02', name: 'Genuine Clutch Plate Assembly (4-Plate)', model: 'Honda CD70', cat: 'Clutch & Gearbox', cost: 980, b2b: 1250, loc: 'Rack-D2' },
  { code: 'HND-OIL-20W50-07', name: 'Atlas Honda 4T Genuine Engine Oil 20W-50 (0.7L)', model: 'Honda CD70', cat: 'Lubricants & Fluids', cost: 890, b2b: 1050, loc: 'Bay-L1' },
  { code: 'HND-OIL-20W50-10', name: 'Atlas Honda 4T Genuine Engine Oil 20W-50 (1.0L)', model: 'Honda CG125', cat: 'Lubricants & Fluids', cost: 1150, b2b: 1350, loc: 'Bay-L2' },
  { code: 'HND-OIL-10W40-10', name: 'Atlas Honda Synthetic 10W-40 SL (1.0L)', model: 'Honda CB150F', cat: 'Lubricants & Fluids', cost: 1650, b2b: 1950, loc: 'Bay-L3' },
  { code: 'SZK-GS-SPRK-01', name: 'NGK Platinum Spark Plug DR8EA', model: 'Suzuki GS150 / GR150', cat: 'Electrical & Ignition', cost: 750, b2b: 950, loc: 'Rack-E1' },
  { code: 'HND-CD-SPRK-01', name: 'Denso Spark Plug U20FS-U', model: 'Honda CD70', cat: 'Electrical & Ignition', cost: 380, b2b: 490, loc: 'Rack-E2' },
  { code: 'YMH-YBR-HL-01', name: 'Yamaha Front Headlamp Assembly Glass Unit', model: 'Yamaha YBR125 / YBR125G', cat: 'Electrical & Lighting', cost: 5200, b2b: 6400, loc: 'Rack-F1' },
  { code: 'YMH-YBR-FLT-01', name: 'High Flow Air Filter Element', model: 'Yamaha YBR125G', cat: 'Fuel System', cost: 1100, b2b: 1400, loc: 'Rack-F2' },
  { code: 'SZK-GS-CHN-01', name: 'KMC Heavy Duty Drive Chain & Sprocket Set 428H', model: 'Suzuki GS150', cat: 'Chains & Sprockets', cost: 3400, b2b: 4200, loc: 'Rack-G1' },
  { code: 'HND-CG-CHN-01', name: 'Rolon Drive Chain Set 428-108L', model: 'Honda CG125', cat: 'Chains & Sprockets', cost: 2300, b2b: 2900, loc: 'Rack-G2' },
  { code: 'AGS-BAT-12V5A', name: 'AGS Maintenance Free Motorcycle Battery 12V 5Ah', model: 'Universal Self Start', cat: 'Electrical & Lighting', cost: 4200, b2b: 4900, loc: 'Rack-H1' },
  { code: 'SERV-TYR-R-17', name: 'Service Cruiser Tubeless Rear Tire 90/90-17', model: 'CB150F / YBR125', cat: 'Tires & Wheels', cost: 6800, b2b: 7900, loc: 'Tire-Bay-1' },
  { code: 'PAN-TYR-R-18', name: 'Panther Trail Master Off-Road Tire 3.00-18', model: 'CG125 / GS150 / YBR-G', cat: 'Tires & Wheels', cost: 5900, b2b: 6850, loc: 'Tire-Bay-2' }
];

async function seedLarge() {
  console.log('=== AutoSuite Comprehensive 5,000+ Records Seeding Engine ===\n');
  const startTime = Date.now();

  // 1. Roles & Permissions setup
  console.log('1. Ensuring RBAC Roles & Permissions...');
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

  // Role permissions
  for (const pId of permMap.values()) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: pId } },
      update: {},
      create: { roleId: adminRole.id, permissionId: pId }
    });
  }

  // 2. Staff Users
  console.log('2. Ensuring Staff User Accounts...');
  const passwordHash = await bcrypt.hash('admin123', 10);
  const managerHash = await bcrypt.hash('manager123', 10);
  const operatorHash = await bcrypt.hash('operator123', 10);
  const salesHash = await bcrypt.hash('sales123', 10);

  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash, isDeleted: false, active: true },
    create: {
      username: 'admin',
      email: 'admin@autosuite.com',
      name: 'Tariq Mehmood (General Manager)',
      passwordHash,
      roleId: adminRole.id
    }
  });

  const managerUser = await prisma.user.upsert({
    where: { username: 'manager' },
    update: { passwordHash: managerHash, isDeleted: false, active: true },
    create: {
      username: 'manager',
      email: 'manager@autosuite.com',
      name: 'Kamran Ashraf (Parts & B2B Manager)',
      passwordHash: managerHash,
      roleId: managerRole.id
    }
  });

  const operatorUser = await prisma.user.upsert({
    where: { username: 'operator' },
    update: { passwordHash: operatorHash, isDeleted: false, active: true },
    create: {
      username: 'operator',
      email: 'operator@autosuite.com',
      name: 'Bilal Farooq (Billing Operator)',
      passwordHash: operatorHash,
      roleId: operatorRole.id
    }
  });

  const salesUser = await prisma.user.upsert({
    where: { username: 'sales' },
    update: { passwordHash: salesHash, isDeleted: false, active: true },
    create: {
      username: 'sales',
      email: 'sales@autosuite.com',
      name: 'Zeeshan Ali (Senior Sales Advisor)',
      passwordHash: salesHash,
      roleId: salesRepRole.id
    }
  });

  // 3. Populate Platform Settings
  console.log('3. Populating Dealership Platform Settings...');
  const settingsData = [
    { key: 'dealershipName', value: 'Falcon Honda Motors' },
    { key: 'dealershipBranch', value: 'Main Campus Showroom, Lahore' },
    { key: 'currency', value: 'PKR' },
    { key: 'invoicePrefix', value: 'INV-' },
    { key: 'defaultTaxRate', value: '0' },
    { key: 'lowStockThreshold', value: '5' },
    { key: 'timezone', value: 'Asia/Karachi' },
    { key: 'contactPhone', value: '+92 42 35990000' },
    { key: 'ntnNumber', value: '4829103-8' },
    { key: 'logRetentionDays', value: '90' }
  ];

  for (const s of settingsData) {
    await prisma.platformSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: s
    });
  }

  // 4. Generate Spare Parts Catalog (250 parts)
  console.log('4. Generating 250 Spare Parts Records...');
  const currentPartsCount = await prisma.part.count();
  if (currentPartsCount < 250) {
    const partsToCreate = [];
    let pSeq = currentPartsCount + 1;

    // Add initial known parts
    for (const p of sparePartsCatalog) {
      const existing = await prisma.part.findUnique({ where: { partCode: p.code } });
      if (!existing) {
        partsToCreate.push({
          partCode: p.code,
          partName: p.name,
          compatibilityModel: p.model,
          wholesaleCost: p.cost,
          b2bSellingPrice: p.b2b,
          quantity: randomNumber(2, 60),
          reorderThreshold: randomNumber(5, 12),
          category: p.cat,
          location: p.loc
        });
      }
    }

    // Fill up to 250 parts
    const partCategories = ['Engine & Transmission', 'Fuel System', 'Brakes & Suspension', 'Clutch & Gearbox', 'Lubricants & Fluids', 'Electrical & Ignition', 'Electrical & Lighting', 'Chains & Sprockets', 'Tires & Wheels', 'Body & Frame', 'Exhaust & Silencer'];
    const partTypes = ['Gasket Set', 'Valve Set', 'Clutch Cable', 'Throttle Cable', 'Front Brake Cable', 'Speedometer Cable', 'Main Stand Assembly', 'Kick Starter Lever', 'Footrest Rubber Pair', 'Rear Shock Absorber Pair', 'Front Fork Oil Seal', 'Wheel Rim 18-inch', 'Wheel Spokes Set (72-pcs)', 'Fuel Tank Cap with Lock', 'Handle Grip Rubber Set', 'Side Cover Set L/R', 'Mudguard Front Metal', 'Silencer Muffler Shield Chrome', 'Ignition Switch Assembly', 'CDI Unit High Performance', 'Horn 12V Loud', 'Indicator Lamp Complete Pair'];

    while (partsToCreate.length + currentPartsCount < 250) {
      const pType = randomItem(partTypes);
      const bModel = randomItem(bikeModels);
      const cat = randomItem(partCategories);
      const code = `${bModel.brand.substring(0, 3).toUpperCase()}-P${String(pSeq).padStart(4, '0')}`;
      const cost = randomNumber(350, 8500);
      const b2b = Math.round(cost * (1 + (randomNumber(15, 35) / 100)));

      partsToCreate.push({
        partCode: code,
        partName: `${bModel.brand} Genuine ${pType}`,
        compatibilityModel: bModel.modelName,
        wholesaleCost: cost,
        b2bSellingPrice: b2b,
        quantity: randomNumber(1, 80),
        reorderThreshold: randomNumber(4, 10),
        category: cat,
        location: `Bin-${randomItem(['A', 'B', 'C', 'D', 'E', 'F'])}${randomNumber(1, 9)}`
      });
      pSeq++;
    }

    if (partsToCreate.length > 0) {
      await prisma.part.createMany({ data: partsToCreate, skipDuplicates: true });
    }
  }
  const totalParts = await prisma.part.count();
  console.log(`   ✓ Spare parts in catalog: ${totalParts}`);

  // 5. Generate 1,200 Motorcycles (Brand New and Certified Used)
  console.log('\n5. Generating 1,200 Motorcycle Records (New & Pre-Owned)...');
  const currentBikesCount = await prisma.bike.count();
  const targetBikes = 1200;

  if (currentBikesCount < targetBikes) {
    const bikesNeeded = targetBikes - currentBikesCount;
    const bikesBatch = [];
    const baseSeq = currentBikesCount + 1000;

    for (let i = 0; i < bikesNeeded; i++) {
      const seq = baseSeq + i;
      const isUsed = Math.random() < 0.32; // ~32% used bikes
      const template = randomItem(bikeModels);
      const modelYear = isUsed ? randomNumber(2021, 2025) : randomNumber(2025, 2026);
      const color = randomItem(template.colors);

      const chassisNumber = `${template.brand.substring(0, 3).toUpperCase()}-${template.modelName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase()}-${modelYear}-${String(seq).padStart(5, '0')}`;
      const engineNumber = `${template.modelName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 5).toUpperCase()}E-${String(seq + 5000000).padStart(7, '0')}`;

      if (isUsed) {
        const cust = generateCustomer();
        const purchaseCost = Math.round(template.retail * (0.60 + Math.random() * 0.20));
        const refCost = randomNumber(3000, 15000);
        const expectedPrice = Math.round((purchaseCost + refCost) * 1.15);
        const regCity = randomItem(['LHR', 'KHI', 'RWP', 'ISL', 'FSD', 'MUL', 'GUJ', 'SLK']);
        const regYear = String(modelYear).substring(2);
        const regNum = `${regCity}-${regYear}-${randomNumber(1000, 9999)}`;

        bikesBatch.push({
          type: 'USED',
          modelName: `${template.modelName} (Pre-Owned Certified)`,
          engineNumber,
          chassisNumber,
          color,
          modelYear,
          dealerInvoicePrice: purchaseCost + refCost,
          retailPrice: expectedPrice,
          status: 'IN_STOCK', // will update sold ones in next step
          marketTarget: Math.random() < 0.7 ? 'B2C' : 'BOTH',
          registrationNumber: regNum,
          prevOwnerName: cust.name,
          prevOwnerPhone: cust.phone,
          prevOwnerCnic: cust.cnic,
          conditionGrade: randomItem(['GRADE_A', 'GRADE_B', 'GRADE_C']),
          purchaseCost,
          refurbishmentCost: refCost,
          expectedSellingPrice: expectedPrice,
          notes: `Certified Pre-Owned unit. PDI inspection complete, smart card and original file verified.`
        });
      } else {
        const quarter = randomItem(['Q1', 'Q2', 'Q3', 'Q4']);
        const batchNum = `BATCH-${modelYear}-${quarter}-${String(randomNumber(1, 20)).padStart(2, '0')}`;

        bikesBatch.push({
          type: 'BRAND_NEW',
          modelName: template.modelName,
          engineNumber,
          chassisNumber,
          color,
          modelYear,
          batchNumber: batchNum,
          dealerInvoicePrice: template.invoice,
          retailPrice: template.retail,
          status: 'IN_STOCK', // will update sold ones in next step
          marketTarget: Math.random() < 0.75 ? 'BOTH' : 'B2C',
          notes: `Brand new master crate unit delivered from plant assembly.`
        });
      }
    }

    // Insert in chunks of 400
    for (let c = 0; c < bikesBatch.length; c += 400) {
      const chunk = bikesBatch.slice(c, c + 400);
      await prisma.bike.createMany({ data: chunk, skipDuplicates: true });
    }
  }

  const totalBikes = await prisma.bike.count();
  console.log(`   ✓ Total motorcycles registered: ${totalBikes}`);

  // 6. Generate 900 Sales Invoices with Installments & Payments
  console.log('\n6. Generating 900 Sales Invoices, Installments, Payments & Documents...');
  const currentSalesCount = await prisma.sale.count();
  const targetSales = 900;

  if (currentSalesCount < targetSales) {
    const salesNeeded = targetSales - currentSalesCount;
    // Get in-stock bikes to sell
    const availableBikes = await prisma.bike.findMany({
      where: { isDeleted: false, status: 'IN_STOCK' },
      take: salesNeeded
    });

    console.log(`   Selecting ${availableBikes.length} available bikes for sales generation...`);
    const dateStart = new Date('2025-01-10');
    const dateEnd = new Date('2026-09-15');

    const salesBatch = [];
    const soldBikeIds = [];

    const userIds = [adminUser.id, managerUser.id, operatorUser.id, salesUser.id];

    let invCounter = currentSalesCount + 1;
    for (const bike of availableBikes) {
      const cust = generateCustomer();
      const saleDate = randomDate(dateStart, dateEnd);
      const isB2B = Math.random() < 0.22;
      const saleType = isB2B ? 'B2B' : 'B2C';
      const customerType = isB2B ? randomItem(['DEALER', 'WORKSHOP']) : 'RETAIL';
      const salePrice = bike.retailPrice;
      const discount = randomNumber(0, 5) * 1000;
      const finalAmount = Math.max(0, salePrice - discount);

      // Payment distribution
      const pModeRand = Math.random();
      let paymentType = 'CASH';
      let initialDeposit = finalAmount;
      let remainingBalance = 0;
      let status = 'COMPLETED';

      if (pModeRand < 0.40) {
        paymentType = 'CASH';
        initialDeposit = finalAmount;
        remainingBalance = 0;
      } else if (pModeRand < 0.62) {
        paymentType = 'BANK_TRANSFER';
        initialDeposit = finalAmount;
        remainingBalance = 0;
      } else if (pModeRand < 0.68) {
        paymentType = 'CHEQUE';
        initialDeposit = finalAmount;
        remainingBalance = 0;
      } else {
        // CREDIT_INSTALLMENT
        paymentType = 'CREDIT_INSTALLMENT';
        const depositRatio = randomItem([0.25, 0.30, 0.35, 0.40, 0.50]);
        initialDeposit = Math.round(finalAmount * depositRatio / 1000) * 1000;
        remainingBalance = finalAmount - initialDeposit;
        status = remainingBalance > 0 ? 'PENDING_PAYMENT' : 'COMPLETED';
      }

      const invoiceNumber = `INV-${saleDate.getFullYear()}-${String(invCounter).padStart(4, '0')}`;
      invCounter++;

      const createdById = randomItem(userIds);

      salesBatch.push({
        invoiceNumber,
        saleType,
        bikeId: bike.id,
        customerName: isB2B ? `${cust.name} (${randomItem(['Autos', 'Motors', 'Enterprises', 'Honda Center'])})` : cust.name,
        customerPhone: cust.phone,
        customerCnic: cust.cnic,
        customerAddress: cust.address,
        customerType,
        salePrice,
        discount,
        tax: 0,
        finalAmount,
        paymentType,
        initialDeposit,
        remainingBalance,
        status,
        createdById,
        saleDate,
        createdAt: saleDate,
        isDeleted: false
      });

      soldBikeIds.push(bike.id);
    }

    // Insert sales in chunks of 300
    for (let c = 0; c < salesBatch.length; c += 300) {
      const chunk = salesBatch.slice(c, c + 300);
      await prisma.sale.createMany({ data: chunk, skipDuplicates: true });
    }

    // Update the sold bikes' status to SOLD in bulk
    for (let b = 0; b < soldBikeIds.length; b += 400) {
      const idsChunk = soldBikeIds.slice(b, b + 400);
      await prisma.bike.updateMany({
        where: { id: { in: idsChunk } },
        data: { status: 'SOLD' }
      });
    }

    console.log(`   ✓ Created ${salesBatch.length} sales records and updated bike stock status to SOLD`);
  }

  const totalSales = await prisma.sale.count();
  console.log(`   ✓ Total sales in system: ${totalSales}`);

  // 7. Generate Installment Schedules & Payments for Credit Sales
  console.log('\n7. Generating Installment Schedules & Payment Transactions...');
  const allCreditSales = await prisma.sale.findMany({
    where: {
      paymentType: 'CREDIT_INSTALLMENT',
      isDeleted: false,
      installments: { none: {} }
    },
    take: 600
  });

  if (allCreditSales.length > 0) {
    console.log(`   Generating installment plans for ${allCreditSales.length} credit sales...`);
    const installmentsBatch = [];
    const paymentsBatch = [];

    const now = new Date();

    for (const sale of allCreditSales) {
      const count = randomItem([3, 4, 6, 8, 10, 12]);
      const remaining = sale.remainingBalance;
      const monthlyAmount = Math.round((remaining / count) * 100) / 100;
      let runningBalance = remaining;

      // Down payment transaction
      if (sale.initialDeposit > 0) {
        paymentsBatch.push({
          saleId: sale.id,
          amount: sale.initialDeposit,
          paymentMethod: 'CASH',
          referenceNumber: `DEP-${randomNumber(10000, 99999)}`,
          paymentDate: sale.saleDate,
          notes: 'Initial down payment at booking'
        });
      }

      for (let i = 1; i <= count; i++) {
        const dueDate = new Date(sale.saleDate);
        dueDate.setMonth(dueDate.getMonth() + i);

        const instAmount = i === count ? runningBalance : monthlyAmount;
        runningBalance -= instAmount;

        const isPastDue = dueDate < now;
        // If past due, 78% chance paid, 22% chance overdue
        const isPaid = isPastDue && Math.random() < 0.78;

        installmentsBatch.push({
          saleId: sale.id,
          installmentNumber: i,
          dueDate,
          amount: instAmount,
          paidAmount: isPaid ? instAmount : 0,
          status: isPaid ? 'PAID' : (isPastDue ? 'OVERDUE' : 'PENDING'),
          paidDate: isPaid ? new Date(dueDate.getTime() - randomNumber(1, 5) * 86400000) : null,
          notes: isPaid ? `Cleared via ${randomItem(['Cash at counter', 'HBL Online', 'Meezan Bank Transfer', 'JazzCash'])}` : null
        });

        if (isPaid) {
          paymentsBatch.push({
            saleId: sale.id,
            amount: instAmount,
            paymentMethod: randomItem(['CASH', 'BANK_TRANSFER']),
            referenceNumber: `TRX-${randomNumber(100000, 999999)}`,
            paymentDate: new Date(dueDate.getTime() - randomNumber(1, 5) * 86400000),
            notes: `Installment #${i} regular settlement`
          });
        }
      }
    }

    // Insert installments in chunks of 500
    for (let c = 0; c < installmentsBatch.length; c += 500) {
      const chunk = installmentsBatch.slice(c, c + 500);
      await prisma.installmentSchedule.createMany({ data: chunk });
    }

    // Insert payments in chunks of 500
    for (let p = 0; p < paymentsBatch.length; p += 500) {
      const chunk = paymentsBatch.slice(p, p + 500);
      await prisma.paymentTransaction.createMany({ data: chunk });
    }

    console.log(`   ✓ Created ${installmentsBatch.length} installment schedules and ${paymentsBatch.length} payment transactions`);
  }

  // Also ensure initial payment transactions for Cash/Bank sales if missing
  const cashSalesWithoutPayments = await prisma.sale.findMany({
    where: {
      paymentType: { in: ['CASH', 'BANK_TRANSFER', 'CHEQUE'] },
      payments: { none: {} }
    },
    take: 600
  });

  if (cashSalesWithoutPayments.length > 0) {
    const cashPayments = cashSalesWithoutPayments.map((s) => ({
      saleId: s.id,
      amount: s.finalAmount,
      paymentMethod: s.paymentType,
      referenceNumber: `${s.paymentType.substring(0, 3)}-${randomNumber(10000, 99999)}`,
      paymentDate: s.saleDate,
      notes: 'Full upfront payment at invoice issuance'
    }));

    for (let c = 0; c < cashPayments.length; c += 500) {
      const chunk = cashPayments.slice(c, c + 500);
      await prisma.paymentTransaction.createMany({ data: chunk });
    }
    console.log(`   ✓ Created ${cashPayments.length} upfront payment transactions for cash/bank sales`);
  }

  // 8. Generate Motorcycle Paperwork Documents
  console.log('\n8. Generating Motorcycle Documents...');
  const salesWithoutDocs = await prisma.sale.findMany({
    where: { documents: { none: {} } },
    take: 350
  });

  if (salesWithoutDocs.length > 0) {
    const docBatch = [];
    const docTypes = [
      'SALES_CERTIFICATE',
      'DELIVERY_LETTER_GATE_PASS',
      'BOOK_TRANSFER_REQUEST',
      'ALLOTMENT_LETTER',
      'REGISTRATION_APPLICATION'
    ];

    for (const sale of salesWithoutDocs) {
      const count = randomNumber(3, 5);
      const selectedTypes = docTypes.slice(0, count);

      for (const dtype of selectedTypes) {
        const pStatus = randomItem(['PENDING_MANUFACTURER', 'PROCESSING_EXCISE', 'READY_FOR_PICKUP', 'DELIVERED']);
        docBatch.push({
          saleId: sale.id,
          docType: dtype,
          paperworkStatus: pStatus,
          statusNotes: pStatus === 'DELIVERED'
            ? 'Original document received and signed by customer.'
            : (pStatus === 'READY_FOR_PICKUP' ? 'Signed & stamped, awaiting customer arrival.' : 'Submitted to excise office.'),
          issuedAt: sale.saleDate,
          updatedAt: new Date(sale.saleDate.getTime() + randomNumber(1, 14) * 86400000)
        });
      }
    }

    for (let d = 0; d < docBatch.length; d += 500) {
      const chunk = docBatch.slice(d, d + 500);
      await prisma.motorcycleDocument.createMany({ data: chunk });
    }
    console.log(`   ✓ Created ${docBatch.length} vehicle paperwork document records`);
  }

  // 9. Generate B2B Parts Orders & Vendor POs
  console.log('\n9. Generating B2B Parts Orders & Vendor Purchase Orders...');
  const currentOrders = await prisma.partOrder.count();
  if (currentOrders < 120) {
    const parts = await prisma.part.findMany({ take: 100 });
    const ordersNeeded = 120 - currentOrders;
    const workshops = [
      'Al-Madina Autos & Repair Workshop', 'Usman Motors Service Center', 'Pak Bike Care Workshop',
      'Lahore Honda Tuning Center', 'Kashif Motorcycle Mechanics', 'Punjab Auto Care',
      'Karachi Bike Tuning & Spare Parts', 'Modern Bike Clinic', 'National Workshop', 'Speedway Motors'
    ];

    for (let i = 0; i < ordersNeeded; i++) {
      const orderDate = randomDate(new Date('2025-02-01'), new Date('2026-09-10'));
      const orderNum = `B2B-2025-${String(i + currentOrders + 100).padStart(4, '0')}`;
      const customerName = randomItem(workshops);
      const cust = generateCustomer();

      const numItems = randomNumber(1, 4);
      let totalAmount = 0;
      const orderItems = [];

      for (let k = 0; k < numItems; k++) {
        const part = randomItem(parts);
        const qty = randomNumber(2, 10);
        const unitPrice = part.b2bSellingPrice;
        const subtotal = unitPrice * qty;
        totalAmount += subtotal;

        orderItems.push({
          partId: part.id,
          quantity: qty,
          unitPrice,
          subtotal
        });
      }

      await prisma.partOrder.create({
        data: {
          orderNumber: orderNum,
          customerName,
          customerType: 'SECONDARY_WORKSHOP',
          contactNumber: cust.phone,
          totalAmount,
          status: 'COMPLETED',
          notes: 'Monthly wholesale inventory delivery.',
          createdAt: orderDate,
          items: {
            create: orderItems
          }
        }
      });
    }
    console.log(`   ✓ Created ${ordersNeeded} B2B wholesale orders with line items`);
  }

  // Vendor POs
  const currentPOs = await prisma.vendorPO.count();
  if (currentPOs < 40) {
    const parts = await prisma.part.findMany({ take: 80 });
    const posNeeded = 40 - currentPOs;
    const suppliers = [
      'Atlas Honda Genuine Parts Logistics',
      'Pak Suzuki Spare Parts Division',
      'Yamaha Motor Pakistan Parts Depot',
      'F.C.C Clutch Technology Distribution',
      'Nissin Brake Systems Pakistan',
      'Service Industries Rubber & Tires Division'
    ];

    for (let i = 0; i < posNeeded; i++) {
      const poDate = randomDate(new Date('2025-01-15'), new Date('2026-09-01'));
      const poNum = `VPO-2025-${String(i + currentPOs + 100).padStart(4, '0')}`;
      const vendorName = randomItem(suppliers);
      const cust = generateCustomer();

      const numItems = randomNumber(1, 4);
      let totalAmount = 0;
      const poItems = [];

      for (let k = 0; k < numItems; k++) {
        const part = randomItem(parts);
        const qty = randomNumber(10, 50);
        const unitCost = part.wholesaleCost;
        const subtotal = unitCost * qty;
        totalAmount += subtotal;

        poItems.push({
          partId: part.id,
          quantityOrdered: qty,
          quantityReceived: qty,
          unitCost,
          subtotal
        });
      }

      await prisma.vendorPO.create({
        data: {
          poNumber: poNum,
          vendorName,
          contactNumber: cust.phone,
          status: 'RECEIVED',
          totalAmount,
          notes: 'Standard stock replenishing shipment received in central warehouse.',
          orderedAt: poDate,
          receivedAt: new Date(poDate.getTime() + randomNumber(3, 10) * 86400000),
          createdAt: poDate,
          items: {
            create: poItems
          }
        }
      });
    }
    console.log(`   ✓ Created ${posNeeded} vendor purchase orders with line items`);
  }

  // 10. Generate 1,000 Audit Logs
  console.log('\n10. Generating 1,000 Audit Log Records...');
  const currentLogs = await prisma.auditLog.count();
  const targetLogs = 1000;

  if (currentLogs < targetLogs) {
    const logsNeeded = targetLogs - currentLogs;
    const auditBatch = [];
    const users = [adminUser, managerUser, operatorUser, salesUser];
    const actions = [
      { module: 'AUTH', action: 'LOGIN', text: (u) => `User ${u.username} logged in successfully via portal` },
      { module: 'SALES', action: 'CREATE_SALE', text: () => `Issued sale invoice for motorcycle unit` },
      { module: 'SALES', action: 'RECORD_PAYMENT', text: () => `Recorded partial installment settlement` },
      { module: 'INVENTORY', action: 'UPDATE_BIKE', text: () => `Updated pre-delivery inspection status for motorcycle unit` },
      { module: 'SPARE_PARTS', action: 'UPDATE_PART', text: () => `Stock level adjusted following central warehouse audit` },
      { module: 'DOCUMENTS', action: 'UPDATE_DOC_STATUS', text: () => `Registration application forwarded to excise office` },
      { module: 'SETTINGS', action: 'UPDATE_PLATFORM_SETTINGS', text: () => `Updated dealership operational parameters` }
    ];

    const logStart = new Date('2025-06-01');
    const logEnd = new Date('2026-09-17');

    for (let i = 0; i < logsNeeded; i++) {
      const u = randomItem(users);
      const act = randomItem(actions);
      const createdAt = randomDate(logStart, logEnd);
      const ip = `192.168.1.${randomNumber(10, 250)}`;

      auditBatch.push({
        userId: u.id,
        action: act.action,
        module: act.module,
        details: act.text(u),
        ipAddress: ip,
        createdAt
      });
    }

    for (let l = 0; l < auditBatch.length; l += 500) {
      const chunk = auditBatch.slice(l, l + 500);
      await prisma.auditLog.createMany({ data: chunk });
    }
    console.log(`   ✓ Created ${auditBatch.length} audit trail records`);
  }

  // 11. Final Count Verification
  console.log('\n=== Database Seeding Complete! Verifying Counts ===');
  const [
    usersCount,
    rolesCount,
    permissionsCount,
    rolePermissionsCount,
    bikesCount,
    salesCount,
    installmentsCount,
    paymentsCount,
    documentsCount,
    partsCount,
    partOrdersCount,
    partOrderItemsCount,
    vendorPOsCount,
    vendorPOItemsCount,
    auditLogsCount,
    platformSettingsCount
  ] = await Promise.all([
    prisma.user.count(),
    prisma.role.count(),
    prisma.permission.count(),
    prisma.rolePermission.count(),
    prisma.bike.count(),
    prisma.sale.count(),
    prisma.installmentSchedule.count(),
    prisma.paymentTransaction.count(),
    prisma.motorcycleDocument.count(),
    prisma.part.count(),
    prisma.partOrder.count(),
    prisma.partOrderItem.count(),
    prisma.vendorPO.count(),
    prisma.vendorPOItem.count(),
    prisma.auditLog.count(),
    prisma.platformSetting.count()
  ]);

  const grandTotal =
    usersCount +
    rolesCount +
    permissionsCount +
    rolePermissionsCount +
    bikesCount +
    salesCount +
    installmentsCount +
    paymentsCount +
    documentsCount +
    partsCount +
    partOrdersCount +
    partOrderItemsCount +
    vendorPOsCount +
    vendorPOItemsCount +
    auditLogsCount +
    platformSettingsCount;

  console.table({
    'Users': usersCount,
    'Roles': rolesCount,
    'Permissions': permissionsCount,
    'Role Permissions': rolePermissionsCount,
    'Bikes (Inventory)': bikesCount,
    'Sales Invoices': salesCount,
    'Installment Schedules': installmentsCount,
    'Payment Transactions': paymentsCount,
    'Motorcycle Documents': documentsCount,
    'Spare Parts': partsCount,
    'Parts Orders (B2B)': partOrdersCount,
    'Parts Order Items': partOrderItemsCount,
    'Vendor Purchase Orders': vendorPOsCount,
    'Vendor PO Items': vendorPOItemsCount,
    'Audit Logs': auditLogsCount,
    'Platform Settings': platformSettingsCount,
    'GRAND TOTAL RECORDS': grandTotal
  });

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n🎉 Completed in ${durationSec}s. Database contains ${grandTotal.toLocaleString()} real-looking dealership records!`);
}

seedLarge()
  .catch((e) => {
    console.error('Error during large seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
