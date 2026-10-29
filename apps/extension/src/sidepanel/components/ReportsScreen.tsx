import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  Download,
  ExternalLink,
  Trash2,
  CloudUpload,
  Maximize2,
  Terminal,
  ChevronDown,
  ChevronUp,
  FileText,
  Search,
  ShieldCheck,
  FileCode2,
  Clock,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';
import { StoredReport } from '../../hooks/useReportCache';
import { formatRelativeTime, openPopoutWindow } from '../../utils/platform';

export interface ReportsScreenProps {
  activeReport: StoredReport | null;
  availableReports: StoredReport[];
  onSelectReport: (report: StoredReport) => void;
  onBackToWorkspace: () => void;
  onSaveToDrive?: () => void;
  onDeleteReport?: (reportId: string) => void;
  onRescan?: (actionType: 'scan_issue' | 'owasp_check' | 'draft_pr') => void;
  driveUrl?: string | null;
  isDark?: boolean;
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({
  activeReport,
  availableReports,
  onSelectReport,
  onBackToWorkspace,
  onSaveToDrive,
  onDeleteReport,
  onRescan,
  driveUrl,
  isDark = false,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut listener: Escape key returns to workspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onBackToWorkspace();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBackToWorkspace]);

  // Auto-scroll logs when drawer is expanded
  useEffect(() => {
    if (isLogsExpanded) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isLogsExpanded, activeReport?.streamLogs]);

  // Extract headings from markdown for Table of Contents navigation pills
  const tableOfContents = useMemo(() => {
    if (!activeReport?.content) return [];
    const lines = activeReport.content.split('\n');
    const headings: { text: string; level: number; id: string }[] = [];

    lines.forEach((line: string) => {
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const rawText = match[2].trim().replace(/[*_`]/g, '');
        const id = rawText.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
        headings.push({ text: rawText, level, id });
      }
    });

    return headings.slice(0, 6); // Max 6 quick-jump pills to keep header clean
  }, [activeReport?.content]);

  const handleCopyMarkdown = () => {
    if (!activeReport?.content) return;
    navigator.clipboard.writeText(activeReport.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    if (!activeReport) return;
    const blob = new Blob([activeReport.content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedRepo = activeReport.repo.replace('/', '_');
    link.setAttribute('download', `${sanitizedRepo}_${activeReport.action}_${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePopout = () => {
    if (!activeReport) return;
    // In extension, open current URL in dedicated popup window
    const currentUrl = window.location.href;
    openPopoutWindow(currentUrl, `Report: ${activeReport.title}`);
  };

  const getActionBadgeIcon = (action: string) => {
    switch (action) {
      case 'scan_issue':
        return <Search className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
      case 'owasp_check':
        return <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />;
      case 'draft_pr':
        return <FileCode2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'scan_issue':
        return 'Entrypoints Scan';
      case 'owasp_check':
        return 'OWASP Security Audit';
      case 'draft_pr':
        return 'PR Description Draft';
      default:
        return action;
    }
  };

  // ==========================================================================
  // EMPTY STATE: No reports available for this context yet
  // ==========================================================================
  if (!activeReport) {
    return (
      <div className="flex flex-col min-h-screen bg-white text-[#37352f] dark:bg-[#191919] dark:text-[#ebebeb] p-4 font-sans">
        <div className="flex items-center justify-between pb-3 border-b border-[#e9e9e7] dark:border-[#2e2e2e]">
          <button
            onClick={onBackToWorkspace}
            className="flex items-center gap-1.5 text-xs font-medium text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Workspace</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#f7f7f5] dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] flex items-center justify-center text-[#787774] dark:text-[#9b9a97]">
            <FileText className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-[#37352f] dark:text-[#ebebeb]">
              No Reports Generated Yet
            </h3>
            <p className="text-xs text-[#787774] dark:text-[#9b9a97] max-w-xs leading-relaxed">
              Run an issue scan, security audit, or PR draft from the workspace to generate in-depth reports.
            </p>
          </div>
          <button
            onClick={onBackToWorkspace}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-medium transition-colors shadow-2xs"
          >
            Return to Workspace Actions
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // ACTIVE REPORT READER VIEW
  // ==========================================================================
  const effectiveDriveUrl = driveUrl || activeReport.driveUrl;

  return (
    <div className="flex flex-col h-screen bg-white text-[#37352f] dark:bg-[#191919] dark:text-[#ebebeb] font-sans overflow-hidden">
      {/* 1. Header Toolbar with Breadcrumbs & Actions */}
      <header className="px-3.5 py-2.5 border-b border-[#e9e9e7] dark:border-[#2e2e2e] bg-[#fafafa]/80 dark:bg-[#1e1e1e]/80 backdrop-blur-xs flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Back button & Breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onBackToWorkspace}
              className="flex items-center gap-1 px-2 py-1 -ml-1 text-xs font-medium text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] hover:bg-[#efefed] dark:hover:bg-[#282828] rounded transition-colors group"
              title="Return to Workspace (Esc)"
            >
              <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span>Workspace</span>
            </button>
            <span className="text-[#9b9a97] text-xs">/</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] truncate">
                {activeReport.repo}
              </span>
              {activeReport.issueNumber && (
                <span className="text-emerald-700 dark:text-emerald-400 font-mono text-[11px] font-medium">
                  #{activeReport.issueNumber}
                </span>
              )}
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Copy Markdown */}
            <button
              onClick={handleCopyMarkdown}
              className="p-1.5 text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] hover:bg-[#efefed] dark:hover:bg-[#282828] rounded transition-colors relative"
              title="Copy markdown content"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {/* Google Drive Export */}
            {effectiveDriveUrl ? (
              <a
                href={effectiveDriveUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded transition-colors"
                title="Open in Google Drive"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : onSaveToDrive ? (
              <button
                onClick={onSaveToDrive}
                className="p-1.5 text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] hover:bg-[#efefed] dark:hover:bg-[#282828] rounded transition-colors"
                title="Save report to Google Drive"
              >
                <CloudUpload className="w-3.5 h-3.5" />
              </button>
            ) : null}

            {/* Download File */}
            <button
              onClick={handleDownloadMarkdown}
              className="p-1.5 text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] hover:bg-[#efefed] dark:hover:bg-[#282828] rounded transition-colors"
              title="Download report (.md)"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            {/* Popout Window */}
            <button
              onClick={handlePopout}
              className="p-1.5 text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] hover:bg-[#efefed] dark:hover:bg-[#282828] rounded transition-colors"
              title="Popout into expanded desktop window"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            {/* Delete Report */}
            {onDeleteReport && (
              <button
                onClick={() => {
                  if (window.confirm('Delete this saved report?')) {
                    onDeleteReport(activeReport.id);
                  }
                }}
                className="p-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors"
                title="Delete report"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 2. Artifact Switcher Pills (If multiple reports exist for this repo/issue) */}
        {availableReports.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-0.5 scrollbar-none">
            {availableReports.map((rep) => {
              const isSelected = rep.id === activeReport.id;
              return (
                <button
                  key={rep.id}
                  onClick={() => onSelectReport(rep)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-all whitespace-nowrap border ${
                    isSelected
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 shadow-2xs'
                      : 'bg-[#f7f7f5] dark:bg-[#222222] text-[#787774] dark:text-[#9b9a97] border-[#e9e9e7] dark:border-[#333333] hover:text-[#37352f] dark:hover:text-[#ebebeb]'
                  }`}
                >
                  {getActionBadgeIcon(rep.action)}
                  <span>{getActionLabel(rep.action)}</span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* 3. Document Sub-Header: Metadata & Re-Scan trigger */}
      <div className="px-4 py-2 bg-[#fdfdfd] dark:bg-[#1b1b1b] border-b border-[#e9e9e7] dark:border-[#2e2e2e] flex items-center justify-between text-xs flex-shrink-0">
        <div className="flex items-center gap-2 text-[#787774] dark:text-[#9b9a97] text-[11px]">
          <div className="flex items-center gap-1">
            {getActionBadgeIcon(activeReport.action)}
            <span className="font-semibold text-[#37352f] dark:text-[#ebebeb]">
              {getActionLabel(activeReport.action)}
            </span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 opacity-70" />
            <span>{formatRelativeTime(activeReport.createdAt)}</span>
          </div>
        </div>

        {/* Quick Re-Scan Button if applicable */}
        {onRescan && (
          <button
            onClick={() => onRescan(activeReport.action as any)}
            className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline transition-colors"
            title="Re-run scan with fresh codebase inspection"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Re-run Analysis</span>
          </button>
        )}
      </div>

      {/* 4. Table of Contents Quick-Jump Pills (If headings exist) */}
      {tableOfContents.length > 0 && (
        <div className="px-4 py-1.5 bg-[#f7f7f5]/60 dark:bg-[#202020]/60 border-b border-[#e9e9e7]/60 dark:border-[#2e2e2e]/60 flex items-center gap-1.5 overflow-x-auto text-[10px] text-[#787774] dark:text-[#9b9a97] flex-shrink-0 scrollbar-none">
          <span className="font-semibold uppercase tracking-wider text-[9px] text-[#9b9a97]">Jump to:</span>
          {tableOfContents.map((h, i) => (
            <button
              key={i}
              onClick={() => {
                const elem = document.getElementById(h.id);
                if (elem) {
                  elem.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              className="px-2 py-0.5 rounded bg-white dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#383838] hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 whitespace-nowrap transition-colors"
            >
              {h.text}
            </button>
          ))}
        </div>
      )}

      {/* 5. Main Full-Height Scrollable Reading Area */}
      <main
        ref={contentContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 selection:bg-emerald-600 selection:text-white"
      >
        <MarkdownViewer content={activeReport.content} isDark={isDark} />
      </main>

      {/* 6. Collapsible Telemetry / Agent Execution Drawer at Bottom */}
      {activeReport.streamLogs && activeReport.streamLogs.length > 0 && (
        <div className="border-t border-[#e9e9e7] dark:border-[#2e2e2e] bg-[#f7f7f5] dark:bg-[#181818] flex-shrink-0">
          <button
            onClick={() => setIsLogsExpanded(!isLogsExpanded)}
            className="w-full px-3.5 py-1.5 flex items-center justify-between text-xs text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] hover:bg-[#efefed] dark:hover:bg-[#202020] transition-colors"
          >
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Agent Execution Trace ({activeReport.streamLogs.length} events)</span>
            </div>
            {isLogsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          {isLogsExpanded && (
            <div className="max-h-48 overflow-y-auto p-3 font-mono text-[10px] space-y-1 bg-[#121212] text-[#d4d4d4] border-t border-[#2e2e2e]">
              {activeReport.streamLogs.map((log: string, index: number) => {
                const isError = log.includes('ERROR');
                const isSuccess = log.includes('SUCCESS');
                const isTool = log.includes('TOOL');
                return (
                  <div
                    key={index}
                    className={`leading-relaxed ${
                      isError
                        ? 'text-rose-400'
                        : isSuccess
                        ? 'text-emerald-400 font-medium'
                        : isTool
                        ? 'text-amber-300'
                        : 'text-[#9b9a97]'
                    }`}
                  >
                    {log}
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
