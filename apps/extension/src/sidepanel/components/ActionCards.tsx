import React, { useState } from 'react';
import {
  Search,
  ShieldCheck,
  FileCode2,
  CloudUpload,
  ChevronRight,
  ChevronDown,
  Loader2,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';
import { formatRelativeTime } from '../../utils/platform';

export interface ActionReportMeta {
  id: string;
  createdAt: string;
}

interface ActionCardsProps {
  hasContext?: boolean;
  activeAction: string | null;
  onTriggerAction: (actionKey: 'scan_issue' | 'security_check' | 'draft_pr' | 'summarise' | 'summarise_feature') => void;
  onSaveToDrive: () => void;
  // Dual-affordance navigation & existing report mapping
  onViewReport?: (actionKey: 'scan_issue' | 'security_check' | 'draft_pr' | 'summarise' | 'summarise_feature') => void;
  reportsByAction?: Partial<Record<'scan_issue' | 'security_check' | 'draft_pr', ActionReportMeta>>;
}

export const ActionCards: React.FC<ActionCardsProps> = ({
  hasContext = true,
  activeAction,
  onTriggerAction,
  onSaveToDrive,
  onViewReport,
  reportsByAction = {},
}) => {
  const [isSecondaryExpanded, setIsSecondaryExpanded] = useState(false);

  const isSecondaryActive =
    activeAction === 'security_check' ||
    activeAction === 'draft_pr' ||
    activeAction === 'drive';

  const showSecondary = isSecondaryExpanded || isSecondaryActive;

  // Helper to render action buttons with the Senior FE Dual-Affordance pattern
  const renderDualAffordance = (
    actionKey: 'scan_issue' | 'security_check' | 'draft_pr',
    defaultLabel: string,
    viewLabel: string,
    rescanTooltip: string
  ) => {
    const isRunning = activeAction === actionKey;
    const existingReport = reportsByAction[actionKey];

    // 1. Actively executing pipeline state
    if (isRunning) {
      return (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-md text-xs font-medium flex items-center gap-1.5 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Analyzing...</span>
          </div>
        </div>
      );
    }

    // 2. Dual-Affordance State: Report already generated and cached
    if (existingReport && onViewReport) {
      return (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Primary Navigation CTA */}
          <button
            onClick={() => onViewReport(actionKey)}
            disabled={activeAction !== null}
            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white rounded-md text-xs font-medium transition-all flex items-center gap-1 shadow-2xs group/btn"
            title="Open dedicated report reader"
          >
            <span>{viewLabel}</span>
            <ArrowRight className="w-3 h-3 transition-transform group-hover/btn:translate-x-0.5" />
          </button>

          {/* Secondary Refresh / Re-Scan Action */}
          <button
            onClick={() => onTriggerAction(actionKey)}
            disabled={!hasContext || activeAction !== null}
            className="p-1 bg-[#f7f7f5] hover:bg-[#efefed] dark:bg-[#282828] dark:hover:bg-[#323232] border border-[#e9e9e7] dark:border-[#383838] text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] rounded-md text-xs transition-colors"
            title={rescanTooltip}
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      );
    }

    // 3. Clean Initial State: Never scanned yet
    return (
      <button
        onClick={() => onTriggerAction(actionKey)}
        disabled={!hasContext || activeAction !== null}
        title={!hasContext ? 'Navigate to a GitHub repository or issue to run' : undefined}
        className="flex-shrink-0 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white rounded-md text-xs font-medium transition-colors flex items-center gap-1 shadow-sm"
      >
        <ChevronRight className="w-3 h-3" />
        <span>{defaultLabel}</span>
      </button>
    );
  };

  return (
    <section className="space-y-2">
      {/* Primary Action Card: Scan Repository & Entry Points */}
      <div className="bg-white dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-lg p-2.5 flex items-center justify-between hover:border-emerald-500/50 transition-colors group">
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className="w-7 h-7 rounded bg-[#f7f7f5] dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
            <Search className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] truncate">
              Scan Repository & Entry Points
            </div>
            <div className="text-[11px] text-[#787774] dark:text-[#9b9a97] truncate">
              Generate report and entrypoint mappings for this repository
            </div>
            {reportsByAction.scan_issue && (
              <div className="flex items-center gap-1 mt-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                <span>Scanned {formatRelativeTime(reportsByAction.scan_issue.createdAt)}</span>
              </div>
            )}
          </div>
        </div>

        {renderDualAffordance(
          'scan_issue',
          'Scan',
          'View Report',
          'Re-scan repository and code entrypoints'
        )}
      </div>

      {/* Secondary Utilities Accordion (Security, PR, Drive) */}
      <div className="pt-0.5">
        <button
          type="button"
          onClick={() => setIsSecondaryExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[#f7f7f5] dark:bg-[#1a1a1a] border border-[#e9e9e7] dark:border-[#282828] text-[11px] font-medium text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <span>Secondary Utilities</span>
            <span className="text-[10px] text-[#9b9a97] dark:text-[#787774]">
              (Security, PR, Drive)
            </span>
          </div>
          {showSecondary ? (
            <ChevronDown className="w-3.5 h-3.5 text-[#9b9a97]" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-[#9b9a97]" />
          )}
        </button>

        {showSecondary && (
          <div className="space-y-2 pt-2">
            {/* Security Check */}
            <div className="bg-white dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-lg p-2.5 flex items-center justify-between hover:border-emerald-500/50 transition-colors group">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="w-7 h-7 rounded bg-[#f7f7f5] dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] truncate">
                    Security Check
                  </div>
                  <div className="text-[11px] text-[#787774] dark:text-[#9b9a97] truncate">
                    Check secrets, malicious install hooks & hygiene
                  </div>
                  {reportsByAction.security_check && (
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                      <span>Audited {formatRelativeTime(reportsByAction.security_check.createdAt)}</span>
                    </div>
                  )}
                </div>
              </div>

              {renderDualAffordance(
                'security_check',
                'Check',
                'View Check',
                'Re-run security check'
              )}
            </div>

            {/* Draft Pull Request */}
            <div className="bg-white dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-lg p-2.5 flex items-center justify-between hover:border-emerald-500/50 transition-colors group">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="w-7 h-7 rounded bg-[#f7f7f5] dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                  <FileCode2 className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] truncate">
                    Draft PR Description
                  </div>
                  <div className="text-[11px] text-[#787774] dark:text-[#9b9a97] truncate">
                    Generate structured pull request summary
                  </div>
                  {reportsByAction.draft_pr && (
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />
                      <span>Drafted {formatRelativeTime(reportsByAction.draft_pr.createdAt)}</span>
                    </div>
                  )}
                </div>
              </div>

              {renderDualAffordance(
                'draft_pr',
                'Draft',
                'View Draft',
                'Re-generate pull request summary'
              )}
            </div>

            {/* Save to Google Drive */}
            <div className="bg-white dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-lg p-2.5 flex items-center justify-between hover:border-emerald-500/50 transition-colors group">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="w-7 h-7 rounded bg-[#f7f7f5] dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                  <CloudUpload className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] truncate">
                    Save to Google Drive
                  </div>
                  <div className="text-[11px] text-[#787774] dark:text-[#9b9a97] truncate">
                    Export markdown report to your Google Drive
                  </div>
                </div>
              </div>

              <button
                onClick={onSaveToDrive}
                disabled={!hasContext || activeAction !== null}
                title={!hasContext ? 'Open a GitHub repository to export research' : undefined}
                className="flex-shrink-0 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white rounded-md text-xs font-medium transition-colors flex items-center gap-1 shadow-sm"
              >
                {activeAction === 'drive' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
                <span>Export</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
