import React, { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

interface WisprVoiceBarProps {
  onSearchQuery?: (query: string) => void;
  onQuickAction?: (actionKey: string) => void;
  disabled?: boolean;
}

export const WisprVoiceBar: React.FC<WisprVoiceBarProps> = ({
  onSearchQuery,
  onQuickAction,
  disabled = false,
}) => {
  const [inputVal, setInputVal] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || disabled) return;
    if (onSearchQuery) {
      onSearchQuery(inputVal.trim());
    }
  };

  const quickSamples: Array<{ label: string; action?: string; query?: string }> = [
    { label: 'useState hook', query: 'useState hook' },
    { label: 'Scan issue', action: 'scan_issue' },
    { label: 'Summarise repo', action: 'summarise' },
  ];

  return (
    <div className="bg-[#f7f7f5] dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-lg p-2.5 transition-colors space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-[11px] font-semibold text-[#37352f] dark:text-[#ebebeb]">
            Wispr Flow Dictation & Search
          </span>
        </div>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-mono">
          Dictate with Wispr
        </span>
      </div>

      {/* Honest, accessible input field where OS Wispr Flow dictates directly */}
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          disabled={disabled}
          placeholder="Dictate with Wispr Flow or type a feature query..."
          className="w-full text-xs pl-2.5 pr-8 py-1.5 rounded-md bg-white dark:bg-[#191919] border border-[#e9e9e7] dark:border-[#333333] text-[#37352f] dark:text-[#ebebeb] placeholder-[#9b9a97] focus:outline-none focus:border-emerald-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!inputVal.trim() || disabled}
          className="absolute right-1 p-1 rounded text-[#787774] hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-[#787774] transition-colors"
          title="Execute query"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Quick Action & Exploration Chips */}
      <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-[#e9e9e7]/70 dark:border-[#2e2e2e]/70">
        <span className="text-[10px] text-[#9b9a97] mr-0.5">Quick queries:</span>
        {quickSamples.map((cmd) => (
          <button
            key={cmd.label}
            type="button"
            onClick={() => {
              if (cmd.query && onSearchQuery) {
                setInputVal(cmd.query);
                onSearchQuery(cmd.query);
              } else if (cmd.action && onQuickAction) {
                onQuickAction(cmd.action);
              }
            }}
            disabled={disabled}
            className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 text-[#787774] dark:text-[#9b9a97] transition-colors disabled:opacity-50"
          >
            "{cmd.label}"
          </button>
        ))}
      </div>
    </div>
  );
};
