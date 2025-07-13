#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Kiểm tra chuẩn bị deploy lên Vercel...\n');

// Kiểm tra các file cần thiết
const requiredFiles = [
  'package.json',
  'next.config.js',
  'vercel.json',
  'tsconfig.json',
  'tailwind.config.js'
];

console.log('📋 Kiểm tra các file cần thiết:');
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - KHÔNG TỒN TẠI`);
  }
});

// Kiểm tra package.json
console.log('\n📦 Kiểm tra package.json:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  if (packageJson.scripts.build) {
    console.log('✅ Script build tồn tại');
  } else {
    console.log('❌ Script build không tồn tại');
  }
  
  if (packageJson.dependencies.next) {
    console.log('✅ Next.js dependency tồn tại');
  } else {
    console.log('❌ Next.js dependency không tồn tại');
  }
  
  if (packageJson.dependencies.react) {
    console.log('✅ React dependency tồn tại');
  } else {
    console.log('❌ React dependency không tồn tại');
  }
} catch (error) {
  console.log('❌ Lỗi đọc package.json:', error.message);
}

// Kiểm tra cấu trúc thư mục
console.log('\n📁 Kiểm tra cấu trúc thư mục:');
const requiredDirs = [
  'src/app',
  'src/components',
  'src/lib',
  'public'
];

requiredDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`✅ ${dir}/`);
  } else {
    console.log(`❌ ${dir}/ - KHÔNG TỒN TẠI`);
  }
});

// Kiểm tra API routes
console.log('\n🔌 Kiểm tra API routes:');
const apiDir = 'src/app/api';
if (fs.existsSync(apiDir)) {
  const apiFiles = fs.readdirSync(apiDir, { recursive: true });
  const routeFiles = apiFiles.filter(file => file.endsWith('route.ts'));
  console.log(`✅ Tìm thấy ${routeFiles.length} API routes`);
  
  // Kiểm tra các API quan trọng
  const importantApis = [
    'auth/login/route.ts',
    'auth/register/route.ts',
    'trades/place/route.ts',
    'trading-sessions/route.ts',
    'user/balance/route.ts'
  ];
  
  importantApis.forEach(api => {
    if (fs.existsSync(path.join(apiDir, api))) {
      console.log(`✅ ${api}`);
    } else {
      console.log(`❌ ${api} - KHÔNG TỒN TẠI`);
    }
  });
} else {
  console.log('❌ Thư mục src/app/api không tồn tại');
}

// Kiểm tra environment variables
console.log('\n🔐 Kiểm tra environment variables:');
const envFiles = ['.env.local', '.env', 'env.example'];
envFiles.forEach(envFile => {
  if (fs.existsSync(envFile)) {
    console.log(`✅ ${envFile} tồn tại`);
    
    if (envFile === 'env.example') {
      const envContent = fs.readFileSync(envFile, 'utf8');
      const requiredVars = [
        'MONGODB_URI',
        'NEXTAUTH_SECRET',
        'NEXTAUTH_URL',
        'CLOUDINARY_API_KEY',
        'CRON_API_KEY'
      ];
      
      console.log('📝 Các biến môi trường cần thiết:');
      requiredVars.forEach(varName => {
        if (envContent.includes(varName)) {
          console.log(`✅ ${varName}`);
        } else {
          console.log(`❌ ${varName} - KHÔNG CÓ TRONG env.example`);
        }
      });
    }
  } else {
    console.log(`❌ ${envFile} không tồn tại`);
  }
});

// Kiểm tra dependencies
console.log('\n📚 Kiểm tra dependencies:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  
  const criticalDeps = [
    'next',
    'react',
    'react-dom',
    'mongodb',
    'jsonwebtoken',
    'bcrypt'
  ];
  
  criticalDeps.forEach(dep => {
    if (allDeps[dep]) {
      console.log(`✅ ${dep}@${allDeps[dep]}`);
    } else {
      console.log(`❌ ${dep} - KHÔNG TỒN TẠI`);
    }
  });
} catch (error) {
  console.log('❌ Lỗi kiểm tra dependencies:', error.message);
}

// Kiểm tra build
console.log('\n🔨 Kiểm tra build:');
try {
  console.log('Đang chạy npm run build...');
  const { execSync } = require('child_process');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ Build thành công!');
} catch (error) {
  console.log('❌ Build thất bại:', error.message);
}

// Hướng dẫn deploy
console.log('\n🚀 HƯỚNG DẪN DEPLOY:');
console.log('1. Cài đặt Vercel CLI: npm install -g vercel');
console.log('2. Đăng nhập: vercel login');
console.log('3. Tạo file .env.local với các biến môi trường');
console.log('4. Deploy: vercel --prod');
console.log('5. Cấu hình environment variables trên Vercel Dashboard');

console.log('\n📋 CHECKLIST TRƯỚC KHI DEPLOY:');
console.log('- [ ] Tạo MongoDB Atlas cluster');
console.log('- [ ] Cấu hình MONGODB_URI');
console.log('- [ ] Tạo Cloudinary account');
console.log('- [ ] Cấu hình Cloudinary credentials');
console.log('- [ ] Tạo NEXTAUTH_SECRET');
console.log('- [ ] Cấu hình NEXTAUTH_URL');
console.log('- [ ] Tạo CRON_API_KEY');
console.log('- [ ] Test tất cả chức năng locally');

console.log('\n🎉 Kiểm tra hoàn thành!'); 