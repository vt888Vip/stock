"use client";

import React, { useState, useEffect, useRef, useCallback, ChangeEvent, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
;
import { Menu, X, Loader2, Upload, CheckCircle, XCircle, UploadCloud } from 'lucide-react';

type TabType = 'overview' | 'account' | 'bank' | 'verify' | 'password';

interface BankForm {
  fullName: string;
  bankType: string;
  bankName: string;
  accountNumber: string;
}

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface UploadStatus {
  success: boolean;
  message: string;
}

interface UploadState {
  front: UploadStatus | null;
  back: UploadStatus | null;
}

interface BankInfo {
  accountHolder: string;
  name: string;
  bankName: string;
  accountNumber: string;
  accountType?: string;
  bankType?: string;
  bankCode?: string;
  verified?: boolean;
}

interface VerificationData {
  verified: boolean;
  cccdFront: string;
  cccdBack: string;
  submittedAt?: string;
  status?: 'pending' | 'approved' | 'rejected';
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

interface BalanceInfo {
  available: number;
  locked?: number;
  total?: number;
}

interface User {
  _id?: string;
  id?: string;
  username?: string;
  email?: string;
  phone?: string;
  fullName?: string;
  address?: string;
  dateOfBirth?: string;
  gender?: string;
  bankInfo?: BankInfo;
  bank?: BankInfo;
  verification?: VerificationData;
  balance?: BalanceInfo | number;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
  refreshUser: () => Promise<void>;
}

export default function AccountPage() {
  const { user, isLoading, logout, refreshUser } = useAuth() as AuthContextType;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const toastVariant = {
    default: 'default' as const,
    destructive: 'destructive' as const,
    success: 'success' as const,
    error: 'destructive' as const,
  } as const;

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<VerificationData>({
    verified: false,
    cccdFront: '',
    cccdBack: '',
    submittedAt: '',
    status: undefined,
    reviewedAt: undefined,
    reviewedBy: undefined,
    rejectionReason: undefined
  });

  const [frontIdFile, setFrontIdFile] = useState<File | null>(null);
  const [backIdFile, setBackIdFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadState>({
    front: null,
    back: null
  });

  const [bankForm, setBankForm] = useState<BankInfo>({
    accountHolder: user?.bankInfo?.accountHolder || user?.bank?.accountHolder || '',
    name: user?.bankInfo?.name || user?.bank?.name || '',
    bankName: user?.bankInfo?.bankName || user?.bank?.bankName || '',
    accountNumber: user?.bankInfo?.accountNumber || user?.bank?.accountNumber || '',
    accountType: user?.bankInfo?.accountType || 'savings',
    bankType: user?.bankInfo?.bankType || '',
    bankCode: user?.bankInfo?.bankCode || '',
    verified: user?.bankInfo?.verified || false
  });

  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Form thông tin tài khoản
  const [accountForm, setAccountForm] = useState({
    fullName: user?.fullName || '',
    phone: user?.phone || '',
    address: user?.address || '',
    dateOfBirth: user?.dateOfBirth || '',
    gender: user?.gender || ''
  });

  // Vô hiệu hóa chức năng chỉnh sửa thông tin ngân hàng
  const [isEditingBankInfo, setIsEditingBankInfo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  
  // Trạng thái khóa chỉnh sửa sau khi đã cập nhật
  const [isBankInfoLocked, setIsBankInfoLocked] = useState(false);
  const [isAccountInfoLocked, setIsAccountInfoLocked] = useState(false);

  useEffect(() => {
    if (user?.verification) {
      setVerificationStatus({
        verified: user.verification.verified || false,
        cccdFront: user.verification.cccdFront || '',
        cccdBack: user.verification.cccdBack || '',
        submittedAt: user.verification.submittedAt || '',
        status: user.verification.status || undefined,
        reviewedAt: user.verification.reviewedAt || undefined,
        reviewedBy: user.verification.reviewedBy || undefined,
        rejectionReason: user.verification.rejectionReason || undefined
      });
    }
    
    // Cập nhật form thông tin tài khoản
    setAccountForm({
      fullName: user?.fullName || '',
      phone: user?.phone || '',
      address: user?.address || '',
      dateOfBirth: user?.dateOfBirth || '',
      gender: user?.gender || ''
    });

    // Cập nhật form thông tin ngân hàng
    setBankForm({
      accountHolder: user?.bank?.accountHolder || user?.bankInfo?.accountHolder || '',
      name: user?.bank?.name || user?.bankInfo?.name || '',
      bankName: user?.bank?.bankName || user?.bankInfo?.bankName || '',
      accountNumber: user?.bank?.accountNumber || user?.bankInfo?.accountNumber || '',
      accountType: user?.bank?.accountType || user?.bankInfo?.accountType || 'savings',
      bankType: user?.bank?.bankType || user?.bankInfo?.bankType || '',
      bankCode: user?.bank?.bankCode || user?.bankInfo?.bankCode || '',
      verified: user?.bank?.verified || user?.bankInfo?.verified || false
    });
    
    // Kiểm tra xem thông tin ngân hàng đã được cập nhật chưa
    const hasBankInfo = user?.bank?.name || user?.bankInfo?.name || user?.bank?.accountHolder || user?.bankInfo?.accountHolder;
    if (hasBankInfo) {
      setIsBankInfoLocked(true);
      console.log('Bank info locked:', hasBankInfo);
    }
    
    // Kiểm tra xem thông tin tài khoản đã được cập nhật chưa
    const hasAccountInfo = user?.fullName || user?.phone || user?.address || user?.dateOfBirth || user?.gender;
    if (hasAccountInfo) {
      setIsAccountInfoLocked(true);
      console.log('Account info locked:', hasAccountInfo);
    }
  }, [user]);

  const isVerified = verificationStatus.verified;

  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log('Checking authentication status...');
        
        // Lấy token từ localStorage
        const token = localStorage.getItem('token') || localStorage.getItem('authToken');
        
        const res = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include', // Vẫn giữ để tương thích với phiên bản cũ
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            // Thêm token vào header nếu có
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          }
        });
        
        // Xử lý response
        if (res.ok) {
          const data = await res.json();
          if (data?.success && data.user) {
            console.log('User authenticated:', data.user.username);
            // Cập nhật user state nếu cần
          } else {
            console.log('No user in auth response:', data);
            // Xử lý khi không có user
          }
        } else {
          console.log('Auth check failed with status:', res.status);
          // Xử lý khi API trả về lỗi
        }
      } catch (error) {
        console.error('Failed to refresh user data:', error);
      }
    };
  
    checkAuth();
  }, [user, refreshUser]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const getBalance = (balance: number | BalanceInfo | undefined): number => {
    if (balance === undefined) return 0;
    if (typeof balance === 'number') return balance;
    if (balance && 'available' in balance) return Number(balance.available) || 0;
    return 0;
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    
    // Try to get token from localStorage first
    const token = localStorage.getItem('authToken');
    if (token) return token;
    
    // If still not found, try to get it from cookies
    const cookies = document.cookie.split(';').reduce((cookies, cookie) => {
      const [name, value] = cookie.split('=').map(c => c.trim());
      cookies[name] = value;
      return cookies;
    }, {} as Record<string, string>);
    
    return cookies.authToken || null;
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast({
        title: 'Lỗi',
        description: 'Chỉ chấp nhận file ảnh định dạng JPG hoặc PNG',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Lỗi',
        description: 'Kích thước file tối đa là 5MB',
        variant: 'destructive',
      });
      return;
    }

    if (type === 'front') {
      setFrontIdFile(file);
      setUploadStatus(prev => ({ ...prev, front: null }));
    } else {
      setBackIdFile(file);
      setUploadStatus(prev => ({ ...prev, back: null }));
    }
  };

  const handleUpload = async (type: 'front' | 'back') => {
    const file = type === 'front' ? frontIdFile : backIdFile;
    if (!file) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng chọn tệp để tải lên',
        variant: 'destructive',
      });
      return;
    }

    // Check authentication first
    const token = getToken();
    if (!token) {
      toast({
        title: 'Lỗi xác thực',
        description: 'Vui lòng đăng nhập lại để tiếp tục',
        variant: 'destructive',
      });
      router.push('/login');
      return;
    }

    setIsUploading(true);
    setUploadStatus(prev => ({ ...prev, [type]: { status: 'uploading' } }));

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    try {
      // Get fresh token on each request
      const token = getToken();
      if (!token) {
        throw new Error('Không tìm thấy thông tin xác thực. Vui lòng đăng nhập lại.');
      }

      // Add cache-control headers to prevent caching
      const headers = new Headers();
      headers.append('Authorization', `Bearer ${token}`);
      headers.append('Cache-Control', 'no-cache, no-store, must-revalidate');
      headers.append('Pragma', 'no-cache');
      headers.append('Expires', '0');

      const response = await fetch('/api/upload-verification', {
        method: 'POST',
        headers: headers,
        body: formData,
        credentials: 'include', // Include cookies in the request
        cache: 'no-store' // Prevent caching
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Có lỗi xảy ra khi tải lên ảnh');
      }

      const data = await response.json();
      setVerificationStatus(prev => ({
        ...prev,
        [type === 'front' ? 'cccdFront' : 'cccdBack']: data.url,
        status: 'pending',
        submittedAt: new Date().toISOString()
      }));

      // Refresh user data after successful upload
      await refreshUser();
      
      toast({
        title: 'Thành công',
        description: `Đã tải lên ảnh ${type === 'front' ? 'mặt trước' : 'mặt sau'} thành công`,
        variant: 'default',
      });
      
      // Reset the file input
      if (type === 'front') {
        setFrontIdFile(null);
      } else {
        setBackIdFile(null);
      }

      setUploadStatus(prev => ({
        ...prev,
        [type]: { success: true, message: 'Tải lên thành công' }
      }));
    } catch (error) {
      console.error(`Lỗi khi tải lên ảnh ${type === 'front' ? 'mặt trước' : 'mặt sau'}:`, error);
      
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Có lỗi xảy ra khi tải lên ảnh',
        variant: 'destructive',
      });

      setUploadStatus(prev => ({
        ...prev,
        [type]: { success: false, message: error instanceof Error ? error.message : 'Có lỗi xảy ra' }
      }));
    } finally {
      setIsUploading(false);
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordForm(prev => ({
      ...prev,
      [name]: value
    }));

    if (passwordError) {
      setPasswordError('');
    }
  };

  const handleBankInfoChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setBankForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBankFormChange = handleBankInfoChange;

  const handleAccountInfoChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setAccountForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmitAccountInfo = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const token = getToken();
      if (!token) {
        throw new Error('Không tìm thấy token xác thực');
      }

      const response = await fetch('/api/update-account-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(accountForm)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Có lỗi xảy ra khi cập nhật thông tin tài khoản');
      }

      const data = await response.json();

      // Cập nhật user state ngay lập tức với thông tin mới
      if (data.user) {
        // Cập nhật local state nếu cần
        console.log('Account info updated successfully');
      }

      // Khóa chỉnh sửa sau khi cập nhật thành công
      setIsAccountInfoLocked(true);

      toast({
        title: 'Thành công',
        description: 'Cập nhật thông tin tài khoản thành công. Thông tin này không thể chỉnh sửa sau này.',
        variant: 'default',
      });
      
      // Refresh user data để đảm bảo đồng bộ
      await refreshUser();
    } catch (error) {
      console.error('Update account info error:', error);
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Có lỗi xảy ra khi cập nhật thông tin tài khoản',
        variant: 'destructive',
      });
    }
  };

  const handleSubmitBankInfo = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const token = getToken();
      if (!token) {
        throw new Error('Không tìm thấy token xác thực');
      }

      const response = await fetch('/api/update-bank-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(bankForm)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Có lỗi xảy ra khi cập nhật thông tin ngân hàng');
      }

      const data = await response.json();

      // Cập nhật user state ngay lập tức với thông tin mới
      if (data.user) {
        // Cập nhật local state nếu cần
        console.log('Bank info updated successfully');
      }

      // Khóa chỉnh sửa sau khi cập nhật thành công
      setIsBankInfoLocked(true);
      setIsEditingBankInfo(false);

      toast({
        title: 'Thành công',
        description: 'Cập nhật thông tin ngân hàng thành công. Thông tin này không thể chỉnh sửa sau này.',
        variant: 'default',
      });
      
      // Refresh user data để đảm bảo đồng bộ
      await refreshUser();
    } catch (error) {
      console.error('Update bank info error:', error);
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Có lỗi xảy ra khi cập nhật thông tin ngân hàng',
        variant: 'destructive',
      });
    }
  };

  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: 'Lỗi',
        description: 'Mật khẩu mới và xác nhận mật khẩu không khớp',
        variant: 'destructive',
      });
      return;
    }

    try {
      const token = getToken();
      if (!token) {
        throw new Error('Không tìm thấy token xác thực');
      }

      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Có lỗi xảy ra khi đổi mật khẩu');
      }

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });

      toast({
        title: 'Thành công',
        description: 'Đổi mật khẩu thành công',
        variant: 'default',
      });
    } catch (error) {
      console.error('Change password error:', error);
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Có lỗi xảy ra khi đổi mật khẩu',
        variant: 'destructive',
      });
    }
  };

  // Handle authentication state and redirects
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    // Check if we're already on the login page to prevent loops
    const isLoginPage = window.location.pathname === '/login';
    const token = getToken();
    
    // If no token and not on login page, redirect to login
    if (!token && !isLoginPage) {
      // Store the current URL to return after login
      const returnUrl = window.location.pathname + window.location.search;
      router.push(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      return;
    }

    // If we have a token but no user data yet, try to refresh
    if (token && !user && !isLoading) {
      refreshUser().catch(() => {
        // If refresh fails, clear invalid token and redirect to login
        localStorage.removeItem('authToken');
        router.push('/login');
      });
    }
  }, [user, isLoading, router, refreshUser]);

  // Show loading state only when we're still loading and have a token
  if ((isLoading && getToken()) || (!user && getToken())) {
    return (
      <div className="min-h-screen bg-gray-900 flex justify-center items-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-4 text-blue-500 animate-spin" />
          <p className="text-gray-400">Đang tải thông tin tài khoản...</p>
        </div>
      </div>
    );
  }

  // If no user and no token, we'll be redirected by the useEffect
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar - Hidden on mobile, shown on desktop */}
          <div className="hidden md:block w-64 flex-shrink-0">
            <div className="bg-gray-800 rounded-lg p-4 sticky top-4">
              <div className="flex items-center space-x-3 mb-6">
                <div className="bg-blue-600 w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold">
                  {user?.username?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <h2 className="font-medium">{user.username}</h2>
                  <p className="text-sm text-gray-400">{user.email}</p>
                </div>
              </div>
              
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`w-full text-left px-4 py-2 rounded-md ${activeTab === 'overview' ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                >
                  Tổng quan
                </button>
                <button
                  onClick={() => setActiveTab('account')}
                  className={`w-full text-left px-4 py-2 rounded-md ${activeTab === 'account' ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                >
                  Thông tin tài khoản
                </button>
                <button
                  onClick={() => setActiveTab('bank')}
                  className={`w-full text-left px-4 py-2 rounded-md ${activeTab === 'bank' ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                >
                  Thông tin ngân hàng
                </button>
                <button
                  onClick={() => setActiveTab('verify')}
                  className={`w-full text-left px-4 py-2 rounded-md ${activeTab === 'verify' ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                >
                  Xác minh danh tính
                </button>
                <button
                  onClick={() => setActiveTab('password')}
                  className={`w-full text-left px-4 py-2 rounded-md ${activeTab === 'password' ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                >
                  Đổi mật khẩu
                </button>
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2 rounded-md text-red-400 hover:bg-gray-700"
                >
                  Đăng xuất
                </button>
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {/* Mobile Navigation - Only show on mobile */}
            <div className="md:hidden mb-6">
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="bg-blue-600 w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold">
                    {user?.username?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <h2 className="font-medium text-sm">{user.username}</h2>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-3 py-2 text-sm rounded ${activeTab === 'overview' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                  >
                    Tổng quan
                  </button>
                  <button
                    onClick={() => setActiveTab('account')}
                    className={`px-3 py-2 text-sm rounded ${activeTab === 'account' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                  >
                    Tài khoản
                  </button>
                  <button
                    onClick={() => setActiveTab('bank')}
                    className={`px-3 py-2 text-sm rounded ${activeTab === 'bank' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                  >
                    Ngân hàng
                  </button>
                  <button
                    onClick={() => setActiveTab('verify')}
                    className={`px-3 py-2 text-sm rounded ${activeTab === 'verify' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                  >
                    Xác minh
                  </button>
                  <button
                    onClick={() => setActiveTab('password')}
                    className={`px-3 py-2 text-sm rounded ${activeTab === 'password' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                  >
                    Mật khẩu
                  </button>
                </div>
              </div>
            </div>
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <h1 className="text-2xl font-bold">Tổng quan tài khoản</h1>

                {/* Thông báo trạng thái cập nhật */}
                {(!isAccountInfoLocked || !isBankInfoLocked) && (
                  <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-4 text-sm text-yellow-200">
                    <h4 className="font-medium mb-2">⚠️ Hoàn thiện hồ sơ</h4>
                    <div className="space-y-1">
                      {!isAccountInfoLocked && (
                        <p>• <span className="font-medium">Thông tin tài khoản:</span> Chưa cập nhật - <button onClick={() => setActiveTab('account')} className="text-blue-300 hover:underline">Cập nhật ngay</button></p>
                      )}
                      {!isBankInfoLocked && (
                        <p>• <span className="font-medium">Thông tin ngân hàng:</span> Chưa cập nhật - <button onClick={() => setActiveTab('bank')} className="text-blue-300 hover:underline">Cập nhật ngay</button></p>
                      )}
                    </div>
                  </div>
                )}

                {isAccountInfoLocked && isBankInfoLocked && (
                  <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-4 text-sm text-green-200">
                    <h4 className="font-medium mb-2">✅ Hồ sơ đã hoàn thiện</h4>
                    <p>Tất cả thông tin tài khoản và ngân hàng đã được cập nhật đầy đủ.</p>
                  </div>
                )}
                
                <div className="bg-gray-800/50 p-6 rounded-lg">
                  <h3 className="text-lg font-medium mb-4">Thông tin cá nhân</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-gray-400">Username</p>
                      <p className="font-medium">{user.username || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Email</p>
                      <p>{user.email || 'Chưa cập nhật'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Họ và tên</p>
                      <p>{user.fullName || 'Chưa cập nhật'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Số điện thoại</p>
                      <p>{user.phone || 'Chưa cập nhật'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Địa chỉ</p>
                      <p>{user.address || 'Chưa cập nhật'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Ngày sinh</p>
                      <p>{user.dateOfBirth ? formatDate(user.dateOfBirth) : 'Chưa cập nhật'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Giới tính</p>
                      <p>{user.gender === 'male' ? 'Nam' : user.gender === 'female' ? 'Nữ' : user.gender === 'other' ? 'Khác' : 'Chưa cập nhật'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Ngày tạo tài khoản</p>
                      <p>{formatDate(user.createdAt)}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800/50 p-6 rounded-lg">
                  <h3 className="text-lg font-medium mb-4">Thông tin ngân hàng</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-gray-400">Tên chủ tài khoản</p>
                      <p>{user.bank?.accountHolder || user.bankInfo?.accountHolder || 'Chưa cập nhật'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Tên ngân hàng</p>
                      <p>{user.bank?.name || user.bankInfo?.name || 'Chưa cập nhật'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Loại tài khoản</p>
                      <p>{user.bank?.bankType || user.bankInfo?.bankType || 'Chưa cập nhật'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Số tài khoản</p>
                      <p>{user.bank?.accountNumber || user.bankInfo?.accountNumber || 'Chưa cập nhật'}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800/50 p-6 rounded-lg">
                  <h3 className="text-lg font-medium mb-4">Trạng thái tài khoản</h3>
                  <div className="space-y-3">
                    <p>
                      <span className="text-gray-400">Xác minh danh tính:</span>{' '}
                      {isVerified ? (
                        <span className="text-green-400 flex items-center">
                          <CheckCircle className="w-4 h-4 mr-1" /> Đã xác minh
                        </span>
                      ) : (
                        <span className="text-yellow-400">Chưa xác minh</span>
                      )}
                    </p>
                    <p><span className="text-gray-400">Số dư khả dụng:</span> <span className="font-bold text-green-400">{getBalance(user.balance).toLocaleString()} VNĐ</span></p>
                    <p><span className="text-gray-400">Trạng thái hoạt động:</span> <span className="text-green-400">Hoạt động</span></p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h1 className="text-2xl font-bold">Thông tin tài khoản</h1>
                </div>

                {!isAccountInfoLocked && (
                  <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 text-sm text-blue-200">
                    <h4 className="font-medium mb-2">📝 Cập nhật thông tin tài khoản</h4>
                    <p>Vui lòng cập nhật thông tin cá nhân của bạn để hoàn thiện hồ sơ. Thông tin này chỉ có thể cập nhật một lần.</p>
                  </div>
                )}

                {!isAccountInfoLocked ? (
                  <form onSubmit={handleSubmitAccountInfo} className="space-y-4 max-w-2xl">
                    <div>
                      <label htmlFor="fullName" className="block text-gray-400 mb-1">Họ và tên *</label>
                      <input
                        id="fullName"
                        name="fullName"
                        type="text"
                        value={accountForm.fullName}
                        onChange={handleAccountInfoChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                        required 
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className="block text-gray-400 mb-1">Số điện thoại *</label>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={accountForm.phone}
                        onChange={handleAccountInfoChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                        required 
                      />
                    </div>
                    <div>
                      <label htmlFor="address" className="block text-gray-400 mb-1">Địa chỉ</label>
                      <input
                        id="address"
                        name="address"
                        type="text"
                        value={accountForm.address}
                        onChange={handleAccountInfoChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="dateOfBirth" className="block text-gray-400 mb-1">Ngày sinh</label>
                      <input
                        id="dateOfBirth"
                        name="dateOfBirth"
                        type="date"
                        value={accountForm.dateOfBirth}
                        onChange={handleAccountInfoChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="gender" className="block text-gray-400 mb-1">Giới tính</label>
                      <select
                        id="gender"
                        name="gender"
                        value={accountForm.gender}
                        onChange={handleAccountInfoChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                      >
                        <option value="">Chọn giới tính</option>
                        <option value="male">Nam</option>
                        <option value="female">Nữ</option>
                        <option value="other">Khác</option>
                      </select>
                    </div>
                    <div className="flex space-x-3 pt-2">
                      <Button type="submit" disabled={isSaving}>
                        {isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Đang lưu...
                          </>
                        ) : 'Lưu thông tin'}
                      </Button>
                    </div>
                    <div className="text-sm text-yellow-400 bg-yellow-900/20 p-3 rounded">
                      ⚠️ Lưu ý: Thông tin này chỉ có thể cập nhật một lần và không thể chỉnh sửa sau này.
                    </div>
                  </form>
                ) : (
                  <div className="bg-gray-800/50 p-6 rounded-lg max-w-2xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-gray-400 text-sm">Họ và tên</p>
                        <p className="font-medium">{user?.fullName || 'Chưa cập nhật'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Số điện thoại</p>
                        <p className="font-medium">{user?.phone || 'Chưa cập nhật'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Địa chỉ</p>
                        <p className="font-medium">{user?.address || 'Chưa cập nhật'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Ngày sinh</p>
                        <p className="font-medium">{user?.dateOfBirth ? formatDate(user.dateOfBirth) : 'Chưa cập nhật'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Giới tính</p>
                        <p className="font-medium">
                          {user?.gender === 'male' ? 'Nam' : 
                           user?.gender === 'female' ? 'Nữ' : 
                           user?.gender === 'other' ? 'Khác' : 
                           'Chưa cập nhật'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Ngày cập nhật</p>
                        <p className="font-medium">{user?.updatedAt ? formatDate(user.updatedAt) : 'Chưa cập nhật'}</p>
                      </div>
                    </div>
                    <div className="mt-4 text-sm text-gray-400 bg-gray-700/50 p-3 rounded">
                      ℹ️ Thông tin đã được cập nhật và không thể chỉnh sửa.
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'bank' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h1 className="text-2xl font-bold">Thông tin ngân hàng</h1>
                </div>

                {!isBankInfoLocked && (
                  <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 text-sm text-blue-200">
                    <h4 className="font-medium mb-2">🏦 Cập nhật thông tin ngân hàng</h4>
                    <p>Vui lòng cập nhật thông tin ngân hàng của bạn để có thể thực hiện các giao dịch nạp/rút tiền. Thông tin này chỉ có thể cập nhật một lần.</p>
                  </div>
                )}

                {!isBankInfoLocked ? (
                  <form onSubmit={handleSubmitBankInfo} className="space-y-4 max-w-2xl">
                    <div>
                      <label htmlFor="fullName" className="block text-gray-400 mb-1">Tên chủ tài khoản</label>
                      <input
                        id="fullName"
                        name="accountHolder"
                        type="text"
                        value={bankForm.accountHolder}
                        onChange={handleBankFormChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                        required 
                      />
                    </div>
                    <div>
                      <label htmlFor="bankType" className="block text-gray-400 mb-1">Loại tài khoản</label>
                      <select
                        id="bankType"
                        name="bankType"
                        value={bankForm.bankType}
                        onChange={handleBankFormChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                        required
                      >
                        <option value="">Chọn loại tài khoản</option>
                        <option value="Ngân hàng">Ngân hàng</option>
                        <option value="Ví điện tử">Ví điện tử</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="bankName" className="block text-gray-400 mb-1">Tên ngân hàng/Ví điện tử</label>
                      <input
                        id="bankName"
                        name="bankName"
                        type="text"
                        value={bankForm.bankName}
                        onChange={handleBankFormChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                        required 
                      />
                    </div>
                    <div>
                      <label htmlFor="accountNumber" className="block text-gray-400 mb-1">Số tài khoản/Số điện thoại</label>
                      <input
                        id="accountNumber"
                        name="accountNumber"
                        type="text"
                        value={bankForm.accountNumber}
                        onChange={handleBankFormChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                        required 
                      />
                    </div>
                    <div className="flex space-x-3 pt-2">
                      <Button type="submit" disabled={isSaving}>
                        {isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Đang lưu...
                          </>
                        ) : 'Lưu thay đổi'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-gray-600 text-white hover:bg-gray-700"
                        onClick={() => setIsEditingBankInfo(false)}
                      >
                        Hủy
                      </Button>
                    </div>
                    <div className="text-sm text-yellow-400 bg-yellow-900/20 p-3 rounded">
                      ⚠️ Lưu ý: Thông tin ngân hàng chỉ có thể cập nhật một lần và không thể chỉnh sửa sau này.
                    </div>
                  </form>
                ) : (
                  <div className="bg-gray-800/50 p-6 rounded-lg max-w-2xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-gray-400 text-sm">Tên chủ tài khoản</p>
                        <p className="font-medium">{bankForm.accountHolder || 'Chưa cập nhật'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Loại tài khoản</p>
                        <p className="font-medium">{bankForm.bankType || 'Chưa cập nhật'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Tên ngân hàng/Ví điện tử</p>
                        <p className="font-medium">{bankForm.bankName || 'Chưa cập nhật'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Số tài khoản/SĐT</p>
                        <p className="font-medium">{bankForm.accountNumber || 'Chưa cập nhật'}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-sm">Trạng thái xác minh</p>
                        <p className="font-medium">
                          {bankForm.verified ? (
                            <span className="text-green-400">Đã xác minh</span>
                          ) : (
                            <span className="text-yellow-400">Chưa xác minh</span>
                          )}
                        </p>
                      </div>
                    </div>
                    {isBankInfoLocked && (
                      <div className="mt-4 text-sm text-gray-400 bg-gray-700/50 p-3 rounded">
                        ℹ️ Thông tin ngân hàng đã được cập nhật và không thể chỉnh sửa.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
  
            {activeTab === 'verify' && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold mb-2">Xác minh danh tính</h1>
                  <p className="text-gray-400">Vui lòng tải lên ảnh chụp 2 mặt CMND/CCCD của bạn</p>
                </div>

                {/* Hiển thị trạng thái xác minh */}
                {verificationStatus.status && (
                  <div className={`p-4 rounded-lg border ${
                    verificationStatus.status === 'approved' 
                      ? 'bg-green-900/20 border-green-800/50 text-green-200'
                      : verificationStatus.status === 'rejected'
                      ? 'bg-red-900/20 border-red-800/50 text-red-200'
                      : 'bg-yellow-900/20 border-yellow-800/50 text-yellow-200'
                  }`}>
                    <h4 className="font-medium mb-2">
                      {verificationStatus.status === 'approved' && '✅ Xác minh thành công'}
                      {verificationStatus.status === 'rejected' && '❌ Xác minh bị từ chối'}
                      {verificationStatus.status === 'pending' && '⏳ Đang chờ xét duyệt'}
                    </h4>
                    {verificationStatus.status === 'pending' && (
                      <p className="text-sm">Yêu cầu xác minh của bạn đã được gửi và đang chờ admin xét duyệt. Thời gian xử lý thường từ 1-3 ngày làm việc.</p>
                    )}
                    {verificationStatus.status === 'rejected' && verificationStatus.rejectionReason && (
                      <p className="text-sm">Lý do từ chối: {verificationStatus.rejectionReason}</p>
                    )}
                    {verificationStatus.submittedAt && (
                      <p className="text-sm mt-2">Ngày gửi: {formatDate(verificationStatus.submittedAt)}</p>
                    )}
                    {verificationStatus.reviewedAt && (
                      <p className="text-sm">Ngày xét duyệt: {formatDate(verificationStatus.reviewedAt)}</p>
                    )}
                  </div>
                )}

                {/* Hiển thị thông báo khi đã tải đầy đủ ảnh nhưng chưa submit */}
                {verificationStatus.cccdFront && verificationStatus.cccdBack && !verificationStatus.status && (
                  <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 text-sm text-blue-200">
                    <h4 className="font-medium mb-2">📋 Đã tải đầy đủ ảnh</h4>
                    <p>Bạn đã tải lên đầy đủ ảnh CMND/CCCD. Vui lòng chờ admin xét duyệt hoặc liên hệ hỗ trợ nếu cần thiết.</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Front ID Card */}
                  <div className="bg-gray-800/50 rounded-lg p-6">
                    <h3 className="font-medium mb-4">Mặt trước CMND/CCCD</h3>
                    {verificationStatus.cccdFront ? (
                      <div className="relative">
                        <img 
                          src={verificationStatus.cccdFront} 
                          alt="Mặt trước CMND/CCCD"
                          className="w-full h-auto rounded border border-gray-700"
                        />
                        {uploadStatus.front && (
                          <div className={`mt-2 text-sm ${uploadStatus.front.success ? 'text-green-400' : 'text-red-400'}`}>
                            {uploadStatus.front.success ? (
                              <span className="flex items-center">
                                <CheckCircle className="w-4 h-4 mr-1" />
                                {uploadStatus.front.message}
                              </span>
                            ) : (
                              <span className="flex items-center">
                                <XCircle className="w-4 h-4 mr-1" />
                                {uploadStatus.front.message}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center">
                        <input
                          type="file"
                          id="frontId"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileChange(e, 'front')}
                        />
                        <label
                          htmlFor="frontId"
                          className="flex flex-col items-center justify-center cursor-pointer p-6"
                        >
                          <UploadCloud className="w-12 h-12 text-gray-500 mb-2" />
                          <p className="text-gray-400">Tải lên mặt trước CMND/CCCD</p>
                          <p className="text-xs text-gray-500 mt-1">JPG, PNG (tối đa 5MB)</p>
                        </label>
                        {frontIdFile && (
                          <Button
                            onClick={() => handleUpload('front')}
                            disabled={isUploading}
                            className="mt-4 w-full"
                          >
                            {isUploading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Đang tải lên...
                              </>
                            ) : 'Xác nhận tải lên'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Back ID Card */}
                  <div className="bg-gray-800/50 rounded-lg p-6">
                    <h3 className="font-medium mb-4">Mặt sau CMND/CCCD</h3>
                    {verificationStatus.cccdBack ? (
                      <div className="relative">
                        <img 
                          src={verificationStatus.cccdBack} 
                          alt="Mặt sau CMND/CCCD"
                          className="w-full h-auto rounded border border-gray-700"
                        />
                        {uploadStatus.back && (
                          <div className={`mt-2 text-sm ${uploadStatus.back.success ? 'text-green-400' : 'text-red-400'}`}>
                            {uploadStatus.back.success ? (
                              <span className="flex items-center">
                                <CheckCircle className="w-4 h-4 mr-1" />
                                {uploadStatus.back.message}
                              </span>
                            ) : (
                              <span className="flex items-center">
                                <XCircle className="w-4 h-4 mr-1" />
                                {uploadStatus.back.message}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center">
                        <input
                          type="file"
                          id="backId"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileChange(e, 'back')}
                        />
                        <label
                          htmlFor="backId"
                          className="flex flex-col items-center justify-center cursor-pointer p-6"
                        >
                          <UploadCloud className="w-12 h-12 text-gray-500 mb-2" />
                          <p className="text-gray-400">Tải lên mặt sau CMND/CCCD</p>
                          <p className="text-xs text-gray-500 mt-1">JPG, PNG (tối đa 5MB)</p>
                        </label>
                        {backIdFile && (
                          <Button
                            onClick={() => handleUpload('back')}
                            disabled={isUploading}
                            className="mt-4 w-full"
                          >
                            {isUploading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Đang tải lên...
                              </>
                            ) : 'Xác nhận tải lên'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-8 bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 text-sm text-blue-200">
                  <h4 className="font-medium mb-2">Hướng dẫn tải ảnh:</h4>
                  <ul className="space-y-1 text-xs">
                    <li>• Ảnh phải rõ nét, không bị mờ, không bị che khuất</li>
                    <li>• Chụp đầy đủ 4 góc CMND/CCCD</li>
                    <li>• Đảm bảo thông tin trên CMND/CCCD dễ đọc</li>
                    <li>• Kích thước tối đa: 5MB/ảnh</li>
                  </ul>
                </div>

                <div className="p-4 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
                  <h4 className="font-medium text-yellow-300 mb-2">Lưu ý quan trọng:</h4>
                  <ul className="text-sm text-yellow-200 space-y-1">
                    <li>• Thông tin của bạn sẽ được bảo mật và chỉ sử dụng cho mục đích xác minh danh tính</li>
                    <li>• Thời gian xử lý: Thông thường từ 1-3 ngày làm việc</li>
                    <li>• Vui lòng đảm bảo thông tin trên CMND/CCCD rõ ràng và dễ đọc</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'password' && (
              <div className="space-y-6">
                <h1 className="text-2xl font-bold">Đổi mật khẩu</h1>
                
                <div className="bg-gray-800/50 p-6 rounded-lg max-w-2xl">
                  <form onSubmit={handleSubmitPassword} className="space-y-4">
                    <div>
                      <label htmlFor="currentPassword" className="block text-gray-400 mb-1">Mật khẩu hiện tại</label>
                      <input
                        id="currentPassword"
                        name="currentPassword"
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={handlePasswordChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="newPassword" className="block text-gray-400 mb-1">Mật khẩu mới</label>
                      <input
                        id="newPassword"
                        name="newPassword"
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={handlePasswordChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                        required
                        minLength={8}
                      />
                      <div className="mt-1 text-xs text-gray-500">
                        Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ cái và số
                      </div>
                      {passwordError && <p className="mt-1 text-sm text-red-400">{passwordError}</p>}
                    </div>
                    <div>
                      <label htmlFor="confirmPassword" className="block text-gray-400 mb-1">Xác nhận mật khẩu mới</label>
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={handlePasswordChange}
                        className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-white"
                        required
                        minLength={8}
                      />
                      {passwordForm.newPassword && passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                        <p className="mt-1 text-sm text-red-400">Mật khẩu xác nhận không khớp</p>
                      )}
                    </div>
                    <Button type="submit" className="mt-4 bg-blue-600 hover:bg-blue-700" disabled={isSaving}>
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Đang xử lý...
                        </>
                      ) : (
                        'Cập nhật mật khẩu'
                      )}
                    </Button>
                  </form>

                  <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-800/50 rounded-lg">
                    <h4 className="font-medium text-yellow-300 mb-2">Lưu ý bảo mật:</h4>
                    <ul className="text-sm text-yellow-200 space-y-1">
                      <li>• Mật khẩu phải có ít nhất 8 ký tự</li>
                      <li>• Bao gồm cả chữ cái và số</li>
                      <li>• Không được trùng với mật khẩu cũ</li>
                      <li>• Sau khi đổi mật khẩu, bạn sẽ cần đăng nhập lại</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};