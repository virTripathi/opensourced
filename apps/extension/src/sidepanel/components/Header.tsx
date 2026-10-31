import React, { useState } from 'react';
import {
  Sparkles,
  Sun,
  Moon,
  Monitor,
  ExternalLink,
  ChevronDown,
  User,
  LogOut,
  LogIn,
  FileText,
  Layers,
  FileCode2,
} from 'lucide-react';
import { GitHubContext, UserProfile } from '@opensourced/common/types';
import { ThemeMode } from '../../hooks/useTheme';
import { EXTENSION_CONFIG } from '../../config/constants';

interface HeaderProps {
  context: GitHubContext | null;
  themeMode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  activeAction: string | null;
  isBackendOffline?: boolean;
  userProfile?: UserProfile | null;
  onGitHubLogin?: () => void;
  onGoogleLogin?: () => void;
  onLogout?: () => void;
  onNavigateToAuth?: () => void;
  // Screen Routing & Navigation
  currentScreen?: 'auth' | 'workspace' | 'reports';
  reportsCount?: number;
  onNavigate?: (screen: 'workspace' | 'reports') => void;
}

export const Header: React.FC<HeaderProps> = ({
  context,
  themeMode,
  resolvedTheme,
  setThemeMode,
  toggleTheme,
  activeAction,
  isBackendOffline = false,
  userProfile,
  onGoogleLogin,
  onLogout,
  onNavigateToAuth,
  currentScreen = 'workspace',
  reportsCount = 0,
  onNavigate,
}) => {
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isAuthenticated = Boolean(userProfile);

  return (
    <header className="flex flex-col gap-2 pb-2.5 border-b border-[#e9e9e7] dark:border-[#2e2e2e]">
      {/* Top Row: Brand, Breadcrumbs, and Controls */}
      <div className="flex items-center justify-between">
        {/* Left: Clean Breadcrumbs & Status Indicator */}
        <div className="flex items-center space-x-2 min-w-0">
          <img
            src="/icons/icon-32.png"
            alt="OpenSourced"
            className="w-7 h-7 rounded-md shadow-xs flex-shrink-0 dark:hidden object-contain"
          />
          <img
            src="/icons/icon-dark-32.png"
            alt="OpenSourced"
            className="w-7 h-7 rounded-md shadow-xs flex-shrink-0 hidden dark:block object-contain"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] truncate">
              <span>OpenSourced</span>
              {context ? (
                <>
                  <span className="text-[#9b9a97]">/</span>
                  <a
                    href={context.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] truncate flex items-center gap-1"
                    title={`${context.owner}/${context.repo}`}
                  >
                    {context.repo}
                    <ExternalLink className="w-2.5 h-2.5 opacity-60 inline" />
                  </a>
                  {context.issueNumber && (
                    <>
                      <span className="text-[#9b9a97]">/</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-mono text-[11px]">
                        #{context.issueNumber}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <>
                  <span className="text-[#9b9a97]">/</span>
                  <span className="text-[#9b9a97] font-normal text-[11px]">Workspace</span>
                </>
              )}
            </div>
            {(activeAction || isBackendOffline) && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    activeAction
                      ? 'bg-emerald-500 animate-ping'
                      : 'bg-rose-500'
                  }`}
                />
                <span className={`text-[10px] ${isBackendOffline && !activeAction ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-[#787774] dark:text-[#9b9a97]'}`}>
                  {activeAction ? `Running ${activeAction}...` : 'Server offline'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Swagger API, User Menu, Model Badge & Theme Toggle */}
        <div className="flex items-center space-x-1.5 flex-shrink-0">
          {/* Swagger API Docs Link */}
          <a
            href={`${EXTENSION_CONFIG.apiBase}/api/docs`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#f7f7f5] dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] text-[11px] font-medium text-[#787774] dark:text-[#9b9a97] hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors shadow-2xs"
            title={`Backend Swagger Docs: ${EXTENSION_CONFIG.apiBase}/api/docs`}
          >
            <FileCode2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Swagger API</span>
          </a>

          {/* User Account Menu */}
          {isAuthenticated && userProfile ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#f7f7f5] dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] text-[11px] text-[#37352f] dark:text-[#ebebeb] hover:bg-[#ecece9] dark:hover:bg-[#282828] transition-colors"
                title={`Account: ${userProfile.displayName || userProfile.username}`}
              >
                {userProfile.avatarUrl ? (
                  <img
                    src={userProfile.avatarUrl}
                    alt=""
                    className="w-3.5 h-3.5 rounded-full object-cover"
                  />
                ) : (
                  <User className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                )}
                <span className="font-medium text-[10px] max-w-[85px] truncate">
                  {userProfile.displayName || userProfile.username}
                </span>
                <ChevronDown className="w-2.5 h-2.5 text-[#9b9a97]" />
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 mt-1.5 w-60 bg-white dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-lg shadow-lg p-3 z-50 text-xs space-y-2.5">
                    {/* Account Header */}
                    <div className="flex items-center gap-2.5">
                      {userProfile.avatarUrl ? (
                        <img
                          src={userProfile.avatarUrl}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover border border-[#e9e9e7] dark:border-[#2e2e2e]"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-semibold text-xs">
                          {(userProfile.displayName || userProfile.username || 'U').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs text-[#37352f] dark:text-[#ebebeb] truncate">
                          {userProfile.displayName || userProfile.username}
                        </div>
                        <div className="text-[11px] text-[#787774] dark:text-[#9b9a97] truncate">
                          {userProfile.email || `@${userProfile.username}`}
                        </div>
                      </div>
                    </div>

                    {/* Connections Status */}
                    <div className="pt-2 border-t border-[#e9e9e7] dark:border-[#2e2e2e] space-y-1.5">
                      <div className="text-[10px] font-medium uppercase tracking-wider text-[#787774] dark:text-[#9b9a97]">
                        Connections
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#37352f] dark:text-[#ebebeb]">GitHub</span>
                        <span className={`text-[10px] ${userProfile.githubConnected ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-[#9b9a97]'}`}>
                          {userProfile.githubConnected ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#37352f] dark:text-[#ebebeb]">Google Drive</span>
                        {userProfile.googleConnected ? (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            Connected
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              onGoogleLogin?.();
                              setShowUserMenu(false);
                            }}
                            className="text-[10px] text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-medium hover:underline"
                          >
                            Connect
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-2 border-t border-[#e9e9e7] dark:border-[#2e2e2e]">
                      <button
                        onClick={() => {
                          onLogout?.();
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Unauthenticated State */
            <button
              onClick={onNavigateToAuth}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium text-[11px] shadow-xs transition-colors"
            >
              <LogIn className="w-3 h-3" />
              <span>Sign In</span>
            </button>
          )}

          {/* Model Badge */}
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#f7f7f5] dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] text-[11px] text-[#37352f] dark:text-[#ebebeb]"
            title="AI Assistant: Gemini 2.5 Flash"
          >
            <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span className="font-medium text-[10px]">Gemini 2.5</span>
          </div>

          {/* Theme Selector */}
          <div className="relative">
            <button
              onClick={toggleTheme}
              onContextMenu={(e) => {
                e.preventDefault();
                setShowThemeMenu(!showThemeMenu);
              }}
              className="p-1.5 rounded-md text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] hover:bg-[#f7f7f5] dark:hover:bg-[#252525] border border-transparent hover:border-[#e9e9e7] dark:hover:border-[#2e2e2e] transition-colors"
              title={`Current theme: ${themeMode} (${resolvedTheme}). Click to toggle, right-click for options.`}
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-[#37352f]" />
              )}
            </button>

            {showThemeMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowThemeMenu(false)}
                />
                <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-md shadow-lg p-1 z-50 text-xs">
                  <button
                    onClick={() => {
                      setThemeMode('system');
                      setShowThemeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left ${
                      themeMode === 'system'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-medium'
                        : 'text-[#37352f] dark:text-[#ebebeb] hover:bg-[#f7f7f5] dark:hover:bg-[#252525]'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span>System ({resolvedTheme})</span>
                  </button>
                  <button
                    onClick={() => {
                      setThemeMode('dark');
                      setShowThemeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left ${
                      themeMode === 'dark'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-medium'
                        : 'text-[#37352f] dark:text-[#ebebeb] hover:bg-[#f7f7f5] dark:hover:bg-[#252525]'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Dark</span>
                  </button>
                  <button
                    onClick={() => {
                      setThemeMode('light');
                      setShowThemeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left ${
                      themeMode === 'light'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-medium'
                        : 'text-[#37352f] dark:text-[#ebebeb] hover:bg-[#f7f7f5] dark:hover:bg-[#252525]'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Light</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Navigation Segmented Pills (Workspace vs. Reports) */}
      {currentScreen !== 'auth' && onNavigate && (
        <div className="flex items-center justify-between pt-1">
          <div className="inline-flex items-center gap-1 bg-[#f2f2f0] dark:bg-[#232323] p-0.5 rounded-lg border border-[#e9e9e7] dark:border-[#313131]">
            <button
              onClick={() => onNavigate('workspace')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                currentScreen === 'workspace'
                  ? 'bg-white dark:bg-[#2e2e2e] text-[#37352f] dark:text-[#ebebeb] shadow-2xs font-semibold'
                  : 'text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb]'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Workspace</span>
            </button>
            <button
              onClick={() => onNavigate('reports')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                currentScreen === 'reports'
                  ? 'bg-white dark:bg-[#2e2e2e] text-[#37352f] dark:text-[#ebebeb] shadow-2xs font-semibold'
                  : 'text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb]'
              }`}
            >
              <FileText className="w-3 h-3" />
              <span>Reports</span>
              {reportsCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold leading-tight ${
                    currentScreen === 'reports'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-300'
                  }`}
                >
                  {reportsCount}
                </span>
              )}
            </button>
          </div>

          {/* Quick status callout */}
          {reportsCount > 0 && currentScreen === 'workspace' && (
            <button
              onClick={() => onNavigate('reports')}
              className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium"
            >
              <span>{reportsCount} {reportsCount === 1 ? 'report' : 'reports'} available ➔</span>
            </button>
          )}
        </div>
      )}
    </header>
  );
};
