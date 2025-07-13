'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import useSWR from 'swr';
import { Upload } from 'lucide-react';

export default function DepositPage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [authToken, setAuthToken] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [bill, setBill] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [billUrl, setBillUrl] = useState<string | null>(null);
  const [selectedBank, setSelectedBank] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);

  // Lấy token từ localStorage
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') || localStorage.getItem('authToken') : null;
  console.log('Token from localStorage:', token ? token.substring(0, 20) + '...' : 'not found');

  // Lấy cài đặt chung của hệ thống
  const { data: settings, error: settingsError } = useSWR(
    user ? '/api/admin/settings' : null,
    async (url: string) => {
      const res = await fetch(url, { 
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json();
    }
  );
  
  // Lấy thông tin ngân hàng của nền tảng
  const { data: platformBanks, error: platformBanksError } = useSWR(
    user ? '/api/platform/banks' : null,
    async (url: string) => {
      console.log('Fetching platform banks...');
      const res = await fetch(url, { 
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      console.log('Platform banks response status:', res.status);
      if (!res.ok) throw new Error('Failed to fetch platform banks');
      const data = await res.json();
      console.log('Platform banks data:', data);
      return data;
    }
  );

  useEffect(() => {
    if (!isLoading && !isAuthenticated()) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Vui lòng đăng nhập' });
      router.push('/login');
    }
  }, [user, isLoading, isAuthenticated, router, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setBill(file);
      handleUploadFile(file);
    }
  };

  const handleUploadFile = async (file: File) => {
    setIsUploading(true);
    setBillUrl(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload-bill', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Upload thất bại');
      }
      
      const data = await response.json();
      setBillUrl(data.url);
      toast({
        title: 'Thành công',
        description: 'Tải lên bill thành công',
      });
    } catch (error) {
      console.error('Lỗi khi tải lên ảnh:', error);
      toast({
        variant: 'destructive',
        title: 'Lỗi',
        description: 'Không thể tải lên ảnh. Vui lòng thử lại.',
      });
      setBill(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!amount || !bill || !selectedBank || !isConfirmed) {
      toast({ 
        variant: 'destructive', 
        title: 'Lỗi', 
        description: 'Vui lòng chọn ngân hàng, điền số tiền, tải lên bill và xác nhận' 
      });
      return;
    }

    if (settings && Number(amount) < settings.minDeposit) {
      toast({ variant: 'destructive', title: 'Lỗi', description: `Số tiền nạp tối thiểu là ${settings.minDeposit.toLocaleString()} đ` });
      return;
    }

    if (!billUrl) {
      toast({ variant: 'destructive', title: 'Lỗi', description: 'Vui lòng đợi ảnh được tải lên hoàn tất' });
      return;
    }

    try {
      console.log('Sending deposit request with token:', token ? 'exists' : 'missing');
      const res = await fetch('/api/deposits', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: Number(amount),
          bill: billUrl,
          bank: selectedBank,
          confirmed: isConfirmed
        }),
      });
      
      console.log('Deposit response status:', res.status);
      
      const result = await res.json();
      
      if (res.ok) {
        toast({ title: 'Thành công', description: 'Yêu cầu nạp tiền đã được gửi' });
        setAmount('');
        setBill(null);
        setBillUrl(null);
      } else {
        toast({ variant: 'destructive', title: 'Lỗi', description: result.message || 'Có lỗi xảy ra' });
      }
    } catch (err) {
      console.error('Lỗi khi gửi yêu cầu:', err);
      toast({ 
        variant: 'destructive', 
        title: 'Lỗi', 
        description: 'Không thể gửi yêu cầu. Vui lòng thử lại sau.' 
      });
    }
  };

  if (isLoading || !user) {
    return <div className="flex justify-center items-center h-[60vh] text-gray-600">Đang tải...</div>;
  }

  return (
    <div id="deposit-page" className="min-h-screen bg-gray-900 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Thông tin ngân hàng nền tảng */}
        <Card className="bg-gray-800 border-gray-700 shadow-lg rounded-xl">
          <CardHeader className="border-b border-gray-700 p-6">
            <CardTitle className="text-2xl font-semibold text-white">Thông tin ngân hàng nền tảng</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {!platformBanks ? (
              <div className="text-center py-4 text-gray-400">Đang tải thông tin ngân hàng...</div>
            ) : platformBanksError ? (
              <div className="text-red-500">Không thể tải thông tin ngân hàng</div>
            ) : platformBanks.banks && platformBanks.banks.length > 0 ? (
              <div className="space-y-4">
                <p className="text-yellow-400 font-medium">Vui lòng chọn ngân hàng để xem thông tin chuyển khoản:</p>
                
                {/* Dropdown chọn ngân hàng */}
                <div className="mb-4">
                  <Label className="text-gray-400 block mb-2">Chọn ngân hàng:</Label>
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="flex h-12 w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">-- Chọn ngân hàng để xem thông tin --</option>
                    {platformBanks.banks.map((bank: any, index: number) => (
                      <option key={index} value={bank.bankName}>
                        {bank.bankName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Hiển thị thông tin ngân hàng đã chọn */}
                {selectedBank && (
                  <div className="bg-gray-700 p-6 rounded-lg border border-gray-600">
                    <h3 className="text-xl font-bold text-white mb-4">{selectedBank}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-400">Chủ tài khoản:</p>
                        <p className="text-white font-medium text-lg">
                          {platformBanks.banks.find((b: any) => b.bankName === selectedBank)?.accountHolder}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400">Số tài khoản:</p>
                        <p className="text-white font-medium text-lg font-mono">
                          {platformBanks.banks.find((b: any) => b.bankName === selectedBank)?.accountNumber}
                        </p>
                      </div>
                      {platformBanks.banks.find((b: any) => b.bankName === selectedBank)?.branch && (
                        <div>
                          <p className="text-gray-400">Chi nhánh:</p>
                          <p className="text-white">
                            {platformBanks.banks.find((b: any) => b.bankName === selectedBank)?.branch}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-gray-400">Nội dung chuyển khoản:</p>
                        <p className="text-white font-mono bg-gray-800 px-3 py-2 rounded border">
                          NAP-{user?.username || 'user'}-{new Date().getTime().toString().slice(-6)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 p-3 bg-amber-900/20 border border-amber-500/30 rounded">
                      <p className="text-amber-400 text-sm">
                        <strong>Lưu ý:</strong> Vui lòng ghi rõ nội dung chuyển khoản như trên để chúng tôi có thể xác nhận nhanh chóng.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-400">Hiện tại chưa có thông tin ngân hàng nền tảng.</p>
            )}
          </CardContent>
        </Card>

        {/* Form nạp tiền */}
        <Card className="bg-gray-800 border-gray-700 shadow-lg rounded-xl">
          <CardHeader className="border-b border-gray-700 p-6">
            <CardTitle className="text-2xl font-semibold text-white">Nạp tiền</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-300 mb-4">Thông tin nạp tiền</h3>
              
              {/* Nhắc nhở chọn ngân hàng */}
              {!selectedBank && (
                <div className="mb-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded">
                  <p className="text-blue-400 text-sm">
                    <strong>Lưu ý:</strong> Vui lòng chọn ngân hàng ở phía trên trước khi điền thông tin nạp tiền.
                  </p>
                </div>
              )}
              
              <div className="mb-4">
                <Label className="text-gray-400">Số tiền nạp (VND)</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Nhập số tiền"
                  className="bg-gray-700 text-white border-gray-600 focus:border-blue-500"
                  min={settings?.minDeposit || 0}
                  max={settings?.maxDeposit || 100000000}
                  required
                />
                {settings && (
                  <p className="text-xs text-gray-500 mt-1">
                    Số tiền từ {settings.minDeposit?.toLocaleString()} - {settings.maxDeposit?.toLocaleString()} VND
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label className="text-gray-400">Tải lên bill chuyển khoản</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    disabled={isUploading}
                    className="bg-gray-700 text-white border-gray-600 focus:border-blue-500 file:bg-gray-600 file:text-white file:hover:bg-gray-500 disabled:opacity-50"
                  />
                </div>
                
                {isUploading && (
                  <div className="flex items-center text-sm text-blue-400">
                    <div className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2"></div>
                    Đang tải lên ảnh...
                  </div>
                )}
                
                {bill && !isUploading && billUrl && (
                  <div className="text-sm text-green-400">
                    ✓ Đã tải lên: {bill.name}
                  </div>
                )}
                
                {bill && !isUploading && !billUrl && (
                  <div className="text-sm text-yellow-400">
                    Lỗi khi tải lên. Vui lòng thử lại.
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-start space-x-2 mt-4">
              <input
                type="checkbox"
                id="confirm-deposit"
                checked={isConfirmed}
                onChange={(e) => setIsConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                required
              />
              <label htmlFor="confirm-deposit" className="text-sm text-gray-300">
                Tôi xác nhận đã chuyển khoản chính xác số tiền và nội dung như trên. Yêu cầu nạp tiền sẽ được xử lý trong vòng 5-15 phút sau khi xác nhận.
              </label>
            </div>

            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-md transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed mt-4"
              onClick={handleSubmit}
              disabled={!amount || !bill || isUploading || !billUrl || !selectedBank || !isConfirmed}
            >
              {isUploading ? (
                <>
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Đang xử lý...
                </>
              ) : !selectedBank ? (
                <>
                  <Upload className="h-5 w-5 mr-2" />
                  Vui lòng chọn ngân hàng
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5 mr-2" />
                  Gửi yêu cầu
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}