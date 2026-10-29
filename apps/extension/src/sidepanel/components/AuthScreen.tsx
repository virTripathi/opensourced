import React from 'react';
import {
  Sun,
  Moon,
  User,
  ChevronRight,
  GitPullRequest,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { GitHubContext } from '@opensourced/common/types';
import { ThemeMode } from '../../hooks/useTheme';

interface AuthScreenProps {
  context: GitHubContext | null;
  themeMode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  onGitHubLogin: () => void;
  onGoogleLogin: () => void;
  onGuestLogin: () => void;
  onProceedWithoutSignIn: () => void;
  onDevLogin?: (username: string) => void;
  authError?: string | null;
  onDismissError?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  context,
  themeMode,
  resolvedTheme,
  toggleTheme,
  onGitHubLogin,
  onGoogleLogin,
  onGuestLogin,
  onProceedWithoutSignIn,
  authError,
  onDismissError,
}) => {
  return (
    <div className="flex flex-col min-h-screen bg-white text-[#37352f] dark:bg-[#191919] dark:text-[#ebebeb] p-4 font-sans transition-colors justify-between">
      {/* Top Bar with Logo & Theme Toggle */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#e9e9e7] dark:border-[#2e2e2e]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#37352f] dark:bg-[#ebebeb] text-white dark:text-[#191919] flex items-center justify-center font-bold text-xs shadow-xs">
              O
            </div>
            <div>
              <span className="font-semibold text-xs text-[#37352f] dark:text-[#ebebeb]">
                OpenSourced
              </span>
              <span className="ml-1.5 px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[9px] font-mono font-medium">
                v0.1.0
              </span>
            </div>
          </div>

          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] hover:bg-[#f7f7f5] dark:hover:bg-[#252525] border border-transparent hover:border-[#e9e9e7] dark:hover:border-[#2e2e2e] transition-colors"
            title={`Switch theme (currently ${themeMode})`}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-[#37352f]" />
            )}
          </button>
        </div>

        {/* Hero Section */}
        <div className="space-y-1 pt-1">
          <h1 className="text-base font-bold text-[#37352f] dark:text-[#ebebeb] tracking-tight">
            Welcome to OpenSourced
          </h1>
          <p className="text-xs text-[#787774] dark:text-[#9b9a97] leading-relaxed">
            Your companion for navigating repositories, diagnosing issues, running security audits, and cloning code locally.
          </p>
        </div>

        {/* Detected Context Banner (if active GitHub tab) */}
        {context?.repo && (
          <div className="p-2.5 rounded-lg bg-[#f7f7f5] dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] text-xs space-y-1">
            <div className="flex items-center justify-between text-[10px] font-medium text-[#787774] dark:text-[#9b9a97]">
              <span>Active GitHub Tab</span>
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-2.5 h-2.5" /> Detected
              </span>
            </div>
            <div className="flex items-center gap-1.5 font-semibold text-[#37352f] dark:text-[#ebebeb] truncate text-[11px]">
              <GitPullRequest className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span className="truncate">{context.owner}/{context.repo}</span>
              {context.issueNumber && (
                <span className="text-emerald-700 dark:text-emerald-300 font-mono text-[10px]">
                  #{context.issueNumber}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Error Notification */}
        {authError && (
          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 flex items-start justify-between gap-2">
            <div className="leading-snug">{authError}</div>
            {onDismissError && (
              <button
                onClick={onDismissError}
                className="text-amber-700 dark:text-amber-300 hover:opacity-80 font-bold text-xs"
              >
                ✕
              </button>
            )}
          </div>
        )}

        {/* Authentication Actions */}
        <div className="space-y-2 pt-1">
          {/* GitHub OAuth Button */}
          <button
            onClick={onGitHubLogin}
            className="w-full flex items-center justify-between p-3 rounded-lg bg-[#24292f] hover:bg-[#1b1f23] text-white shadow-xs transition-all duration-150 group border border-transparent"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold leading-tight">
                  Continue with GitHub
                </div>
                <div className="text-[10px] text-gray-300 font-normal">
                  Connect your GitHub account
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
          </button>

          {/* Google Drive Button */}
          <button
            onClick={onGoogleLogin}
            className="w-full flex items-center justify-between p-3 rounded-lg border border-[#e9e9e7] dark:border-[#2e2e2e] bg-[#f7f7f5] hover:bg-[#ecece9] dark:bg-[#202020] dark:hover:bg-[#282828] text-left transition-colors group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded bg-white border border-[#e9e9e7] flex items-center justify-center flex-shrink-0 shadow-2xs">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              </div>
              <div>
                <div className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] leading-tight">
                  Connect Google Drive
                </div>
                <div className="text-[10px] text-[#787774] dark:text-[#9b9a97]">
                  Export analyses directly to Google Drive
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#9b9a97] group-hover:text-[#37352f] dark:group-hover:text-[#ebebeb] group-hover:translate-x-0.5 transition-all" />
          </button>
        </div>

        {/* Divider */}
        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#e9e9e7] dark:border-[#2e2e2e]" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
            <span className="bg-white dark:bg-[#191919] px-2 text-[#9b9a97]">
              or
            </span>
          </div>
        </div>

        {/* Guest & Skip Actions */}
        <div className="space-y-2">
          <button
            onClick={onGuestLogin}
            className="w-full flex items-center justify-between p-2.5 rounded-lg border border-[#e9e9e7] dark:border-[#2e2e2e] bg-white hover:bg-[#f7f7f5] dark:bg-[#202020] dark:hover:bg-[#252525] text-left transition-colors group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                <User className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] leading-tight">
                  Continue as Guest
                </div>
                <div className="text-[10px] text-[#787774] dark:text-[#9b9a97]">
                  Explore repositories without signing in
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#9b9a97] group-hover:text-[#37352f] dark:group-hover:text-[#ebebeb] group-hover:translate-x-0.5 transition-all" />
          </button>

          <button
            onClick={onProceedWithoutSignIn}
            className="w-full py-2 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
          >
            <span>Proceed to Workspace</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Clean Notion / Linear-style Minimal Footer */}
      <div className="pt-4 text-center">
        <p className="text-[10px] text-[#9b9a97]">
          OpenSourced runs locally in your browser.
        </p>
      </div>
    </div>
  );
};
