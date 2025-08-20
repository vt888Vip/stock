import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';
import { processWinTrade, processLoseTrade, calculateProfit } from '@/lib/balanceUtils';

// API Cron để tự động xử lý phiên giao dịch
export async function GET(request: NextRequest) {
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

    // 1. Xử lý các phiên ACTIVE đã kết thúc - Đối chiếu sessionId và lấy kết quả có sẵn
    // Chỉ xử lý phiên chưa được admin xử lý (createdBy !== 'admin')
    const expiredActiveSessions = await db.collection('trading_sessions').find({
      status: 'ACTIVE',
      endTime: { $lte: now },
      createdBy: { $ne: 'admin' } // Chỉ xử lý phiên không phải admin đặt
    }).toArray();

    for (const session of expiredActiveSessions) {
      try {
        // Đối chiếu sessionId để lấy result đã có sẵn từ database
        const sessionResult = session.result;
        
        if (!sessionResult) {
          console.log(`⚠️ Cron: Phiên ${session.sessionId} không có kết quả, bỏ qua`);
          continue;
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

        // ✅ SỬ DỤNG UTILITY AN TOÀN: Xử lý từng lệnh một cách chính xác
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

          // ✅ XỬ LÝ BALANCE AN TOÀN: Sử dụng aggregation pipeline
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
            console.error(`❌ [CRON] Lỗi xử lý balance cho trade ${trade._id}:`, error);
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

    // 2. Chức năng duy trì 30 phiên tương lai đã được tắt


    return NextResponse.json({
      success: true,
      message: `Cron job hoàn thành: Xử lý ${results.totalProcessed} phiên`,
      results
    });

  } catch (error) {
    console.error('Lỗi trong cron job:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Hàm tạo sessionId
function generateSessionId(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  
  return `${year}${month}${day}${hours}${minutes}`;
} 