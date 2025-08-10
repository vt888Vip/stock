import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { NextRequest } from 'next/server';

// API để dọn dẹp phiên cũ và tối ưu hóa database
export async function POST(request: NextRequest) {
  try {
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Không thể kết nối cơ sở dữ liệu');
    }

    const body = await request.json();
    const { daysToKeep = 30, dryRun = false } = body;

    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (daysToKeep * 24 * 60 * 60 * 1000));

    console.log(`🧹 Bắt đầu dọn dẹp phiên cũ hơn ${daysToKeep} ngày (trước ${cutoffDate.toISOString()})`);

    // Tìm các phiên cũ để xóa
    const oldSessions = await db.collection('trading_sessions').find({
      createdAt: { $lt: cutoffDate },
      status: { $in: ['COMPLETED', 'CANCELLED'] }
    }).toArray();

    console.log(`📊 Tìm thấy ${oldSessions.length} phiên cũ để xóa`);

    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `Dry run: Sẽ xóa ${oldSessions.length} phiên cũ`,
        sessionsToDelete: oldSessions.length,
        cutoffDate: cutoffDate.toISOString()
      });
    }

    // Xóa các phiên cũ
    const deleteResult = await db.collection('trading_sessions').deleteMany({
      createdAt: { $lt: cutoffDate },
      status: { $in: ['COMPLETED', 'CANCELLED'] }
    });

    console.log(`✅ Đã xóa ${deleteResult.deletedCount} phiên cũ`);

    // Tối ưu hóa collection
    await db.collection('trading_sessions').createIndex({ createdAt: -1 });
    await db.collection('trading_sessions').createIndex({ status: 1, createdAt: -1 });

    // Thống kê sau khi dọn dẹp
    const totalSessions = await db.collection('trading_sessions').countDocuments();
    const activeSessions = await db.collection('trading_sessions').countDocuments({ status: 'ACTIVE' });
    const completedSessions = await db.collection('trading_sessions').countDocuments({ status: 'COMPLETED' });

    return NextResponse.json({
      success: true,
      message: `Dọn dẹp hoàn thành: Đã xóa ${deleteResult.deletedCount} phiên cũ`,
      stats: {
        deletedCount: deleteResult.deletedCount,
        totalSessions,
        activeSessions,
        completedSessions,
        cutoffDate: cutoffDate.toISOString()
      }
    });

  } catch (error) {
    console.error('Lỗi khi dọn dẹp phiên:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
}

// API để xem thống kê phiên
export async function GET(request: NextRequest) {
  try {
    const db = await getMongoDb();
    if (!db) {
      throw new Error('Không thể kết nối cơ sở dữ liệu');
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '7');

    const now = new Date();
    const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

    // Thống kê tổng quan
    const totalSessions = await db.collection('trading_sessions').countDocuments();
    const activeSessions = await db.collection('trading_sessions').countDocuments({ status: 'ACTIVE' });
    const completedSessions = await db.collection('trading_sessions').countDocuments({ status: 'COMPLETED' });

    // Thống kê theo ngày
    const sessionsByDay = await db.collection('trading_sessions').aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt"
            }
          },
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] }
          },
          completedCount: {
            $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] }
          }
        }
      },
      {
        $sort: { _id: -1 }
      }
    ]).toArray();

    // Phiên cũ nhất và mới nhất
    const oldestSession = await db.collection('trading_sessions')
      .find({})
      .sort({ createdAt: 1 })
      .limit(1)
      .toArray();

    const newestSession = await db.collection('trading_sessions')
      .find({})
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    return NextResponse.json({
      success: true,
      stats: {
        totalSessions,
        activeSessions,
        completedSessions,
        sessionsByDay,
        oldestSession: oldestSession[0] || null,
        newestSession: newestSession[0] || null,
        period: `${days} ngày gần đây`
      }
    });

  } catch (error) {
    console.error('Lỗi khi lấy thống kê phiên:', error);
    return NextResponse.json(
      { success: false, message: 'Lỗi máy chủ nội bộ' },
      { status: 500 }
    );
  }
}

