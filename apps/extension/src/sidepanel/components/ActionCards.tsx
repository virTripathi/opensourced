import React from 'react';
import {
  FolderGit2,
  FolderOpen,
  Search,
  ShieldCheck,
  FileCode2,
  CloudUpload,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  Loader2,
  Square,
  RotateCcw,
  AlertTriangle,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { formatRelativeTime } from '../../utils/platform';

export interface ActionReportMeta {
  id: string;
  createdAt: string;
}

interface ActionCardsProps {
  hasContext?: boolean;
  activeAction: string | null;
  clonePath: string;
  cloneProgress: number | null;
  cloneStatus: string;
  vsCodeUri: string | null;
  clonedTargetPath: string | null;
  cloneError?: string | null;
  onOpenFolderPicker: () => void;
  onExecuteClone: () => void;
  onCancelClone?: () => void;
  onTriggerAction: (actionKey: 'scan_issue' | 'owasp_check' | 'draft_pr') => void;
  onSaveToDrive: () => void;
  // Dual-affordance navigation & existing report mapping
  onViewReport?: (actionKey: 'scan_issue' | 'owasp_check' | 'draft_pr') => void;
  reportsByAction?: Partial<Record<'scan_issue' | 'owasp_check' | 'draft_pr', ActionReportMeta>>;
}

export const ActionCards: React.FC<ActionCardsProps> = ({
  hasContext = true,
  activeAction,
  clonePath,
  cloneProgress,
  cloneStatus,
  vsCodeUri,
  clonedTargetPath,
  cloneError,
  onOpenFolderPicker,
  onExecuteClone,
  onCancelClone,
  onTriggerAction,
  onSaveToDrive,
  onViewReport,
  reportsByAction = {},
}) => {
  const isCloning = activeAction === 'clone';
  const hasCloneError = Boolean(cloneError);

  // Helper to render action buttons with the Senior FE Dual-Affordance pattern
  const renderDualAffordance = (
    actionKey: 'scan_issue' | 'owasp_check' | 'draft_pr',
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
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#787774] dark:text-[#9b9a97]">
          Actions
        </h3>
      </div>

      {/* Action 1: Clone Repository Card */}
      <div className="bg-white dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-lg p-3 space-y-2.5 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#f7f7f5] dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <FolderGit2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb]">
                Clone to Local Machine
              </span>
            </div>
          </div>

          <button
            onClick={onOpenFolderPicker}
            disabled={isCloning}
            className="text-[11px] text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] flex items-center gap-1 bg-[#f7f7f5] dark:bg-[#282828] px-2 py-0.5 rounded border border-[#e9e9e7] dark:border-[#333333] hover:border-emerald-500 disabled:opacity-50 transition-colors"
          >
            <FolderOpen className="w-3 h-3" />
            <span>Browse...</span>
          </button>
        </div>

        {/* Path preview */}
        <div className="text-[11px] font-mono text-[#37352f] dark:text-[#ebebeb] bg-[#f7f7f5] dark:bg-[#191919] px-2.5 py-1.5 rounded border border-[#e9e9e7] dark:border-[#2e2e2e] truncate">
          {clonePath}
        </div>

        {/* Clone Error with Reload / Retry option */}
        {hasCloneError && (
          <div className="p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 space-y-2">
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-[11px] leading-snug">{cloneError}</div>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <button
                onClick={onExecuteClone}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-medium flex items-center gap-1 transition-colors shadow-2xs"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reload & Clone Again</span>
              </button>
              {onCancelClone && (
                <button
                  onClick={onCancelClone}
                  className="px-2.5 py-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-[11px] transition-colors"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}

        {/* Active Progress or Action button */}
        {!hasCloneError && cloneProgress !== null ? (
          <div className="space-y-1.5 pt-1">
            <div className="w-full bg-[#e9e9e7] dark:bg-[#2e2e2e] rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-600 h-1.5 transition-all duration-300 rounded-full"
                style={{ width: `${cloneProgress}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-[#787774] dark:text-[#9b9a97]">
              <span className="truncate pr-2">{cloneStatus}</span>
              <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                {cloneProgress}%
              </span>
            </div>

            {/* Stop Cloning button while clone is executing */}
            {isCloning && onCancelClone && (
              <button
                onClick={onCancelClone}
                className="mt-2 w-full py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                title="Stop git clone and clean up partially cloned files"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop Cloning & Clean Up Files</span>
              </button>
            )}

            {vsCodeUri && (
              <a
                href={vsCodeUri}
                className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-md text-xs font-medium shadow-sm transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open in VS Code
              </a>
            )}
          </div>
        ) : (
          !hasCloneError && (
            <button
              onClick={onExecuteClone}
              disabled={!hasContext || activeAction !== null}
              title={!hasContext ? 'Navigate to a GitHub repository to clone' : undefined}
              className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shadow-sm"
            >
              <FolderGit2 className="w-3.5 h-3.5" />
              <span>Clone to Folder</span>
            </button>
          )
        )}
      </div>

      {/* Action 2: Scan Issue & Find Entrypoints (Dual Affordance) */}
      <div className="bg-white dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-lg p-2.5 flex items-center justify-between hover:border-emerald-500/50 transition-colors group">
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className="w-7 h-7 rounded bg-[#f7f7f5] dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
            <Search className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] truncate">
              Scan Issue & Entrypoints
            </div>
            <div className="text-[11px] text-[#787774] dark:text-[#9b9a97] truncate">
              Find relevant files and code entrypoints
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
          'Re-scan issue with fresh AST inspection'
        )}
      </div>

      {/* Action 3: OWASP Security Audit (Dual Affordance) */}
      <div className="bg-white dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-lg p-2.5 flex items-center justify-between hover:border-emerald-500/50 transition-colors group">
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className="w-7 h-7 rounded bg-[#f7f7f5] dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] truncate">
              OWASP Pre-Flight Check
            </div>
            <div className="text-[11px] text-[#787774] dark:text-[#9b9a97] truncate">
              Audit code for common security vulnerabilities
            </div>
            {reportsByAction.owasp_check && (
              <div className="flex items-center gap-1 mt-0.5 text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                <span>Audited {formatRelativeTime(reportsByAction.owasp_check.createdAt)}</span>
              </div>
            )}
          </div>
        </div>

        {renderDualAffordance(
          'owasp_check',
          'Audit',
          'View Audit',
          'Re-run OWASP security audit'
        )}
      </div>

      {/* Action 4: Draft Pull Request (Dual Affordance) */}
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

      {/* Action 5: Save to Google Drive */}
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
    </section>
  );
};
