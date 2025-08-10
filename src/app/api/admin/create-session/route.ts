import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';

// API để admin tạo phiên giao dịch thủ công
export async function POST(request: NextRequest) {
  try {
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Không thể kết nối cơ sở dữ liệu');
    }

    const body = await request.json();
    const { sessionId, startTime, endTime, result } = body;

    // Validate input
    if (!sessionId || !startTime || !endTime) {
      return NextResponse.json(
        { success: false, message: 'Thiếu thông tin bắt buộc: sessionId, startTime, endTime' },
        { status: 400 }
      );
    }

    // Kiểm tra xem sessionId đã tồn tại chưa
    const existingSession = await db.collection('trading_sessions').findOne({ sessionId });
    if (existingSession) {
      return NextResponse.json(
        { success: false, message: `Phiên ${sessionId} đã tồn tại` },
        { status: 400 }
      );
    }

    const now = new Date();
    const newSession = {
      sessionId,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      status: 'ACTIVE',
      result: result || null,
      createdBy: 'admin',
      createdAt: now,
      updatedAt: now
    };

    await db.collection('trading_sessions').insertOne(newSession);

    return NextResponse.json({
      success: true,
      message: `Đã tạo phiên ${sessionId} thành công`,
      session: newSession
    });

  } catch (error) {
    console.error('Lỗi khi tạo phiên:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
}

// API để lấy danh sách phiên gần đây
export async function GET(request: NextRequest) {
  try {
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Không thể kết nối cơ sở dữ liệu');
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status');

    let query: any = {};
    if (status) {
      query.status = status;
    }

    const sessions = await db.collection('trading_sessions')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      success: true,
      sessions
    });

  } catch (error) {
    console.error('Lỗi khi lấy danh sách phiên:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
}

