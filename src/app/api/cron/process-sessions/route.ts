import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';

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

    console.log('🕐 Cron job bắt đầu xử lý phiên:', now.toISOString());

    // 1. Xử lý các phiên ACTIVE đã kết thúc - Đối chiếu sessionId và lấy kết quả có sẵn
    // Chỉ xử lý phiên chưa được admin xử lý (createdBy !== 'admin')
    const expiredActiveSessions = await db.collection('trading_sessions').find({
      status: 'ACTIVE',
      endTime: { $lte: now },
      createdBy: { $ne: 'admin' } // Chỉ xử lý phiên không phải admin đặt
    }).toArray();

    console.log(`🔍 Tìm thấy ${expiredActiveSessions.length} phiên ACTIVE đã kết thúc (chưa được admin xử lý)`);

    for (const session of expiredActiveSessions) {
      try {
        // Đối chiếu sessionId để lấy result đã có sẵn từ database
        const sessionResult = session.result;
        
        if (!sessionResult) {
          console.log(`⚠️ Cron: Phiên ${session.sessionId} không có kết quả, bỏ qua`);
          continue;
        }

        console.log(`🎯 Cron: Đối chiếu sessionId ${session.sessionId} - Kết quả: ${sessionResult}`);

        // Tìm tất cả lệnh pending của phiên này
        const pendingTrades = await db.collection('trades').find({
          sessionId: session.sessionId,
          status: 'pending'
        }).toArray();

        console.log(`🔍 Cron: Tìm thấy ${pendingTrades.length} lệnh pending cho phiên ${session.sessionId}`);

        // Thống kê kết quả
        let totalWins = 0;
        let totalLosses = 0;
        let totalWinAmount = 0;
        let totalLossAmount = 0;

        // Tính toán kết quả cho từng lệnh dựa trên result có sẵn
        for (const trade of pendingTrades) {
          console.log(`🔍 Cron: Debug - Trade ${trade._id}: direction=${trade.direction}, sessionResult=${sessionResult}, userId=${trade.userId}`);
          
          const isWin = trade.direction === sessionResult;
          const profit = isWin ? Math.floor(trade.amount * 0.9) : 0; // 10 ăn 9

          console.log(`🎯 Cron: So sánh - trade.direction (${trade.direction}) === sessionResult (${sessionResult}) = ${isWin}`);

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

          console.log(`✅ Cron: Cập nhật lệnh ${trade._id}: ${isWin ? 'THẮNG' : 'THUA'} - Lợi nhuận: ${profit}`);

          // Cập nhật số dư người dùng
          const user = await db.collection('users').findOne({ _id: trade.userId });
          if (user) {
            let currentBalance = user.balance || 0;
            let newBalance = currentBalance;
            
            if (isWin) {
              // Thắng: cộng tiền thắng (tiền cược + lợi nhuận)
              newBalance += trade.amount + profit;
              totalWins++;
              totalWinAmount += trade.amount + profit;
            } else {
              // Thua: trừ tiền cược (vì không trừ khi đặt lệnh)
              newBalance -= trade.amount;
              totalLosses++;
              totalLossAmount += trade.amount;
            }

            await db.collection('users').updateOne(
              { _id: trade.userId },
              { 
                $set: { 
                  balance: newBalance,
                  updatedAt: now
                }
              }
            );

            console.log(`💰 Cron: Cập nhật số dư user ${trade.userId}: ${currentBalance} -> ${newBalance} (${isWin ? 'THẮNG' : 'THUA'})`);
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
        
        console.log(`📈 Cron: Hoàn thành phiên ${session.sessionId}: ${totalWins} thắng, ${totalLosses} thua, Tổng thắng: ${totalWinAmount}, Tổng thua: ${totalLossAmount}`);
        
      } catch (error) {
        const errorMsg = `Lỗi khi xử lý phiên ACTIVE ${session.sessionId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        results.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    // 2. Chức năng duy trì 30 phiên tương lai đã được tắt
    console.log('🚫 Chức năng duy trì 30 phiên tương lai đã được tắt');

    console.log(`✅ Cron job hoàn thành: Xử lý ${results.totalProcessed} phiên, ${results.errors.length} lỗi`);

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