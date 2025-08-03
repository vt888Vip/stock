"use client"

import { useRouter, usePathname } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { useState, useEffect } from "react"
import { useAuth } from "@/lib/useAuth"
import { Button } from "./ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { User as UserIcon, LogOut, Wallet, CreditCard, ArrowUpRight, ArrowDownLeft, 
  Clock, ChevronDown, Phone, Menu, X, Headphones } from "lucide-react"
import loading from "@/app/(auth)/login/loading"

export default function Header() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [isWalletDropdownOpen, setIsWalletDropdownOpen] = useState(false)
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false)

  // Handle scrolling effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleLogout = async () => {
    try {
      await logout()
      router.push("/")
    } catch (error) {
      console.error("Logout error:", error)
    }
  }
  
  // Track pathname for route changes
  const pathname = usePathname()
  
  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false)
    setIsWalletDropdownOpen(false)
    setIsUserDropdownOpen(false)
  }, [pathname])

  return (
    <header className={`bg-white border-b border-gray-100 sticky top-0 z-50 ${scrolled ? 'shadow-md' : 'shadow-sm'}`}>
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                 {/* Left side: Logo and Navigation */}
         <div className="flex items-center">
           {/* Logo */}
           <Link href="/" className="flex items-center mr-4">
             <Image 
               src="/logo.png" 
               alt="London HSC" 
               width={120} 
               height={100} 
               className="h-10 w-auto"
               priority
             />
           </Link>
           
           {/* Desktop Navigation - chỉ hiển thị khi đã đăng nhập */}
           {user && (
             <div className="hidden md:flex items-center space-x-2">
               <Link href="/">
                 <Button
                   variant="outline"
                   size="sm"
                   className="text-blue-600 border-blue-600 bg-white hover:bg-blue-50"
                 >
                   Trang chủ
                 </Button>
               </Link>
               <Link href="/trade">
                 <Button
                   variant="outline"
                   size="sm"
                   className="text-blue-600 border-blue-600 bg-white hover:bg-blue-50"
                 >
                   Giao dịch
                 </Button>
               </Link>
               
               {/* Wallet dropdown */}
               <DropdownMenu open={isWalletDropdownOpen} onOpenChange={setIsWalletDropdownOpen}>
                 <DropdownMenuTrigger asChild>
                   <Button 
                     variant="outline" 
                     size="sm" 
                     className="text-blue-600 border-blue-600 bg-white hover:bg-blue-50 font-semibold underline"
                     style={{ textDecoration: 'underline', fontWeight: 600, color: 'rgb(17, 125, 187)' }}
                   >
                     <ChevronDown className="h-4 w-4 mr-1" />
                     <span>Ví</span>
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent align="start" className="w-56">
                   <DropdownMenuItem onClick={() => setIsWalletDropdownOpen(false)}>
                     <Link href="/deposit" className="flex items-center w-full">
                       <ArrowDownLeft className="mr-2 h-4 w-4" />
                       <span>Nạp tiền</span>
                     </Link>
                   </DropdownMenuItem>
                   <DropdownMenuItem onClick={() => setIsWalletDropdownOpen(false)}>
                     <Link href="/withdraw" className="flex items-center w-full">
                       <ArrowUpRight className="mr-2 h-4 w-4" />
                       <span>Rút tiền</span>
                     </Link>
                   </DropdownMenuItem>
                   <DropdownMenuItem onClick={() => setIsWalletDropdownOpen(false)}>
                     <Link href="/transaction-history" className="flex items-center w-full">
                       <Clock className="mr-2 h-4 w-4" />
                       <span>Lịch sử giao dịch</span>
                     </Link>
                   </DropdownMenuItem>
                 </DropdownMenuContent>
               </DropdownMenu>
             </div>
           )}
         </div>
        
                 {/* Right side */}
         <div className="flex items-center gap-3">
          
                     {/* Mobile menu button - chỉ hiển thị khi đã đăng nhập */}
                       {user && (
              <div className="flex items-center gap-1 md:hidden">
                {/* Menu button */}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                >
                  {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </Button>
                
                {/* Avatar button */}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full overflow-hidden h-6 w-6"
                  onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                >
                  <Image 
                    src={user.avatar || "/avatars/default.png"} 
                    alt={user.username || "User"} 
                    width={24} 
                    height={24} 
                    className="h-full w-full object-cover"
                  />
                </Button>
              </div>
            )}
          
                                 {/* User Account dropdown */}
            {user ? (
              <div className="flex items-center gap-2">
                {/* CSKH button - chỉ hiển thị trên desktop khi đã đăng nhập */}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="hidden md:flex text-blue-600 hover:bg-blue-50 gap-2"
                  onClick={() => window.open("https://t.me/DICHVUCSKHLSE", "_blank")}
                >
                  <Headphones className="h-4 w-4" />
                  CSKH
                </Button>
                
                                 <DropdownMenu open={isUserDropdownOpen} onOpenChange={setIsUserDropdownOpen}>
                   <DropdownMenuTrigger asChild>
                     <Button variant="outline" size="sm" className="gap-2 hidden md:flex">
                       <span>Tài khoản</span>
                       <ChevronDown className="h-4 w-4" />
                     </Button>
                   </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {/* Username display */}
                  <div className="px-4 py-2 text-sm font-medium">{user.username || 'tdnm'}</div>
                  
                  <DropdownMenuItem onClick={() => setIsUserDropdownOpen(false)}>
                    <Link href="/account" className="flex items-center w-full">
                      <span>Tổng quan tài khoản</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => setIsUserDropdownOpen(false)}>
                    <Link href="/account?tab=password" className="flex items-center w-full">
                      <span>Cài đặt bảo mật</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => setIsUserDropdownOpen(false)}>
                    <Link href="/account?tab=verification" className="flex items-center w-full">
                      <span>Xác minh danh tính</span>
                    </Link>
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem onClick={() => {
                    setIsUserDropdownOpen(false)
                    handleLogout()
                  }}>
                    <span>Đăng xuất</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
           </div>
                         ) : (
               <div className="flex items-center gap-1">
                 <Link href="/login">
                   <Button 
                     variant="default" 
                     size="sm" 
                     className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-1.5 sm:px-3 h-7 sm:h-9"
                   >
                     <span className="hidden sm:inline">Đăng nhập</span>
                     <span className="sm:hidden">Đăng nhập</span>
                   </Button>
                 </Link>
                 <Link href="/register">
                   <Button 
                     variant="outline" 
                     size="sm" 
                     className="border-blue-600 text-blue-600 hover:bg-blue-50 text-xs px-1.5 sm:px-3 h-7 sm:h-9"
                   >
                     <span className="hidden sm:inline">Mở tài khoản</span>
                     <span className="sm:hidden">Tài khoản</span>
                   </Button>
                 </Link>
                 <Button 
                   variant="ghost" 
                   size="sm" 
                   className="text-blue-600 hover:bg-blue-50 gap-1 px-1 sm:px-2 h-7 sm:h-9"
                   onClick={() => window.open("https://t.me/DICHVUCSKHLSE", "_blank")}
                 >
                   <Headphones className="h-3 w-3 sm:h-4 sm:w-4" />
                   <span className="hidden sm:inline">CSKH</span>
                 </Button>
               </div>
             )}
        </div>
      </div>
      
      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="absolute top-full left-0 right-0 bg-white border-b border-gray-200 shadow-lg z-40 md:hidden">
          <div className="p-3">
            <nav className="flex flex-col space-y-1">
              <Link 
                href="/" 
                className="py-2 px-3 rounded-md text-sm hover:bg-gray-50 transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Trang chủ
              </Link>
              <Link 
                href="/trade" 
                className="py-2 px-3 rounded-md text-sm hover:bg-gray-50 transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Giao dịch
              </Link>
              <Link 
                href="/transaction-history" 
                className="py-2 px-3 rounded-md text-sm hover:bg-gray-50 transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Lịch sử giao dịch
              </Link>
              <Link 
                href="/account" 
                className="py-2 px-3 rounded-md text-sm hover:bg-gray-50 transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Tổng quan tài khoản
              </Link>
              <Link 
                href="/account?tab=password" 
                className="py-2 px-3 rounded-md text-sm hover:bg-gray-50 transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Đổi mật khẩu
              </Link>
              <Link 
                href="/account?tab=verification" 
                className="py-2 px-3 rounded-md text-sm hover:bg-gray-50 transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Xác minh danh tính
              </Link>
            </nav>
            
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Link 
                href="/deposit" 
                className="bg-green-600 text-white py-2 px-3 rounded-md flex justify-center items-center font-medium text-xs"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Nạp tiền
              </Link>
              <Link 
                href="/withdraw" 
                className="bg-green-600 text-white py-2 px-3 rounded-md flex justify-center items-center font-medium text-xs"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Rút tiền
              </Link>
            </div>
            
            {/* CSKH button for mobile */}
            <div className="mt-3">
              <button 
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  window.open("https://t.me/DICHVUCSKHLSE", "_blank")
                }}
                className="w-full bg-blue-600 text-white py-2 px-3 rounded-md flex justify-center items-center font-medium text-xs gap-2"
              >
                <Headphones className="h-3 w-3" />
                CSKH
              </button>
            </div>
            
            <div className="mt-2">
              <button 
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  handleLogout()
                }}
                className="w-full bg-white border border-gray-300 text-gray-700 py-2 rounded-md flex justify-center items-center font-medium text-xs"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}