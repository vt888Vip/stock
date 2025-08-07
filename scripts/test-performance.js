const { MongoClient } = require('mongodb');

// Script test hiệu suất xử lý kết quả
async function testPerformance() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/financial_platform';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Kết nối MongoDB thành công');

    const db = client.db();
    
    // Test 1: Kiểm tra thời gian query session
    console.log('\n🔍 Test 1: Thời gian query session');
    const startTime1 = Date.now();
    
    const session = await db.collection('trading_sessions').findOne(
      { sessionId: '202507130933' },
      { projection: { result: 1, status: 1, actualResult: 1 } }
    );
    
    const queryTime = Date.now() - startTime1;
    console.log(`⏱️ Thời gian query: ${queryTime}ms`);
    console.log(`📊 Session:`, session);

    // Test 2: Kiểm tra thời gian bulk update trades
    console.log('\n🔍 Test 2: Thời gian bulk update trades');
    const startTime2 = Date.now();
    
    const pendingTrades = await db.collection('trades').find({
      sessionId: '202507130933',
      status: 'pending'
    }).toArray();
    
    console.log(`📊 Tìm thấy ${pendingTrades.length} trades pending`);
    
    if (pendingTrades.length > 0) {
      const bulkOps = pendingTrades.map(trade => ({
        updateOne: {
          filter: { _id: trade._id },
          update: {
            $set: {
              status: 'completed',
              result: 'win',
              profit: 100000,
              completedAt: new Date(),
              updatedAt: new Date()
            }
          }
        }
      }));

      const bulkResult = await db.collection('trades').bulkWrite(bulkOps);
      const bulkTime = Date.now() - startTime2;
      console.log(`⏱️ Thời gian bulk update: ${bulkTime}ms`);
      console.log(`📊 Kết quả:`, bulkResult);
    }

    // Test 3: Kiểm tra index
    console.log('\n🔍 Test 3: Kiểm tra index');
    const indexes = await db.collection('trading_sessions').indexes();
    console.log(`📊 Indexes trading_sessions:`, indexes.map(idx => idx.name));
    
    const tradeIndexes = await db.collection('trades').indexes();
    console.log(`📊 Indexes trades:`, tradeIndexes.map(idx => idx.name));

    // Test 4: Kiểm tra thời gian xử lý session hoàn chỉnh
    console.log('\n🔍 Test 4: Thời gian xử lý session hoàn chỉnh');
    const startTime4 = Date.now();
    
    // Simulate process session
    const sessionToProcess = await db.collection('trading_sessions').findOne({
      status: 'ACTIVE',
      result: { $exists: true }
    });
    
    if (sessionToProcess) {
      console.log(`📊 Xử lý session: ${sessionToProcess.sessionId}`);
      
      // Update session status
      await db.collection('trading_sessions').updateOne(
        { _id: sessionToProcess._id },
        { $set: { status: 'COMPLETED', completedAt: new Date() } }
      );
      
      const processTime = Date.now() - startTime4;
      console.log(`⏱️ Thời gian xử lý session: ${processTime}ms`);
    }

    console.log('\n✅ Test hiệu suất hoàn thành');

  } catch (error) {
    console.error('❌ Lỗi:', error);
  } finally {
    await client.close();
  }
}

// Chạy test
testPerformance(); 