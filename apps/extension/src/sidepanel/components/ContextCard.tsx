import React, { useState } from 'react';
import {
  ExternalLink,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  Tag,
  Github,
} from 'lucide-react';
import { GitHubContext } from '@opensourced/common/types';

interface ContextCardProps {
  context: GitHubContext | null;
}

export const ContextCard: React.FC<ContextCardProps> = ({ context }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!context) {
    return (
      <div className="bg-[#f7f7f5] dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-lg p-3 transition-colors">
        <div className="flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-md bg-white dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] flex items-center justify-center text-[#787774] dark:text-[#9b9a97] flex-shrink-0 mt-0.5 shadow-2xs">
            <Github className="w-4 h-4 opacity-70" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#787774] dark:text-[#9b9a97] uppercase tracking-wide">
                GitHub Context
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400 font-medium">
                Idle
              </span>
            </div>
            <h2 className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] mt-1 leading-snug">
              No GitHub repository detected
            </h2>
            <p className="text-[11px] text-[#787774] dark:text-[#9b9a97] mt-1 leading-relaxed">
              Navigate to any GitHub issue or open-source repository tab to automatically inspect architecture, find bug entrypoints, and clone locally.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f7f7f5] dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-lg p-3 transition-colors">
      <div className="flex items-start gap-2.5">
        {/* Left Notion Callout Icon */}
        <div className="w-7 h-7 rounded-md bg-white dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5 shadow-2xs">
          <Github className="w-4 h-4 text-[#37352f] dark:text-[#ebebeb]" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-semibold text-[#787774] dark:text-[#9b9a97] uppercase tracking-wide">
                Active Issue
              </span>
              {context.issueNumber && (
                <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                  #{context.issueNumber}
                </span>
              )}
            </div>

            <a
              href={context.url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] flex items-center gap-1 flex-shrink-0"
              title="Open issue on GitHub"
            >
              <span>{context.owner}/{context.repo}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <h2 className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] mt-1 leading-snug">
            {context.title || `${context.owner}/${context.repo}`}
          </h2>

          {/* Labels if present */}
          {context.labels && context.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {context.labels.map((label, idx) => (
                <span
                  key={idx}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] text-[#787774] dark:text-[#9b9a97]"
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* Collapsible Issue Body */}
          {context.body && (
            <div className="mt-2 pt-2 border-t border-[#e9e9e7]/70 dark:border-[#2e2e2e]/70">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 text-[11px] text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <span>{isExpanded ? 'Hide issue context' : 'Show issue context'}</span>
              </button>

              {isExpanded && (
                <div className="mt-1.5 p-2 rounded bg-white dark:bg-[#191919] border border-[#e9e9e7] dark:border-[#2e2e2e] text-[11px] text-[#787774] dark:text-[#9b9a97] leading-relaxed max-h-36 overflow-y-auto font-sans">
                  {context.body}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
