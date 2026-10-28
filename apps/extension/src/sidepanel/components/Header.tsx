import React, { useState } from 'react';
import {
  Sparkles,
  Sun,
  Moon,
  Monitor,
  ExternalLink,
  GitBranch,
  Github,
  ChevronDown,
} from 'lucide-react';
import { GitHubContext } from '@worksmarter/common/types';
import { ThemeMode } from '../../hooks/useTheme';

interface HeaderProps {
  context: GitHubContext;
  themeMode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  activeAction: string | null;
}

export const Header: React.FC<HeaderProps> = ({
  context,
  themeMode,
  resolvedTheme,
  setThemeMode,
  toggleTheme,
  activeAction,
}) => {
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  return (
    <header className="flex items-center justify-between pb-3 border-b border-[#e9e9e7] dark:border-[#2e2e2e]">
      {/* Left: Notion-style Breadcrumb / Workspace */}
      <div className="flex items-center space-x-2 min-w-0">
        <div className="w-7 h-7 rounded-md bg-[#37352f] dark:bg-[#ebebeb] text-white dark:text-[#191919] flex items-center justify-center font-bold text-xs shadow-sm flex-shrink-0">
          W
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] truncate">
            <span className="hover:underline cursor-pointer">Worksmarter</span>
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
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                activeAction ? 'bg-emerald-500 animate-ping' : 'bg-emerald-600'
              }`}
            />
            <span className="text-[10px] text-[#787774] dark:text-[#9b9a97]">
              {activeAction ? `Running ${activeAction}...` : 'Ready'}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Model Tag & Theme Toggle */}
      <div className="flex items-center space-x-1.5 flex-shrink-0">
        {/* Model Badge */}
        <div
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#f7f7f5] dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] text-[11px] text-[#37352f] dark:text-[#ebebeb]"
          title="LLM Strategy: Gemini 2.5 Flash"
        >
          <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium text-[10px]">Gemini 2.5</span>
        </div>

        {/* Theme Selector (Notion Menu) */}
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

          {/* Quick theme drop down toggle trigger */}
          <button
            onClick={() => setShowThemeMenu(!showThemeMenu)}
            className="p-0.5 text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb]"
            title="Choose theme (System, Dark, Light)"
          >
            <ChevronDown className="w-2.5 h-2.5" />
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
    </header>
  );
};
