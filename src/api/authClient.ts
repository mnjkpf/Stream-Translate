// Тонка обгортка над background service worker для auth-дій з UI (settings-панель).
// Уся справжня робота (launchWebAuthFlow, токени, мережа) — у src/backendAuth.ts,
// який виконується у воркері; тут лише типізовані повідомлення до нього.

import { MSG } from '../shared/messages';

export interface AuthStatus {
  loggedIn: boolean;
  email: string | null;
}

interface AuthError {
  error: string;
}

export type AuthResult = AuthStatus | AuthError;

export function isAuthError(result: AuthResult): result is AuthError {
  return 'error' in result;
}

export function login(): Promise<AuthResult> {
  return chrome.runtime.sendMessage({ type: MSG.authLogin });
}

export function logout(): Promise<AuthResult> {
  return chrome.runtime.sendMessage({ type: MSG.authLogout });
}

export function getAuthStatus(): Promise<AuthResult> {
  return chrome.runtime.sendMessage({ type: MSG.authStatus });
}
