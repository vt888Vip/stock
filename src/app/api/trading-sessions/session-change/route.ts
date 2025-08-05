import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';

// API để theo dõi sự thay đổi phiên và cập nhật trạng thái lệnh
export async function GET(request: NextRequest) {
  try {
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Không thể kết nối cơ sở dữ liệu');
    }

    const now = new Date();
    const currentMinute = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()));
    const nextMinute = new Date(currentMinute.getTime() + 60000);

    // Tạo sessionId cho phiên hiện tại
    const sessionId = `${currentMinute.getUTCFullYear()}${String(currentMinute.getUTCMonth() + 1).padStart(2, '0')}${String(currentMinute.getUTCDate()).padStart(2, '0')}${String(currentMinute.getUTCHours()).padStart(2, '0')}${String(currentMinute.getUTCMinutes()).padStart(2, '0')}`;

    // Lấy phiên hiện tại từ database
    let currentSession = await db.collection('trading_sessions').findOne({ 
      sessionId: sessionId,
      status: { $in: ['ACTIVE', 'PREDICTED'] }
    });

    // Kiểm tra xem phiên hiện tại có kết thúc chưa
    const sessionEnded = currentSession && currentSession.endTime <= now;
    const sessionChanged = sessionEnded || !currentSession;

    // Nếu phiên đã kết thúc và không có kết quả admin, gọi fix-expired để xử lý
    if (sessionEnded && (!currentSession || currentSession.createdBy !== 'admin')) {
      console.log(`⏰ Phiên ${sessionId} đã kết thúc, gọi fix-expired để xử lý`);
      try {
        const fixResponse = await fetch(`${request.nextUrl.origin}/api/trading-sessions/fix-expired`);
        if (fixResponse.ok) {
          const fixData = await fixResponse.json();
          console.log(`✅ Đã gọi fix-expired cho phiên ${sessionId}`);
        }
      } catch (error) {
        console.error(`❌ Lỗi khi gọi fix-expired cho phiên ${sessionId}:`, error);
      }
    }

    if (sessionChanged) {
      // Tạo phiên mới nếu cần
      if (!currentSession || sessionEnded) {
        const newSession = {
          sessionId,
          startTime: currentMinute,
          endTime: nextMinute,
          status: 'ACTIVE', // Bắt đầu với ACTIVE
          result: null, // Chưa có kết quả
          createdAt: now,
          updatedAt: now
        };

        // Tạo phiên mới (không xóa phiên cũ)
        await db.collection('trading_sessions').insertOne(newSession);
        currentSession = newSession as any;
      }
    }

    // Tính thời gian còn lại
    const timeLeft = Math.max(0, Math.floor((nextMinute.getTime() - now.getTime()) / 1000));

    return NextResponse.json({
      success: true,
      sessionChanged,
      currentSession: {
        sessionId: currentSession?.sessionId || sessionId,
        startTime: currentSession?.startTime || currentMinute,
        endTime: currentSession?.endTime || nextMinute,
        timeLeft,
        status: currentSession?.status || 'ACTIVE',
        result: currentSession?.result || null
      },
      serverTime: now.toISOString()
    });

  } catch (error) {
    console.error('Lỗi khi theo dõi thay đổi phiên:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
} 