export type AppErrorCategory =
  | 'retryable'
  | 'login-required'
  | 'administrator-action-required'
  | 'security-blocked';

export type AppErrorCode =
  | 'NETWORK_UNAVAILABLE'
  | 'SERVER_MAINTENANCE'
  | 'SESSION_INVALID'
  | 'ACCOUNT_DISABLED'
  | 'SERVER_CONFIGURATION_INVALID'
  | 'API_VERSION_INCOMPATIBLE'
  | 'CERTIFICATE_MISMATCH'
  | 'SERVER_IDENTITY_INVALID'
  | 'UNEXPECTED_ERROR';

export type AppErrorView = {
  code: AppErrorCode;
  category: AppErrorCategory;
  message: string;
};

export function appError(
  code: AppErrorCode,
  category: AppErrorCategory,
  message: string,
): AppErrorView {
  return { code, category, message };
}
