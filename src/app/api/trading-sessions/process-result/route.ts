import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';
import { processWinTrade, processLoseTrade, calculateProfit } from '@/lib/balanceUtils';

// API đơn giản để xử lý kết quả phiên
export async function POST(request: NextRequest) {
  try {
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Không thể kết nối cơ sở dữ liệu');
    }

    const now = new Date();
    
    // 1. Tìm phiên ACTIVE đã kết thúc
    const expiredSessions = await db.collection('trading_sessions').find({
      status: 'ACTIVE',
      endTime: { $lte: now }
    }).toArray();

    console.log(`🎯 [PROCESS] Tìm thấy ${expiredSessions.length} phiên cần xử lý`);

    for (const session of expiredSessions) {
      try {
        // 2. Lấy kết quả từ database hoặc tạo random
        let sessionResult = session.result;
        
        if (!sessionResult) {
          sessionResult = Math.random() < 0.5 ? 'UP' : 'DOWN';
          await db.collection('trading_sessions').updateOne(
            { _id: session._id },
            { $set: { result: sessionResult, updatedAt: now } }
          );
          console.log(`🎲 [PROCESS] Tạo kết quả cho phiên ${session.sessionId}: ${sessionResult}`);
        }

        // 3. Tìm trades pending của phiên này
        const pendingTrades = await db.collection('trades').find({
          sessionId: session.sessionId,
          status: 'pending'
        }).toArray();

        console.log(`📊 [PROCESS] Xử lý ${pendingTrades.length} trades cho phiên ${session.sessionId}`);

        // 4. Tính toán kết quả cho từng trade
        for (const trade of pendingTrades) {
          const isWin = trade.direction === sessionResult;
          const profit = isWin ? calculateProfit(trade.amount, 0.9) : 0;

          // Cập nhật trade
          await db.collection('trades').updateOne(
            { _id: trade._id },
            { 
              $set: {
                status: 'completed',
                result: isWin ? 'win' : 'lose',
                profit: profit,
                completedAt: now,
                updatedAt: now
              }
            }
          );

          // Cập nhật balance
          if (isWin) {
            await processWinTrade(db, trade.userId.toString(), trade.amount, profit);
          } else {
            await processLoseTrade(db, trade.userId.toString(), trade.amount);
          }
        }

        // 5. Đánh dấu phiên hoàn thành
        await db.collection('trading_sessions').updateOne(
          { _id: session._id },
          { 
            $set: { 
              status: 'COMPLETED',
              completedAt: now,
              updatedAt: now
            }
          }
        );

        console.log(`✅ [PROCESS] Hoàn thành xử lý phiên ${session.sessionId}`);
        
      } catch (error) {
        console.error(`❌ [PROCESS] Lỗi xử lý phiên ${session.sessionId}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Xử lý ${expiredSessions.length} phiên thành công`
    });

  } catch (error) {
    console.error('❌ [PROCESS] Lỗi:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ' },
      { status: 500 }
    );
  }
} 