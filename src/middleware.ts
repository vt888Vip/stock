import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

// Danh sách domain được phép truy cập - Local only
const allowedOrigins = [
  // Môi trường phát triển local
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];

// Các header bảo mật
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
} as const;

// Hàm thiết lập CORS headers
function setCorsHeaders(response: NextResponse, origin: string) {
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Max-Age', '86400'); // 24 giờ
  response.headers.set('Vary', 'Origin');
  return response;
}

// Hàm lấy token từ request
function getTokenFromRequest(request: NextRequest): string | null {
  // 1. Ưu tiên lấy từ header Authorization
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    return token;
  }
  
  // 2. Thử lấy từ cookie
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    
    const token = cookies['token'];
    if (token) {
      return token;
    }
  }
  
  // 3. Thử lấy từ localStorage (cho client-side rendering)
  // Lưu ý: Middleware chạy trên server nên không thể truy cập trực tiếp localStorage
  // Nhưng có thể kiểm tra xem có token trong URL không (cho trường hợp redirect từ OAuth)
  const url = new URL(request.url);
  const tokenFromUrl = url.searchParams.get('token');
  if (tokenFromUrl) {
    return tokenFromUrl;
  }
  
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get('origin') || '';
  const isAllowedOrigin = allowedOrigins.includes(origin) ||
    (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost'));

  // Xử lý preflight request
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    return setCorsHeaders(response, origin);
  }

  // Tạo response mới với CORS headers nếu cần
  let response: NextResponse;
  
  if (isAllowedOrigin) {
    const newResponse = NextResponse.next();
    setCorsHeaders(newResponse, origin);
    response = newResponse;
  } else {
    response = NextResponse.next();
  }
  
  // Danh sách các đường dẫn tĩnh và công khai không cần xác thực
  const staticPaths = [
    '/_next',
    '/favicon.ico',
    '/site.webmanifest',
    '/images',
    '/icons',
    '/assets',
    '/fonts',
    '/public'
  ];
  
  // Kiểm tra xem có phải là tài nguyên tĩnh không
  const isStaticPath = staticPaths.some(path => pathname.startsWith(path));
  const hasFileExtension = pathname.includes('.'); // Bất kỳ tệp có phần mở rộng
  
  // Nếu là tài nguyên tĩnh, cho phép truy cập mà không cần xác thực
  if (isStaticPath || hasFileExtension) {
    return response;
  }
  
  // Bỏ qua xác thực cho các API route công khai
  const publicApiPaths = [
    '/api/auth',
    '/api/health'
  ];
  
  const isPublicApiPath = publicApiPaths.some(path => pathname.startsWith(path));
  
  if (isPublicApiPath) {
    return response;
  }
  
  // Kiểm tra token trong cookie hoặc header (chỉ để log)
  const token = getTokenFromRequest(request);
  
  // Vô hiệu hóa hoàn toàn phần xác thực trong middleware
  // Để client-side xử lý toàn bộ xác thực
  
  // Trả về response ban đầu mà không có bất kỳ kiểm tra xác thực nào
  return response;

  // Xử lý preflight request (OPTIONS) đã được xử lý ở trên
  if (request.method === 'OPTIONS') {
    return response;
  }

  // Chặn request từ origin không được phép
  if (origin && !isAllowedOrigin) {
    return new NextResponse(
      JSON.stringify({
        success: false,
        message: 'Not allowed by CORS',
        allowedOrigins
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  // Public routes that don't require authentication
  const publicRoutes = [
    "/",                // Trang chủ
    "/login",           // Trang đăng nhập
    "/register",        // Trang đăng ký
    "/auth-check",      // Trang kiểm tra xác thực
    "/about",           // Trang giới thiệu
    "/contact",         // Trang liên hệ
    "/news",            // Trang tin tức
    "/products",        // Trang sản phẩm
    "/services"         // Trang dịch vụ
  ];
  
  // Kiểm tra xem đường dẫn hiện tại có phải là trang công khai không
  const isPublicPage = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
  
  // Nếu là trang chủ hoặc các trang con của trang chủ, luôn cho phép truy cập
  if (pathname === "/" || pathname === "" || isPublicPage) {
    return response;
  }
  
  // API routes that don't require authentication
  const publicApiRoutes = [
    "/api/auth/me", 
    "/api/public",
    "/api/login",
    "/api/auth/login",
    "/api/register",
    "/api/auth/verify",
    "/api/trading-sessions",
    "/api/test-session",
    "/api/debug-session",
    "/api/test-save-session-result",
    "/api/trades/publish-results",
    "/api/test-balance"
  ];
  
  // Skip auth check for public API routes
  if (publicApiRoutes.some(route => pathname.startsWith(route))) {
    return response;
  }

  // API routes that should be handled separately
  if (pathname.startsWith("/api/")) {
    // Chặn request từ origin không được phép
    if (origin && !isAllowedOrigin) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          message: 'Not allowed by CORS',
          allowedOrigins
        }),
        {
          status: 403,
          headers: { 
            'Content-Type': 'application/json',
            ...Object.fromEntries(
              Object.entries(securityHeaders).map(([k, v]) => [k, v])
            )
          }
        }
      );
    }

    // Thêm các header bảo mật cho API
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    // Thêm CORS headers cho các response API
    if (isAllowedOrigin) {
      response = setCorsHeaders(response, origin);
    }
    
    return response;
  }

  // Static files and Next.js internals
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/images/") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".gif") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js")
  ) {
    return response;
  }

  // Check if current path is public
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
  
  // Kiểm tra xem URL có chứa tham số auth=true không
  const url = new URL(request.url);
  const hasAuthParam = url.searchParams.get('auth') === 'true';
  const noRedirect = url.searchParams.get('redirect') === 'false';
  
  // Nếu URL có tham số auth=true, cho phép truy cập mà không cần chuyển hướng
  if (hasAuthParam && noRedirect) {
    return response;
  }

  // Kiểm tra xem có phải là tài nguyên tĩnh không
  const isStaticResource = (
    pathname.includes('.') || // Bất kỳ tệp có phần mở rộng
    pathname.startsWith('/images/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/fonts/') ||
    pathname.startsWith('/public/') ||
    pathname.startsWith('/_next/')
  );
  
  // Nếu là tài nguyên tĩnh, cho phép truy cập mà không cần xác thực
  if (isStaticResource) {
    return response;
  }

  // Nếu không có token, vẫn cho phép truy cập và để client-side xử lý xác thực
  if (!token) {
    // Nếu là trang công khai hoặc API, cho phép truy cập
    if (isPublicRoute || pathname.startsWith('/api/')) {
      return response;
    }
    
    // Cho phép truy cập vào các trang admin và để client-side kiểm tra xác thực
    // Client-side sẽ tự chuyển hướng nếu không có quyền truy cập
    return response;
  }

  // If has token but trying to access auth pages, redirect to home
  if (token && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Thêm các header bảo mật cho các trang thông thường
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });



  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - site.webmanifest (web app manifest)
     * - images/ (image files)
     * - icons/ (icon files)
     * - assets/ (static assets)
     * - public/ (public files)
     * - .*\..* (files with extensions)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|site.webmanifest|.*\..*|images/.*|icons/.*|assets/.*|public/.*).*)",
  ],
}
