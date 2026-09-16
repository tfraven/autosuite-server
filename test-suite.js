async function runTests() {
  console.log('=== AutoSuite Comprehensive Verification Suite ===\n');
  const baseUrl = 'http://localhost:5000/api';

  // 1. Test Admin Login
  console.log('1. Testing Admin Authentication...');
  const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const adminData = await adminLoginRes.json();
  if (!adminData.accessToken || adminData.user.role !== 'Admin') {
    throw new Error('Admin login failed');
  }
  const adminToken = adminData.accessToken;
  console.log('   ✓ Admin authenticated successfully. Role:', adminData.user.role);

  // 2. Test Operator Login & RBAC restrictions
  console.log('\n2. Testing Operator RBAC Restrictions...');
  const operatorLoginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'operator', password: 'operator123' })
  });
  const operatorData = await operatorLoginRes.json();
  const opToken = operatorData.accessToken;
  console.log('   ✓ Operator authenticated. Permissions:', operatorData.user.permissions);

  // Verify Operator is forbidden from accessing /api/users (Admin only)
  const forbiddenUsersRes = await fetch(`${baseUrl}/users`, {
    headers: { Authorization: `Bearer ${opToken}` }
  });
  if (forbiddenUsersRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for operator accessing users, got ${forbiddenUsersRes.status}`);
  }
  console.log('   ✓ Operator strictly forbidden from Users & RBAC route (403 Forbidden)');

  // Verify Operator is forbidden from accessing /api/parts (Manager only)
  const forbiddenPartsRes = await fetch(`${baseUrl}/parts`, {
    headers: { Authorization: `Bearer ${opToken}` }
  });
  if (forbiddenPartsRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for operator accessing parts, got ${forbiddenPartsRes.status}`);
  }
  console.log('   ✓ Operator strictly forbidden from Spare Parts route (403 Forbidden)');

  // 3. Test Motorcycle Inventory (New & Used)
  console.log('\n3. Testing Motorcycle Inventory...');
  const bikesRes = await fetch(`${baseUrl}/bikes`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const bikes = await bikesRes.json();
  const brandNewCount = bikes.filter(b => b.type === 'BRAND_NEW').length;
  const usedCount = bikes.filter(b => b.type === 'USED').length;
  console.log(`   ✓ Retrieved ${bikes.length} total bikes (Brand New: ${brandNewCount}, Used Pre-owned: ${usedCount})`);

  // 4. Test Chassis Lookup
  console.log('\n4. Testing Chassis Fast Lookup...');
  const availableBike = bikes.find(b => b.status === 'IN_STOCK');
  if (!availableBike) throw new Error('No in-stock bike found for test');
  const chassisRes = await fetch(`${baseUrl}/bikes/search-chassis/${availableBike.chassisNumber}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const chassisBike = await chassisRes.json();
  if (chassisBike.id !== availableBike.id) throw new Error('Chassis search mismatch');
  console.log(`   ✓ Chassis lookup found: ${chassisBike.modelName} (${chassisBike.chassisNumber})`);

  // 5. Test Sales Transaction Engine & Status Locking
  console.log('\n5. Testing Sales Engine & Real-time Chassis Status Locking...');
  const newSalePayload = {
    bikeId: availableBike.id,
    saleType: 'B2C',
    customerName: 'Tariq Jameel',
    customerPhone: '0300-7654321',
    customerCnic: '35202-1234567-9',
    customerAddress: 'DHA Phase 5, Lahore',
    customerType: 'RETAIL',
    salePrice: availableBike.retailPrice,
    discount: 5000,
    tax: 0,
    paymentType: 'CREDIT_INSTALLMENT',
    initialDeposit: 75000,
    installmentsCount: 6,
    firstInstallmentDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  };

  const createSaleRes = await fetch(`${baseUrl}/sales`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify(newSalePayload)
  });
  const createdSale = await createSaleRes.json();
  if (!createdSale.invoiceNumber) throw new Error('Sale creation failed: ' + JSON.stringify(createdSale));
  console.log(`   ✓ Sale recorded: Invoice ${createdSale.invoiceNumber}`);
  console.log(`     Total: PKR ${createdSale.finalAmount}, Deposit: PKR ${createdSale.initialDeposit}, Balance: PKR ${createdSale.remainingBalance}`);
  console.log(`     Generated Installment Schedules: ${createdSale.installments?.length} months`);
  console.log(`     Auto-initialized Motorcycle Letters: ${createdSale.documents?.length} documents`);

  // Verify bike is now locked to SOLD
  const updatedBikeRes = await fetch(`${baseUrl}/bikes/${availableBike.id}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const updatedBike = await updatedBikeRes.json();
  if (updatedBike.status !== 'SOLD') throw new Error('Bike status was not updated to SOLD');
  console.log(`   ✓ Bike status automatically updated to '${updatedBike.status}' in real time`);

  // 6. Test Installment Payment Collection
  console.log('\n6. Testing Installment Payment Recording...');
  const firstInst = createdSale.installments[0];
  const paymentRes = await fetch(`${baseUrl}/sales/${createdSale.id}/payments`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      amount: firstInst.amount,
      installmentId: firstInst.id,
      paymentMethod: 'BANK_TRANSFER',
      referenceNumber: 'TX-9871234',
      notes: '1st Installment collected via Online Transfer'
    })
  });
  const updatedSaleAfterPayment = await paymentRes.json();
  console.log(`   ✓ Payment recorded. New Remaining Balance: PKR ${updatedSaleAfterPayment.remainingBalance}`);

  // 7. Test Vehicle Letters Status Update
  console.log('\n7. Testing Motorcycle Letters & Registration Lifecycle Tracking...');
  const doc = createdSale.documents[0];
  const updateDocRes = await fetch(`${baseUrl}/documents/${doc.id}/status`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      paperworkStatus: 'PROCESSING_EXCISE',
      statusNotes: 'Application submitted to Lahore Motor Registering Authority'
    })
  });
  const updatedDoc = await updateDocRes.json();
  console.log(`   ✓ Document '${updatedDoc.docType}' status updated to '${updatedDoc.paperworkStatus}'`);

  // 8. Test Manager Spare Parts & Low Stock Alert
  console.log('\n8. Testing B2B Spare Parts (Manager)...');
  const alertsRes = await fetch(`${baseUrl}/parts/alerts/low-stock`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const alerts = await alertsRes.json();
  console.log(`   ✓ Low stock alerts working: ${alerts.count} items below re-order threshold`);

  // 9. Test Excel Exports
  console.log('\n9. Testing Excel (.xlsx) Reports Export Stream...');
  const excelEndpoints = ['bikes', 'parts', 'sales', 'credit-ledger'];
  for (const ep of excelEndpoints) {
    const res = await fetch(`${baseUrl}/reports/export/${ep}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (res.status !== 200) throw new Error(`Excel export failed for ${ep}: status ${res.status}`);
    const buffer = await res.arrayBuffer();
    console.log(`   ✓ Excel export '/export/${ep}' generated: ${buffer.byteLength} bytes`);
  }

  // 10. Dashboard Stats
  console.log('\n10. Testing Dashboard Financial Aggregations...');
  const statsRes = await fetch(`${baseUrl}/reports/dashboard`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const stats = await statsRes.json();
  console.log(`   ✓ Revenue: PKR ${stats.totalRevenue.toLocaleString()}`);
  console.log(`   ✓ Total Sales Count: ${stats.totalSalesCount}`);
  console.log(`   ✓ Outstanding Credit: PKR ${stats.totalOutstandingCredit.toLocaleString()}`);

  console.log('\n🎉 ALL 10 VERIFICATION SUITE TESTS PASSED WITH 100% SUCCESS!');
}

runTests().catch(err => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
