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
      
      // Tạo 30 phiên giao dịch tương lai nếu chưa có (đã được tối ưu hóa)
      await createFutureSessions(db, now);

      // Lấy tất cả phiên tương lai
      const futureSessions = await db.collection('trading_sessions')
        .find({
          startTime: { $gt: now }
        })
        .sort({ startTime: 1 }) // Sắp xếp theo thời gian bắt đầu (sớm nhất trước)
        .toArray();

      // Đếm tổng số phiên tương lai (luôn là 30)
      const total = futureSessions.length;

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

        // ✅ SỬA: Chỉ đặt kết quả, KHÔNG xử lý balance
        // Cron job sẽ xử lý balance sau khi phiên kết thúc
        await db.collection('trading_sessions').updateOne(
          { sessionId },
          {
            $set: {
              result: result,
              actualResult: result,
              createdBy: 'admin', // ⚡ QUAN TRỌNG: Đánh dấu admin đặt
              updatedAt: now
            }
          }
        );

        console.log(`✅ Admin đã đặt kết quả cho phiên ${sessionId}: ${result} (Cron sẽ xử lý balance sau)`);

        return NextResponse.json({
          success: true,
          message: `Phiên ${sessionId} kết quả được đặt: ${result} (Cron sẽ xử lý balance sau)`,
          data: { 
            sessionId, 
            result, 
            status: 'ACTIVE', // Vẫn giữ ACTIVE để cron xử lý
            note: 'Cron job sẽ xử lý balance khi phiên kết thúc'
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
            
            // ✅ SỬA: Chỉ đặt kết quả, KHÔNG xử lý balance
            await db.collection('trading_sessions').updateOne(
              { sessionId },
              {
                $set: {
                  result: result,
                  actualResult: result,
                  createdBy: 'admin', // ⚡ QUAN TRỌNG: Đánh dấu admin đặt
                  updatedAt: now
                }
              }
            );

            updateResults.push({ 
              sessionId, 
              result, 
              status: 'ACTIVE',
              note: 'Cron job sẽ xử lý balance khi phiên kết thúc'
            });
          }
        }

        return NextResponse.json({
          success: true,
          message: `Đã đặt kết quả cho ${updateResults.length} phiên (Cron sẽ xử lý balance sau)`,
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
            // Generate random result (50% UP, 50% DOWN)
            const random = Math.random();
            const randomResult = random < 0.5 ? 'UP' : 'DOWN';

            const now = new Date();
            
            // ✅ SỬA: Chỉ đặt kết quả, KHÔNG xử lý balance
            await db.collection('trading_sessions').updateOne(
              { sessionId },
              {
                $set: {
                  result: randomResult,
                  actualResult: randomResult,
                  createdBy: 'admin', // ⚡ QUAN TRỌNG: Đánh dấu admin đặt
                  updatedAt: now
                }
              }
            );

            updateResults.push({ 
              sessionId, 
              result: randomResult, 
              status: 'ACTIVE',
              note: 'Cron job sẽ xử lý balance khi phiên kết thúc'
            });
          }
        }

        return NextResponse.json({
          success: true,
          message: `Đã random kết quả cho ${updateResults.length} phiên (Cron sẽ xử lý balance sau)`,
          data: { results: updateResults }
        });

      } else if (action === 'generate_future_sessions') {
        // Tạo lại 30 phiên giao dịch tương lai (đã được tối ưu hóa)
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

// Hàm tạo 30 phiên giao dịch tương lai (đã được tối ưu hóa)
async function createFutureSessions(db: any, startTime: Date) {
  const now = new Date();
  
  // Kiểm tra xem đã có bao nhiêu phiên tương lai
  const existingFutureSessions = await db.collection('trading_sessions').countDocuments({
    startTime: { $gt: now }
  });

  if (existingFutureSessions >= 30) {
    console.log(`✅ Đã có đủ ${existingFutureSessions} phiên tương lai, không cần tạo thêm`);
    return; // Đã có đủ 30 phiên tương lai
  }

  const sessionsToCreate = 30 - existingFutureSessions;
  console.log(`🆕 Tạo thêm ${sessionsToCreate} phiên để duy trì 30 phiên tương lai`);
  
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
      // Tự động tạo kết quả cho phiên tương lai (50% UP, 50% DOWN)
      const random = Math.random();
      const autoResult = random < 0.5 ? 'UP' : 'DOWN';
      
      sessions.push({
        sessionId,
        startTime: sessionStartTime,
        endTime: sessionEndTime,
        status: 'ACTIVE',
        result: autoResult, // Tự động tạo kết quả
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
    console.log(`✅ Đã tạo ${sessions.length} phiên tương lai mới`);
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