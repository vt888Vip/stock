"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { useToast } from "@/components/ui/use-toast";
import { generateSessionId } from '@/lib/sessionUtils';
import { Loader2, AlertCircle, RefreshCw, ArrowDown, ArrowUp, ChevronDown, Plus, Minus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import RightColumn from './RightColumn';
import TradeHistory from './TradeHistory';
import LiquidityTable from '@/components/LiquidityTable';
import TradingViewTickerTape from '@/components/TradingViewTickerTape';
import TradingViewAdvancedChart from '@/components/TradingViewAdvancedChart';
import SymbolSelector from '@/components/SymbolSelector';

// Types
export interface TradeHistoryRecord {
  id: string;
  sessionId: string;
  direction: "UP" | "DOWN";
  amount: number;
  status: "success" | "completed" | "pending";
  result: "win" | "lose" | null;
  profit: number;
  createdAt: string;
}

interface TradeResult {
  status: "idle" | "win" | "lose";
  direction?: "UP" | "DOWN";
  profit?: number;
  amount?: number;
}

const QUICK_AMOUNTS = [100000, 1000000, 5000000, 10000000, 30000000, 50000000, 100000000, 200000000];
const SESSION_DURATION = 60; // 60 seconds per session
const RESULT_DELAY = 5; // 5 seconds delay for result

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const formatAmount = (value: string): string => {
  const num = parseFloat(value);
  return isNaN(num) ? '' : num.toLocaleString('vi-VN');
};

// Hàm sync balance - chỉ sync khi tất cả trades đã hoàn thành
async function syncBalance(setBalance: React.Dispatch<React.SetStateAction<number>>, setIsSyncing: React.Dispatch<React.SetStateAction<boolean>>, waitForPending = true) {
  let tries = 0;
  setIsSyncing(true);
  
  while (tries < 10) { // Tăng số lần thử lên 10
    try {
      const url = waitForPending 
        ? '/api/user/balance/sync?waitForPending=true'
        : '/api/user/balance/sync';
        
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      const data = await res.json();
      
      if (data.success) {
        setBalance(data.balance.available);
        break;
      } else if (res.status === 202) {
        // Còn trades pending, chờ thêm
        await new Promise(r => setTimeout(r, 2000)); // Chờ 2 giây
        tries++;
      } else {
        tries++;
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (error) {
      console.error('❌ Error syncing balance:', error);
      tries++;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  setIsSyncing(false);
}

export default function TradePage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [tradeHistory, setTradeHistory] = useState<TradeHistoryRecord[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(SESSION_DURATION);
  const [amount, setAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedAction, setSelectedAction] = useState<"UP" | "DOWN" | null>(null);
  const [tradeResult, setTradeResult] = useState<TradeResult>({ status: "idle" });

  const [sessionStatus, setSessionStatus] = useState<'ACTIVE' | 'PREDICTED' | 'COMPLETED'>('ACTIVE');
  const [chartSymbol, setChartSymbol] = useState('TVC:GOLD');
  const [isSyncingBalance, setIsSyncingBalance] = useState(false);

  // Thêm state cho ngày và giờ hiện tại
  const [currentDate, setCurrentDate] = useState('');
  const [currentTime, setCurrentTime] = useState('');

  // Thêm state cho countdown cập nhật sau 12 giây
  const [updateCountdown, setUpdateCountdown] = useState<number | null>(null);
  const [countdownStarted, setCountdownStarted] = useState(false);
  const [isBalanceLocked, setIsBalanceLocked] = useState(false);

  // Load user balance and current session
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/login');
      toast({ variant: 'destructive', title: 'Vui lòng đăng nhập để sử dụng tính năng này' });
      return;
    }

    const loadUserData = async () => {
      try {
        // Lấy phiên giao dịch hiện tại
        const sessionResponse = await fetch('/api/trading-sessions');
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          if (sessionData.success) {
            setCurrentSessionId(sessionData.currentSession.sessionId);
            setTimeLeft(sessionData.currentSession.timeLeft);
          }
        }

        // Lấy lịch sử giao dịch từ database
        const tradeHistoryResponse = await fetch('/api/trades/history', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        });

        if (tradeHistoryResponse.ok) {
          const tradeHistoryData = await tradeHistoryResponse.json();
          if (tradeHistoryData.trades && tradeHistoryData.trades.length > 0) {
            // Chuyển đổi dữ liệu từ database sang format của component
            const formattedTrades: TradeHistoryRecord[] = tradeHistoryData.trades.map((trade: any) => ({
              id: trade._id || trade._id.toString(),
              sessionId: trade.sessionId,
              direction: trade.direction,
              amount: trade.amount,
              status: trade.status || 'pending',
              result: trade.result,
              profit: trade.profit || 0,
              createdAt: trade.createdAt || new Date().toISOString(),
            }));

            setTradeHistory(formattedTrades);
          }
        }

        setIsLoading(false);
      } catch (error) {
        setError('Không thể tải dữ liệu. Vui lòng thử lại.');
        setIsLoading(false);
      }
    };

    if (user) {
      loadUserData();
    }
  }, [authLoading, user, router, toast]);

  // Load balance ban đầu khi component mount lần đầu tiên
  useEffect(() => {
    if (!authLoading && user && updateCountdown === null && !isBalanceLocked) {
      const loadInitialBalance = async () => {
        try {
          const balanceResponse = await fetch('/api/user/balance', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
          });
          
          if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json();
            if (balanceData.success) {
              setBalance(balanceData.balance.available);
            }
          }
        } catch (error) {
          console.error('Lỗi khi load balance ban đầu:', error);
        }
      };

      loadInitialBalance();
    }
  }, [authLoading, user, updateCountdown, isBalanceLocked]);

  // Update session and time left
  useEffect(() => {
    const updateSession = async () => {
      try {
        // Sử dụng API session-change để theo dõi thay đổi phiên
        const sessionResponse = await fetch('/api/trading-sessions/session-change');
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          if (sessionData.success) {
            const newSessionId = sessionData.currentSession.sessionId;
            const newTimeLeft = sessionData.currentSession.timeLeft;
            const sessionChanged = sessionData.sessionChanged;
            
            // Cập nhật timeLeft
            setTimeLeft(newTimeLeft);
            
            // Nếu phiên thay đổi, cập nhật sessionId và reset các trạng thái
            if (sessionChanged || newSessionId !== currentSessionId) {
              setCurrentSessionId(newSessionId);
              
              // Reset các trạng thái liên quan khi session mới bắt đầu
              setTradeResult({ status: 'idle' });
              
              // KHÔNG reset countdown khi session thay đổi
              // Countdown sẽ được quản lý riêng biệt
              
              // KHÔNG cập nhật lịch sử giao dịch ngay lập tức khi session thay đổi
              // Lịch sử giao dịch sẽ được cập nhật sau 12 giây khi phiên kết thúc
            }
            
            setSessionStatus(sessionData.currentSession.status);
          }
        }
      } catch (error) {
        console.error('Lỗi khi cập nhật phiên:', error);
      }
    };
    
    // Update immediately
    updateSession();
    
    // Then check every 2 seconds for session changes
    const sessionInterval = setInterval(updateSession, 2000);
    
    return () => clearInterval(sessionInterval);
  }, [currentSessionId]);

  // Local timer for countdown
  useEffect(() => {
    if (timeLeft <= 0) {
      return;
    }
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [timeLeft]);

  // Force update session when timeLeft reaches 0
  useEffect(() => {
    if (timeLeft === 0 && !countdownStarted) {  
      // Đánh dấu countdown đã bắt đầu để tránh bắt đầu lại
      setCountdownStarted(true);
      
      // Lock balance để tránh cập nhật trong quá trình countdown
      setIsBalanceLocked(true);
      
      // Bắt đầu countdown 12 giây
      setUpdateCountdown(12);
      
      // Hàm cập nhật sau 12 giây
      const updateAfterDelay = async () => {
        try {
          // Cập nhật lịch sử giao dịch
          const tradeHistoryResponse = await fetch('/api/trades/history', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
          });

          if (tradeHistoryResponse.ok) {
            const tradeHistoryData = await tradeHistoryResponse.json();
            if (tradeHistoryData.trades && tradeHistoryData.trades.length > 0) {
              const formattedTrades: TradeHistoryRecord[] = tradeHistoryData.trades.map((trade: any) => ({
                id: trade._id || trade._id.toString(),
                sessionId: trade.sessionId,
                direction: trade.direction,
                amount: trade.amount,
                status: trade.status || 'pending',
                result: trade.result,
                profit: trade.profit || 0,
                createdAt: trade.createdAt || new Date().toISOString(),
              }));

              setTradeHistory(formattedTrades);
            }
          }

          // Sync balance
          await syncBalance(setBalance, setIsSyncingBalance, true);
        } catch (error) {
          console.error('Lỗi khi cập nhật sau 12 giây:', error);
        } finally {
          setUpdateCountdown(null);
          setCountdownStarted(false); // Reset để có thể bắt đầu countdown mới
          setIsBalanceLocked(false); // Unlock balance sau khi sync xong
        }
      };

      // Chờ 12 giây rồi cập nhật
      setTimeout(updateAfterDelay, 12000);

      // Trigger session update by calling the API again
      const forceUpdateSession = async () => {
        try {
          const sessionResponse = await fetch('/api/trading-sessions/session-change');
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            if (sessionData.success) {
              const newSessionId = sessionData.currentSession.sessionId;
              const newTimeLeft = sessionData.currentSession.timeLeft;
              
              setCurrentSessionId(newSessionId);
              setTimeLeft(newTimeLeft);
              
              // Reset trade result
              setTradeResult({ status: 'idle' });
              
              // KHÔNG reset countdown khi force update session
              // Countdown sẽ tiếp tục chạy cho đến khi hoàn thành
            }
          }
        } catch (error) {
          console.error('Lỗi khi force update session:', error);
        }
      };
      
      // Delay a bit to ensure backend has processed the session change
      setTimeout(forceUpdateSession, 1000);
    }
  }, [timeLeft, currentSessionId, toast, countdownStarted]);

  // Track which trades have been processed to prevent duplicate updates
  const processedTradesRef = useRef<Set<string>>(new Set());

  // Reset countdownStarted và isBalanceLocked khi session mới bắt đầu
  useEffect(() => {
    if (timeLeft > 0 && countdownStarted) {
      setCountdownStarted(false);
    }
    if (timeLeft > 0 && isBalanceLocked) {
      setIsBalanceLocked(false);
    }
  }, [timeLeft, countdownStarted, isBalanceLocked]);

  // Quản lý countdown cập nhật
  useEffect(() => {
    if (updateCountdown === null || updateCountdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setUpdateCountdown(prev => {
        if (prev === null || prev <= 1) {
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [updateCountdown]);

  // XOÁ useEffect này vì không cần polling trade history nữa
  // Trade history sẽ chỉ được cập nhật sau 12 giây khi phiên kết thúc
  // useEffect(() => {
  //   const updateTradeHistory = async () => {
  //     try {
  //       const tradeHistoryResponse = await fetch('/api/trades/history', {
  //         headers: {
  //           'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  //         }
  //       });

  //       if (tradeHistoryResponse.ok) {
  //         const tradeHistoryData = await tradeHistoryResponse.json();
  //         if (tradeHistoryData.trades && tradeHistoryData.trades.length > 0) {
  //           const formattedTrades: TradeHistoryRecord[] = tradeHistoryData.trades.map((trade: any) => ({
  //             id: trade._id || trade._id.toString(),
  //             sessionId: trade.sessionId,
  //             direction: trade.direction,
  //             amount: trade.amount,
  //             status: trade.status || 'pending',
  //             result: trade.result,
  //             profit: trade.profit || 0,
  //             createdAt: trade.createdAt || new Date().toISOString(),
  //           }));

  //           setTradeHistory(formattedTrades);

  //           let hasNewCompletedTrade = false;
  //           for (const trade of formattedTrades) {
  //             if (
  //               trade.status === 'completed' &&
  //               trade.result &&
  //               !processedTradesRef.current.has(trade.id)
  //             ) {
  //               processedTradesRef.current.add(trade.id);
  //               hasNewCompletedTrade = true;
  //               // ĐÃ XOÁ: Không hiện toast hoặc Dialog thắng/thua nữa
  //               // Không setTradeResult, không toast win/lose
  //             }
  //           }
  //           if (hasNewCompletedTrade) {
  //             await syncBalance(setBalance, setIsSyncingBalance, true); // Chờ tất cả pending trades hoàn thành
  //           }
  //         }
  //       }
  //     } catch (error) {
  //       console.error('Error updating trade history:', error);
  //     }
  //   };

  //   // Chỉ cập nhật khi phiên kết thúc và sau 12 giây
  //   // Không còn polling mỗi 3 giây nữa
  //   // updateTradeHistory sẽ được gọi từ updateAfterDelay khi phiên kết thúc
  // }, [currentSessionId, toast]);

  // Cập nhật ngày và giờ chỉ ở client
  useEffect(() => {
    const updateDateTime = () => {
      setCurrentDate(new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }));
      setCurrentTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    
    // Chỉ cập nhật khi component đã mount (tránh hydration mismatch)
    if (typeof window !== 'undefined') {
      updateDateTime();
      const interval = setInterval(updateDateTime, 1000);
      return () => clearInterval(interval);
    }
  }, []);

  // Cập nhật symbol biểu đồ mặc định
  useEffect(() => {
    setChartSymbol('TVC:GOLD');
  }, []);

  // Handle amount changes
  const addAmount = useCallback((value: number) => {
    setAmount(prev => {
      const current = parseFloat(prev) || 0;
      if (value < 0) return '0'; // Nhấn dấu trừ thì về 0 luôn
      const newAmount = current + value;
      return newAmount.toString();
    });
  }, []);

  // Handle trade action
  const handleAction = useCallback((direction: "UP" | "DOWN") => {
    const amountValue = parseFloat(amount);
    if (!amount || isNaN(amountValue) || amountValue < 100000) {
      toast({
        title: 'Lỗi',
        description: 'Số tiền phải lớn hơn hoặc bằng 100,000 VND',
        variant: 'destructive',
      });
      return;
    }
    if (amountValue > balance) {
      toast({
        title: 'Lỗi',
        description: 'Số dư không đủ để đặt lệnh',
        variant: 'destructive',
      });
      return;
    }
    setSelectedAction(direction);
    setIsConfirming(true);
  }, [amount, balance, toast]);

  // Handle deposit button click
  const handleDeposit = useCallback(() => {
    router.push('/deposit');
  }, [router]);

  // Confirm trade
  const confirmTrade = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    // Kiểm tra xem có đang trong quá trình loading không
    if (isLoading) {
      toast({
        title: 'Đang tải dữ liệu',
        description: 'Vui lòng đợi hệ thống tải xong dữ liệu',
        variant: 'destructive',
      });
      return;
    }

    if (!token) {
      toast({
        title: 'Lỗi xác thực',
        description: 'Không tìm thấy token đăng nhập. Vui lòng đăng nhập lại.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
      setIsConfirming(false);
      return;
    }
    if (!selectedAction || !amount || !currentSessionId) {
      toast({
        title: 'Thiếu thông tin',
        description: `Vui lòng kiểm tra lại: ${!selectedAction ? 'hướng lệnh' : ''} ${!amount ? 'số tiền' : ''} ${!currentSessionId ? 'phiên giao dịch' : ''}`,
        variant: 'destructive',
      });
      setIsSubmitting(false);
      setIsConfirming(false);
      return;
    }

    // Kiểm tra số tiền hợp lệ
    const amountValue = Number(amount);
    if (isNaN(amountValue) || amountValue < 100000) {
      toast({
        title: 'Số tiền không hợp lệ',
        description: 'Số tiền phải lớn hơn hoặc bằng 100,000 VND',
        variant: 'destructive',
      });
      setIsSubmitting(false);
      setIsConfirming(false);
      return;
    }

    setIsSubmitting(true);
    setIsConfirming(false);

    try {
      // Debug log request body
             // Lấy tên asset từ symbol hiện tại
       const getAssetName = (symbol: string) => {
         const symbolMap: Record<string, string> = {
           'TVC:GOLD': 'Vàng/Đô la Mỹ',
           'XAUUSD': 'Vàng/Đô la Mỹ',
           'GOLD': 'Vàng/Đô la Mỹ',
           'OANDA:XAUUSD': 'Vàng/Đô la Mỹ',
           'TVC:SILVER': 'Bạc/Đô la Mỹ',
           'XAGUSD': 'Bạc/Đô la Mỹ',
           'EURUSD': 'EUR/USD',
           'GBPUSD': 'GBP/USD',
           'USDJPY': 'USD/JPY',
           'BTCUSD': 'Bitcoin/USD',
           'ETHUSD': 'Ethereum/USD',
           'SPX': 'S&P 500',
           'DJI': 'Dow Jones',
           'IXIC': 'NASDAQ',
         };
         return symbolMap[symbol] || symbol;
       };

       const requestBody = {
         sessionId: currentSessionId,
         direction: selectedAction,
         amount: Number(amount),
         asset: getAssetName(chartSymbol)
       };

      // Gọi API để đặt lệnh
      const response = await fetch('/api/trades/place', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          errorData
        });
        throw new Error(errorData.message || `Lỗi ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        
        const newTrade: TradeHistoryRecord = {
          id: data.trade._id || data.trade._id.toString(),
          sessionId: currentSessionId,
          direction: selectedAction,
          amount: Number(amount),
          status: 'pending',
          result: null,
          profit: 0,
          createdAt: new Date().toISOString(),
        };

        setTradeHistory(prev => [newTrade, ...prev]);

        // Cập nhật số dư ngay trên UI (giảm available) - chỉ khi không bị lock
        if (!isBalanceLocked) {
          setBalance(prev => prev - Number(amount));
        }
        // Nếu có quản lý frozen, có thể cập nhật thêm ở đây

        setAmount('');
        setSelectedAction(null);

        toast({
          title: '✅ Đặt lệnh thành công!',
          description: `Lệnh ${selectedAction === 'UP' ? 'LÊN' : 'XUỐNG'} - ${formatCurrency(Number(amount))} - Đang đợi kết quả`,
          duration: 1000, // Tự động đóng sau 1 giây
        });

        // KHÔNG sync balance ngay sau khi đặt lệnh
        // Balance sẽ được sync sau 12 giây khi phiên kết thúc
      }
    } catch (error) {
      console.error('Lỗi khi đặt lệnh:', error);
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Lỗi khi đặt lệnh',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedAction, amount, currentSessionId, toast, isBalanceLocked]);

  // Loading state
  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2">Đang tải dữ liệu...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Đã xảy ra lỗi</h2>
        <p className="text-gray-600 mb-4 text-center">{error}</p>
        <Button onClick={() => window.location.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Tải lại trang
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="p-4 md:p-8">
        <Dialog
          open={false} // ĐÃ XOÁ: Không mở Dialog kết quả thắng/thua nữa
          onOpenChange={() => {}}
        >
          {/* ĐÃ XOÁ: Nội dung Dialog kết quả thắng/thua */}
        </Dialog>

        <Dialog open={isConfirming} onOpenChange={setIsConfirming}>
          <DialogContent className="sm:max-w-[425px] bg-gray-800">
            <DialogHeader>
              <DialogTitle className="text-white text-center">
                Phiên hiện tại <span className="text-red-500">{currentSessionId || 'N/A'}</span>
              </DialogTitle>
            </DialogHeader>
            <DialogDescription className="text-gray-300 text-center">
              XÁC NHẬN
            </DialogDescription>
            <DialogFooter className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => setIsConfirming(false)}
              >
                Hủy
              </Button>
              <Button
                type="button"
                className={`flex-1 ${selectedAction === "UP" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
                onClick={confirmTrade}
              >
                Xác nhận
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="max-w-7xl mx-auto">
          {/* Desktop Layout - Đặt lệnh bên trái, biểu đồ và lịch sử bên phải */}
          <div className="hidden lg:grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-6">
              <Card className="bg-white border border-gray-300 rounded-md shadow">
                <CardHeader>
                  <div className="flex items-center space-x-2">
                    <ChevronDown className="h-4 w-4 text-gray-700" />
                    <CardTitle className="text-gray-900 text-base font-medium">Đặt lệnh</CardTitle>
                    <span className="bg-green-600 text-white text-xs font-semibold px-2 py-1 rounded ml-auto" suppressHydrationWarning>
                      Phiên: {currentSessionId || 'N/A'}
                    </span>
                  </div>
                </CardHeader>
                                 <CardContent>
                   {/* Hiển thị số dư */}
                   <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                     <div className="flex items-center justify-between text-blue-900">
                       <span className="font-semibold">SỐ DƯ:</span>
                       <span className="text-lg font-bold" suppressHydrationWarning>{formatCurrency(balance || 0)} VND</span>
                     </div>
                   </div>
                   
                   <div className="mb-4">
                     <div className="flex justify-between items-center mb-2">
                       <label htmlFor="amount" className="text-sm text-gray-400">
                         Số tiền (VND)
                       </label>
                       <span className="text-xs text-gray-400">Tối thiểu: {formatCurrency(100000)}</span>
                     </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="outline" size="icon" onClick={() => addAmount(-100000)}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        id="amount"
                        type="text"
                        value={formatAmount(amount)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/,/g, "");
                          if (/^\d*$/.test(raw)) setAmount(raw);
                        }}
                        placeholder="Nhập số tiền"
                        suppressHydrationWarning
                      />
                      <Button variant="outline" size="icon" onClick={() => addAmount(100000)}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {QUICK_AMOUNTS.map((value) => (
                        <Button
                          key={value}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-sm font-semibold bg-white hover:bg-gray-100"
                          onClick={() => addAmount(value)}
                        >
                          {value >= 1000000 ? `+${value / 1000000}M` : `+${value / 1000}K`}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1 mb-4 text-sm text-gray-900">
                    <div className="flex justify-between">
                      <span>Ngày:</span>
                      <span suppressHydrationWarning>{currentDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Giờ:</span>
                      <span suppressHydrationWarning>{currentTime}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>Phiên hiện tại:</span>
                      <span suppressHydrationWarning>{currentSessionId || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="border border-red-600 rounded bg-gray-100 text-center py-3">
                      <div className="text-sm text-gray-900">Hãy đặt lệnh:</div>
                      <div className="text-xl font-bold text-red-600" suppressHydrationWarning>{String(timeLeft).padStart(2, '0')}s</div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Button
                      type="button"
                      className="w-full h-14 bg-green-600 hover:bg-green-700 text-lg font-bold flex items-center justify-center"
                      onClick={() => handleAction("UP")}
                      disabled={isLoading || !amount || isSubmitting || balance <= 0}
                    >
                      LÊN <ArrowUp className="h-5 w-5 ml-2" />
                    </Button>
                    <Button
                      type="button"
                      className="w-full h-14 bg-red-600 hover:bg-red-700 text-lg font-bold flex items-center justify-center"
                      onClick={() => handleAction("DOWN")}
                      disabled={isLoading || !amount || isSubmitting || balance <= 0}
                    >
                      XUỐNG <ArrowDown className="h-5 w-5 ml-2" />
                    </Button>
                    
                    {/* Thông báo hết tiền trong form đặt lệnh */}
                    {balance <= 0 && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-center space-x-2 mb-2">
                          <AlertCircle className="h-4 w-4 text-red-500" />
                          <span className="text-red-700 font-semibold text-sm">Không thể đặt lệnh</span>
                        </div>
                        <p className="text-red-600 text-xs mb-2">
                          Số dư không đủ. Vui lòng nạp tiền trước.
                        </p>
                        <Button 
                          onClick={handleDeposit}
                          size="sm"
                          className="w-full bg-red-600 hover:bg-red-700 text-white text-xs"
                        >
                          <Wallet className="h-3 w-3 mr-1" />
                          Nạp tiền
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-gray-300 rounded-md shadow">
                <CardHeader>
                  <CardTitle className="text-gray-900">Cập nhật</CardTitle>
                </CardHeader>
                <CardContent>
                  <LiquidityTable />
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-8 space-y-6">
              {/* Market Data Ticker */}
              <Card className="bg-white border-gray-300 rounded-md shadow">
                <CardContent className="p-0">
                  <TradingViewTickerTape />
                </CardContent>
              </Card>

                             {/* Advanced Chart */}
               <Card className="bg-white border-gray-500 rounded-md shadow h-[500px]">
                 <CardContent className="p-2 h-full">
                   <TradingViewAdvancedChart 
                     key={chartSymbol} 
                     symbol={chartSymbol} 
                     interval="1"
                   />
                 </CardContent>
               </Card>

              {/* Trade History */}
              <TradeHistory tradeHistory={tradeHistory} formatCurrency={formatCurrency} />

              {/* Liquidity Table */}
              <Card className="bg-white border-gray-300 rounded-md shadow">
                <CardHeader>
                  <CardTitle className="text-gray-900">Thanh khoản</CardTitle>
                </CardHeader>
                <CardContent>
                  <LiquidityTable />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Mobile Layout - Thứ tự: Biểu đồ → Số dư → Đặt lệnh → Lịch sử giao dịch */}
          <div className="lg:hidden space-y-4">
            {/* 1. Biểu đồ */}
            <div className="space-y-4">
              {/* Market Data Ticker */}
              <Card className="bg-white border-gray-300 rounded-md shadow">
                <CardContent className="p-0">
                  <TradingViewTickerTape />
                </CardContent>
              </Card>

                             {/* Advanced Chart */}
               <Card className="bg-white border-gray-500 rounded-md shadow h-[350px]">
                 <CardContent className="p-2 h-full">
                   <TradingViewAdvancedChart 
                     key={chartSymbol} 
                     symbol={chartSymbol} 
                     interval="1"
                   />
                 </CardContent>
               </Card>
            </div>

            {/* 3. Đặt lệnh */}
            <Card className="bg-white border border-gray-300 rounded-md shadow">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <ChevronDown className="h-4 w-4 text-gray-700" />
                  <CardTitle className="text-gray-900 text-base font-medium">Đặt lệnh</CardTitle>
                  <span className="bg-green-600 text-white text-xs font-semibold px-2 py-1 rounded ml-auto" suppressHydrationWarning>
                    Phiên: {currentSessionId || 'N/A'}
                  </span>
                </div>
              </CardHeader>
                             <CardContent>
                 {/* Hiển thị số dư */}
                 <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                   <div className="flex items-center justify-between text-blue-900">
                     <span className="font-semibold text-sm">SỐ DƯ:</span>
                     <span className="text-base font-bold" suppressHydrationWarning>{formatCurrency(balance || 0)} VND</span>
                   </div>
                 </div>
                 
                 <div className="mb-3">
                   <div className="flex justify-between items-center mb-2">
                     <label htmlFor="amount-mobile" className="text-sm text-gray-400">
                       Số tiền (VND)
                     </label>
                     <span className="text-xs text-gray-400">Tối thiểu: {formatCurrency(100000)}</span>
                   </div>
                  <div className="flex items-center space-x-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => addAmount(-100000)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      id="amount-mobile"
                      type="text"
                      value={formatAmount(amount)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, "");
                        if (/^\d*$/.test(raw)) setAmount(raw);
                      }}
                      placeholder="Nhập số tiền"
                      suppressHydrationWarning
                    />
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => addAmount(100000)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-1 mt-2">
                    {QUICK_AMOUNTS.map((value) => (
                      <Button
                        key={value}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs font-semibold bg-white hover:bg-gray-100 h-8"
                        onClick={() => addAmount(value)}
                      >
                        {value >= 1000000 ? `+${value / 1000000}M` : `+${value / 1000}K`}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1 mb-4 text-xs text-gray-900">
                  <div className="flex justify-between">
                    <span>Ngày:</span>
                    <span suppressHydrationWarning>{currentDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Giờ:</span>
                    <span suppressHydrationWarning>{currentTime}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Phiên hiện tại:</span>
                    <span suppressHydrationWarning>{currentSessionId || 'N/A'}</span>
                  </div>
                </div>
                <div className="mb-4">
                  <div className="border border-red-600 rounded bg-gray-100 text-center py-2">
                    <div className="text-xs text-gray-900">Hãy đặt lệnh:</div>
                    <div className="text-lg font-bold text-red-600" suppressHydrationWarning>{String(timeLeft).padStart(2, '0')}s</div>
                  </div>
                </div>
                <div className="space-y-3">
                  <Button
                    type="button"
                    className="w-full h-12 bg-green-600 hover:bg-green-700 text-base font-bold flex items-center justify-center"
                    onClick={() => handleAction("UP")}
                    disabled={isLoading || !amount || isSubmitting || balance <= 0}
                  >
                    LÊN <ArrowUp className="h-4 w-4 ml-2" />
                  </Button>
                  <Button
                    type="button"
                    className="w-full h-12 bg-red-600 hover:bg-red-700 text-base font-bold flex items-center justify-center"
                    onClick={() => handleAction("DOWN")}
                    disabled={isLoading || !amount || isSubmitting || balance <= 0}
                  >
                    XUỐNG <ArrowDown className="h-4 w-4 ml-2" />
                  </Button>
                  
                  {/* Thông báo hết tiền trong form đặt lệnh */}
                  {balance <= 0 && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-red-700 font-semibold text-sm">Không thể đặt lệnh</span>
                      </div>
                      <p className="text-red-600 text-xs mb-2">
                        Số dư không đủ. Vui lòng nạp tiền trước.
                      </p>
                      <Button 
                        onClick={handleDeposit}
                        size="sm"
                        className="w-full bg-red-600 hover:bg-red-700 text-white text-xs"
                      >
                        <Wallet className="h-3 w-3 mr-1" />
                        Nạp tiền
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 4. Lịch sử giao dịch */}
            <TradeHistory tradeHistory={tradeHistory} formatCurrency={formatCurrency} />

            {/* 5. Cập nhật */}
            <Card className="bg-white border-gray-300 rounded-md shadow">
              <CardHeader>
                <CardTitle className="text-gray-7700">Cập nhật</CardTitle>
              </CardHeader>
              <CardContent>
                <LiquidityTable />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}