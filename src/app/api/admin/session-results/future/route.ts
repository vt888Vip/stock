import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-utils';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  return requireAdmin(request, async (req: NextRequest, user: any) => {
    try {
      const { searchParams } = new URL(request.url);
      const page = parseInt(searchParams.get('page') || '1');
      const limit = parseInt(searchParams.get('limit') || '30');
      const skip = (page - 1) * limit;

      const db = await getMongoDb();
      if (!db) {
        throw new Error('Could not connect to database');
      }

      const now = new Date();
      
      // Tạo 30 phiên giao dịch tương lai nếu chưa có
      await createFutureSessions(db, now);

      // Lấy danh sách phiên tương lai (chưa bắt đầu)
      const futureSessions = await db.collection('trading_sessions')
        .find({
          startTime: { $gt: now },
          status: { $in: ['ACTIVE', 'PREDICTED'] }
        })
        .sort({ startTime: 1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      // Đếm tổng số phiên tương lai
      const total = await db.collection('trading_sessions').countDocuments({
        startTime: { $gt: now },
        status: { $in: ['ACTIVE', 'PREDICTED'] }
      });

      // Format sessions for frontend
      const formattedSessions = futureSessions.map(session => ({
        _id: session._id,
        sessionId: session.sessionId,
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status,
        result: session.result,
        createdBy: session.createdBy || 'system',
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }));

      return NextResponse.json({
        success: true,
        data: {
          sessions: formattedSessions,
          pagination: {
            total,
            page,
            totalPages: Math.ceil(total / limit),
            limit
          }
        }
      });

    } catch (error) {
      console.error('Error fetching future sessions:', error);
      return NextResponse.json(
        { success: false, message: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return requireAdmin(request, async (req: NextRequest, user: any) => {
    try {
      const body = await request.json();
      const { action, sessionId, result, sessionIds, results } = body;

      const db = await getMongoDb();
      if (!db) {
        throw new Error('Could not connect to database');
      }

      if (action === 'set_future_result') {
        // Đặt kết quả cho một phiên tương lai
        if (!sessionId || !result) {
          return NextResponse.json(
            { success: false, message: 'Session ID and result are required' },
            { status: 400 }
          );
        }

        if (!['UP', 'DOWN'].includes(result)) {
          return NextResponse.json(
            { success: false, message: 'Result must be UP or DOWN' },
            { status: 400 }
          );
        }

        const session = await db.collection('trading_sessions').findOne({ sessionId });
        if (!session) {
          return NextResponse.json(
            { success: false, message: 'Session not found' },
            { status: 404 }
          );
        }

        const now = new Date();
        console.log(`👑 Admin đặt kết quả cho phiên ${sessionId}: ${result}`);

        // Tìm tất cả lệnh của phiên này
        const pendingTrades = await db.collection('trades').find({
          sessionId: sessionId,
          status: 'pending'
        }).toArray();

        console.log(`📋 Tìm thấy ${pendingTrades.length} lệnh cần xử lý`);

        let totalWins = 0;
        let totalLosses = 0;
        let totalWinAmount = 0;
        let totalLossAmount = 0;

        // Xử lý từng lệnh ngay lập tức
        for (const trade of pendingTrades) {
          const isWin = trade.direction === result;
          const profit = isWin ? Math.floor(trade.amount * 0.9) : 0; // Thắng được 90%

          // Cập nhật lệnh
          await db.collection('trades').updateOne(
            { _id: trade._id },
            { 
              $set: { 
                status: 'completed', 
                result: isWin ? 'win' : 'lose', 
                profit: profit,
                updatedAt: now
              }
            }
          );

          // Cập nhật số dư user
          if (isWin) {
            // Thắng: trả lại tiền cược + lợi nhuận
            await db.collection('users').updateOne(
              { _id: new ObjectId(trade.userId) },
              { 
                $inc: { 
                  'balance.available': profit + trade.amount,
                  'balance.frozen': -trade.amount 
                },
                $set: { updatedAt: now }
              }
            );
            totalWins++;
            totalWinAmount += profit + trade.amount;
            console.log(`💰 User ${trade.userId} thắng: +${profit + trade.amount} VND`);
          } else {
            // Thua: chỉ trừ tiền cược (đã bị đóng băng)
            await db.collection('users').updateOne(
              { _id: new ObjectId(trade.userId) },
              { 
                $inc: { 'balance.frozen': -trade.amount },
                $set: { updatedAt: now }
              }
            );
            totalLosses++;
            totalLossAmount += trade.amount;
            console.log(`💸 User ${trade.userId} thua: -${trade.amount} VND`);
          }
        }

        // Cập nhật phiên thành COMPLETED ngay lập tức
        await db.collection('trading_sessions').updateOne(
          { sessionId },
          {
            $set: {
              result: result,
              status: 'COMPLETED', // Đặt trực tiếp thành COMPLETED
              actualResult: result,
              createdBy: 'admin',
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

        console.log(`✅ Hoàn thành xử lý kết quả admin cho phiên ${sessionId}: ${totalWins} thắng, ${totalLosses} thua`);

        return NextResponse.json({
          success: true,
          message: `Phiên ${sessionId} kết quả được đặt: ${result} (${totalWins} thắng, ${totalLosses} thua)`,
          data: { 
            sessionId, 
            result, 
            status: 'COMPLETED',
            totalTrades: pendingTrades.length,
            totalWins,
            totalLosses
          }
        });

      } else if (action === 'bulk_set_future_results') {
        // Đặt kết quả hàng loạt cho nhiều phiên tương lai
        if (!sessionIds || !Array.isArray(sessionIds) || !results || !Array.isArray(results)) {
          return NextResponse.json(
            { success: false, message: 'Session IDs and results arrays are required' },
            { status: 400 }
          );
        }

        if (sessionIds.length !== results.length) {
          return NextResponse.json(
            { success: false, message: 'Session IDs and results arrays must have the same length' },
            { status: 400 }
          );
        }

        const updateResults = [];
        for (let i = 0; i < sessionIds.length; i++) {
          const sessionId = sessionIds[i];
          const result = results[i];

          if (!['UP', 'DOWN'].includes(result)) {
            continue; // Skip invalid results
          }

          const session = await db.collection('trading_sessions').findOne({ sessionId });
          if (session) {
            const now = new Date();
            
            // Tìm và xử lý tất cả lệnh của phiên này
            const pendingTrades = await db.collection('trades').find({
              sessionId: sessionId,
              status: 'pending'
            }).toArray();

            let totalWins = 0;
            let totalLosses = 0;
            let totalWinAmount = 0;
            let totalLossAmount = 0;

            // Xử lý từng lệnh
            for (const trade of pendingTrades) {
              const isWin = trade.direction === result;
              const profit = isWin ? Math.floor(trade.amount * 0.9) : 0;

              // Cập nhật lệnh
              await db.collection('trades').updateOne(
                { _id: trade._id },
                { 
                  $set: { 
                    status: 'completed', 
                    result: isWin ? 'win' : 'lose', 
                    profit: profit,
                    updatedAt: now
                  }
                }
              );

              // Cập nhật số dư user
              if (isWin) {
                await db.collection('users').updateOne(
                  { _id: new ObjectId(trade.userId) },
                  { 
                    $inc: { 
                      'balance.available': profit + trade.amount,
                      'balance.frozen': -trade.amount 
                    },
                    $set: { updatedAt: now }
                  }
                );
                totalWins++;
                totalWinAmount += profit + trade.amount;
              } else {
                await db.collection('users').updateOne(
                  { _id: new ObjectId(trade.userId) },
                  { 
                    $inc: { 'balance.frozen': -trade.amount },
                    $set: { updatedAt: now }
                  }
                );
                totalLosses++;
                totalLossAmount += trade.amount;
              }
            }

            // Cập nhật phiên thành COMPLETED
            await db.collection('trading_sessions').updateOne(
              { sessionId },
              {
                $set: {
                  result: result,
                  status: 'COMPLETED',
                  actualResult: result,
                  createdBy: 'admin',
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

            updateResults.push({ 
              sessionId, 
              result, 
              totalTrades: pendingTrades.length,
              totalWins,
              totalLosses
            });
          }
        }

        return NextResponse.json({
          success: true,
          message: `Đã đặt kết quả cho ${updateResults.length} phiên`,
          data: { results: updateResults }
        });

      } else if (action === 'bulk_random_results') {
        // Random kết quả hàng loạt cho nhiều phiên tương lai
        if (!sessionIds || !Array.isArray(sessionIds)) {
          return NextResponse.json(
            { success: false, message: 'Session IDs array is required' },
            { status: 400 }
          );
        }

        const updateResults = [];
        for (const sessionId of sessionIds) {
          const session = await db.collection('trading_sessions').findOne({ sessionId });
          if (session && session.status === 'ACTIVE') {
            // Generate random result (60% UP, 40% DOWN)
            const random = Math.random();
            const randomResult = random < 0.6 ? 'UP' : 'DOWN';

            const now = new Date();
            
            // Tìm và xử lý tất cả lệnh của phiên này
            const pendingTrades = await db.collection('trades').find({
              sessionId: sessionId,
              status: 'pending'
            }).toArray();

            let totalWins = 0;
            let totalLosses = 0;
            let totalWinAmount = 0;
            let totalLossAmount = 0;

            // Xử lý từng lệnh
            for (const trade of pendingTrades) {
              const isWin = trade.direction === randomResult;
              const profit = isWin ? Math.floor(trade.amount * 0.9) : 0;

              // Cập nhật lệnh
              await db.collection('trades').updateOne(
                { _id: trade._id },
                { 
                  $set: { 
                    status: 'completed', 
                    result: isWin ? 'win' : 'lose', 
                    profit: profit,
                    updatedAt: now
                  }
                }
              );

              // Cập nhật số dư user
              if (isWin) {
                await db.collection('users').updateOne(
                  { _id: new ObjectId(trade.userId) },
                  { 
                    $inc: { 
                      'balance.available': profit + trade.amount,
                      'balance.frozen': -trade.amount 
                    },
                    $set: { updatedAt: now }
                  }
                );
                totalWins++;
                totalWinAmount += profit + trade.amount;
              } else {
                await db.collection('users').updateOne(
                  { _id: new ObjectId(trade.userId) },
                  { 
                    $inc: { 'balance.frozen': -trade.amount },
                    $set: { updatedAt: now }
                  }
                );
                totalLosses++;
                totalLossAmount += trade.amount;
              }
            }

            // Cập nhật phiên thành COMPLETED
            await db.collection('trading_sessions').updateOne(
              { sessionId },
              {
                $set: {
                  result: randomResult,
                  status: 'COMPLETED',
                  actualResult: randomResult,
                  createdBy: 'admin',
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

            updateResults.push({ 
              sessionId, 
              result: randomResult, 
              totalTrades: pendingTrades.length,
              totalWins,
              totalLosses
            });
          }
        }

        return NextResponse.json({
          success: true,
          message: `Đã random kết quả cho ${updateResults.length} phiên`,
          data: { results: updateResults }
        });

      } else if (action === 'generate_future_sessions') {
        // Tạo lại 30 phiên giao dịch tương lai
        const now = new Date();
        await createFutureSessions(db, now);

        return NextResponse.json({
          success: true,
          message: 'Đã tạo 30 phiên giao dịch tương lai',
          data: { count: 30 }
        });

      } else {
        return NextResponse.json(
          { success: false, message: 'Invalid action' },
          { status: 400 }
        );
      }

    } catch (error) {
      console.error('Error setting future results:', error);
      return NextResponse.json(
        { success: false, message: 'Internal server error' },
        { status: 500 }
      );
    }
  });
}

// Hàm tạo 30 phiên giao dịch tương lai
async function createFutureSessions(db: any, startTime: Date) {
  const now = new Date();
  
  // Kiểm tra xem đã có bao nhiêu phiên tương lai
  const existingFutureSessions = await db.collection('trading_sessions').countDocuments({
    startTime: { $gt: now }
  });

  if (existingFutureSessions >= 30) {
    return; // Đã có đủ 30 phiên tương lai
  }

  const sessionsToCreate = 30 - existingFutureSessions;
  const sessions = [];

  let createdCount = 0;
  let i = 0;
  while (createdCount < sessionsToCreate && i < 100) { // tránh vòng lặp vô hạn
    const sessionStartTime = new Date(startTime.getTime() + (i + 1) * 60000); // Mỗi phiên cách nhau 1 phút
    const sessionEndTime = new Date(sessionStartTime.getTime() + 60000); // Phiên kéo dài 1 phút
    const sessionId = generateSessionId(sessionStartTime);

    // Kiểm tra sessionId đã tồn tại chưa
    const exists = await db.collection('trading_sessions').findOne({ sessionId });
    if (!exists) {
      sessions.push({
        sessionId,
        startTime: sessionStartTime,
        endTime: sessionEndTime,
        status: 'ACTIVE',
        result: null,
        createdBy: 'system',
        createdAt: now,
        updatedAt: now
      });
      createdCount++;
    }
    i++;
  }

  if (sessions.length > 0) {
    await db.collection('trading_sessions').insertMany(sessions);
    console.log(`Created ${sessions.length} future sessions`);
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