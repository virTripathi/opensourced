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
  FileText,
  Search,
  ShieldCheck,
  FileCode2,
  Clock,
  Sparkles,
  Layers,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  X,
} from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';
import { StoredReport } from '../../hooks/useReportCache';
import { formatRelativeTime, openPopoutWindow } from '../../utils/platform';

export interface ReportsScreenProps {
  activeReport: StoredReport | null;
  availableReports: StoredReport[];
  allReports?: StoredReport[];
  currentRepo?: string | null;
  onSelectReport: (report: StoredReport) => void;
  onBackToWorkspace: () => void;
  onSaveToDrive?: () => void;
  onDeleteReport?: (reportId: string) => void;
  onRescan?: (actionType: 'scan_issue' | 'owasp_check' | 'draft_pr' | 'summarise') => void;
  driveUrl?: string | null;
  isDark?: boolean;
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({
  activeReport,
  availableReports,
  allReports = [],
  currentRepo = null,
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
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'current' | 'all'>('current');
  const [isBrowsingDirectory, setIsBrowsingDirectory] = useState(false);
  const [selectedRepoFilter, setSelectedRepoFilter] = useState<string>('all');
  const [directorySearchQuery, setDirectorySearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);

  // Reset selected version and browsing directory when active report changes
  useEffect(() => {
    setSelectedVersion(null);
    if (activeReport) {
      setIsBrowsingDirectory(false);
    }
  }, [activeReport?.id]);

  // Determine active snapshot or latest report content
  const activeSnapshot = useMemo(() => {
    if (!activeReport || selectedVersion === null || selectedVersion === activeReport.version) {
      return null;
    }
    return activeReport.previousVersions?.find((s) => s.version === selectedVersion) || null;
  }, [activeReport, selectedVersion]);

  const displayedContent = activeSnapshot ? activeSnapshot.content : (activeReport?.content || '');
  const displayedCreatedAt = activeSnapshot ? activeSnapshot.createdAt : (activeReport?.updatedAt || activeReport?.createdAt || '');
  const displayedVersion = activeSnapshot ? activeSnapshot.version : (activeReport?.version || 1);
  const isViewingLatest = selectedVersion === null || selectedVersion === (activeReport?.version || 1);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isSearchDropdownOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchDropdownOpen]);

  // Keyboard shortcut listener: Escape key closes dropdown or returns to workspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isSearchDropdownOpen) {
          setIsSearchDropdownOpen(false);
        } else {
          onBackToWorkspace();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBackToWorkspace, isSearchDropdownOpen]);

  // Auto-scroll logs when drawer is expanded
  useEffect(() => {
    if (isLogsExpanded) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isLogsExpanded, activeReport?.streamLogs]);

  // Extract headings from markdown for Table of Contents navigation pills
  const tableOfContents = useMemo(() => {
    if (!displayedContent) return [];
    const lines = displayedContent.split('\n');
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
  }, [displayedContent]);

  const handleCopyMarkdown = () => {
    if (!displayedContent) return;
    navigator.clipboard.writeText(displayedContent);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    if (!activeReport || !displayedContent) return;
    const blob = new Blob([displayedContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const sanitizedRepo = activeReport.repo.replace('/', '_');
    link.setAttribute('download', `${sanitizedRepo}_${activeReport.action}_v${displayedVersion}_${Date.now()}.md`);
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
      case 'summarise_feature':
        return <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
      case 'summarise':
        return <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
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
      case 'summarise_feature':
        return 'Feature Exploration';
      case 'summarise':
        return 'Repo Architecture';
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

  const getReportPillLabel = (rep: StoredReport) => {
    const base = rep.query
      ? rep.query.length > 20 ? `"${rep.query.slice(0, 18)}..."` : `"${rep.query}"`
      : getActionLabel(rep.action);
    const ver = rep.version && rep.version > 1 ? ` v${rep.version}` : '';
    return `${base}${ver}`;
  };

  // Unified pools and scoping (IDE-style repository isolation + global switcher)
  const allReportsPool = useMemo(() => {
    return allReports && allReports.length > 0 ? allReports : availableReports;
  }, [allReports, availableReports]);

  const targetRepo = useMemo(() => {
    return (currentRepo || activeReport?.repo || '').toLowerCase().trim();
  }, [currentRepo, activeReport?.repo]);

  const currentRepoReports = useMemo(() => {
    if (!targetRepo) return availableReports;
    return allReportsPool.filter((r) => r.repo.toLowerCase().trim() === targetRepo);
  }, [allReportsPool, availableReports, targetRepo]);

  const availableReposList = useMemo(() => {
    const repos = Array.from(new Set(allReportsPool.map((r) => r.repo).filter(Boolean)));
    return repos.sort();
  }, [allReportsPool]);

  const directoryReports = useMemo(() => {
    return allReportsPool.filter((r) => {
      if (selectedRepoFilter !== 'all' && r.repo.toLowerCase() !== selectedRepoFilter.toLowerCase()) {
        return false;
      }
      if (directorySearchQuery.trim()) {
        const q = directorySearchQuery.toLowerCase().trim();
        const matchTitle = (r.title || '').toLowerCase().includes(q);
        const matchRepo = (r.repo || '').toLowerCase().includes(q);
        const matchQuery = (r.query || '').toLowerCase().includes(q);
        const matchAction = getActionLabel(r.action).toLowerCase().includes(q);
        const matchIssue = r.issueNumber ? String(r.issueNumber).includes(q) : false;
        return matchTitle || matchRepo || matchQuery || matchAction || matchIssue;
      }
      return true;
    });
  }, [allReportsPool, selectedRepoFilter, directorySearchQuery]);

  const reportsToDisplay = useMemo(() => {
    const pool =
      scopeFilter === 'current' && currentRepoReports.length > 0
        ? currentRepoReports
        : allReportsPool;

    if (!searchQuery.trim()) {
      return pool;
    }

    const q = searchQuery.toLowerCase().trim();
    return pool.filter((r) => {
      const matchTitle = (r.title || '').toLowerCase().includes(q);
      const matchRepo = (r.repo || '').toLowerCase().includes(q);
      const matchQuery = (r.query || '').toLowerCase().includes(q);
      const matchAction = getActionLabel(r.action).toLowerCase().includes(q);
      const matchIssue = r.issueNumber ? String(r.issueNumber).includes(q) : false;
      return matchTitle || matchRepo || matchQuery || matchAction || matchIssue;
    });
  }, [scopeFilter, currentRepoReports, allReportsPool, searchQuery]);

  // ==========================================================================
  // DIRECTORY & REPOSITORY SELECTOR VIEW
  // (Rendered when no report is active, or when explicitly browsing library)
  // ==========================================================================
  if (!activeReport || isBrowsingDirectory) {
    return (
      <div className="flex flex-col min-h-screen bg-white text-[#37352f] dark:bg-[#191919] dark:text-[#ebebeb] p-3.5 font-sans space-y-3">
        {/* Directory Header Toolbar */}
        <header className="flex items-center justify-between pb-2.5 border-b border-[#e9e9e7] dark:border-[#2e2e2e]">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToWorkspace}
              className="flex items-center gap-1 px-2 py-1 -ml-1 text-xs font-medium text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] hover:bg-[#efefed] dark:hover:bg-[#282828] rounded transition-colors group"
              title="Return to Workspace (Esc)"
            >
              <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span>Workspace</span>
            </button>
            <span className="text-[#9b9a97] text-xs">/</span>
            <span className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb]">
              Reports Library
            </span>
          </div>

          {activeReport && isBrowsingDirectory && (
            <button
              onClick={() => setIsBrowsingDirectory(false)}
              className="px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors shadow-2xs"
            >
              Back to Open Report
            </button>
          )}
        </header>

        {/* Current Repository Context Status Callout */}
        {currentRepo && currentRepoReports.length === 0 && (
          <div className="p-3 rounded-lg bg-[#f7f7f5] dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] space-y-2">
            <div className="flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb]">
                No reports for {currentRepo}
              </span>
            </div>
            <p className="text-[11px] text-[#787774] dark:text-[#9b9a97] leading-relaxed">
              This repository does not have any saved reports yet. Run an analysis below or select another repository from your library.
            </p>
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {onRescan && (
                <>
                  <button
                    onClick={() => onRescan('scan_issue')}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow-2xs transition-colors"
                  >
                    <Search className="w-3 h-3" />
                    <span>Scan Entrypoints</span>
                  </button>
                  <button
                    onClick={() => onRescan('summarise')}
                    className="px-2.5 py-1 bg-[#efefed] dark:bg-[#2b2b2b] hover:bg-[#e4e4e1] dark:hover:bg-[#333333] text-[#37352f] dark:text-[#ebebeb] rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Layers className="w-3 h-3" />
                    <span>Architecture Analysis</span>
                  </button>
                </>
              )}
              <button
                onClick={onBackToWorkspace}
                className="px-2.5 py-1 text-xs text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] transition-colors"
              >
                Return to Workspace
              </button>
            </div>
          </div>
        )}

        {/* Saved Reports Library & Repository Selector */}
        {allReportsPool.length > 0 ? (
          <div className="space-y-2.5 flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-[#787774] dark:text-[#9b9a97]" />
                <span className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb]">
                  Saved Reports
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#efefed] dark:bg-[#282828] text-[#787774] dark:text-[#9b9a97] font-mono">
                  {allReportsPool.length}
                </span>
              </div>
            </div>

            {/* Repository Filter Pills & Search */}
            <div className="space-y-1.5">
              {availableReposList.length > 1 && (
                <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-[11px]">
                  <button
                    onClick={() => setSelectedRepoFilter('all')}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${selectedRepoFilter === 'all'
                      ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-semibold shadow-2xs'
                      : 'bg-[#f7f7f5] dark:bg-[#202020] text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] border border-[#e9e9e7] dark:border-[#2e2e2e]'
                      }`}
                  >
                    All Repos ({allReportsPool.length})
                  </button>
                  {availableReposList.map((r) => {
                    const count = allReportsPool.filter((rep) => rep.repo === r).length;
                    const isSelected = selectedRepoFilter.toLowerCase() === r.toLowerCase();
                    return (
                      <button
                        key={r}
                        onClick={() => setSelectedRepoFilter(r)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${isSelected
                          ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-semibold shadow-2xs'
                          : 'bg-[#f7f7f5] dark:bg-[#202020] text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] border border-[#e9e9e7] dark:border-[#2e2e2e]'
                          }`}
                      >
                        {r} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Search Bar */}
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 absolute left-2.5 text-[#9b9a97] pointer-events-none" />
                <input
                  type="text"
                  value={directorySearchQuery}
                  onChange={(e) => setDirectorySearchQuery(e.target.value)}
                  placeholder="Filter by title, query, action, or repository..."
                  className="w-full text-xs pl-8 pr-7 py-1.5 rounded-md bg-[#f7f7f5] dark:bg-[#202020] border border-[#e2e2df] dark:border-[#333333] text-[#37352f] dark:text-[#ebebeb] placeholder-[#9b9a97] focus:outline-none focus:border-emerald-500 transition-colors"
                />
                {directorySearchQuery && (
                  <button
                    onClick={() => setDirectorySearchQuery('')}
                    className="absolute right-2 p-0.5 text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb]"
                    title="Clear filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Reports List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
              {directoryReports.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#787774] dark:text-[#9b9a97]">
                  No reports match your current filter.
                </div>
              ) : (
                directoryReports.map((rep) => (
                  <button
                    key={rep.id}
                    onClick={() => {
                      onSelectReport(rep);
                      setIsBrowsingDirectory(false);
                    }}
                    className="w-full text-left p-2.5 rounded-lg bg-white dark:bg-[#202020] hover:bg-[#f7f7f5] dark:hover:bg-[#252525] border border-[#e9e9e7] dark:border-[#2e2e2e] hover:border-emerald-500/50 transition-colors group flex items-start justify-between gap-2 shadow-2xs"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="mt-0.5 flex-shrink-0">
                        {getActionBadgeIcon(rep.action)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors">
                            {getReportPillLabel(rep)}
                          </span>
                          {rep.version && (
                            <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-[#efefed] dark:bg-[#2b2b2b] text-[#555] dark:text-[#aaa]">
                              v{rep.version}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[10px] text-[#787774] dark:text-[#9b9a97]">
                          <span className="font-medium text-[#555] dark:text-[#bbb] truncate max-w-[140px]">
                            {rep.repo}
                          </span>
                          {rep.issueNumber && <span>#{rep.issueNumber}</span>}
                          <span>•</span>
                          <span>{formatRelativeTime(rep.updatedAt || rep.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[#9b9a97] group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Zero reports across all repositories */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#f7f7f5] dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] flex items-center justify-center text-[#787774] dark:text-[#9b9a97]">
              <FileText className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-[#37352f] dark:text-[#ebebeb]">
                No Reports Generated Yet
              </h3>
              <p className="text-xs text-[#787774] dark:text-[#9b9a97] max-w-xs leading-relaxed">
                Explore a feature, inspect entrypoints, or run an architecture analysis from the workspace to generate in-depth reports.
              </p>
            </div>
            <button
              onClick={onBackToWorkspace}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-medium transition-colors shadow-2xs"
            >
              Return to Workspace
            </button>
          </div>
        )}
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
            <button
              onClick={() => setIsBrowsingDirectory(true)}
              className="text-xs font-medium text-[#787774] dark:text-[#9b9a97] hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline transition-colors"
              title="Browse all saved reports directory"
            >
              Reports
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

        {/* 2. Report Selector & Quick-Search Trigger (Compact, IDE-style) */}
        <div className="relative">
          <button
            onClick={() => setIsSearchDropdownOpen((prev) => !prev)}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#f4f4f2] dark:bg-[#232323] hover:bg-[#eaeae7] dark:hover:bg-[#2b2b2b] border border-[#e2e2df] dark:border-[#333333] text-xs transition-colors group"
            title="Search or switch report"
          >
            <div className="flex items-center gap-2 min-w-0">
              {getActionBadgeIcon(activeReport.action)}
              <span className="font-semibold text-[#37352f] dark:text-[#ebebeb] truncate">
                {getReportPillLabel(activeReport)}
              </span>
              <span className="font-mono text-[10px] text-[#787774] dark:text-[#9b9a97] px-1 py-0.2 rounded bg-white dark:bg-[#1a1a1a] border border-[#e9e9e7] dark:border-[#2e2e2e]">
                v{displayedVersion}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[#787774] dark:text-[#9b9a97] flex-shrink-0">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium hidden sm:inline">
                {allReportsPool.length} {allReportsPool.length === 1 ? 'report' : 'reports'}
              </span>
              <Search className="w-3.5 h-3.5 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${isSearchDropdownOpen ? 'rotate-180' : ''
                  }`}
              />
            </div>
          </button>

          {/* Dropdown Overlay: Quick Search & Repository-Scoped Switcher */}
          {isSearchDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/20 dark:bg-black/50 backdrop-blur-2xs"
                onClick={() => setIsSearchDropdownOpen(false)}
              />
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-[#202020] border border-[#e2e2df] dark:border-[#333333] rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[380px]">
                {/* Search Bar with Wispr Flow Affordance */}
                <div className="p-2 border-b border-[#e9e9e7] dark:border-[#2e2e2e] bg-[#fafafa] dark:bg-[#1b1b1b] space-y-2">
                  <div className="relative flex items-center">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 text-[#9b9a97] pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Dictate with Wispr or search reports..."
                      className="w-full text-xs pl-8 pr-7 py-1.5 rounded-md bg-white dark:bg-[#141414] border border-[#e2e2df] dark:border-[#333333] text-[#37352f] dark:text-[#ebebeb] placeholder-[#9b9a97] focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 p-0.5 text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb]"
                        title="Clear search"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Scope Filters: Current Repo vs All Repos */}
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setScopeFilter('current')}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${scopeFilter === 'current'
                          ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-semibold shadow-2xs'
                          : 'text-[#787774] dark:text-[#9b9a97] hover:bg-[#efefed] dark:hover:bg-[#282828]'
                          }`}
                      >
                        This Repo ({currentRepoReports.length})
                      </button>
                      {allReportsPool.length > currentRepoReports.length && (
                        <button
                          type="button"
                          onClick={() => setScopeFilter('all')}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${scopeFilter === 'all'
                            ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 font-semibold shadow-2xs'
                            : 'text-[#787774] dark:text-[#9b9a97] hover:bg-[#efefed] dark:hover:bg-[#282828]'
                            }`}
                        >
                          All Repos ({allReportsPool.length})
                        </button>
                      )}
                    </div>
                    <span className="text-[10px] text-[#9b9a97] font-mono">Esc to close</span>
                  </div>
                </div>

                {/* Reports List */}
                <div className="overflow-y-auto p-1.5 space-y-1">
                  {reportsToDisplay.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#787774] dark:text-[#9b9a97]">
                      {searchQuery ? `No reports match "${searchQuery}"` : 'No reports in this scope'}
                    </div>
                  ) : (
                    reportsToDisplay.map((rep) => {
                      const isSelected = rep.id === activeReport.id;
                      return (
                        <button
                          key={rep.id}
                          onClick={() => {
                            onSelectReport(rep);
                            setIsSearchDropdownOpen(false);
                            setSearchQuery('');
                          }}
                          className={`w-full text-left p-2 rounded-md flex items-start justify-between gap-2 transition-colors ${isSelected
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60'
                            : 'hover:bg-[#f5f5f3] dark:hover:bg-[#262626] border border-transparent'
                            }`}
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <div className="mt-0.5 flex-shrink-0">
                              {getActionBadgeIcon(rep.action)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] truncate">
                                  {getReportPillLabel(rep)}
                                </span>
                                {rep.version && (
                                  <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-[#efefed] dark:bg-[#2b2b2b] text-[#555] dark:text-[#aaa]">
                                    v{rep.version}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[#787774] dark:text-[#9b9a97]">
                                <span className="font-medium text-[#555] dark:text-[#bbb] truncate max-w-[130px]">
                                  {rep.repo}
                                </span>
                                {rep.issueNumber && <span>#{rep.issueNumber}</span>}
                                <span>•</span>
                                <span>{formatRelativeTime(rep.updatedAt || rep.createdAt)}</span>
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {/* 3. Document Sub-Header: Metadata & Prompt Summary & Version */}
      <div className="px-4 py-2 bg-[#fdfdfd] dark:bg-[#1b1b1b] border-b border-[#e9e9e7] dark:border-[#2e2e2e] flex items-center justify-between text-xs flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap text-[#787774] dark:text-[#9b9a97] text-[11px]">
          <div className="flex items-center gap-1">
            {getActionBadgeIcon(activeReport.action)}
            <span className="font-semibold text-[#37352f] dark:text-[#ebebeb]">
              {getActionLabel(activeReport.action)}
            </span>
          </div>
          {activeReport.query && (
            <>
              <span>•</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-medium">
                Prompt: "{activeReport.query}"
              </span>
            </>
          )}
          <span>•</span>
          {/* Version badge & Latest indicator */}
          <div className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold bg-[#f0f0ee] dark:bg-[#282828] text-[#555] dark:text-[#aaa] border border-[#e2e2df] dark:border-[#383838]">
              v{displayedVersion}
            </span>
            {isViewingLatest && activeReport.isLatest !== false ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-300 dark:border-emerald-800">
                Latest
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-semibold border border-amber-300 dark:border-amber-800">
                Archived
              </span>
            )}
          </div>
          <span>•</span>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 opacity-70" />
            <span>{formatRelativeTime(displayedCreatedAt)}</span>
          </div>
        </div>

        {/* Quick Re-Scan Button if applicable */}
        {onRescan && (
          <button
            onClick={() => onRescan(activeReport.action as any)}
            className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline transition-colors"
            title="Re-run scan with fresh codebase inspection (updates report and increments version)"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Re-run Analysis</span>
          </button>
        )}
      </div>

      {/* 4. Version History Switcher (If report has previous versions) */}
      {activeReport.previousVersions && activeReport.previousVersions.length > 0 && (
        <div className="px-4 py-1.5 bg-[#fbfbfa] dark:bg-[#1f1f1f] border-b border-[#e9e9e7] dark:border-[#2e2e2e] flex items-center justify-between text-[11px] flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[#787774] dark:text-[#9b9a97] font-medium text-[10px]">Versions:</span>
            <button
              onClick={() => setSelectedVersion(null)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${isViewingLatest
                ? 'bg-emerald-600 text-white font-semibold shadow-2xs'
                : 'bg-[#efefed] dark:bg-[#282828] text-[#555] dark:text-[#aaa] hover:bg-[#e5e5e2]'
                }`}
            >
              v{activeReport.version || 1} (Latest)
            </button>
            {activeReport.previousVersions
              .slice()
              .reverse()
              .map((snapshot) => {
                const isSelected = selectedVersion === snapshot.version;
                return (
                  <button
                    key={snapshot.version}
                    onClick={() => setSelectedVersion(snapshot.version)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${isSelected
                      ? 'bg-amber-600 text-white font-semibold shadow-2xs'
                      : 'bg-[#efefed] dark:bg-[#282828] text-[#555] dark:text-[#aaa] hover:bg-[#e5e5e2]'
                      }`}
                  >
                    v{snapshot.version}
                  </button>
                );
              })}
          </div>

          {!isViewingLatest && (
            <button
              onClick={() => setSelectedVersion(null)}
              className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium text-[10px]"
            >
              Back to Latest (v{activeReport.version || 1})
            </button>
          )}
        </div>
      )}

      {/* 6. Main Full-Height Scrollable Reading Area */}
      <main
        ref={contentContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 selection:bg-emerald-600 selection:text-white"
      >
        <MarkdownViewer content={displayedContent} isDark={isDark} />
      </main>
    </div>
  );
};
