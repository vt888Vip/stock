/**
 * Tạo sessionId dựa trên thời gian hiện tại
 * Định dạng: YYMMDDHHmm (Ví dụ: 2507111927 cho 19:27 ngày 11/07/2025)
 */
export const generateSessionId = (date: Date = new Date()): string => {
  // Chuyển đổi sang múi giờ Việt Nam (UTC+7)
  const options: Intl.DateTimeFormatOptions = { 
    timeZone: 'Asia/Ho_Chi_Minh',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(date);
  
  // Lấy các thành phần thời gian
  const year = parts.find(part => part.type === 'year')?.value || '';
  const month = parts.find(part => part.type === 'month')?.value || '';
  const day = parts.find(part => part.type === 'day')?.value || '';
  const hour = parts.find(part => part.type === 'hour')?.value || '';
  const minute = parts.find(part => part.type === 'minute')?.value || '';

  // Đảm bảo đủ 2 chữ số cho tất cả các thành phần
  const pad = (num: string) => num.padStart(2, '0');
  
  // Format: YYMMDDHHmm (ví dụ: 2507111927)
  return `${year}${pad(month)}${pad(day)}${pad(hour)}${pad(minute)}`;
};

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
