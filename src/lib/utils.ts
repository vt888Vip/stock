import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Validation functions for bank information
export interface BankValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate account holder name
 */
export function validateAccountHolder(name: string): BankValidationResult {
  const errors: string[] = [];
  
  if (!name || !name.trim()) {
    errors.push('Tên chủ tài khoản không được để trống');
    return { isValid: false, errors };
  }
  
  const trimmedName = name.trim();
  
  // Kiểm tra độ dài
  if (trimmedName.length < 2) {
    errors.push('Tên chủ tài khoản phải có ít nhất 2 ký tự');
  }
  
  if (trimmedName.length > 100) {
    errors.push('Tên chủ tài khoản không được vượt quá 100 ký tự');
  }
  
  // Kiểm tra dấu tiếng Việt
  const vietnameseAccents = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  if (vietnameseAccents.test(trimmedName)) {
    errors.push('Tên chủ tài khoản không được chứa dấu tiếng Việt. Vui lòng nhập không dấu');
  }
  
  // Kiểm tra ký tự đặc biệt không hợp lệ
  const invalidChars = /[<>{}[\]\\|`~!@#$%^&*()_+=]/;
  if (invalidChars.test(trimmedName)) {
    errors.push('Tên chủ tài khoản không được chứa ký tự đặc biệt');
  }
  
  // Kiểm tra chỉ có số
  if (/^\d+$/.test(trimmedName)) {
    errors.push('Tên chủ tài khoản không được chỉ chứa số');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate bank name
 */
export function validateBankName(bankName: string): BankValidationResult {
  const errors: string[] = [];
  
  if (!bankName || !bankName.trim()) {
    errors.push('Tên ngân hàng không được để trống');
    return { isValid: false, errors };
  }
  
  const trimmedBankName = bankName.trim();
  
  // Kiểm tra độ dài
  if (trimmedBankName.length < 2) {
    errors.push('Tên ngân hàng phải có ít nhất 2 ký tự');
  }
  
  if (trimmedBankName.length > 100) {
    errors.push('Tên ngân hàng không được vượt quá 100 ký tự');
  }
  
  // Kiểm tra dấu tiếng Việt
  const vietnameseAccents = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  if (vietnameseAccents.test(trimmedBankName)) {
    errors.push('Tên ngân hàng không được chứa dấu tiếng Việt. Vui lòng nhập không dấu');
  }
  
  // Kiểm tra ký tự đặc biệt không hợp lệ
  const invalidChars = /[<>{}[\]\\|`~!@#$%^&*()_+=]/;
  if (invalidChars.test(trimmedBankName)) {
    errors.push('Tên ngân hàng không được chứa ký tự đặc biệt');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate account number
 */
export function validateAccountNumber(accountNumber: string): BankValidationResult {
  const errors: string[] = [];
  
  if (!accountNumber || !accountNumber.trim()) {
    errors.push('Số tài khoản không được để trống');
    return { isValid: false, errors };
  }
  
  const trimmedAccountNumber = accountNumber.trim();
  
  // Loại bỏ khoảng trắng và dấu gạch ngang
  const cleanAccountNumber = trimmedAccountNumber.replace(/[\s-]/g, '');
  
  // Kiểm tra chỉ chứa số
  if (!/^\d+$/.test(cleanAccountNumber)) {
    errors.push('Số tài khoản chỉ được chứa số');
  }
  
  // Kiểm tra độ dài
  if (cleanAccountNumber.length < 8) {
    errors.push('Số tài khoản phải có ít nhất 8 chữ số');
  }
  
  if (cleanAccountNumber.length > 20) {
    errors.push('Số tài khoản không được vượt quá 20 chữ số');
  }
  
  // Kiểm tra các số tài khoản phổ biến của Việt Nam
  const vietnameseBankPatterns = [
    /^0\d{8,17}$/, // Vietcombank, BIDV, Agribank, etc.
    /^1\d{8,17}$/, // Techcombank, ACB, etc.
    /^2\d{8,17}$/, // VPBank, MB Bank, etc.
    /^3\d{8,17}$/, // SHB, OCB, etc.
    /^4\d{8,17}$/, // TCB, VIB, etc.
    /^5\d{8,17}$/, // MSB, HDBank, etc.
    /^6\d{8,17}$/, // SeABank, etc.
    /^7\d{8,17}$/, // VPB, etc.
    /^8\d{8,17}$/, // TPBank, etc.
    /^9\d{8,17}$/, // Other banks
  ];
  
  const isValidPattern = vietnameseBankPatterns.some(pattern => pattern.test(cleanAccountNumber));
  if (!isValidPattern) {
    errors.push('Số tài khoản không đúng định dạng ngân hàng Việt Nam');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate complete bank information
 */
export function validateBankInfo(bankInfo: {
  accountHolder: string;
  bankName: string;
  accountNumber: string;
}): BankValidationResult {
  const errors: string[] = [];
  
  // Validate each field
  const accountHolderValidation = validateAccountHolder(bankInfo.accountHolder);
  const bankNameValidation = validateBankName(bankInfo.bankName);
  const accountNumberValidation = validateAccountNumber(bankInfo.accountNumber);
  
  // Collect all errors
  errors.push(...accountHolderValidation.errors);
  errors.push(...bankNameValidation.errors);
  errors.push(...accountNumberValidation.errors);
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Chuẩn hóa tên ngân hàng: chỉ trim khoảng trắng đầu cuối
 * @param bankName - Tên ngân hàng gốc
 * @returns Tên ngân hàng đã chuẩn hóa
 */
export function normalizeBankName(bankName: string): string {
  if (!bankName) return '';
  
  // Chỉ trim khoảng trắng đầu cuối, giữ nguyên nội dung
  return bankName.trim();
}

/**
 * Chuẩn hóa tên chủ tài khoản: chỉ trim khoảng trắng đầu cuối
 * @param accountHolder - Tên chủ tài khoản gốc
 * @returns Tên chủ tài khoản đã chuẩn hóa
 */
export function normalizeAccountHolder(accountHolder: string): string {
  if (!accountHolder) return '';
  
  // Chỉ trim khoảng trắng đầu cuối, giữ nguyên nội dung
  return accountHolder.trim();
}
