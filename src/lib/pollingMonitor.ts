/**
 * Utility để monitor và tối ưu polling performance
 */

interface PollingStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastRequestTime: number;
}

class PollingMonitor {
  private stats: PollingStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    lastRequestTime: 0
  };

  private startTime: number = Date.now();

  /**
   * Log một request
   */
  logRequest(success: boolean, responseTime: number) {
    this.stats.totalRequests++;
    this.stats.lastRequestTime = Date.now();
    
    if (success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }

    // Tính average response time
    const totalTime = this.stats.averageResponseTime * (this.stats.totalRequests - 1) + responseTime;
    this.stats.averageResponseTime = totalTime / this.stats.totalRequests;

    // Log performance warning nếu cần
    this.checkPerformance();
  }

  /**
   * Kiểm tra performance và đưa ra cảnh báo
   */
  private checkPerformance() {
    const successRate = this.stats.successfulRequests / this.stats.totalRequests;
    const requestsPerMinute = this.stats.totalRequests / ((Date.now() - this.startTime) / 60000);

    if (successRate < 0.9) {
      console.warn('⚠️ Polling success rate thấp:', (successRate * 100).toFixed(1) + '%');
    }

    if (requestsPerMinute > 30) {
      console.warn('⚠️ Polling quá nhiều:', requestsPerMinute.toFixed(1) + ' requests/phút');
    }

    if (this.stats.averageResponseTime > 2000) {
      console.warn('⚠️ Response time cao:', this.stats.averageResponseTime.toFixed(0) + 'ms');
    }
  }

  /**
   * Lấy thống kê polling
   */
  getStats(): PollingStats {
    return { ...this.stats };
  }

  /**
   * Reset thống kê
   */
  reset() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: 0
    };
    this.startTime = Date.now();
  }

  /**
   * Log summary
   */
  logSummary() {
    const uptime = (Date.now() - this.startTime) / 1000;
    const successRate = this.stats.successfulRequests / this.stats.totalRequests;
    const requestsPerMinute = this.stats.totalRequests / (uptime / 60);

    console.log('📊 Polling Performance Summary:');
    console.log(`   Uptime: ${uptime.toFixed(0)}s`);
    console.log(`   Total Requests: ${this.stats.totalRequests}`);
    console.log(`   Success Rate: ${(successRate * 100).toFixed(1)}%`);
    console.log(`   Requests/min: ${requestsPerMinute.toFixed(1)}`);
    console.log(`   Avg Response Time: ${this.stats.averageResponseTime.toFixed(0)}ms`);
  }
}

// Singleton instance
export const pollingMonitor = new PollingMonitor();

/**
 * Hook để wrap API calls với monitoring
 */
export const withPollingMonitor = async <T>(
  apiCall: () => Promise<T>,
  endpoint: string
): Promise<T> => {
  const startTime = Date.now();
  
  try {
    const result = await apiCall();
    const responseTime = Date.now() - startTime;
    
    pollingMonitor.logRequest(true, responseTime);
    console.log(`✅ ${endpoint}: ${responseTime}ms`);
    
    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    pollingMonitor.logRequest(false, responseTime);
    console.error(`❌ ${endpoint}: ${responseTime}ms`, error);
    
    throw error;
  }
};

/**
 * Utility để tính toán polling interval tối ưu
 */
export const calculateOptimalInterval = (
  timeLeft: number,
  hasPendingTrades: boolean,
  isSessionEnding: boolean
): number => {
  // Khi timer = 0 và có lệnh pending
  if (timeLeft === 0 && hasPendingTrades) {
    return 1000; // Poll mỗi giây
  }
  
  // Khi gần kết thúc phiên
  if (timeLeft <= 5) {
    return 1000; // Poll mỗi giây
  }
  
  // Khi còn ít thời gian
  if (timeLeft <= 30) {
    return 3000; // Poll mỗi 3 giây
  }
  
  // Khi còn nhiều thời gian
  return 10000; // Poll mỗi 10 giây
};

/**
 * Utility để kiểm tra xem có nên poll hay không
 */
export const shouldPoll = (
  timeLeft: number,
  hasPendingTrades: boolean,
  isTabActive: boolean = true
): boolean => {
  // Không poll khi tab không active
  if (!isTabActive) {
    return false;
  }
  
  // Luôn poll khi có lệnh pending và timer = 0
  if (timeLeft === 0 && hasPendingTrades) {
    return true;
  }
  
  // Poll khi gần kết thúc phiên
  if (timeLeft <= 5) {
    return true;
  }
  
  // Poll định kỳ
  return true;
};
