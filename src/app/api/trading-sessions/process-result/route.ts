import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';
import { processWinTrade, processLoseTrade, calculateProfit } from '@/lib/balanceUtils';

// API để xử lý kết quả phiên thay thế cho cron job
export async function POST(request: NextRequest) {
  try {
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Không thể kết nối cơ sở dữ liệu');
    }

    const now = new Date();
    const results = {
      processedSessions: [] as any[],
      totalProcessed: 0,
      errors: [] as string[],
      timestamp: now.toISOString()
    };

    // Tìm các phiên ACTIVE đã kết thúc
    const expiredActiveSessions = await db.collection('trading_sessions').find({
      status: 'ACTIVE',
      endTime: { $lte: now },
      createdBy: { $ne: 'admin' } // Chỉ xử lý phiên không phải admin đặt
    }).toArray();

    console.log(`🎯 [PROCESS] Tìm thấy ${expiredActiveSessions.length} phiên cần xử lý`);

    for (const session of expiredActiveSessions) {
      try {
        // Đối chiếu sessionId để lấy result đã có sẵn từ database
        let sessionResult = session.result;
        
        // Nếu không có kết quả, tạo random kết quả
        if (!sessionResult) {
          console.log(`🎲 [PROCESS] Phiên ${session.sessionId} không có kết quả, tạo random kết quả`);
          
          // Tạo random kết quả (50% UP, 50% DOWN)
          const random = Math.random();
          sessionResult = random < 0.5 ? 'UP' : 'DOWN';
          
          // Cập nhật kết quả cho phiên
          await db.collection('trading_sessions').updateOne(
            { _id: session._id },
            { 
              $set: { 
                result: sessionResult,
                actualResult: sessionResult,
                createdBy: 'system',
                updatedAt: now
              }
            }
          );
          
          console.log(`🎲 [PROCESS] Đã tạo random kết quả cho phiên ${session.sessionId}: ${sessionResult}`);
        }

        // Tìm tất cả lệnh pending của phiên này
        const pendingTrades = await db.collection('trades').find({
          sessionId: session.sessionId,
          status: 'pending'
        }).toArray();

        // Thống kê kết quả
        let totalWins = 0;
        let totalLosses = 0;
        let totalWinAmount = 0;
        let totalLossAmount = 0;

        // Xử lý từng lệnh một cách chính xác
        for (const trade of pendingTrades) {
          const isWin = trade.direction === sessionResult;
          const profit = isWin ? calculateProfit(trade.amount, 0.9) : 0; // 10 ăn 9

          // Cập nhật trạng thái lệnh
          const updateData = {
            status: 'completed',
            result: isWin ? 'win' : 'lose',
            profit: profit,
            completedAt: now,
            updatedAt: now
          };

          await db.collection('trades').updateOne(
            { _id: trade._id },
            { $set: updateData }
          );

          // Xử lý balance
          try {
            if (isWin) {
              await processWinTrade(db, trade.userId.toString(), trade.amount, profit);
              totalWins++;
              totalWinAmount += trade.amount + profit;
            } else {
              await processLoseTrade(db, trade.userId.toString(), trade.amount);
              totalLosses++;
              totalLossAmount += trade.amount;
            }
          } catch (error) {
            console.error(`❌ [PROCESS] Lỗi xử lý balance cho trade ${trade._id}:`, error);
            results.errors.push(`Lỗi xử lý balance trade ${trade._id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Đổi trạng thái từ ACTIVE sang COMPLETED sau khi tính toán xong
        await db.collection('trading_sessions').updateOne(
          { _id: session._id },
          { 
            $set: { 
              status: 'COMPLETED',
              totalTrades: pendingTrades.length,
              totalWins: totalWins,
              totalLosses: totalLosses,
              totalWinAmount: totalWinAmount,
              totalLossAmount: totalLossAmount,
              completedAt: now,
              updatedAt: now
            }
          }
        );

        results.processedSessions.push({
          sessionId: session.sessionId,
          action: 'ACTIVE_TO_COMPLETED',
          oldStatus: 'ACTIVE',
          newStatus: 'COMPLETED',
          result: sessionResult,
          totalTrades: pendingTrades.length,
          totalWins: totalWins,
          totalLosses: totalLosses,
          totalWinAmount: totalWinAmount,
          totalLossAmount: totalLossAmount,
          endTime: session.endTime,
          timeExpired: Math.floor((now.getTime() - session.endTime.getTime()) / 1000)
        });
        
        results.totalProcessed++;
        
      } catch (error) {
        const errorMsg = `Lỗi khi xử lý phiên ACTIVE ${session.sessionId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        results.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Process result hoàn thành: Xử lý ${results.totalProcessed} phiên`,
      results
    });

  } catch (error) {
    console.error('Lỗi trong process result:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 