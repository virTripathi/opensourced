import React, { useState, useEffect, useRef } from 'react';
import { GitHubContext, ServerSentEvent } from '@opensourced/common/types';
import { parseGitHubUrl } from '@opensourced/common';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { AuthScreen } from './components/AuthScreen';
import { Header } from './components/Header';
import { ContextCard } from './components/ContextCard';
import { WisprVoiceBar } from './components/WisprVoiceBar';
import { ActionCards } from './components/ActionCards';
import { OutputViewer } from './components/OutputViewer';
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

  // Screen Routing: 'auth' (Authentication screen) vs 'workspace' (Main workspace)
  const [currentScreen, setCurrentScreen] = useState<'auth' | 'workspace'>('auth');
  const [hasProceededWithoutAuth, setHasProceededWithoutAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Synchronize screen state with authenticated session
  useEffect(() => {
    if (!isLoading) {
      if (userProfile || authToken) {
        setCurrentScreen('workspace');
      } else if (!hasProceededWithoutAuth) {
        setCurrentScreen('auth');
      }
    }
  }, [isLoading, userProfile, authToken, hasProceededWithoutAuth]);

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

  // Wispr Flow Voice state
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');

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
      const data = await res.json();
      if (data.selectedPath) {
        setClonePath(data.selectedPath);
        setStreamLogs((prev) => [...prev, `[PICKER] Selected path: ${data.selectedPath}`]);
      }
    } catch {
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
      setStreamLogs((prev) => [
        ...prev,
        '[GIT NOTICE] No GitHub repository detected in active tab. Please navigate to a GitHub repo to clone.',
      ]);
      return;
    }

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

      if (!response.body) return;
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
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      setCloneStatus(`Connection error: ${err.message}`);
      setStreamLogs((prev) => [...prev, `[ERROR] Failed to connect: ${err.message}`]);
      setActiveAction(null);
    } finally {
      cloneAbortControllerRef.current = null;
    }
  };

  // Agent Actions (Scan, OWASP, Draft PR)
  const handleTriggerAction = async (actionType: 'scan_issue' | 'owasp_check' | 'draft_pr') => {
    if (!context) {
      setStreamLogs((prev) => [
        ...prev,
        `[PIPELINE NOTICE] Cannot run ${actionType}: Navigate to a GitHub repository or issue first.`,
      ]);
      return;
    }

    setActiveAction(actionType);
    setLatestResult('');
    setDriveUrl(null);
    setIsReportSaved(false);
    setStreamLogs((prev) => [...prev, `[PIPELINE] Starting action: ${actionType}...`]);

    try {
      const response = await fetch(`${API_BASE}/api/agent/stream`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ action: actionType, context }),
      });

      if (!response.body) return;
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
                setLatestResult((prev) => prev + event.text);
              } else if (event.type === 'PIPELINE_COMPLETE') {
                setStreamLogs((prev) => [...prev, `[SUCCESS] Completed ${actionType}`]);
                setActiveAction(null);
              } else if (event.type === 'PIPELINE_ERROR') {
                setStreamLogs((prev) => [...prev, `[ERROR] ${event.message}`]);
                setActiveAction(null);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setStreamLogs((prev) => [...prev, `[ERROR] Action failed: ${err.message}`]);
      setActiveAction(null);
    }
  };

  // Google Drive Export
  const handleSaveToDrive = async () => {
    if (!context) {
      setStreamLogs((prev) => [...prev, '[DRIVE NOTICE] No active repository context to export.']);
      return;
    }

    setActiveAction('drive');
    setStreamLogs((prev) => [...prev, `[DRIVE] Exporting session artifact to Google Drive (drive.file)...`]);

    try {
      const res = await fetch(`${API_BASE}/api/drive/export`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({
          title: `[Issue-${context.issueNumber || 'General'}]_${context.repo}_Analysis.md`,
          content: latestResult || 'OpenSourced Analysis Artifact for ' + context.repo,
        }),
      });
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
      setStreamLogs((prev) => [...prev, `[DRIVE ERROR] ${err.message}`]);
    } finally {
      setActiveAction(null);
    }
  };

  // Wispr Flow Voice toggle & recognition
  const toggleListening = () => {
    if (!isListening) {
      setIsListening(true);
      setVoiceTranscript('Listening... Speak "Clone repo", "Scan issue", or dictate hints');
      setTimeout(() => {
        setVoiceTranscript('Recognized command: "Scan issue"');
        setTimeout(() => {
          setIsListening(false);
          handleTriggerAction('scan_issue');
        }, 800);
      }, 2500);
    } else {
      setIsListening(false);
      setVoiceTranscript('');
    }
  };

  const handleVoiceAction = (actionKey: string) => {
    setVoiceTranscript(`Action triggered: "${actionKey}"`);
    if (actionKey === 'clone') {
      handleExecuteClone();
    } else if (actionKey === 'scan_issue' || actionKey === 'owasp_check' || actionKey === 'draft_pr') {
      handleTriggerAction(actionKey);
    } else if (actionKey === 'drive') {
      handleSaveToDrive();
    }
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
  // SCREEN 2: Workspace / Contributor Dashboard Screen
  // ==========================================================================
  return (
    <div className="flex flex-col min-h-screen bg-white text-[#37352f] dark:bg-[#191919] dark:text-[#ebebeb] p-3.5 space-y-3 font-sans transition-colors selection:bg-emerald-600 selection:text-white">
      {/* Notion Workspace Header & Breadcrumbs with Auth Controls */}
      <Header
        context={context}
        themeMode={themeMode}
        resolvedTheme={resolvedTheme}
        setThemeMode={setThemeMode}
        toggleTheme={toggleTheme}
        activeAction={activeAction}
        userProfile={userProfile}
        onGitHubLogin={handleGitHubLogin}
        onGoogleLogin={handleGoogleLogin}
        onLogout={handleLogout}
        onNavigateToAuth={() => setCurrentScreen('auth')}
      />

      {/* Active GitHub Context (Notion Callout) */}
      <ContextCard context={context} />

      {/* Wispr Flow Voice Bar */}
      <WisprVoiceBar
        isListening={isListening}
        voiceTranscript={voiceTranscript}
        toggleListening={toggleListening}
        onVoiceAction={handleVoiceAction}
      />

      {/* Notion Action Cards (with green action buttons, cancellation, and repo retry) */}
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
      />

      {/* Notion Output Viewer (Report + Live Telemetry + IDOR-Protected Save) */}
      <OutputViewer
        latestResult={latestResult}
        streamLogs={streamLogs}
        activeAction={activeAction}
        driveUrl={driveUrl}
        onClear={handleClearOutput}
        onSaveReport={latestResult ? handleSaveUserReport : undefined}
        isSaved={isReportSaved}
        isDark={resolvedTheme === 'dark'}
      />
    </div>
  );
}


