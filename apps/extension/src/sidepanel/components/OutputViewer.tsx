import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Terminal,
  Copy,
  Check,
  Download,
  Trash2,
  ExternalLink,
  Code2,
  CheckCircle,
  Bookmark,
} from 'lucide-react';
import { MarkdownViewer } from './MarkdownViewer';
import { RepoContext } from '../../utils/file-navigation';

interface OutputViewerProps {
  latestResult: string;
  streamLogs: string[];
  activeAction: string | null;
  driveUrl?: string | null;
  onClear: () => void;
  onSaveReport?: () => void;
  isSaved?: boolean;
  isDark?: boolean;
  repoContext?: RepoContext | null;
}

export const OutputViewer: React.FC<OutputViewerProps> = ({
  latestResult,
  streamLogs,
  activeAction,
  driveUrl,
  onClear,
  onSaveReport,
  isSaved = false,
  isDark = false,
  repoContext,
}) => {
  const [activeTab, setActiveTab] = useState<'report' | 'logs'>('report');
  const [isCopied, setIsCopied] = useState(false);
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll telemetry when new logs arrive
  useEffect(() => {
    if (activeTab === 'logs') {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamLogs, activeTab]);

  // Switch to report when new result streams in
  useEffect(() => {
    if (latestResult && activeTab !== 'report') {
      setActiveTab('report');
    }
  }, [latestResult]);

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCopySnippet = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeIndex(idx);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  const handleDownloadMd = () => {
    if (!latestResult) return;
    const blob = new Blob([latestResult], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `opensourced_analysis_${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Simple clean markdown parser for Notion aesthetic
  const renderFormattedMarkdown = (markdown: string) => {
    if (!markdown) return null;
    const lines = markdown.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    let codeLanguage = '';
    let codeBlockCount = 0;

    lines.forEach((line, index) => {
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          // Closing code block
          const codeText = codeBuffer.join('\n');
          const currentIdx = codeBlockCount++;
          elements.push(
            <div
              key={`code-${index}`}
              className="my-2.5 rounded-md bg-[#f7f7f5] dark:bg-[#191919] border border-[#e9e9e7] dark:border-[#2e2e2e] overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-1 bg-[#efefed] dark:bg-[#202020] border-b border-[#e9e9e7] dark:border-[#2e2e2e] text-[10px] text-[#787774] dark:text-[#9b9a97] font-mono">
                <span>{codeLanguage || 'code'}</span>
                <button
                  onClick={() => handleCopySnippet(codeText, currentIdx)}
                  className="flex items-center gap-1 hover:text-[#37352f] dark:hover:text-[#ebebeb]"
                >
                  {copiedCodeIndex === currentIdx ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-600 font-medium">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 text-[11px] font-mono text-[#37352f] dark:text-[#ebebeb] overflow-x-auto leading-relaxed">
                <code>{codeText}</code>
              </pre>
            </div>
          );
          codeBuffer = [];
          inCodeBlock = false;
        } else {
          // Starting code block
          inCodeBlock = true;
          codeLanguage = line.replace('```', '').trim();
        }
        return;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      // Headers
      if (line.startsWith('### ')) {
        elements.push(
          <h4
            key={index}
            className="text-xs font-bold text-[#37352f] dark:text-[#ebebeb] mt-3 mb-1"
          >
            {line.replace('### ', '')}
          </h4>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h3
            key={index}
            className="text-sm font-bold text-[#37352f] dark:text-[#ebebeb] mt-4 mb-1.5 pb-1 border-b border-[#e9e9e7] dark:border-[#2e2e2e]"
          >
            {line.replace('## ', '')}
          </h3>
        );
      } else if (line.startsWith('# ')) {
        elements.push(
          <h2
            key={index}
            className="text-base font-bold text-[#37352f] dark:text-[#ebebeb] mt-4 mb-2 pb-1 border-b border-[#e9e9e7] dark:border-[#2e2e2e]"
          >
            {line.replace('# ', '')}
          </h2>
        );
      } else if (line.startsWith('- [ ] ') || line.startsWith('- [x] ')) {
        const isChecked = line.startsWith('- [x] ');
        elements.push(
          <div key={index} className="flex items-center gap-2 py-0.5 text-xs text-[#37352f] dark:text-[#ebebeb]">
            <input
              type="checkbox"
              checked={isChecked}
              readOnly
              className="rounded border-[#e9e9e7] dark:border-[#2e2e2e] text-emerald-600 focus:ring-emerald-500"
            />
            <span>{line.replace(/- \[[ x]\] /, '')}</span>
          </div>
        );
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <li
            key={index}
            className="text-xs text-[#37352f] dark:text-[#ebebeb] ml-4 list-disc py-0.5 leading-relaxed"
          >
            {line.substring(2)}
          </li>
        );
      } else if (line.trim() === '') {
        elements.push(<div key={index} className="h-1.5" />);
      } else {
        elements.push(
          <p
            key={index}
            className="text-xs text-[#37352f] dark:text-[#ebebeb] leading-relaxed"
          >
            {line}
          </p>
        );
      }
    });

    return elements;
  };

  return (
    <section className="bg-white dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-lg flex flex-col flex-1 min-h-[220px] transition-colors shadow-2xs">
      {/* Notion Tabs Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#e9e9e7] dark:border-[#2e2e2e]">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setActiveTab('report')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'report'
                ? 'bg-[#f7f7f5] dark:bg-[#282828] text-[#37352f] dark:text-[#ebebeb] shadow-2xs'
                : 'text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Report Document</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'logs'
                ? 'bg-[#f7f7f5] dark:bg-[#282828] text-[#37352f] dark:text-[#ebebeb] shadow-2xs'
                : 'text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Telemetry</span>
            {streamLogs.length > 0 && (
              <span className="text-[10px] px-1 rounded-full bg-[#e9e9e7] dark:bg-[#333333] text-[#787774] dark:text-[#9b9a97]">
                {streamLogs.length}
              </span>
            )}
          </button>
        </div>

        {/* Action icons */}
        <div className="flex items-center space-x-1">
          {latestResult && activeTab === 'report' && (
            <>
              <button
                onClick={() => handleCopy(latestResult)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-2xs"
                title="Copy full markdown report"
              >
                {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{isCopied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                onClick={handleDownloadMd}
                className="p-1 rounded text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] hover:bg-[#f7f7f5] dark:hover:bg-[#282828]"
                title="Download report (.md)"
              >
                <Download className="w-3.5 h-3.5" />
              </button>

              {onSaveReport && (
                <button
                  onClick={onSaveReport}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[#f7f7f5] dark:bg-[#252525] hover:bg-[#ecece9] dark:hover:bg-[#303030] border border-[#e9e9e7] dark:border-[#2e2e2e] text-[#37352f] dark:text-[#ebebeb] transition-colors"
                  title="Save report to your authenticated account (IDOR-protected)"
                >
                  <Bookmark className={`w-3 h-3 ${isSaved ? 'text-emerald-600 fill-emerald-600' : 'text-purple-600'}`} />
                  <span>{isSaved ? 'Saved' : 'Save'}</span>
                </button>
              )}
            </>
          )}

          {(latestResult || streamLogs.length > 0) && (
            <button
              onClick={onClear}
              className="p-1 rounded text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] hover:bg-[#f7f7f5] dark:hover:bg-[#282828]"
              title="Clear output"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-3 flex-1 overflow-y-auto max-h-[360px]">
        {activeTab === 'report' ? (
          <div>
            {/* Google Drive Bookmark link card if exported */}
            {driveUrl && (
              <a
                href={driveUrl}
                target="_blank"
                rel="noreferrer"
                className="mb-3 block p-2.5 rounded-lg bg-[#f7f7f5] dark:bg-[#191919] border border-[#e9e9e7] dark:border-[#2e2e2e] hover:border-emerald-500 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📁</span>
                    <div>
                      <div className="text-xs font-semibold text-[#37352f] dark:text-[#ebebeb] group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                        View Analysis in Google Drive
                      </div>
                      <div className="text-[10px] text-[#787774] dark:text-[#9b9a97]">
                        Saved in "OpenSourced Research" folder
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-[#9b9a97] group-hover:text-emerald-600" />
                </div>
              </a>
            )}

            {/* Formatted Content with GFM & Mermaid Diagram Rendering */}
            {latestResult ? (
              <MarkdownViewer content={latestResult} isDark={isDark} repoContext={repoContext} />
            ) : (
              <div className="py-8 text-center text-[#787774] dark:text-[#9b9a97] space-y-2">
                <div className="w-8 h-8 rounded-full bg-[#f7f7f5] dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] flex items-center justify-center mx-auto text-[#787774] dark:text-[#9b9a97]">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="text-xs font-medium text-[#37352f] dark:text-[#ebebeb]">
                  No Analysis Report Yet
                </div>
                <div className="text-[11px] max-w-[240px] mx-auto">
                  Click one of the green action buttons above or speak a voice command to start onboarding.
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Live Monospace Telemetry Logs */
          <div className="font-mono text-[11px] space-y-1 text-[#37352f] dark:text-[#ebebeb]">
            {streamLogs.length === 0 ? (
              <div className="text-[#9b9a97] italic py-6 text-center">
                Awaiting telemetry events...
              </div>
            ) : (
              streamLogs.map((log, index) => {
                let badgeClass = 'text-[#787774] dark:text-[#9b9a97]';
                if (log.includes('[SUCCESS]')) {
                  badgeClass = 'text-emerald-600 dark:text-emerald-400 font-semibold';
                } else if (log.includes('[ERROR]')) {
                  badgeClass = 'text-rose-600 dark:text-rose-400 font-semibold';
                } else if (log.includes('[TOOL]')) {
                  badgeClass = 'text-blue-600 dark:text-blue-400';
                } else if (log.includes('[GIT]')) {
                  badgeClass = 'text-purple-600 dark:text-purple-400';
                }

                return (
                  <div
                    key={index}
                    className="flex items-start gap-2 py-0.5 leading-snug border-b border-[#f7f7f5] dark:border-[#252525] last:border-0"
                  >
                    <span className="text-[10px] text-[#9b9a97] select-none">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className={`break-all ${badgeClass}`}>{log}</span>
                  </div>
                );
              })
            )}
            <div ref={terminalEndRef} />
          </div>
        )}
      </div>
    </section>
  );
};
