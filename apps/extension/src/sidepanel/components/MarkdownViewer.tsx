import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, ExternalLink, Terminal } from 'lucide-react';
import { MermaidViewer } from './MermaidViewer';

interface MarkdownViewerProps {
  content: string;
  isDark?: boolean;
  className?: string;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  isDark = false,
  className = '',
}) => {
  const [copiedSnippetIndex, setCopiedSnippetIndex] = useState<number | null>(null);

  const handleCopySnippet = (codeText: string, idx: number) => {
    navigator.clipboard.writeText(codeText);
    setCopiedSnippetIndex(idx);
    setTimeout(() => setCopiedSnippetIndex(null), 2000);
  };

  return (
    <div className={`prose-sm max-w-none text-left leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code Block Interceptor: Automatically renders Mermaid diagrams or code blocks with copy
          code({ node, className: codeClassName, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const language = match ? match[1] : '';
            const codeString = String(children).replace(/\n$/, '');
            const isInline = !codeClassName && !codeString.includes('\n');

            // 1. Mermaid UML / Architecture Diagram rendering
            if (language === 'mermaid') {
              return (
                <MermaidViewer
                  chart={codeString}
                  isDark={isDark}
                  title="Architecture / Sequence Diagram"
                />
              );
            }

            // 2. Inline Code badge
            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-[#f2f2f0] dark:bg-[#252525] text-emerald-800 dark:text-emerald-300 border border-[#e9e9e7]/60 dark:border-[#333333]"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            // 3. Multi-line Code Block with Copy Toolbar
            const snippetId = Math.abs(codeString.split('').reduce((a, b) => (a << 5) - a + b.charCodeAt(0), 0));
            const isSnippetCopied = copiedSnippetIndex === snippetId;

            return (
              <div className="my-2.5 rounded-md bg-[#f7f7f5] dark:bg-[#181818] border border-[#e9e9e7] dark:border-[#2e2e2e] overflow-hidden shadow-2xs">
                <div className="flex items-center justify-between px-3 py-1 bg-[#efefed] dark:bg-[#222222] border-b border-[#e9e9e7] dark:border-[#2e2e2e] text-[10px] text-[#787774] dark:text-[#9b9a97] font-mono">
                  <div className="flex items-center gap-1.5">
                    <Terminal className="w-3 h-3 text-[#9b9a97]" />
                    <span className="font-semibold uppercase tracking-wider">{language || 'code'}</span>
                  </div>
                  <button
                    onClick={() => handleCopySnippet(codeString, snippetId)}
                    className="flex items-center gap-1 hover:text-[#37352f] dark:hover:text-[#ebebeb] transition-colors"
                    title="Copy code snippet"
                  >
                    {isSnippetCopied ? (
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
                  <code>{children}</code>
                </pre>
              </div>
            );
          },

          // Typography styling matching OpenSourced Notion aesthetic
          h1: ({ children }) => (
            <h1 className="text-base font-bold text-[#37352f] dark:text-[#ebebeb] mt-4 mb-2 pb-1 border-b border-[#e9e9e7] dark:border-[#2e2e2e] flex items-center gap-1.5">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-bold text-[#37352f] dark:text-[#ebebeb] mt-3.5 mb-1.5 pb-0.5 border-b border-[#e9e9e7] dark:border-[#2e2e2e]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-bold text-[#37352f] dark:text-[#ebebeb] mt-3 mb-1">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[11px] font-bold text-[#787774] dark:text-[#9b9a97] uppercase tracking-wider mt-2.5 mb-1">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="text-xs text-[#37352f] dark:text-[#ebebeb] my-1.5 leading-relaxed">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="text-xs text-[#37352f] dark:text-[#ebebeb] space-y-1 my-1.5 pl-4 list-disc">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="text-xs text-[#37352f] dark:text-[#ebebeb] space-y-1 my-1.5 pl-4 list-decimal">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-emerald-500 pl-3 py-0.5 bg-[#f7f7f5] dark:bg-[#1a1a1a] rounded-r text-xs text-[#787774] dark:text-[#9b9a97] italic">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 dark:text-emerald-400 hover:underline font-medium inline-flex items-center gap-0.5"
            >
              <span>{children}</span>
              <ExternalLink className="w-2.5 h-2.5 inline" />
            </a>
          ),
          table: ({ children }) => (
            <div className="my-2.5 overflow-x-auto rounded border border-[#e9e9e7] dark:border-[#2e2e2e]">
              <table className="w-full text-left text-xs text-[#37352f] dark:text-[#ebebeb] border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#f7f7f5] dark:bg-[#222222] border-b border-[#e9e9e7] dark:border-[#2e2e2e] text-[11px] font-semibold text-[#787774] dark:text-[#9b9a97]">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-2.5 py-1.5 font-medium">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-2.5 py-1.5 border-t border-[#e9e9e7]/50 dark:border-[#2e2e2e]/50 text-[11px]">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
