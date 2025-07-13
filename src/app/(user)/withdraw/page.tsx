"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Separator } from '../../../../components/ui/separator';
import useSWR from 'swr';

export default function WithdrawPage() {
  const { user, isLoading, logout, isAuthenticated } = useAuth();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') || localStorage.getItem('authToken') : null;
  const router = useRouter();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Lấy thông tin balance
  const { data: balanceData, error: balanceError } = useSWR(
    token ? '/api/user/balance' : null,
    url => fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(res => res.json())
  );

  // Lấy thông tin cài đặt
  const { data: settings, error: settingsError } = useSWR(
    token ? '/api/admin/settings' : null,
    url => fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(res => res.json())
  );

  const availableBalance = balanceData?.balance?.available || 0;
  const WITHDRAWAL_FEE = 0.04; // 4% phí rút tiền

  useEffect(() => {
    if (!isLoading && !user) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Vui lòng đăng nhập' });
      router.push('/login');
    }
  }, [user, isLoading, router, toast]);

  // Kiểm tra xem user đã liên kết ngân hàng chưa
  const hasBankInfo = user?.bank?.name && user?.bank?.accountNumber && user?.bank?.accountHolder;

  // Tính toán số tiền thực nhận sau khi trừ phí
  const calculateActualAmount = (withdrawAmount: number) => {
    const fee = withdrawAmount * WITHDRAWAL_FEE;
    return withdrawAmount - fee;
  };

  // Tính toán phí rút tiền
  const calculateFee = (withdrawAmount: number) => {
    return withdrawAmount * WITHDRAWAL_FEE;
  };

  const handleLinkBank = () => {
    router.push('/account');
  };

  const handleSubmit = async () => {
    if (!amount) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Vui lòng nhập số tiền rút' });
      return;
    }

    const withdrawAmount = Number(amount);
    
    // Kiểm tra số tiền tối thiểu và tối đa
    if (settings && settings.minWithdrawal && settings.maxWithdrawal) {
      if (withdrawAmount < settings.minWithdrawal) {
        toast({
          variant: 'destructive',
          title: 'Lỗi',
          description: `Số tiền rút tối thiểu là ${settings.minWithdrawal.toLocaleString()} VND`,
        });
        return;
      }
      
      if (withdrawAmount > settings.maxWithdrawal) {
        toast({
          variant: 'destructive',
          title: 'Lỗi',
          description: `Số tiền rút tối đa là ${settings.maxWithdrawal.toLocaleString()} VND`,
        });
        return;
      }
    }

    // Kiểm tra số dư
    if (withdrawAmount > availableBalance) {
      toast({
        variant: 'destructive',
        title: 'Lỗi',
        description: 'Số dư không đủ để thực hiện giao dịch này',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/withdrawals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          amount: withdrawAmount,
          bankName: user?.bank?.name || '',
          accountNumber: user?.bank?.accountNumber || '',
          accountHolder: user?.bank?.accountHolder || ''
        }),
      });
      
      const result = await res.json();
      
      if (res.ok) {
        toast({ 
          title: 'Thành công', 
          description: 'Yêu cầu rút tiền đã được gửi và đang được xử lý' 
        });
        setAmount('');
      } else {
        toast({ variant: 'destructive', title: 'Lỗi', description: result.message || 'Không thể gửi yêu cầu rút tiền' });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Không thể gửi yêu cầu rút tiền' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !user) {
    return <div className="flex justify-center items-center h-screen text-white">Loading...</div>;
  }

  return (
    <div className="text-white p-4">
      <Card className="bg-gray-800 border-gray-700 max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            💰 Rút tiền
            <Badge variant="secondary" className="bg-blue-600 text-white">
              Phí rút: 4%
            </Badge>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Hiển thị số dư */}
          <div className="bg-gray-700 p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-gray-300">Số dư khả dụng:</span>
              <span className="text-green-400 font-bold text-lg">
                {availableBalance.toLocaleString()} VND
              </span>
            </div>
          </div>

          {/* Kiểm tra tài khoản ngân hàng */}
          {!hasBankInfo ? (
            <div className="bg-yellow-900/20 border border-yellow-600 p-4 rounded-lg">
              <div className="text-center space-y-4">
                <div className="text-yellow-400 text-lg font-medium">
                  ⚠️ Bạn chưa liên kết tài khoản ngân hàng
                </div>
                <p className="text-gray-300 text-sm">
                  Vui lòng liên kết tài khoản ngân hàng để có thể rút tiền
                </p>
                <Button 
                  onClick={handleLinkBank}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  🔗 Liên kết ngân hàng
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Thông tin ngân hàng (chỉ đọc) */}
              <div className="bg-gray-700 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-white mb-3 flex items-center gap-2">
                  🏦 Thông tin tài khoản ngân hàng
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                     <div>
                     <Label className="text-gray-400 text-sm">Tên ngân hàng</Label>
                     <div className="text-white font-medium mt-1">{user?.bank?.name || 'N/A'}</div>
                   </div>
                   <div>
                     <Label className="text-gray-400 text-sm">Số tài khoản</Label>
                     <div className="text-white font-medium mt-1">{user?.bank?.accountNumber || 'N/A'}</div>
                   </div>
                   <div>
                     <Label className="text-gray-400 text-sm">Chủ tài khoản</Label>
                     <div className="text-white font-medium mt-1">{user?.bank?.accountHolder || 'N/A'}</div>
                   </div>
                </div>
              </div>

              <Separator className="bg-gray-600" />

              {/* Form rút tiền */}
              <div className="space-y-4">
                <div>
                  <Label className="text-white">Số tiền rút (VND)</Label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Nhập số tiền muốn rút"
                    className="bg-gray-700 text-white border-gray-600"
                    min={settings?.minWithdrawal || 100000}
                    max={Math.min(availableBalance, settings?.maxWithdrawal || 100000000)}
                  />
                  {settings && settings.minWithdrawal && settings.maxWithdrawal && (
                    <p className="text-gray-400 text-sm mt-1">
                      Từ {settings.minWithdrawal.toLocaleString()} - {settings.maxWithdrawal.toLocaleString()} VND
                    </p>
                  )}
                </div>

                {/* Thông tin chi tiết */}
                {amount && Number(amount) > 0 && (
                  <div className="bg-gray-700 p-4 rounded-lg space-y-2">
                    <h4 className="text-white font-medium">Chi tiết giao dịch:</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-300">Số tiền rút:</span>
                        <span className="text-white">{Number(amount).toLocaleString()} VND</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Phí rút (4%):</span>
                        <span className="text-red-400">-{calculateFee(Number(amount)).toLocaleString()} VND</span>
                      </div>
                      <Separator className="bg-gray-600 my-2" />
                      <div className="flex justify-between font-medium">
                        <span className="text-gray-300">Số tiền thực nhận:</span>
                        <span className="text-green-400">{calculateActualAmount(Number(amount)).toLocaleString()} VND</span>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  className="bg-green-600 hover:bg-green-700 w-full"
                  onClick={handleSubmit}
                  disabled={!amount || Number(amount) <= 0 || Number(amount) > availableBalance || isSubmitting}
                >
                  {isSubmitting ? 'Đang xử lý...' : '💳 Gửi yêu cầu rút tiền'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
