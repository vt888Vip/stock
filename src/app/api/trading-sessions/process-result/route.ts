import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

// Cache để tránh xử lý trùng lặp - giảm thời gian cache
const processingSessions = new Set<string>();

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();
    
    if (!sessionId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Session ID is required' 
      }, { status: 400 });
    }

    // ⚡ ANTI-DUPLICATE: Kiểm tra session đang được xử lý - giảm thời gian cache
    if (processingSessions.has(sessionId)) {
      console.log(`⏳ Session ${sessionId} đang được xử lý, trả về kết quả ngay lập tức`);
      return NextResponse.json({ 
        success: true, 
        message: 'Session đang được xử lý, vui lòng thử lại sau',
        data: { sessionId, status: 'processing' }
      });
    }

    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json({ 
        success: false, 
        message: 'Database connection failed' 
      }, { status: 500 });
    }

    // ⚡ ANTI-DUPLICATE: Đánh dấu session đang xử lý - giảm thời gian cache
    processingSessions.add(sessionId);

    try {
      // 1. Lấy thông tin phiên giao dịch từ database
      const session = await db.collection('trading_sessions').findOne({ sessionId });
      
      if (!session) {
        return NextResponse.json({ 
          success: false, 
          message: 'Trading session not found' 
        }, { status: 404 });
      }

      if (session.status === 'COMPLETED') {
        return NextResponse.json({ 
          success: true, 
          message: 'Session already completed',
          data: { 
            sessionId, 
            status: 'completed',
            result: session.actualResult || session.result
          }
        });
      }

      // 2. Kiểm tra xem có kết quả được lưu sẵn không
      if (!session.result) {
        return NextResponse.json({ 
          success: false, 
          message: 'Session result not available yet' 
        }, { status: 400 });
      }

      const finalResult = session.result; // Lấy kết quả từ database
      console.log(`📊 Processing session ${sessionId} with result: ${finalResult}`);

      // 3. Sử dụng MongoDB transaction để đảm bảo tính nhất quán - tối ưu hóa
      const client = (db as any).client || (db as any).db?.client;
      if (!client) {
        throw new Error('MongoDB client not available for transaction');
      }
      
      const dbSession = client.startSession();
      
      await dbSession.withTransaction(async () => {
        // 4. Lấy tất cả lệnh pending của phiên này - tối ưu hóa query
        const trades = await db.collection('trades').find({ 
          sessionId,
          status: 'pending'
        }).toArray();

        console.log(`🔍 Found ${trades.length} pending trades for session ${sessionId}`);

        if (trades.length > 0) {
          // 5. Tối ưu hóa bulk operations
          const bulkTradesOps: any[] = [];
          const userUpdates = new Map<string, { available: number; frozen: number }>();
          let totalWins = 0;
          let totalLosses = 0;
          let totalWinAmount = 0;
          let totalLossAmount = 0;

          // Xử lý từng lệnh một cách hiệu quả
          for (const trade of trades) {
            const isWin = trade.direction === finalResult;
            const profit = isWin ? Math.floor(trade.amount * 0.9) : 0; // 90% tiền thắng (10 ăn 9)
            
            // Cập nhật trạng thái lệnh
            bulkTradesOps.push({
              updateOne: {
                filter: { _id: trade._id },
                update: {
                  $set: {
                    status: 'completed',
                    result: isWin ? 'win' : 'lose',
                    profit: profit,
                    completedAt: new Date(),
                    updatedAt: new Date()
                  }
                }
              }
            });

            // Tích lũy user balance updates
            const userId = trade.userId.toString();
            if (!userUpdates.has(userId)) {
              userUpdates.set(userId, { available: 0, frozen: 0 });
            }
            
            const userUpdate = userUpdates.get(userId)!;
            if (isWin) {
              userUpdate.available += trade.amount + profit;
              userUpdate.frozen -= trade.amount;
              totalWins++;
              totalWinAmount += trade.amount + profit;
            } else {
              userUpdate.frozen -= trade.amount;
              totalLosses++;
              totalLossAmount += trade.amount;
            }
          }

          // 6. Thực hiện bulk update trades - tối ưu hóa
          if (bulkTradesOps.length > 0) {
            await db.collection('trades').bulkWrite(bulkTradesOps, { session: dbSession });
            console.log(`✅ Updated ${bulkTradesOps.length} trades`);
          }

          // 7. Thực hiện bulk update users - tối ưu hóa
          const bulkUsersOps: any[] = [];
          userUpdates.forEach((update, userId) => {
            bulkUsersOps.push({
              updateOne: {
                filter: { _id: new ObjectId(userId) },
                update: {
                  $inc: {
                    'balance.available': update.available,
                    'balance.frozen': update.frozen
                  },
                  $set: { updatedAt: new Date() }
                }
              }
            });
          });

          if (bulkUsersOps.length > 0) {
            await db.collection('users').bulkWrite(bulkUsersOps, { session: dbSession });
            console.log(`✅ Updated ${bulkUsersOps.length} users`);
          }

          // 8. Cập nhật trạng thái phiên giao dịch
          await db.collection('trading_sessions').updateOne(
            { sessionId },
            {
              $set: {
                status: 'COMPLETED',
                actualResult: finalResult,
                totalTrades: trades.length,
                totalWins: totalWins,
                totalLosses: totalLosses,
                totalWinAmount: totalWinAmount,
                totalLossAmount: totalLossAmount,
                completedAt: new Date(),
                updatedAt: new Date()
              }
            },
            { session: dbSession }
          );
        } else {
          // Không có trades nào, chỉ cập nhật trạng thái phiên
          await db.collection('trading_sessions').updateOne(
            { sessionId },
            {
              $set: {
                status: 'COMPLETED',
                actualResult: finalResult,
                totalTrades: 0,
                totalWins: 0,
                totalLosses: 0,
                totalWinAmount: 0,
                totalLossAmount: 0,
                completedAt: new Date(),
                updatedAt: new Date()
              }
            },
            { session: dbSession }
          );
        }
      });

      await dbSession.endSession();

      // 9. Lấy thông tin phiên đã hoàn thành
      const completedSession = await db.collection('trading_sessions').findOne({ sessionId });
      const completedTrades = await db.collection('trades')
        .find({ sessionId, status: 'completed' })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray();

      return NextResponse.json({
        success: true,
        message: `Session ${sessionId} processed successfully`,
        data: {
          sessionId,
          status: 'completed',
          result: finalResult,
          session: completedSession,
          trades: completedTrades.map(trade => ({
            ...trade,
            _id: trade._id.toString(),
            userId: trade.userId.toString()
          }))
        }
      });

    } catch (error) {
      console.error(`❌ Error processing session ${sessionId}:`, error);
      return NextResponse.json({
        success: false,
        message: 'Error processing session',
        error: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    } finally {
      // ⚡ ANTI-DUPLICATE: Xóa session khỏi cache sau 5 giây thay vì ngay lập tức
      setTimeout(() => {
        processingSessions.delete(sessionId);
      }, 5000);
    }

  } catch (error) {
    console.error('❌ Error in process-result API:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 