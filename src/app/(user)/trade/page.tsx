"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { useToast } from "@/components/ui/use-toast";
import { withPollingMonitor, pollingMonitor } from '@/lib/pollingMonitor';
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
const RESULT_DELAY = 12; // 12 seconds delay for result (giữ nguyên để tạo kịch tính)

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const formatAmount = (value: string): string => {
  const num = parseFloat(value);
  return isNaN(num) ? '' : num.toLocaleString('vi-VN');
};

// Cache để tránh sync balance quá nhiều
let balanceSyncCache = {
  lastSync: 0,
  lastBalance: 0,
  isSyncing: false
};

// Hàm sync balance - chỉ sync khi tất cả trades đã hoàn thành
async function syncBalance(
  setBalance: React.Dispatch<React.SetStateAction<number>>, 
  setIsSyncing: React.Dispatch<React.SetStateAction<boolean>>, 
  waitForPending = true,
  setLastBalanceSync?: React.Dispatch<React.SetStateAction<number>>,
  forceSync = false // ✅ THÊM: Tham số force sync
) {
  // ✅ THÊM: Cache mechanism để tránh sync quá nhiều
  const now = Date.now();
  if (balanceSyncCache.isSyncing && !forceSync) {
    console.log('⏭️ [BALANCE] Đang sync, bỏ qua request mới');
    return;
  }
  
  // Chỉ sync nếu đã qua 3 giây từ lần sync cuối (trừ khi force sync)
  if (now - balanceSyncCache.lastSync < 3000 && !forceSync) {
    console.log('⏭️ [BALANCE] Sync quá gần, sử dụng cache');
    setBalance(balanceSyncCache.lastBalance);
    if (setLastBalanceSync) {
      setLastBalanceSync(balanceSyncCache.lastSync);
    }
    return;
  }
  
  let tries = 0;
  setIsSyncing(true);
  balanceSyncCache.isSyncing = true;
    
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
        const newBalance = data.balance.available;
        setBalance(newBalance);
        
        // ✅ Cập nhật cache
        balanceSyncCache.lastSync = now;
        balanceSyncCache.lastBalance = newBalance;
        
        if (setLastBalanceSync) {
          setLastBalanceSync(now);
        }
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
      console.error('❌ [BALANCE] Error syncing balance:', error);
      tries++;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  setIsSyncing(false);
  balanceSyncCache.isSyncing = false;
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
  const [lastBalanceSync, setLastBalanceSync] = useState<number>(0);
  const [tradesInCurrentSession, setTradesInCurrentSession] = useState<number>(0);
  const [processedSessionId, setProcessedSessionId] = useState<string>('');

  // Load user balance and current session
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/login');
      toast({ variant: 'destructive', title: 'Vui lòng đăng nhập để sử dụng tính năng này' });
      return;
    }

    const loadUserData = async () => {
      try {
        let currentSessionId = '';
        
        // Lấy phiên giao dịch hiện tại
        const sessionResponse = await fetch('/api/trading-sessions');
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          if (sessionData.success) {
            currentSessionId = sessionData.currentSession.sessionId;
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
            
            // Đếm số lệnh pending trong phiên hiện tại
            const currentSessionTrades = formattedTrades.filter(trade => 
              trade.sessionId === currentSessionId && 
              trade.status === 'pending'
            );
            setTradesInCurrentSession(currentSessionTrades.length);
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
              const initialBalance = balanceData.balance.available;
              setBalance(initialBalance);
            }
          }
        } catch (error) {
          console.error('❌ [INIT] Lỗi khi load balance ban đầu:', error);
        }
      };

      loadInitialBalance();
    }
  }, [authLoading, user, updateCountdown, isBalanceLocked]);

  // ✅ TỐI ƯU: Smart polling cho session updates
  useEffect(() => {
    const updateSession = async () => {
      try {
        // ✅ SỬ DỤNG MONITORING: Wrap API call với performance tracking
        const sessionData = await withPollingMonitor(
          async () => {
            const sessionResponse = await fetch('/api/trading-sessions/session-change');
            if (!sessionResponse.ok) {
              throw new Error('Session update failed');
            }
            return sessionResponse.json();
          },
          'session-change'
        );
        
        if (sessionData.success) {
            const newSessionId = sessionData.currentSession.sessionId;
            const newTimeLeft = sessionData.currentSession.timeLeft;
            const sessionChanged = sessionData.sessionChanged;
            
            // Cập nhật timeLeft
            setTimeLeft(newTimeLeft);
            
                         // Nếu phiên thay đổi, cập nhật sessionId và reset các trạng thái
             if (sessionChanged || newSessionId !== currentSessionId) {
               console.log(`🔄 [SESSION] Session changed: ${currentSessionId} -> ${newSessionId}`);
               setCurrentSessionId(newSessionId);
               
               // Reset các trạng thái liên quan khi session mới bắt đầu
               setTradeResult({ status: 'idle' });
               setTradesInCurrentSession(0); // Reset số lệnh trong phiên mới
               setCountdownStarted(false); // Reset countdown
               setIsBalanceLocked(false); // Unlock balance
               setUpdateCountdown(null); // Reset update countdown
               setProcessedSessionId(''); // Reset processed session ID
             }
            
            setSessionStatus(sessionData.currentSession.status);
          }
      } catch (error) {
        console.error('Lỗi khi cập nhật phiên:', error);
      }
    };
    
    // Update immediately
    updateSession();
    
    // ✅ TỐI ƯU: Smart polling thông minh hơn
    let interval;
    if (timeLeft <= 0) {
      interval = 2000; // Poll mỗi 2 giây khi timer = 0 (giảm từ 1s)
    } else if (timeLeft <= 5) {
      interval = 2000; // Poll mỗi 2 giây khi gần về 0 (giảm từ 1s)
    } else if (timeLeft <= 30) {
      interval = 5000; // Poll mỗi 5 giây khi còn ít thời gian (tăng từ 3s)
    } else {
      interval = 15000; // Poll mỗi 15 giây khi còn nhiều thời gian (tăng từ 10s)
    }
    
    const sessionInterval = setInterval(updateSession, interval);
    
    return () => clearInterval(sessionInterval);
  }, [currentSessionId, timeLeft]); // ✅ Thêm timeLeft vào dependency

  // ✅ TỐI ƯU: Local timer với fallback cho server sync
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

  // ✅ THÊM: Fallback timer khi server không response
  useEffect(() => {
    if (timeLeft === 0) {
      // Fallback: Tự động chuyển phiên sau 5 giây nếu server không response
      const fallbackTimer = setTimeout(() => {
        console.log('⚠️ Server timeout, tự động chuyển phiên...');
        // Force re-render để trigger session update
        setTimeLeft(60); // Tạm thời set 60s
        setCurrentSessionId(prev => prev + '_new'); // Force session change
      }, 5000);
      
      return () => clearTimeout(fallbackTimer);
    }
  }, [timeLeft]);

  // ✅ THÊM: Performance monitoring cleanup
  useEffect(() => {
    return () => {
      // ✅ TẮT: Log performance summary để giảm spam
      // pollingMonitor.logSummary();
    };
  }, []);

  // ✅ TỐI ƯU: Conditional trade results checking
  useEffect(() => {
    // Chỉ check results khi có lệnh pending và timer = 0
    if (timeLeft === 0 && tradesInCurrentSession > 0 && !countdownStarted) {
    }
  }, [timeLeft, tradesInCurrentSession, countdownStarted]);

  // Force update session when timeLeft reaches 0
  useEffect(() => {
    if (timeLeft === 0 && !countdownStarted && currentSessionId !== processedSessionId) {  
      console.log(`🎯 [RESULT] Timer = 0, bắt đầu xử lý kết quả phiên...`);
      console.log(`🎯 [RESULT] Thời gian hiện tại: ${new Date().toLocaleTimeString()}`);
      console.log(`🎯 [RESULT] Session ID: ${currentSessionId}`);
      console.log(`🎯 [RESULT] Trades trong phiên hiện tại: ${tradesInCurrentSession}`);
      
      // Đánh dấu session này đã được xử lý
      setProcessedSessionId(currentSessionId);
      
      // Đánh dấu countdown đã bắt đầu để tránh bắt đầu lại
      setCountdownStarted(true);
      
      // Lock balance để tránh cập nhật trong quá trình countdown
      setIsBalanceLocked(true);
      
      // Bắt đầu countdown 12 giây
      setUpdateCountdown(12); // Giữ nguyên 12 giây để tạo kịch tính
      
      // ✅ OPTION 1: Xử lý kết quả ngay lập tức khi timer = 0
      const processSessionResults = async () => {
        try {
          console.log(`🎬 [RESULT] Bắt đầu xử lý kết quả phiên...`);
          console.log(`🎬 [RESULT] Thời gian: ${new Date().toLocaleTimeString()}`);
          
          // ✅ BƯỚC 1: Trigger session processing ngay lập tức
          let sessionProcessed = false;
          for (let i = 0; i < 3; i++) {
            try {
              console.log(`🔄 [RESULT] Gọi API process-result lần ${i + 1}...`);
              const sessionResponse = await fetch('/api/trading-sessions/process-result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              if (sessionResponse.ok) {
                const sessionData = await sessionResponse.json();
                console.log(`✅ [RESULT] Session processed thành công:`, sessionData.message);
                console.log(`✅ [RESULT] Chi tiết kết quả:`, sessionData.results);
                sessionProcessed = true;
                break;
              } else {
                console.error(`❌ [RESULT] API process-result lần ${i + 1} failed với status:`, sessionResponse.status);
              }
            } catch (error) {
              console.error(`❌ [RESULT] Session processing attempt ${i + 1} failed:`, error);
              if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          if (!sessionProcessed) {
            console.error('❌ [RESULT] Không thể process sessions sau 3 lần thử');
          } else {
            console.log('🎉 [RESULT] Hoàn thành xử lý kết quả phiên!');
          }
        } catch (error) {
          console.error('❌ [RESULT] Lỗi khi xử lý kết quả phiên:', error);
        }
      };

      // ✅ BƯỚC 1: Xử lý kết quả ngay lập tức
      processSessionResults();
      
      // ✅ BƯỚC 2: Cập nhật UI sau 12 giây để tạo kịch tính
      const updateUIAfterDelay = async () => {
        try {
          console.log(`🎬 [UI] Bắt đầu cập nhật UI sau 12 giây kịch tính...`);
          console.log(`🎬 [UI] Thời gian: ${new Date().toLocaleTimeString()}`);
          
          // ✅ BƯỚC 1: Cập nhật lịch sử giao dịch với retry
          let tradeHistoryUpdated = false;
          for (let i = 0; i < 3; i++) {
            try {
              console.log(`🔄 [UI] Gọi API trade history lần ${i + 1}...`);
              const tradeHistoryResponse = await fetch('/api/trades/history', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
              });

              if (tradeHistoryResponse.ok) {
                const tradeHistoryData = await tradeHistoryResponse.json();
                console.log(`📊 [UI] Trade history data:`, tradeHistoryData);
                
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
                  console.log(`✅ [UI] Trade history updated thành công`);
                  console.log(`✅ [UI] Số lượng trades: ${formattedTrades.length}`);
                  console.log(`✅ [UI] Trades mới nhất:`, formattedTrades.slice(0, 3));
                  tradeHistoryUpdated = true;
                  break;
                } else {
                  console.log(`📊 [UI] Không có trades trong response`);
                }
              } else {
                console.error(`❌ [UI] API trade history lần ${i + 1} failed với status:`, tradeHistoryResponse.status);
              }
            } catch (error) {
              console.error(`❌ [UI] Trade history update attempt ${i + 1} failed:`, error);
              if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          if (!tradeHistoryUpdated) {
            console.error('❌ [UI] Không thể cập nhật trade history sau 3 lần thử');
          }

          // ✅ BƯỚC 2: Sync balance với retry
          let balanceSynced = false;
          for (let i = 0; i < 3; i++) {
            try {
              console.log(`🔄 [UI] Gọi API sync balance lần ${i + 1}...`);
              await syncBalance(setBalance, setIsSyncingBalance, true, setLastBalanceSync, true);
              console.log(`✅ [UI] Balance synced thành công`);
              balanceSynced = true;
              break;
            } catch (error) {
              console.error(`❌ [UI] Balance sync attempt ${i + 1} failed:`, error);
              if (i < 2) await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
          
          if (!balanceSynced) {
            console.error('❌ [UI] Không thể sync balance sau 3 lần thử');
          }
          
          console.log(`🎉 [UI] Hoàn thành cập nhật UI sau 12 giây!`);
        } catch (error) {
          console.error('❌ [UI] Lỗi khi cập nhật UI sau 12 giây:', error);
        } finally {
          setUpdateCountdown(null);
          setCountdownStarted(false);
          setIsBalanceLocked(false);
          console.log(`🔍 [UI] Reset các state flags`);
        }
      };

      // ✅ BƯỚC 2: Chờ 12 giây rồi cập nhật UI
      console.log(`⏰ [RESULT] Đặt timeout 12 giây để cập nhật UI...`);
      setTimeout(() => {
        console.log(`⏰ [RESULT] Timeout 12 giây đã hoàn thành, bắt đầu updateUIAfterDelay`);
        updateUIAfterDelay();
      }, 12000);

      // ✅ SỬA: KHÔNG force update session ngay lập tức nữa
      // Để UI có thể cập nhật kết quả của phiên hiện tại trước khi chuyển phiên
      // Session sẽ được cập nhật tự động thông qua polling
    }
  }, [timeLeft, currentSessionId, toast, countdownStarted, tradesInCurrentSession, processedSessionId]);

  // Track which trades have been processed to prevent duplicate updates
  const processedTradesRef = useRef<Set<string>>(new Set());

  // Reset countdownStarted và isBalanceLocked khi session mới bắt đầu
  useEffect(() => {
    if (timeLeft > 0 && countdownStarted) {
      console.log(`🔄 [RESET] Reset countdownStarted vì timeLeft > 0 (${timeLeft})`);
      setCountdownStarted(false);
    }
    if (timeLeft > 0 && isBalanceLocked) {
      console.log(`🔄 [RESET] Reset isBalanceLocked vì timeLeft > 0 (${timeLeft})`);
      setIsBalanceLocked(false);
    }
  }, [timeLeft, countdownStarted, isBalanceLocked]);

  // ✅ THÊM: Force update session sau khi UI đã được cập nhật
  useEffect(() => {
    // Khi updateCountdown từ 12 về null (UI đã được cập nhật xong)
    if (updateCountdown === null && countdownStarted) {
      console.log(`🔄 [SESSION] UI đã được cập nhật xong, force update session...`);
      
      const forceUpdateSession = async () => {
        try {
          const sessionResponse = await fetch('/api/trading-sessions/session-change');
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            if (sessionData.success) {
              const newSessionId = sessionData.currentSession.sessionId;
              const newTimeLeft = sessionData.currentSession.timeLeft;
              
              console.log(`🔄 [SESSION] Force update session: ${currentSessionId} -> ${newSessionId}, timeLeft: ${newTimeLeft}`);
              
              setCurrentSessionId(newSessionId);
              setTimeLeft(newTimeLeft);
              
              // Reset trade result
              setTradeResult({ status: 'idle' });
              setTradesInCurrentSession(0); // Reset số lệnh trong phiên mới
            }
          }
        } catch (error) {
          console.error('❌ [SESSION] Lỗi khi force update session:', error);
        }
      };
      
      // Delay 1 giây để đảm bảo UI đã được cập nhật hoàn toàn
      setTimeout(forceUpdateSession, 1000);
    }
  }, [updateCountdown, countdownStarted, currentSessionId]);

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

  // Cập nhật ngày và giờ chỉ ở client
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      setCurrentDate(`${day}/${month}/${year}`);
      setCurrentTime(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    
    // Chỉ cập nhật khi component đã mount (tránh hydration mismatch)
    if (typeof window !== 'undefined') {
      updateDateTime();
      const interval = setInterval(updateDateTime, 1000);
      return () => clearInterval(interval);
    }
  }, []);

  // Tránh gọi syncBalance quá thường xuyên (tối thiểu 5 giây giữa các lần gọi)
  useEffect(() => {
    const now = Date.now();
    const timeSinceLastSync = now - lastBalanceSync;
    const minSyncInterval = 5000; // 5 giây
    
    if (timeSinceLastSync < minSyncInterval) {
    }
  }, [lastBalanceSync]);

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
        
        // ✅ SỬA: Cập nhật balance ngay lập tức trên UI
        setBalance(prevBalance => {
          const newBalance = prevBalance - Number(amount);
          return newBalance;
        });

        setAmount('');
        setSelectedAction(null);

        // Cập nhật số lệnh trong phiên hiện tại
        const tradesInSession = data.data?.tradesInSession || 1;
        setTradesInCurrentSession(tradesInSession);
        
        // Hiển thị thông tin về số lệnh đã đặt trong phiên
        const sessionInfo = tradesInSession > 1 ? ` (Lệnh thứ ${tradesInSession} trong phiên)` : '';
        
        toast({
          title: '✅ Đặt lệnh thành công!',
          description: `Lệnh ${selectedAction === 'UP' ? 'LÊN' : 'XUỐNG'} - ${formatCurrency(Number(amount))} - Đang đợi kết quả${sessionInfo}`,
          duration: 2500, // Tự động đóng sau 2.5 giây
        });

        // ✅ SỬA: Sync balance ngay lập tức sau khi đặt lệnh
        try {
          // Reset cache để force sync balance ngay lập tức
          balanceSyncCache.lastSync = 0;
          balanceSyncCache.isSyncing = false;
          
          // Sync balance ngay lập tức với force sync
          await syncBalance(setBalance, setIsSyncingBalance, false, setLastBalanceSync, true);
        } catch (error) {
          console.error('❌ [TRADE] Lỗi khi sync balance sau đặt lệnh:', error);
        }
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
      <div className="p-1 md:p-8">
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
                      {/* Debug info - chỉ hiển thị trong development */}
                      {process.env.NODE_ENV === 'development' && (
                        <div className="mt-2 text-xs text-blue-700">
                          <div>Last Sync: {lastBalanceSync ? new Date(lastBalanceSync).toLocaleTimeString() : 'Never'}</div>
                          <div>Balance Locked: {isBalanceLocked ? 'Yes' : 'No'}</div>
                          <div>Syncing: {isSyncingBalance ? 'Yes' : 'No'}</div>
                          <div>Countdown Started: {countdownStarted ? 'Yes' : 'No'}</div>
                          <div>Trades in Session: {tradesInCurrentSession}</div>
                          <div>Processed Session: {processedSessionId}</div>
                          <div className="mt-1 pt-1 border-t border-blue-300">
                            <button 
                              onClick={async () => {
                                try {
                                  const response = await fetch('/api/test-balance', {
                                    headers: {
                                      'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                                    }
                                  });
                                  const data = await response.json();
                                  if (data.success) {
                                    console.log('🔍 [DEBUG] Balance Test Result:', data.data);
                                    alert(`Current: ${data.data.currentBalance.available} | Calculated: ${data.data.calculatedBalance.available}`);
                                  }
                                } catch (error) {
                                  console.error('Debug balance error:', error);
                                }
                              }}
                              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                            >
                              Test Balance
                            </button>
                          </div>
                        </div>
                      )}
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

          {/* Mobile Layout - Thứ tự: Biểu đồ → Số dư → Đặt lệnh → Lịch sử giao dịch - Full màn hình với margin nhẹ */}
          <div className="lg:hidden space-y-2 min-h-screen">
            {/* 1. Biểu đồ */}
            <div className="space-y-2">
              {/* Market Data Ticker */}
              <Card className="bg-white border border-gray-200 rounded-lg shadow-sm">
                <CardContent className="p-0">
                  <TradingViewTickerTape />
                </CardContent>
              </Card>

                             {/* Advanced Chart */}
               <Card className="bg-white border border-gray-200 rounded-lg shadow-sm h-[400px]">
                 <CardContent className="p-0 h-full">
                   <TradingViewAdvancedChart 
                     key={chartSymbol} 
                     symbol={chartSymbol} 
                     interval="1"
                   />
                 </CardContent>
               </Card>
            </div>

            {/* 3. Đặt lệnh */}
            <Card className="bg-white border border-gray-200 rounded-lg shadow-sm">
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
                    {/* Debug info - chỉ hiển thị trong development */}
                    {process.env.NODE_ENV === 'development' && (
                      <div className="mt-1 text-xs text-blue-700">
                        <div>Last Sync: {lastBalanceSync ? new Date(lastBalanceSync).toLocaleTimeString() : 'Never'}</div>
                        <div>Balance Locked: {isBalanceLocked ? 'Yes' : 'No'}</div>
                        <div>Syncing: {isSyncingBalance ? 'Yes' : 'No'}</div>
                        <div>Countdown Started: {countdownStarted ? 'Yes' : 'No'}</div>
                        <div>Trades in Session: {tradesInCurrentSession}</div>
                        <div>Processed Session: {processedSessionId}</div>
                        <div className="mt-1 pt-1 border-t border-blue-300">
                          <button 
                            onClick={async () => {
                              try {
                                const response = await fetch('/api/test-balance', {
                                  headers: {
                                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                                  }
                                });
                                const data = await response.json();
                                if (data.success) {
                                  console.log('🔍 [DEBUG] Balance Test Result:', data.data);
                                  alert(`Current: ${data.data.currentBalance.available} | Calculated: ${data.data.calculatedBalance.available}`);
                                }
                              } catch (error) {
                                console.error('Debug balance error:', error);
                              }
                            }}
                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                          >
                            Test Balance
                          </button>
                        </div>
                      </div>
                    )}
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
            <Card className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="text-gray-900">Cập nhật</CardTitle>
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