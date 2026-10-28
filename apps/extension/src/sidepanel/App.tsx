import React, { useState, useEffect } from 'react';
import { GitHubContext, ServerSentEvent } from '@worksmarter/common/types';
import { useTheme } from '../hooks/useTheme';
import { Header } from './components/Header';
import { ContextCard } from './components/ContextCard';
import { WisprVoiceBar } from './components/WisprVoiceBar';
import { ActionCards } from './components/ActionCards';
import { OutputViewer } from './components/OutputViewer';

const API_BASE = 'http://localhost:3001';

export default function App() {
  const { themeMode, resolvedTheme, setThemeMode, toggleTheme } = useTheme();

  // Context state
  const [context, setContext] = useState<GitHubContext>({
    owner: 'calcom',
    repo: 'cal.com',
    issueNumber: 14280,
    isIssue: true,
    url: 'https://github.com/calcom/cal.com/issues/14280',
    title: 'Fix: OAuth token expiration handling in Google Calendar sync',
    body: 'When Google Calendar sync encounters an expired OAuth token, it throws an unhandled rejection rather than refreshing the access token.',
    labels: ['bug', 'integrations', 'good first issue'],
  });

  // Action states
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [streamLogs, setStreamLogs] = useState<string[]>([]);
  const [latestResult, setLatestResult] = useState<string>('');
  const [driveUrl, setDriveUrl] = useState<string | null>(null);

  // Git Clone state
  const [clonePath, setClonePath] = useState(`~/Projects/calcom`);
  const [cloneProgress, setCloneProgress] = useState<number | null>(null);
  const [cloneStatus, setCloneStatus] = useState<string>('');
  const [clonedTargetPath, setClonedTargetPath] = useState<string | null>(null);
  const [vsCodeUri, setVsCodeUri] = useState<string | null>(null);

  // Wispr Flow Voice state
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');

  // Listen to background service worker for GitHub tab context updates
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      const listener = (msg: any) => {
        if (msg.type === 'GITHUB_CONTEXT_UPDATED' && msg.payload) {
          setContext((prev) => ({
            ...prev,
            ...msg.payload,
          }));
          setClonePath(`~/Projects/${msg.payload.repo}`);
        }
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, []);

  // Native Folder Picker handler
  const handleOpenFolderPicker = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/git/picker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName: context.repo }),
      });
      const data = await res.json();
      if (data.selectedPath) {
        setClonePath(data.selectedPath);
        setStreamLogs((prev) => [...prev, `[PICKER] Selected path: ${data.selectedPath}`]);
      }
    } catch {
      // Fallback
      setClonePath(`~/Projects/${context.repo}`);
    }
  };

  // Git Clone execution
  const handleExecuteClone = async () => {
    setActiveAction('clone');
    setCloneProgress(5);
    setCloneStatus('Initializing clone...');
    setClonedTargetPath(null);
    setVsCodeUri(null);
    setStreamLogs((prev) => [...prev, `[GIT] Starting clone for ${context.owner}/${context.repo}...`]);

    try {
      const response = await fetch(`${API_BASE}/api/git/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
              } else if (event.type === 'PIPELINE_ERROR') {
                setCloneStatus(`Error: ${event.message}`);
                setStreamLogs((prev) => [...prev, `[ERROR] ${event.message}`]);
                setActiveAction(null);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setCloneStatus(`Connection error: ${err.message}`);
      setStreamLogs((prev) => [...prev, `[ERROR] Failed to connect: ${err.message}`]);
      setActiveAction(null);
    }
  };

  // Agent Actions (Scan, OWASP, Draft PR)
  const handleTriggerAction = async (actionType: 'scan_issue' | 'owasp_check' | 'draft_pr') => {
    setActiveAction(actionType);
    setLatestResult('');
    setDriveUrl(null);
    setStreamLogs((prev) => [...prev, `[PIPELINE] Starting action: ${actionType}...`]);

    try {
      const response = await fetch(`${API_BASE}/api/agent/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    setActiveAction('drive');
    setStreamLogs((prev) => [...prev, `[DRIVE] Exporting session artifact to Google Drive (drive.file)...`]);

    try {
      const res = await fetch(`${API_BASE}/api/drive/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `[Issue-${context.issueNumber}]_${context.repo}_Analysis.md`,
          content: latestResult || 'Worksmarter Analysis Artifact for ' + context.repo,
        }),
      });
      const data = await res.json();
      if (data.webViewLink) {
        setDriveUrl(data.webViewLink);
        setStreamLogs((prev) => [...prev, `[DRIVE] Saved successfully: ${data.webViewLink}`]);
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
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-[#37352f] dark:bg-[#191919] dark:text-[#ebebeb] p-3.5 space-y-3 font-sans transition-colors selection:bg-emerald-600 selection:text-white">
      {/* Notion Workspace Header & Breadcrumbs */}
      <Header
        context={context}
        themeMode={themeMode}
        resolvedTheme={resolvedTheme}
        setThemeMode={setThemeMode}
        toggleTheme={toggleTheme}
        activeAction={activeAction}
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

      {/* Notion Action Cards (with green action buttons) */}
      <ActionCards
        activeAction={activeAction}
        clonePath={clonePath}
        cloneProgress={cloneProgress}
        cloneStatus={cloneStatus}
        vsCodeUri={vsCodeUri}
        clonedTargetPath={clonedTargetPath}
        onOpenFolderPicker={handleOpenFolderPicker}
        onExecuteClone={handleExecuteClone}
        onTriggerAction={handleTriggerAction}
        onSaveToDrive={handleSaveToDrive}
      />

      {/* Notion Output Viewer (Report + Live Telemetry) */}
      <OutputViewer
        latestResult={latestResult}
        streamLogs={streamLogs}
        activeAction={activeAction}
        driveUrl={driveUrl}
        onClear={handleClearOutput}
      />
    </div>
  );
}
