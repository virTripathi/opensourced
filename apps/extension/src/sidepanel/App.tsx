import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GitHubContext, ServerSentEvent } from '@opensourced/common/types';
import { parseGitHubUrl } from '@opensourced/common';
import { CheckCircle2, ArrowRight, X, Sparkles, AlertCircle } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useReportCache, StoredReport } from '../hooks/useReportCache';
import { AuthScreen } from './components/AuthScreen';
import { Header } from './components/Header';
import { ContextCard } from './components/ContextCard';
import { WisprVoiceBar } from './components/WisprVoiceBar';
import { ActionCards } from './components/ActionCards';
import { ReportsScreen } from './components/ReportsScreen';
import { formatFeatureSummaryToMarkdown, formatRepoSummaryToMarkdown } from '../utils/format-summary';
import { EXTENSION_CONFIG } from '../config/constants';

const API_BASE = EXTENSION_CONFIG.apiBase;

export default function App() {
  const { themeMode, resolvedTheme, setThemeMode, toggleTheme } = useTheme();

  // Authentication & Session management with chrome.storage persistence & OAuth
  const {
    authToken,
    userProfile,
    isLoading,
    getAuthHeaders,
    loginAsGuest,
    loginAsDev,
    loginWithGitHub,
    loginWithGoogle,
    logout,
  } = useAuth();

  // Universal Report Cache (works in chrome.storage.local, localStorage, and syncs with backend)
  const {
    reports,
    saveReport,
    deleteReport,
    getReportsForRepo,
    getLatestReportForAction,
    syncWithBackend,
  } = useReportCache(API_BASE, getAuthHeaders);

  // Screen Routing: 'auth' | 'workspace' | 'reports'
  const [currentScreen, setCurrentScreen] = useState<'auth' | 'workspace' | 'reports'>('auth');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [hasProceededWithoutAuth, setHasProceededWithoutAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isBackendOffline, setIsBackendOffline] = useState(false);
  const [actionError, setActionError] = useState<{ title: string; message: string } | null>(null);

  // Completed Action Notification in Workspace
  const [completedNotification, setCompletedNotification] = useState<{
    message: string;
    actionKey: 'scan_issue' | 'owasp_check' | 'draft_pr' | 'summarise' | 'summarise_feature';
    reportId?: string;
  } | null>(null);

  // Synchronize screen state with authenticated session
  useEffect(() => {
    if (!isLoading) {
      if (userProfile || authToken) {
        if (currentScreen === 'auth') {
          setCurrentScreen('workspace');
        }
        syncWithBackend();
      } else if (!hasProceededWithoutAuth) {
        setCurrentScreen('auth');
      }
    }
  }, [isLoading, userProfile, authToken, hasProceededWithoutAuth, syncWithBackend]);

  // Proactively verify backend reachability on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/session`, { credentials: 'include' })
      .then((res) => {
        if (res.ok) {
          setIsBackendOffline(false);
        }
      })
      .catch(() => {
        setIsBackendOffline(true);
      });
  }, []);

  const [isReportSaved, setIsReportSaved] = useState(false);

  // Context state (null by default; resolved dynamically from active tab)
  const [context, setContext] = useState<GitHubContext | null>(null);

  // Action states
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [streamLogs, setStreamLogs] = useState<string[]>([]);
  const [latestResult, setLatestResult] = useState<string>('');
  const [driveUrl, setDriveUrl] = useState<string | null>(null);

  // Git Clone state
  const [clonePath, setClonePath] = useState(EXTENSION_CONFIG.defaultProjectsDir);
  const [cloneProgress, setCloneProgress] = useState<number | null>(null);
  const [cloneStatus, setCloneStatus] = useState<string>('');
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [clonedTargetPath, setClonedTargetPath] = useState<string | null>(null);
  const [vsCodeUri, setVsCodeUri] = useState<string | null>(null);
  const cloneAbortControllerRef = useRef<AbortController | null>(null);

  // 1. Detect GitHub context from active tab on initial mount
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs?.[0];
        if (activeTab?.url) {
          const parsed = parseGitHubUrl(activeTab.url);
          if (parsed) {
            setContext(parsed);
            setClonePath(`~/Projects/${parsed.repo}`);

            // Query rich DOM context from content script if tab is accessible
            if (activeTab.id) {
              chrome.tabs.sendMessage(activeTab.id, { type: 'EXTRACT_DOM_CONTEXT' }, (res) => {
                if (res && !chrome.runtime.lastError) {
                  setContext((prev) => (prev ? { ...prev, ...res } : null));
                }
              });
            }
            return;
          }
        }
        // Non-GitHub page: keep context null (clean empty state)
        setContext(null);
      });
    }
  }, []);

  // 2. Listen to background service worker for subsequent GitHub tab switches & updates
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const listener = (msg: any) => {
        if (msg.type === 'GITHUB_CONTEXT_UPDATED' && msg.payload) {
          setContext((prev) => ({
            ...(prev || {}),
            ...msg.payload,
          }));
          setClonePath(`~/Projects/${msg.payload.repo}`);
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, []);

  // Context-derived repository reports and action state mapping
  const contextRepoFullName = useMemo(() => {
    return context ? `${context.owner}/${context.repo}` : '';
  }, [context]);

  // Reset selected report ID when switching to a different repository
  const previousRepoRef = useRef<string>(contextRepoFullName);
  useEffect(() => {
    if (previousRepoRef.current !== contextRepoFullName) {
      previousRepoRef.current = contextRepoFullName;
      setSelectedReportId(null);
    }
  }, [contextRepoFullName]);

  const contextReports = useMemo(() => {
    if (!contextRepoFullName) return [];
    return getReportsForRepo(contextRepoFullName, context?.issueNumber);
  }, [contextRepoFullName, context?.issueNumber, getReportsForRepo, reports]);

  const reportsByAction = useMemo(() => {
    if (!contextRepoFullName) return {};
    const map: Partial<Record<'scan_issue' | 'owasp_check' | 'draft_pr', { id: string; createdAt: string }>> = {};
    (['scan_issue', 'owasp_check', 'draft_pr'] as const).forEach((actionKey) => {
      const rep = getLatestReportForAction(contextRepoFullName, actionKey, context?.issueNumber);
      if (rep) {
        map[actionKey] = {
          id: rep.id,
          createdAt: rep.createdAt,
        };
      }
    });
    return map;
  }, [contextRepoFullName, context?.issueNumber, getLatestReportForAction, reports]);

  const activeReportToView = useMemo(() => {
    if (selectedReportId) {
      const found = reports.find((r) => r.id === selectedReportId);
      if (found) return found;
    }
    // Prefer newest/most relevant report for context
    if (contextReports.length > 0) {
      const latest = contextReports.find((r) => r.isLatest);
      return latest || contextReports[0];
    }
    // If the active repository has 0 reports, return null so ReportsScreen displays the Directory & Selector
    return null;
  }, [selectedReportId, contextReports, reports]);

  // Auth Handlers with telemetry feedback & screen transitions
  const handleGuestLogin = async () => {
    setAuthError(null);
    const res = await loginAsGuest();
    if (res.success && res.user) {
      setStreamLogs((prev) => [
        ...prev,
        `[AUTH] Initialized guest session: ${res.user.username}`,
      ]);
      setCurrentScreen('workspace');
    } else {
      setAuthError(res.error || 'Guest session initialization failed');
      setStreamLogs((prev) => [...prev, `[AUTH ERROR] Guest init failed: ${res.error}`]);
    }
  };

  const handleDevLogin = async (username: string) => {
    const res = await loginAsDev(username);
    if (res.success && res.user) {
      setIsReportSaved(false);
      setStreamLogs((prev) => [
        ...prev,
        `[AUTH] Switched user: '${res.user.username}'`,
      ]);
      setCurrentScreen('workspace');
    } else {
      setStreamLogs((prev) => [...prev, `[AUTH ERROR] Login failed: ${res.error}`]);
    }
  };

  const handleGitHubLogin = async () => {
    setAuthError(null);
    setStreamLogs((prev) => [...prev, `[AUTH] Launching GitHub OAuth...`]);
    const res = await loginWithGitHub();
    if (res.success && res.user) {
      setStreamLogs((prev) => [
        ...prev,
        `[AUTH] GitHub authorization active for '${res.user?.username || 'user'}'`,
      ]);
      setCurrentScreen('workspace');
    } else if (res.error) {
      setAuthError(res.error);
      setStreamLogs((prev) => [...prev, `[AUTH NOTICE] ${res.error}`]);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setStreamLogs((prev) => [...prev, `[AUTH] Connecting Google Drive...`]);
    const res = await loginWithGoogle();
    if (res.success) {
      setStreamLogs((prev) => [
        ...prev,
        `[AUTH] Google Drive connected successfully`,
      ]);
      setCurrentScreen('workspace');
    } else if (res.error) {
      setAuthError(res.error);
      setStreamLogs((prev) => [...prev, `[AUTH NOTICE] ${res.error}`]);
    }
  };

  const handleProceedWithoutSignIn = () => {
    setHasProceededWithoutAuth(true);
    setCurrentScreen('workspace');
    setStreamLogs((prev) => [
      ...prev,
      `[NAVIGATION] Entered workspace without signing in. Features ready.`,
    ]);
  };

  const handleLogout = async () => {
    await logout();
    setHasProceededWithoutAuth(false);
    setIsReportSaved(false);
    setCurrentScreen('auth');
    setStreamLogs((prev) => [...prev, `[AUTH] Session cleared. Returned to authentication screen.`]);
  };

  // Resource Action: Save Report with Strict IDOR Isolation
  const handleSaveUserReport = async () => {
    if (!latestResult || !context) return;
    try {
      const res = await fetch(`${API_BASE}/api/reports`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          title: `Analysis for ${context.repo}${context.issueNumber ? ' #' + context.issueNumber : ''}`,
          repo: `${context.owner}/${context.repo}`,
          action: activeAction || 'analysis',
          content: latestResult,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setIsReportSaved(true);
        setStreamLogs((prev) => [
          ...prev,
          `[IDOR SECURE] Report persisted: '${data.id}' (Strictly bound to user: ${data.userId})`,
        ]);
      } else {
        const err = await res.json();
        setStreamLogs((prev) => [...prev, `[SAVE ERROR] ${err.message || 'Failed to save'}`]);
      }
    } catch (err: any) {
      setStreamLogs((prev) => [...prev, `[SAVE ERROR] ${err.message}`]);
    }
  };

  // Native Folder Picker handler
  const handleOpenFolderPicker = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/git/picker`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ repoName: context?.repo || 'my-project' }),
      });
      if (res.ok) {
        setIsBackendOffline(false);
        const data = await res.json();
        if (data.selectedPath) {
          setClonePath(data.selectedPath);
          setStreamLogs((prev) => [...prev, `[PICKER] Selected path: ${data.selectedPath}`]);
        }
      } else {
        if (res.status >= 500) setIsBackendOffline(true);
        setActionError({
          title: 'Server Error',
          message: 'Backend server is unreachable. Please retry after some time.',
        });
      }
    } catch {
      setIsBackendOffline(true);
      setActionError({
        title: 'Server Error',
        message: 'Backend server is unreachable. Please retry after some time.',
      });
      setClonePath(context ? `~/Projects/${context.repo}` : EXTENSION_CONFIG.defaultProjectsDir);
    }
  };

  // Stop / Cancel active clone and delete partial files on disk
  const handleCancelClone = async () => {
    if (cloneAbortControllerRef.current) {
      cloneAbortControllerRef.current.abort();
      cloneAbortControllerRef.current = null;
    }

    if (!context) return;

    try {
      await fetch(`${API_BASE}/api/git/cancel`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          targetPath: clonePath,
          repo: context.repo,
          repoUrl: `https://github.com/${context.owner}/${context.repo}.git`,
        }),
      });
    } catch (err: any) {
      console.warn('Error sending clone cancellation to backend:', err.message);
    }

    setActiveAction(null);
    setCloneProgress(null);
    setCloneError(null);
    setCloneStatus('Cloning stopped. Partial files deleted.');
    setStreamLogs((prev) => [
      ...prev,
      `[GIT] Cloning stopped midway. Cleaned up target directory: ${clonePath}`,
    ]);
  };

  // Git Clone execution
  const handleExecuteClone = async () => {
    if (!context) {
      setActionError({
        title: 'No Repository Detected',
        message: 'Please navigate to a GitHub repository or issue tab to clone.',
      });
      return;
    }

    setActionError(null);
    setActiveAction('clone');
    setCloneProgress(5);
    setCloneStatus('Initializing clone...');
    setCloneError(null);
    setClonedTargetPath(null);
    setVsCodeUri(null);
    setStreamLogs((prev) => [...prev, `[GIT] Starting clone for ${context.owner}/${context.repo}...`]);

    const abortController = new AbortController();
    cloneAbortControllerRef.current = abortController;

    try {
      const response = await fetch(`${API_BASE}/api/git/clone`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        signal: abortController.signal,
        body: JSON.stringify({
          repoUrl: `https://github.com/${context.owner}/${context.repo}.git`,
          owner: context.owner,
          repo: context.repo,
          destinationPath: clonePath,
        }),
      });

      setIsBackendOffline(false);

      if (!response.ok) {
        if (response.status >= 500) setIsBackendOffline(true);
        setActionError({
          title: 'Server Error',
          message: 'Backend server is unreachable. Please retry after some time.',
        });
        setActiveAction(null);
        return;
      }

      if (!response.body) {
        setActiveAction(null);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const event: ServerSentEvent = JSON.parse(line.replace('data:', '').trim());
              if (event.type === 'CLONE_PROGRESS') {
                setCloneProgress(event.percent);
                setCloneStatus(event.statusText);
                setStreamLogs((prev) => [...prev, `[CLONE] ${event.statusText}`]);
              } else if (event.type === 'CLONE_COMPLETE') {
                setCloneProgress(100);
                setCloneStatus('Clone Complete!');
                setClonedTargetPath(event.targetPath);
                setVsCodeUri(event.vsCodeUri);
                setStreamLogs((prev) => [...prev, `[SUCCESS] Cloned into ${event.targetPath}`]);
                setActiveAction(null);
              } else if (event.type === 'CLONE_CANCELLED') {
                setCloneProgress(null);
                setCloneStatus(event.message || 'Clone cancelled. Partial files removed.');
                setActiveAction(null);
                setStreamLogs((prev) => [...prev, `[CANCELLED] ${event.message}`]);
              } else if (event.type === 'PIPELINE_ERROR') {
                if (event.code === 'REPO_NOT_FOUND') {
                  setCloneError(event.message);
                }
                setCloneStatus(`Error: ${event.message}`);
                setStreamLogs((prev) => [...prev, `[ERROR] ${event.message}`]);
                setActiveAction(null);
              }
            } catch (parseErr: any) {
              console.warn('[SSE Clone] Non-JSON stream chunk:', line, parseErr);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      setIsBackendOffline(true);
      setActionError({
        title: 'Server Error',
        message: 'Backend server is unreachable. Please retry after some time.',
      });
      setCloneStatus(`Connection error: ${err.message}`);
      setStreamLogs((prev) => [...prev, `[ERROR] Failed to connect: ${err.message}`]);
      setActiveAction(null);
    } finally {
      cloneAbortControllerRef.current = null;
    }
  };

  // Agent Actions (Scan, OWASP, Draft PR, Summaries) with Automatic Report Cache Persistence
  const handleTriggerAction = async (
    actionType: 'scan_issue' | 'owasp_check' | 'draft_pr' | 'summarise' | 'summarise_feature',
    customQuery?: string
  ) => {
    if (!context) {
      setActionError({
        title: 'No Repository Detected',
        message: 'Please navigate to a GitHub repository or issue tab to run this action.',
      });
      return;
    }

    setActionError(null);
    setActiveAction(actionType);
    setLatestResult('');
    setDriveUrl(null);
    setIsReportSaved(false);
    setCompletedNotification(null);
    setStreamLogs((prev) => [...prev, `[PIPELINE] Starting action: ${actionType}...`]);

    let accumulatedResult = '';

    const requestPayloadContext = {
      ...context,
      ...(customQuery ? { title: customQuery, body: customQuery } : {}),
    };

    try {
      const response = await fetch(`${API_BASE}/api/agent/stream`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ action: actionType, context: requestPayloadContext }),
      });

      setIsBackendOffline(false);

      if (!response.ok) {
        if (response.status >= 500) setIsBackendOffline(true);
        let errorMsg = 'Backend server is unreachable. Please retry after some time.';
        try {
          const errData = await response.json();
          if (errData.message && response.status < 500) {
            errorMsg = errData.message;
          }
        } catch {}
        setActionError({
          title: 'Action Failed',
          message: errorMsg,
        });
        setActiveAction(null);
        return;
      }

      if (!response.body) {
        setActiveAction(null);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const event: ServerSentEvent = JSON.parse(line.replace('data:', '').trim());
              if (event.type === 'TOOL_CALL') {
                setStreamLogs((prev) => [...prev, `[TOOL] Executing ${event.tool}...`]);
              } else if (event.type === 'TOOL_RESULT') {
                setStreamLogs((prev) => [...prev, `[TOOL RESULT] ${event.tool}: ${event.summary}`]);
              } else if (event.type === 'TOKEN_DELTA') {
                accumulatedResult += event.text;
                setLatestResult((prev) => prev + event.text);
              } else if (event.type === 'REPO_SUMMARY_COMPLETE' && event.result) {
                const md = formatRepoSummaryToMarkdown(event.result, {
                  owner: context.owner,
                  repo: context.repo,
                  branch: context.branch,
                });
                accumulatedResult = md;
                setLatestResult(md);
              } else if (event.type === 'FEATURE_SUMMARY_COMPLETE' && event.result) {
                const md = formatFeatureSummaryToMarkdown(event.result, {
                  owner: context.owner,
                  repo: context.repo,
                  branch: context.branch,
                });
                accumulatedResult = md;
                setLatestResult(md);
              } else if (event.type === 'PIPELINE_COMPLETE') {
                setStreamLogs((prev) => [...prev, `[SUCCESS] Completed ${actionType}`]);
                setActiveAction(null);

                // Handle structured result in PIPELINE_COMPLETE if accumulatedResult is empty
                if (event.result && !accumulatedResult.trim()) {
                  if ((event.result as any).type === 'feature_summary') {
                    accumulatedResult = formatFeatureSummaryToMarkdown(event.result as any, {
                      owner: context.owner,
                      repo: context.repo,
                      branch: context.branch,
                    });
                    setLatestResult(accumulatedResult);
                  } else if ((event.result as any).type === 'repo_summary') {
                    accumulatedResult = formatRepoSummaryToMarkdown(event.result as any, {
                      owner: context.owner,
                      repo: context.repo,
                      branch: context.branch,
                    });
                    setLatestResult(accumulatedResult);
                  }
                }

                // Persist completed report to cache with query context and auto-navigate to report reader
                if (accumulatedResult.trim()) {
                  const promptSummary = customQuery
                    ? customQuery.length > 50
                      ? `${customQuery.slice(0, 47)}...`
                      : customQuery
                    : context.title || (context.issueNumber ? `Issue #${context.issueNumber}` : undefined);

                  const reportTitle =
                    actionType === 'summarise_feature'
                      ? `Feature: ${promptSummary || 'Exploration'}`
                      : actionType === 'summarise'
                      ? `Architecture: ${context.repo}`
                      : actionType === 'scan_issue'
                      ? `Entrypoints: ${context.repo}${context.issueNumber ? ' #' + context.issueNumber : ''}`
                      : actionType === 'owasp_check'
                      ? `Safety & Hygiene: ${context.repo}`
                      : `PR Draft: ${context.repo}`;

                  saveReport(
                    {
                      title: reportTitle,
                      repo: `${context.owner}/${context.repo}`,
                      issueNumber: context.issueNumber,
                      action: actionType,
                      query: promptSummary,
                      content: accumulatedResult,
                      streamLogs: [...streamLogs],
                      branch: context.branch,
                    },
                    { replaceExisting: true }
                  ).then((saved) => {
                    setSelectedReportId(saved.id);
                    setIsReportSaved(true);
                    setCompletedNotification({
                      message: `${reportTitle} ${saved.version ? `v${saved.version} ` : ''}ready!`,
                      actionKey: actionType,
                      reportId: saved.id,
                    });
                    // Move completely to dedicated View Report page
                    setCurrentScreen('reports');
                  });
                }
              } else if (event.type === 'PIPELINE_ERROR') {
                setStreamLogs((prev) => [...prev, `[ERROR] ${event.message}`]);
                setActionError({
                  title:
                    event.code === 'RATE_LIMIT_EXCEEDED'
                      ? 'Rate Limit Reached'
                      : event.code === 'MODEL_SYNTAX_ERROR'
                      ? 'Model Syntax Error'
                      : 'Pipeline Error',
                  message: event.message || 'The pipeline encountered an error.',
                });
                setActiveAction(null);
              }
            } catch (parseErr: any) {
              console.warn('[SSE Stream] Non-JSON stream chunk:', line, parseErr);
            }
          }
        }
      }
    } catch (err: any) {
      setIsBackendOffline(true);
      setStreamLogs((prev) => [...prev, `[ERROR] Action failed: ${err.message}`]);
      setActionError({
        title: 'Server Error',
        message: 'Backend server is unreachable. Please retry after some time.',
      });
      setActiveAction(null);
    }
  };

  // Google Drive Export
  const handleSaveToDrive = async () => {
    if (!context) {
      setActionError({
        title: 'No Repository Detected',
        message: 'No active repository context to export.',
      });
      return;
    }

    setActionError(null);
    setActiveAction('drive');
    setStreamLogs((prev) => [...prev, `[DRIVE] Exporting session artifact to Google Drive (drive.file)...`]);

    try {
      const res = await fetch(`${API_BASE}/api/drive/export`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          title: `[Issue-${context.issueNumber || 'General'}]_${context.repo}_Analysis.md`,
          content: (activeReportToView?.content || latestResult) || 'OpenSourced Analysis Artifact for ' + context.repo,
        }),
      });
      setIsBackendOffline(false);
      if (!res.ok) {
        if (res.status >= 500) setIsBackendOffline(true);
        setActionError({
          title: 'Export Failed',
          message: 'Backend server is unreachable. Please retry after some time.',
        });
        return;
      }
      const data = await res.json();
      if (data.webViewLink) {
        setDriveUrl(data.webViewLink);
        const folderMsg = data.folder ? `folder "${data.folder}"` : 'Google Drive';
        setStreamLogs((prev) => [
          ...prev,
          `[DRIVE] Exported successfully to ${folderMsg}: ${data.webViewLink}`,
        ]);
      }
    } catch (err: any) {
      setIsBackendOffline(true);
      setActionError({
        title: 'Export Failed',
        message: 'Backend server is unreachable. Please retry after some time.',
      });
      setStreamLogs((prev) => [...prev, `[DRIVE ERROR] ${err.message}`]);
    } finally {
      setActiveAction(null);
    }
  };

  // Navigation Handler: View Report from Action Card or Notification
  const handleViewReport = (actionKey: 'scan_issue' | 'owasp_check' | 'draft_pr' | 'summarise' | 'summarise_feature') => {
    if (contextRepoFullName) {
      const rep = getLatestReportForAction(contextRepoFullName, actionKey as any, context?.issueNumber);
      if (rep) {
        setSelectedReportId(rep.id);
      }
    }
    setCurrentScreen('reports');
  };

  const handleVoiceAction = (actionKey: string) => {
    if (actionKey === 'clone') {
      handleExecuteClone();
    } else if (
      actionKey === 'scan_issue' ||
      actionKey === 'owasp_check' ||
      actionKey === 'draft_pr' ||
      actionKey === 'summarise'
    ) {
      handleTriggerAction(actionKey as any);
    } else if (actionKey === 'drive') {
      handleSaveToDrive();
    }
  };

  const handleSearchQuery = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    // Check if query is targeting an issue number (e.g. #42, issue 42, or plain 42)
    const issueMatch = trimmed.match(/^(?:issue\s*#?|#)?(\d+)$/i);
    if (issueMatch && issueMatch[1]) {
      const issueNum = parseInt(issueMatch[1], 10);
      if (context) {
        context.issueNumber = issueNum;
      }
      handleTriggerAction('scan_issue', trimmed);
      return;
    }

    const lower = trimmed.toLowerCase();
    if (lower === 'overview' || lower === 'summary' || lower === 'architecture' || lower === 'summarize') {
      handleTriggerAction('summarise');
      return;
    }
    if (lower.includes('safety') || lower.includes('security') || lower.includes('audit')) {
      handleTriggerAction('owasp_check');
      return;
    }
    if (lower.startsWith('pr ') || lower === 'pr' || lower.includes('pull request')) {
      handleTriggerAction('draft_pr');
      return;
    }

    handleTriggerAction('summarise_feature', trimmed);
  };

  const handleClearOutput = () => {
    setLatestResult('');
    setStreamLogs([]);
    setDriveUrl(null);
    setIsReportSaved(false);
  };

  // ==========================================================================
  // SCREEN 1: Authentication / Sign-In Screen
  // ==========================================================================
  if (currentScreen === 'auth') {
    return (
      <AuthScreen
        context={context}
        themeMode={themeMode}
        resolvedTheme={resolvedTheme}
        setThemeMode={setThemeMode}
        toggleTheme={toggleTheme}
        onGitHubLogin={handleGitHubLogin}
        onGoogleLogin={handleGoogleLogin}
        onGuestLogin={handleGuestLogin}
        onProceedWithoutSignIn={handleProceedWithoutSignIn}
        authError={authError}
        onDismissError={() => setAuthError(null)}
      />
    );
  }

  // ==========================================================================
  // SCREEN 2: Dedicated Reports Screen (Full-Height Document Reader)
  // ==========================================================================
  if (currentScreen === 'reports') {
    return (
      <ReportsScreen
        activeReport={activeReportToView}
        availableReports={contextReports.length > 0 ? contextReports : reports}
        allReports={reports}
        currentRepo={contextRepoFullName || activeReportToView?.repo || null}
        onSelectReport={(rep) => setSelectedReportId(rep.id)}
        onBackToWorkspace={() => setCurrentScreen('workspace')}
        onSaveToDrive={handleSaveToDrive}
        onDeleteReport={async (reportId) => {
          await deleteReport(reportId);
          setSelectedReportId(null);
        }}
        onRescan={(actionType) => {
          setCurrentScreen('workspace');
          handleTriggerAction(actionType);
        }}
        driveUrl={driveUrl}
        isDark={resolvedTheme === 'dark'}
      />
    );
  }

  // ==========================================================================
  // SCREEN 3: Workspace / Contributor Dashboard Screen (with Dual Affordance)
  // ==========================================================================
  return (
    <div className="flex flex-col min-h-screen bg-white text-[#37352f] dark:bg-[#191919] dark:text-[#ebebeb] p-3.5 space-y-3 font-sans transition-colors selection:bg-emerald-600 selection:text-white">
      {/* Notion Workspace Header & Breadcrumbs with Auth Controls & Navigation Pills */}
      <Header
        context={context}
        themeMode={themeMode}
        resolvedTheme={resolvedTheme}
        setThemeMode={setThemeMode}
        toggleTheme={toggleTheme}
        activeAction={activeAction}
        isBackendOffline={isBackendOffline}
        userProfile={userProfile}
        onGitHubLogin={handleGitHubLogin}
        onGoogleLogin={handleGoogleLogin}
        onLogout={handleLogout}
        onNavigateToAuth={() => setCurrentScreen('auth')}
        currentScreen={currentScreen}
        reportsCount={contextReports.length}
        onNavigate={(screen) => setCurrentScreen(screen)}
      />

      {/* Action / Backend Error Alert Banner */}
      {actionError && (
        <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start justify-between text-xs transition-all shadow-2xs">
          <div className="flex items-start gap-2 min-w-0 pr-2">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-semibold text-rose-950 dark:text-rose-200 truncate">
                {actionError.title}
              </div>
              <div className="text-[11px] text-rose-800 dark:text-rose-300 leading-snug">
                {actionError.message}
              </div>
            </div>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="p-1 text-rose-700 dark:text-rose-300 hover:text-rose-950 dark:hover:text-rose-100 flex-shrink-0"
            title="Dismiss error"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Completed Report Banner in Workspace (Instant 1-Click Navigation) */}
      {completedNotification && (
        <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs transition-all shadow-2xs">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-emerald-950 dark:text-emerald-200 truncate">
                {completedNotification.message}
              </div>
              <div className="text-[11px] text-emerald-800 dark:text-emerald-300">
                Full-height report is ready for inspection
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => {
                if (completedNotification.reportId) {
                  setSelectedReportId(completedNotification.reportId);
                }
                setCurrentScreen('reports');
              }}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-medium flex items-center gap-1 shadow-2xs"
            >
              <span>View Report</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            <button
              onClick={() => setCompletedNotification(null)}
              className="p-1 text-emerald-700 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-emerald-100"
              title="Dismiss notification"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Active GitHub Context (Notion Callout) */}
      <ContextCard context={context} />

      {/* Wispr Flow Dictation & Search Bar */}
      <WisprVoiceBar
        onSearchQuery={handleSearchQuery}
        onQuickAction={handleVoiceAction}
        disabled={activeAction !== null}
      />

      {/* Notion Action Cards with Dual Affordance (View Report ➔ & Re-scan ↻) */}
      <ActionCards
        hasContext={Boolean(context)}
        activeAction={activeAction}
        clonePath={clonePath}
        cloneProgress={cloneProgress}
        cloneStatus={cloneStatus}
        vsCodeUri={vsCodeUri}
        clonedTargetPath={clonedTargetPath}
        cloneError={cloneError}
        onOpenFolderPicker={handleOpenFolderPicker}
        onExecuteClone={handleExecuteClone}
        onCancelClone={handleCancelClone}
        onTriggerAction={handleTriggerAction}
        onSaveToDrive={handleSaveToDrive}
        onViewReport={handleViewReport}
        reportsByAction={reportsByAction}
      />

      {/* Active In-Flight Analysis Indicator (Sleek, Minimal & Zero-Clutter) */}
      {activeAction && (
        <div className="bg-white dark:bg-[#202020] border border-emerald-300 dark:border-emerald-800 rounded-lg p-3 flex items-center justify-between text-xs text-[#37352f] dark:text-[#ebebeb] shadow-2xs animate-pulse">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
            </div>
            <div>
              <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                {activeAction === 'summarise_feature'
                  ? 'Analyzing Feature...'
                  : activeAction === 'summarise'
                  ? 'Analyzing Repository Architecture...'
                  : 'Scanning Codebase...'}
              </div>
              <div className="text-[11px] text-[#787774] dark:text-[#9b9a97]">
                Generating Mermaid sequence diagram & entrypoint mappings...
              </div>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
            Running
          </span>
        </div>
      )}
    </div>
  );
}
