import { ObjectId } from 'mongodb';
import { processWinTrade, processLoseTrade, calculateProfit } from '@/lib/balanceUtils';

/**
 * Tạo sessionId dựa trên thời gian hiện tại
 * Định dạng: YYMMDDHHmm (Ví dụ: 2507111927 cho 19:27 ngày 11/07/2025)
 */
export function generateSessionId(date: Date = new Date()): string {
  const year = date.getUTCFullYear().toString();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}`;
}

/**
 * Lấy thông tin từ sessionId
 */
export const parseSessionId = (sessionId: string) => {
  if (!sessionId || sessionId.length !== 10) return null;
  
  const year = parseInt(sessionId.slice(0, 2), 10) + 2000; // Giả sử thế kỷ 21
  const month = parseInt(sessionId.slice(2, 4), 10) - 1; // Tháng bắt đầu từ 0
  const day = parseInt(sessionId.slice(4, 6), 10);
  const hour = parseInt(sessionId.slice(6, 8), 10);
  const minute = parseInt(sessionId.slice(8, 10), 10);
  
  // Tạo đối tượng Date với múi giờ Việt Nam
  const date = new Date(Date.UTC(year, month, day, hour - 7, minute)); // UTC+7
  
  return {
    date,
    year,
    month: month + 1,
    day,
    hour,
    minute,
    // Thêm các thông tin hữu ích khác nếu cần
    formattedTime: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
    formattedDate: `${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year}`
  };
};

// Cache để tránh xử lý trùng lặp
const processedSessionsCache = new Set<string>();

// Hàm xử lý phiên hết hạn và công bố kết quả
export async function processExpiredSessions(db: any, apiName: string = 'Unknown') {
  const now = new Date();
  
  // Tìm các phiên đã hết hạn nhưng chưa được xử lý
  const expiredSessions = await db.collection('trading_sessions').find({
    status: { $in: ['ACTIVE', 'PREDICTED'] },
    endTime: { $lte: now }
  }).toArray();


  for (const session of expiredSessions) {
    try {
      // ✅ THÊM: Kiểm tra cache để tránh xử lý trùng lặp
      const cacheKey = `${session.sessionId}_${apiName}`;
      if (processedSessionsCache.has(cacheKey)) {
        continue;
      }
      
      
      // 1. Kiểm tra xem admin đã đặt kết quả chưa
      let result = session.result;
      let createdBy = session.createdBy || 'system';
      
      if (!result) {
        // ✅ SỬA: Nếu không có kết quả, tạo random kết quả
        console.log(`🎲 [${apiName}] Phiên ${session.sessionId} không có kết quả, tạo random kết quả`);
        
        // Tạo random kết quả (50% UP, 50% DOWN)
        const random = Math.random();
        result = random < 0.5 ? 'UP' : 'DOWN';
        createdBy = 'system';
        
        // Cập nhật kết quả cho phiên
        await db.collection('trading_sessions').updateOne(
          { _id: session._id },
          { 
            $set: { 
              result: result,
              actualResult: result,
              createdBy: createdBy,
              updatedAt: now
            }
          }
        );
        
        console.log(`🎲 [${apiName}] Đã tạo random kết quả cho phiên ${session.sessionId}: ${result}`);
      } else {
        console.log(`👑 [${apiName}] Sử dụng kết quả có sẵn cho phiên ${session.sessionId}: ${result}`);
      }

      // 2. Cập nhật trạng thái phiên thành COMPLETED
      await db.collection('trading_sessions').updateOne(
        { _id: session._id },
        { 
          $set: { 
            status: 'COMPLETED',
            result: result,
            actualResult: result, // Lưu kết quả thực tế
            createdBy: createdBy,
            completedAt: now,
            updatedAt: now
          }
        }
      );


      // 3. Lấy tất cả lệnh của phiên này
      const trades = await db.collection('trades').find({ 
        sessionId: session.sessionId, 
        status: 'pending' 
      }).toArray();


      for (const trade of trades) {
        // 4. Xác định win/lose
        const isWin = trade.direction === result;
        const profit = isWin ? calculateProfit(trade.amount, 0.9) : 0; // Thắng được 90%
        const newStatus = 'completed';

        // 5. Cập nhật lệnh
        await db.collection('trades').updateOne(
          { _id: trade._id },
          { 
            $set: { 
              status: newStatus, 
              result: isWin ? 'win' : 'lose', 
              profit: profit,
              updatedAt: now
            }
          }
        );

        // 6. ✅ SỬA: Sử dụng balanceUtils thay vì xử lý trực tiếp
        try {
          if (isWin) {
            await processWinTrade(db, trade.userId.toString(), trade.amount, profit);
          } else {
            await processLoseTrade(db, trade.userId.toString(), trade.amount);
          }
        } catch (error) {
          console.error(`❌ [${apiName}] Lỗi xử lý balance cho trade ${trade._id}:`, error);
        }
      }

      // ✅ THÊM: Đánh dấu phiên đã được xử lý
      processedSessionsCache.add(cacheKey);
      
    } catch (error) {
      console.error(`❌ [${apiName}] Lỗi khi xử lý phiên ${session.sessionId}:`, error);
    }
  }
  
  // ✅ THÊM: Cleanup cache sau 5 phút để tránh memory leak
  setTimeout(() => {
    processedSessionsCache.clear();
  }, 5 * 60 * 1000);
}
