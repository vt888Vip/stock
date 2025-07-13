'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '../../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Loader2, 
  Users, 
  TrendingUp, 
  DollarSign, 
  Settings, 
  LogOut, 
  Plus,
  Eye,
  CreditCard,
  History,
  Banknote,
  Building,
  Trash2,
  Edit,
  Target
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

type TabType = 'dashboard' | 'users' | 'transactions' | 'deposits' | 'banks' | 'predictions';

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isLoading, isAuthenticated, isAdmin, logout } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    activeUsers: 0
  });
  const [users, setUsers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [banks, setBanks] = useState([]);
  
  // Form states
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [newBank, setNewBank] = useState({
    name: '',
    accountNumber: '',
    accountHolder: '',
    branch: ''
  });
  
  // User management states
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);

  // Bank management states
  const [editingBank, setEditingBank] = useState<any>(null);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showBankDeleteConfirm, setShowBankDeleteConfirm] = useState(false);
  const [bankToDelete, setBankToDelete] = useState<any>(null);

  // Kiểm tra quyền truy cập
  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated()) {
        toast({
          title: 'Lỗi',
          description: 'Vui lòng đăng nhập để truy cập trang quản trị',
          variant: 'destructive',
        });
        router.push('/login');
        return;
      }

      if (!isAdmin()) {
        toast({
          title: 'Lỗi',
          description: 'Bạn không có quyền truy cập trang này',
          variant: 'destructive',
        });
        router.push('/');
        return;
      }
    }
  }, [isLoading, isAuthenticated, isAdmin, router, toast]);

  // Load dữ liệu
  useEffect(() => {
    if (isAuthenticated() && isAdmin()) {
      loadData();
    }
  }, [isAuthenticated, isAdmin]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load stats
      const statsResponse = await fetch('/api/admin/stats', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      }

      // Load users
      const usersResponse = await fetch('/api/admin/users', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        setUsers(usersData.users || []);
      }

      // Load transactions
      const transactionsResponse = await fetch('/api/admin/transactions', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (transactionsResponse.ok) {
        const transactionsData = await transactionsResponse.json();
        setTransactions(transactionsData.transactions || []);
      }

      // Load deposits
      const depositsResponse = await fetch('/api/admin/deposits', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (depositsResponse.ok) {
        const depositsData = await depositsResponse.json();
        setDeposits(depositsData.deposits || []);
      }

      // Load banks
      const banksResponse = await fetch('/api/admin/banks', {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (banksResponse.ok) {
        const banksData = await banksResponse.json();
        setBanks(banksData.banks || []);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể tải dữ liệu',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleDeposit = async () => {
    if (!selectedUser || !depositAmount) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng chọn người dùng và nhập số tiền',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/admin/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          userId: selectedUser._id,
          amount: parseFloat(depositAmount),
          note: depositNote
        })
      });

      if (response.ok) {
        toast({
          title: 'Thành công',
          description: 'Đã nạp tiền cho người dùng',
        });
        setDepositAmount('');
        setDepositNote('');
        setSelectedUser(null);
        loadData(); // Reload data
      } else {
        throw new Error('Failed to deposit');
      }
    } catch (error) {
      toast({
        title: 'Lỗi',
        description: 'Không thể nạp tiền',
        variant: 'destructive',
      });
    }
  };

  const handleAddBank = async () => {
    if (!newBank.name || !newBank.accountNumber || !newBank.accountHolder) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng điền đầy đủ thông tin ngân hàng',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/admin/banks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newBank)
      });

      if (response.ok) {
        toast({
          title: 'Thành công',
          description: 'Đã thêm ngân hàng mới',
        });
        setNewBank({ name: '', accountNumber: '', accountHolder: '', branch: '' });
        loadData(); // Reload data
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add bank');
      }
    } catch (error) {
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Không thể thêm ngân hàng',
        variant: 'destructive',
      });
    }
  };

  const handleEditBank = (bank: any) => {
    setEditingBank({ ...bank });
    setShowBankModal(true);
  };

  const handleUpdateBank = async () => {
    if (!editingBank.name || !editingBank.accountNumber || !editingBank.accountHolder) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng điền đầy đủ thông tin ngân hàng',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch('/api/admin/banks', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(editingBank)
      });

      if (response.ok) {
        toast({
          title: 'Thành công',
          description: 'Đã cập nhật ngân hàng',
        });
        setShowBankModal(false);
        setEditingBank(null);
        loadData(); // Reload data
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update bank');
      }
    } catch (error) {
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Không thể cập nhật ngân hàng',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteBank = (bank: any) => {
    setBankToDelete(bank);
    setShowBankDeleteConfirm(true);
  };

  const confirmDeleteBank = async () => {
    if (!bankToDelete) return;

    try {
      const response = await fetch(`/api/admin/banks?id=${bankToDelete._id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        toast({
          title: 'Thành công',
          description: 'Đã xóa ngân hàng',
        });
        setShowBankDeleteConfirm(false);
        setBankToDelete(null);
        loadData(); // Reload data
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete bank');
      }
    } catch (error) {
      toast({
        title: 'Lỗi',
        description: error instanceof Error ? error.message : 'Không thể xóa ngân hàng',
        variant: 'destructive',
      });
    }
  };

  const handleProcessDeposit = async (depositId: string, action: 'approve' | 'reject') => {
    try {
      const response = await fetch('/api/admin/deposits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          depositId,
          action,
          note: action === 'approve' ? 'Được duyệt bởi admin' : 'Bị từ chối bởi admin'
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: 'Thành công',
          description: result.message,
        });
        loadData(); // Reload data to update the list
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.message || 'Không thể xử lý yêu cầu nạp tiền',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error processing deposit:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể xử lý yêu cầu nạp tiền',
        variant: 'destructive',
      });
    }
  };

  // User management functions
  const handleViewUser = (user: any) => {
    setEditingUser({ ...user });
    setShowUserModal(true);
  };

  const handleEditUser = async () => {
    if (!editingUser) return;

    try {
      const response = await fetch(`/api/admin/users/${editingUser._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(editingUser)
      });

      if (response.ok) {
        toast({
          title: 'Thành công',
          description: 'Đã cập nhật thông tin người dùng',
        });
        setShowUserModal(false);
        setEditingUser(null);
        loadData();
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.message || 'Không thể cập nhật người dùng',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error updating user:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể cập nhật người dùng',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = (user: any) => {
    setUserToDelete(user);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      const response = await fetch(`/api/admin/users/${userToDelete._id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        toast({
          title: 'Thành công',
          description: 'Đã xóa người dùng',
        });
        setShowDeleteConfirm(false);
        setUserToDelete(null);
        loadData();
      } else {
        const error = await response.json();
        toast({
          title: 'Lỗi',
          description: error.message || 'Không thể xóa người dùng',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Lỗi',
        description: 'Không thể xóa người dùng',
        variant: 'destructive',
      });
    }
  };

  // Loading state
  if (isLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Đang tải...</p>
        </div>
      </div>
    );
  }

  // Không render nếu không có quyền
  if (!isAuthenticated() || !isAdmin()) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Admin Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Xin chào, {user?.username}
              </span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Đăng xuất
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <TrendingUp className="h-4 w-4 inline mr-2" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Users className="h-4 w-4 inline mr-2" />
              Quản lý người dùng
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'transactions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <History className="h-4 w-4 inline mr-2" />
              Lịch sử giao dịch
            </button>
            <button
              onClick={() => setActiveTab('deposits')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'deposits'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Banknote className="h-4 w-4 inline mr-2" />
              Nạp tiền
            </button>
            <button
              onClick={() => setActiveTab('banks')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'banks'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Building className="h-4 w-4 inline mr-2" />
              Quản lý ngân hàng
            </button>
            <button
              onClick={() => setActiveTab('predictions')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'predictions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Target className="h-4 w-4 inline mr-2" />
              Dự đoán phiên giao dịch
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Tổng người dùng</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalUsers}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Tổng nạp tiền</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {stats.totalDeposits.toLocaleString()}đ
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Tổng rút tiền</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {stats.totalWithdrawals.toLocaleString()}đ
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Người dùng hoạt động</CardTitle>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.activeUsers}</div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Users */}
            <Card>
              <CardHeader>
                <CardTitle>Người dùng mới nhất</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Vai trò</TableHead>
                      <TableHead>Số dư</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Ngày tạo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.slice(0, 5).map((user: any) => (
                      <TableRow key={user._id}>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-bold text-green-600">
                              {user.balance?.available?.toLocaleString() || 0}đ
                            </div>
                            <div className="text-xs text-gray-500">
                              Đã nạp: {user.totalDeposited?.toLocaleString() || 0}đ
                            </div>
                            {user.totalWithdrawn > 0 && (
                              <div className="text-xs text-red-500">
                                Đã rút: {user.totalWithdrawn?.toLocaleString() || 0}đ
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.status?.active ? 'default' : 'destructive'}>
                            {user.status?.active ? 'Hoạt động' : 'Khóa'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <Card>
            <CardHeader>
              <CardTitle>Quản lý người dùng</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Vai trò</TableHead>
                    <TableHead>Số dư</TableHead>
                    <TableHead>CCCD</TableHead>
                    <TableHead>Ngân hàng</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead>Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user: any) => (
                    <TableRow key={user._id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>{user.email || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                          {user.role}
                        </Badge>
                      </TableCell>
                                              <TableCell>
                          <div>
                            <div className="font-bold text-green-600">
                              {user.balance?.available?.toLocaleString() || 0}đ
                            </div>
                            <div className="text-xs text-gray-500">
                              Đã nạp: {user.totalDeposited?.toLocaleString() || 0}đ
                            </div>
                          </div>
                        </TableCell>
                      <TableCell>
                        {user.verification?.verified ? (
                          <Badge variant="default">Đã xác minh</Badge>
                        ) : (
                          <Badge variant="destructive">Chưa xác minh</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.bank?.name ? (
                          <div>
                            <div className="font-medium">{user.bank.name}</div>
                            <div className="text-sm text-gray-500">{user.bank.accountNumber}</div>
                            <div className="text-xs text-gray-400">{user.bank.accountHolder}</div>
                          </div>
                        ) : (
                          'Chưa cập nhật'
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.status?.active ? 'default' : 'destructive'}>
                          {user.status?.active ? 'Hoạt động' : 'Khóa'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewUser(user)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteUser(user)}
                            disabled={user.role === 'admin'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <Card>
            <CardHeader>
              <CardTitle>Lịch sử giao dịch</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Người dùng</TableHead>
                    <TableHead>Loại</TableHead>
                    <TableHead>Số tiền</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    <TableHead>Thời gian</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction: any) => (
                    <TableRow key={transaction._id}>
                      <TableCell className="font-medium">{transaction.username}</TableCell>
                      <TableCell>
                        <Badge variant={transaction.type === 'deposit' ? 'default' : 'secondary'}>
                          {transaction.type === 'deposit' ? 'Nạp tiền' : 'Rút tiền'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={transaction.type === 'deposit' ? 'text-green-600' : 'text-red-600'}>
                          {transaction.amount.toLocaleString()}đ
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={transaction.status === 'completed' ? 'default' : 'destructive'}>
                          {transaction.status === 'completed' ? 'Hoàn thành' : 'Đang xử lý'}
                        </Badge>
                      </TableCell>
                      <TableCell>{transaction.note || 'N/A'}</TableCell>
                      <TableCell>
                        {new Date(transaction.createdAt).toLocaleString('vi-VN')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Deposits Tab */}
        {activeTab === 'deposits' && (
          <div className="space-y-6">
            {/* Manual Deposit Form */}
            <Card>
              <CardHeader>
                <CardTitle>Nạp tiền thủ công</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="user">Chọn người dùng</Label>
                                         <Select onValueChange={(value: string) => {
                       const user = users.find((u: any) => u._id === value);
                       setSelectedUser(user);
                     }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn người dùng" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user: any) => (
                          <SelectItem key={user._id} value={user._id}>
                            {user.username} - {user.balance?.available?.toLocaleString() || 0}đ (Đã nạp: {user.totalDeposited?.toLocaleString() || 0}đ)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="amount">Số tiền</Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="Nhập số tiền"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Label htmlFor="note">Ghi chú</Label>
                  <Textarea
                    id="note"
                    placeholder="Ghi chú về giao dịch"
                    value={depositNote}
                    onChange={(e) => setDepositNote(e.target.value)}
                  />
                </div>
                <Button onClick={handleDeposit} className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Nạp tiền
                </Button>
              </CardContent>
            </Card>

            {/* Deposit Requests */}
            <Card>
              <CardHeader>
                <CardTitle>Yêu cầu nạp tiền</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Người dùng</TableHead>
                      <TableHead>Số tiền</TableHead>
                      <TableHead>Ngân hàng</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Thời gian</TableHead>
                      <TableHead>Hành động</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deposits.map((deposit: any) => (
                      <TableRow key={deposit._id}>
                        <TableCell className="font-medium">{deposit.username}</TableCell>
                        <TableCell>{deposit.amount.toLocaleString()}đ</TableCell>
                        <TableCell>
                          {deposit.bankInfo?.name ? (
                            <div>
                              <div className="font-medium">{deposit.bankInfo.name}</div>
                              <div className="text-sm text-gray-500">{deposit.bankInfo.accountNumber}</div>
                            </div>
                          ) : 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            deposit.status === 'CHO XU LY' ? 'secondary' : 
                            deposit.status === 'DA DUYET' ? 'default' : 
                            'destructive'
                          }>
                            {deposit.status === 'CHO XU LY' ? 'Chờ xử lý' : 
                             deposit.status === 'DA DUYET' ? 'Đã duyệt' : 
                             deposit.status === 'TU CHOI' ? 'Đã từ chối' : 
                             deposit.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(deposit.createdAt).toLocaleString('vi-VN')}
                        </TableCell>
                        <TableCell>
                          {deposit.status === 'CHO XU LY' && (
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="default"
                                onClick={() => handleProcessDeposit(deposit._id, 'approve')}
                              >
                                Duyệt
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => handleProcessDeposit(deposit._id, 'reject')}
                              >
                                Từ chối
                              </Button>
                            </div>
                          )}
                          {deposit.status === 'DA DUYET' && (
                            <Badge variant="default">Đã duyệt</Badge>
                          )}
                          {deposit.status === 'TU CHOI' && (
                            <Badge variant="destructive">Đã từ chối</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Banks Tab */}
        {activeTab === 'banks' && (
          <div className="space-y-6">
            {/* Add Bank Form */}
            <Card>
              <CardHeader>
                <CardTitle>Thêm ngân hàng mới</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="bankName">Tên ngân hàng</Label>
                    <Input
                      id="bankName"
                      placeholder="VD: Vietcombank"
                      value={newBank.name}
                      onChange={(e) => setNewBank({...newBank, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="accountNumber">Số tài khoản</Label>
                    <Input
                      id="accountNumber"
                      placeholder="Số tài khoản"
                      value={newBank.accountNumber}
                      onChange={(e) => setNewBank({...newBank, accountNumber: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="accountHolder">Chủ tài khoản</Label>
                    <Input
                      id="accountHolder"
                      placeholder="Tên chủ tài khoản"
                      value={newBank.accountHolder}
                      onChange={(e) => setNewBank({...newBank, accountHolder: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="branch">Chi nhánh</Label>
                    <Input
                      id="branch"
                      placeholder="Chi nhánh (tùy chọn)"
                      value={newBank.branch}
                      onChange={(e) => setNewBank({...newBank, branch: e.target.value})}
                    />
                  </div>
                </div>
                <Button onClick={handleAddBank} className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Thêm ngân hàng
                </Button>
              </CardContent>
            </Card>

            {/* Banks List */}
            <Card>
              <CardHeader>
                <CardTitle>Danh sách ngân hàng</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên ngân hàng</TableHead>
                      <TableHead>Số tài khoản</TableHead>
                      <TableHead>Chủ tài khoản</TableHead>
                      <TableHead>Chi nhánh</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {banks.map((bank: any) => (
                      <TableRow key={bank._id}>
                        <TableCell className="font-medium">{bank.name}</TableCell>
                        <TableCell>{bank.accountNumber}</TableCell>
                        <TableCell>{bank.accountHolder}</TableCell>
                        <TableCell>{bank.branch || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant={bank.status === 'active' ? 'default' : 'secondary'}>
                            {bank.status === 'active' ? 'Hoạt động' : 'Không hoạt động'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditBank(bank)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteBank(bank)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Predictions Tab */}
        {activeTab === 'predictions' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dự đoán phiên giao dịch</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Target className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Quản lý dự đoán phiên giao dịch</h3>
                  <p className="text-gray-600 mb-4">
                    Xem trước và quản lý kết quả của 30 phiên giao dịch tiếp theo
                  </p>
                  <Button 
                    onClick={() => router.push('/admin/predictions')}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Target className="h-4 w-4 mr-2" />
                    Mở trang dự đoán
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* User Edit Modal */}
        <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Thông tin người dùng</DialogTitle>
            </DialogHeader>
            {editingUser && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Username</Label>
                    <Input
                      value={editingUser.username || ''}
                      onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input
                      value={editingUser.email || ''}
                      onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Vai trò</Label>
                    <Select
                      value={editingUser.role || 'user'}
                      onValueChange={(value) => setEditingUser({...editingUser, role: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Số dư khả dụng</Label>
                    <Input
                      type="number"
                      value={editingUser.balance?.available || 0}
                      onChange={(e) => setEditingUser({
                        ...editingUser, 
                        balance: {...editingUser.balance, available: Number(e.target.value)}
                      })}
                    />
                  </div>
                  <div>
                    <Label>Trạng thái hoạt động</Label>
                    <Select
                      value={editingUser.status?.active ? 'true' : 'false'}
                      onValueChange={(value) => setEditingUser({
                        ...editingUser, 
                        status: {...editingUser.status, active: value === 'true'}
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Hoạt động</SelectItem>
                        <SelectItem value="false">Khóa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Thông tin ngân hàng</Label>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <Input
                      placeholder="Tên ngân hàng"
                      value={editingUser.bank?.name || ''}
                      onChange={(e) => setEditingUser({
                        ...editingUser, 
                        bank: {...editingUser.bank, name: e.target.value}
                      })}
                    />
                    <Input
                      placeholder="Số tài khoản"
                      value={editingUser.bank?.accountNumber || ''}
                      onChange={(e) => setEditingUser({
                        ...editingUser, 
                        bank: {...editingUser.bank, accountNumber: e.target.value}
                      })}
                    />
                    <Input
                      placeholder="Chủ tài khoản"
                      value={editingUser.bank?.accountHolder || ''}
                      onChange={(e) => setEditingUser({
                        ...editingUser, 
                        bank: {...editingUser.bank, accountHolder: e.target.value}
                      })}
                    />
                  </div>
                </div>

                <div>
                  <Label>Xác minh CCCD</Label>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <Label className="text-sm">Mặt trước</Label>
                      {editingUser.verification?.cccdFront && (
                        <img 
                          src={editingUser.verification.cccdFront} 
                          alt="CCCD Front" 
                          className="w-full h-32 object-cover rounded border"
                        />
                      )}
                    </div>
                    <div>
                      <Label className="text-sm">Mặt sau</Label>
                      {editingUser.verification?.cccdBack && (
                        <img 
                          src={editingUser.verification.cccdBack} 
                          alt="CCCD Back" 
                          className="w-full h-32 object-cover rounded border"
                        />
                      )}
                    </div>
                  </div>
                  <div className="mt-2">
                    <Select
                      value={editingUser.verification?.verified ? 'true' : 'false'}
                      onValueChange={(value) => setEditingUser({
                        ...editingUser, 
                        verification: {...editingUser.verification, verified: value === 'true'}
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Đã xác minh</SelectItem>
                        <SelectItem value="false">Chưa xác minh</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowUserModal(false)}>
                    Hủy
                  </Button>
                  <Button onClick={handleEditUser}>
                    <Edit className="h-4 w-4 mr-2" />
                    Cập nhật
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Xác nhận xóa</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p>Bạn có chắc chắn muốn xóa người dùng <strong>{userToDelete?.username}</strong>?</p>
              <p className="text-sm text-gray-500 mt-2">Hành động này không thể hoàn tác.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Hủy
              </Button>
              <Button variant="destructive" onClick={confirmDeleteUser}>
                <Trash2 className="h-4 w-4 mr-2" />
                Xóa
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bank Edit Modal */}
        <Dialog open={showBankModal} onOpenChange={setShowBankModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Sửa thông tin ngân hàng</DialogTitle>
            </DialogHeader>
            {editingBank && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tên ngân hàng</Label>
                    <Input
                      value={editingBank.name || ''}
                      onChange={(e) => setEditingBank({...editingBank, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Số tài khoản</Label>
                    <Input
                      value={editingBank.accountNumber || ''}
                      onChange={(e) => setEditingBank({...editingBank, accountNumber: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Chủ tài khoản</Label>
                    <Input
                      value={editingBank.accountHolder || ''}
                      onChange={(e) => setEditingBank({...editingBank, accountHolder: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Chi nhánh</Label>
                    <Input
                      value={editingBank.branch || ''}
                      onChange={(e) => setEditingBank({...editingBank, branch: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Trạng thái</Label>
                    <Select
                      value={editingBank.status || 'active'}
                      onValueChange={(value) => setEditingBank({...editingBank, status: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Hoạt động</SelectItem>
                        <SelectItem value="inactive">Không hoạt động</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button onClick={handleUpdateBank} className="flex-1">
                    Cập nhật
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowBankModal(false)}
                    className="flex-1"
                  >
                    Hủy
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Bank Delete Confirmation Dialog */}
        <Dialog open={showBankDeleteConfirm} onOpenChange={setShowBankDeleteConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Xác nhận xóa ngân hàng</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p>Bạn có chắc chắn muốn xóa ngân hàng này không?</p>
              {bankToDelete && (
                <div className="mt-4 p-3 bg-gray-100 rounded">
                  <p><strong>Tên ngân hàng:</strong> {bankToDelete.name}</p>
                  <p><strong>Số tài khoản:</strong> {bankToDelete.accountNumber}</p>
                  <p><strong>Chủ tài khoản:</strong> {bankToDelete.accountHolder}</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                variant="destructive" 
                onClick={confirmDeleteBank}
                className="flex-1"
              >
                Xóa
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowBankDeleteConfirm(false)}
                className="flex-1"
              >
                Hủy
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

