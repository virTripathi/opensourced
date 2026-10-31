import React, { useEffect, useState, useRef, useId } from 'react';
import {
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Download,
  AlertCircle,
  Code2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Volume2,
  Pause,
  Play,
  Square,
} from 'lucide-react';
import { useDiagramNarrator } from '../../hooks/useDiagramNarrator';

interface MermaidViewerProps {
  chart: string;
  isDark?: boolean;
  className?: string;
  title?: string;
  explanation?: string;
}

/**
 * Synthesizes a natural, spoken audio walkthrough from raw Mermaid syntax
 * when no explicit explanation metadata is attached to the diagram.
 */
export function generateFallbackDiagramWalkthrough(chartText: string): string {
  if (!chartText || !chartText.trim()) return '';

  const clean = chartText
    .replace(/^```mermaid\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // 1. Flowchart / Graph (e.g. graph TD, flowchart LR)
  if (/^(graph|flowchart)\s+/i.test(clean)) {
    const nodeLabels = new Map<string, string>();
    const lines = clean.split('\n');
    const transitions: Array<{ from: string; label?: string; to: string }> = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('%%') || /^(graph|flowchart|subgraph|end|style|classDef|class|click)/i.test(line)) {
        continue;
      }

      // First extract any node labels defined on this line
      const localNodeRegex = /([A-Za-z0-9_-]+)\s*(?:\[|\(\[|\(\(|\{\{|\()([^[\](){}]+)(?:\]|\)\)|\}\}|\))/g;
      let m: RegExpExecArray | null;
      while ((m = localNodeRegex.exec(line)) !== null) {
        const id = m[1];
        const text = m[2].replace(/["']/g, '').trim();
        if (text && !nodeLabels.has(id)) {
          nodeLabels.set(id, text);
        }
      }

      // Match edge transitions: FromId -->|Label| ToId or FromId --> ToId
      const edgeMatch = line.match(
        /([A-Za-z0-9_-]+)(?:\[.*?\]|\(.*?\))?\s*(?:-->|==>|-\.->)\s*(?:\|([^|]+)\|)?\s*([A-Za-z0-9_-]+)(?:\[.*?\]|\(.*?\))?/
      );
      if (edgeMatch) {
        const fromId = edgeMatch[1];
        const edgeLabel = edgeMatch[2]?.trim();
        const toId = edgeMatch[3];
        transitions.push({ from: fromId, label: edgeLabel, to: toId });
      }
    }

    if (transitions.length > 0) {
      const steps: string[] = [];
      transitions.forEach((t, idx) => {
        const fromName = nodeLabels.get(t.from) || t.from;
        const toName = nodeLabels.get(t.to) || t.to;
        const prefix = idx === 0 ? 'First, ' : idx === transitions.length - 1 ? 'Finally, ' : 'Next, ';

        if (t.label) {
          steps.push(`${prefix}${fromName} transitions via ${t.label} to ${toName}.`);
        } else {
          steps.push(`${prefix}${fromName} connects directly to ${toName}.`);
        }
      });

      return `This diagram illustrates the architectural execution flow. ${steps.join(' ')}`;
    }
  }

  // 2. Sequence Diagram (sequenceDiagram)
  if (/^sequenceDiagram/i.test(clean)) {
    const lines = clean.split('\n');
    const steps: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('%%') || /^(sequenceDiagram|autonumber|participant|actor|box|end|note)/i.test(line)) {
        continue;
      }

      const seqMatch = line.match(/([A-Za-z0-9_-]+)\s*(?:->>|-->>|->|-->)\s*([A-Za-z0-9_-]+)\s*:\s*(.+)/);
      if (seqMatch) {
        const from = seqMatch[1];
        const to = seqMatch[2];
        const msg = seqMatch[3].trim();
        const prefix = steps.length === 0 ? 'First, ' : 'Next, ';

        if (from === to) {
          steps.push(`${prefix}${from} internally processes ${msg}.`);
        } else {
          steps.push(`${prefix}${from} sends ${msg} to ${to}.`);
        }
      }
    }

    if (steps.length > 0) {
      return `This sequence diagram outlines the interaction flow. ${steps.join(' ')}`;
    }
  }

  // 3. Fallback for any diagram: extract readable bracketed labels
  const extractedLabels: string[] = [];
  const genericMatch = clean.match(/\[([^[\]]+)\]/g);
  if (genericMatch) {
    for (const raw of genericMatch) {
      const text = raw.replace(/^\[|\]$/g, '').replace(/["']/g, '').trim();
      if (text && !extractedLabels.includes(text)) {
        extractedLabels.push(text);
      }
    }
  }

  if (extractedLabels.length > 0) {
    return `This architecture diagram illustrates the flow across components: ${extractedLabels.join(', ')}.`;
  }

  return 'Architectural component and data flow diagram.';
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({
  chart,
  isDark = false,
  className = '',
  title,
  explanation: propExplanation,
}) => {
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showRawCode, setShowRawCode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Unique ID generator for Mermaid SVG rendering
  const uniqueId = useId().replace(/:/g, '_');
  const containerRef = useRef<HTMLDivElement>(null);

  // Clean raw chart code and extract hidden explanation comment if present
  const { cleanChart, extractedExplanation } = React.useMemo(() => {
    if (!chart) return { cleanChart: '', extractedExplanation: '' };
    let raw = chart
      .replace(/^```mermaid\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let extracted = '';
    const match = raw.match(/%%\s*diagram-explanation:\s*([^\r\n]+)/i);
    if (match) {
      extracted = match[1].trim();
      raw = raw.replace(/%%\s*diagram-explanation:\s*[^\r\n]+(\r?\n)?/i, '').trim();
    }

    return { cleanChart: raw, extractedExplanation: extracted };
  }, [chart]);

  const fallbackExplanation = React.useMemo(() => {
    return generateFallbackDiagramWalkthrough(cleanChart);
  }, [cleanChart]);

  const activeExplanation = (propExplanation || extractedExplanation || fallbackExplanation || '').trim();
  const narrator = useDiagramNarrator(activeExplanation);

  useEffect(() => {
    let isMounted = true;

    if (!cleanChart) {
      setSvgContent('');
      setError(null);
      return;
    }

    const renderChart = async () => {
      try {
        setError(null);

        // Dynamically load Mermaid for zero bundle bloat & on-demand code splitting
        const { default: mermaid } = await import('mermaid');

        // Initialize Mermaid with theme matching the current mode
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose',
          theme: isDark ? 'dark' : 'neutral',
          themeVariables: isDark
            ? {
                primaryColor: '#10b981',
                primaryTextColor: '#f8fafc',
                primaryBorderColor: '#059669',
                lineColor: '#64748b',
                secondaryColor: '#1e293b',
                tertiaryColor: '#0f172a',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: '12px',
              }
            : {
                primaryColor: '#ecfdf5',
                primaryTextColor: '#064e3b',
                primaryBorderColor: '#10b981',
                lineColor: '#94a3b8',
                secondaryColor: '#f8fafc',
                tertiaryColor: '#f1f5f9',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: '12px',
              },
        });

        // Use a unique ID for each render pass to prevent DOM collisions
        const renderId = `mermaid_svg_${uniqueId}_${Date.now().toString(36)}`;
        const { svg } = await mermaid.render(renderId, cleanChart);

        if (isMounted) {
          // Add responsive SVG properties
          const responsiveSvg = svg
            .replace(/<svg\s+/, '<svg style="max-width: 100%; height: auto;" ')
            .replace(/height="[0-9]+(\.[0-9]+)?(px)?"/i, '');
          setSvgContent(responsiveSvg);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('[MermaidViewer] Diagram parse error:', err.message);
          setError(err.message || 'Syntax error in Mermaid diagram');
          // Clean up any rogue elements Mermaid inserts into body on failure
          const rogue = document.getElementById(`d${uniqueId}`);
          if (rogue) rogue.remove();
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [cleanChart, isDark, uniqueId]);

  const handleCopyCode = () => {
    if (!cleanChart) return;
    navigator.clipboard.writeText(cleanChart);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagram_${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  return (
    <div
      className={`relative my-3 rounded-lg border border-[#e9e9e7] dark:border-[#2e2e2e] bg-[#fcfcfc] dark:bg-[#191919] overflow-hidden shadow-2xs transition-colors ${className}`}
    >
      {/* Header Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f7f7f5] dark:bg-[#202020] border-b border-[#e9e9e7] dark:border-[#2e2e2e] text-[11px] text-[#787774] dark:text-[#9b9a97]">
        <div className="flex items-center gap-1.5 font-medium truncate pr-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
          <span className="truncate">{title || 'Architecture & UML Diagram'}</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Voice Walkthrough Dictation Button */}
          {activeExplanation && narrator.isSupported && (
            <div className="flex items-center gap-1">
              <button
                onClick={narrator.toggle}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors shadow-2xs ${
                  narrator.state === 'playing'
                    ? 'bg-emerald-600 text-white animate-pulse'
                    : narrator.state === 'paused'
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                }`}
                title={
                  narrator.state === 'playing'
                    ? 'Pause diagram narration'
                    : narrator.state === 'paused'
                    ? 'Resume diagram narration'
                    : 'Listen to spoken architecture walkthrough'
                }
              >
                {narrator.state === 'playing' ? (
                  <>
                    <Pause className="w-3 h-3" />
                    <span>Pause</span>
                  </>
                ) : narrator.state === 'paused' ? (
                  <>
                    <Play className="w-3 h-3" />
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3 h-3" />
                    <span>Walkthrough</span>
                  </>
                )}
              </button>

              {narrator.state !== 'idle' && (
                <button
                  onClick={narrator.stop}
                  className="p-1 rounded text-[#787774] dark:text-[#9b9a97] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-[#e9e9e7] dark:hover:bg-[#2e2e2e] transition-colors"
                  title="Stop narration"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                </button>
              )}

              <div className="w-[1px] h-3 bg-[#e9e9e7] dark:bg-[#2e2e2e] mx-0.5" />
            </div>
          )}

          {/* Zoom controls (visible in normal or fullscreen) */}
          <button
            onClick={handleZoomIn}
            className="p-1 rounded hover:bg-[#e9e9e7] dark:hover:bg-[#2e2e2e] text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-1 rounded hover:bg-[#e9e9e7] dark:hover:bg-[#2e2e2e] text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          {zoomLevel !== 1 && (
            <button
              onClick={handleResetZoom}
              className="p-1 rounded hover:bg-[#e9e9e7] dark:hover:bg-[#2e2e2e] text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] transition-colors"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}

          <div className="w-[1px] h-3 bg-[#e9e9e7] dark:bg-[#2e2e2e] mx-0.5" />

          {/* Toggle raw code */}
          <button
            onClick={() => setShowRawCode((prev) => !prev)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
              showRawCode
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                : 'hover:bg-[#e9e9e7] dark:hover:bg-[#2e2e2e] hover:text-[#37352f] dark:hover:text-[#ebebeb]'
            }`}
            title="Toggle Raw Mermaid Definition"
          >
            <Code2 className="w-3 h-3" />
            <span>Code</span>
          </button>

          {/* Copy Mermaid Source */}
          <button
            onClick={handleCopyCode}
            className="p-1 rounded hover:bg-[#e9e9e7] dark:hover:bg-[#2e2e2e] text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] transition-colors"
            title="Copy Mermaid source"
          >
            {isCopied ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>

          {/* Download SVG */}
          {svgContent && (
            <button
              onClick={handleDownloadSvg}
              className="p-1 rounded hover:bg-[#e9e9e7] dark:hover:bg-[#2e2e2e] text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] transition-colors"
              title="Export Diagram as SVG"
            >
              <Download className="w-3 h-3" />
            </button>
          )}

          {/* Fullscreen Expand */}
          <button
            onClick={() => setIsFullscreen((prev) => !prev)}
            className="p-1 rounded hover:bg-[#e9e9e7] dark:hover:bg-[#2e2e2e] text-[#787774] dark:text-[#9b9a97] hover:text-[#37352f] dark:hover:text-[#ebebeb] transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Expand Diagram'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3 h-3" />
            ) : (
              <Maximize2 className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {/* Main Diagram Canvas or Raw Code */}
      <div
        ref={containerRef}
        className={`p-3 overflow-x-auto flex items-center justify-center min-h-[140px] transition-all ${
          isFullscreen
            ? 'fixed inset-4 z-50 bg-white/95 dark:bg-[#151515]/95 backdrop-blur-md rounded-xl border border-[#e9e9e7] dark:border-[#2e2e2e] shadow-2xl p-6 flex-col'
            : 'max-h-[420px]'
        }`}
      >
        {isFullscreen && (
          <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-[#e9e9e7] dark:border-[#2e2e2e]">
            <span className="text-sm font-semibold text-[#37352f] dark:text-[#ebebeb]">
              {title || 'Mermaid Architecture & Data Flow Inspection'}
            </span>
            <button
              onClick={() => setIsFullscreen(false)}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium"
            >
              Close Fullscreen
            </button>
          </div>
        )}

        {showRawCode ? (
          <pre className="w-full text-left p-3 rounded bg-[#f7f7f5] dark:bg-[#121212] border border-[#e9e9e7] dark:border-[#2e2e2e] text-[11px] font-mono text-[#37352f] dark:text-[#ebebeb] overflow-x-auto leading-relaxed select-all">
            <code>{cleanChart}</code>
          </pre>
        ) : error ? (
          <div className="w-full p-3 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-left space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>Diagram Rendering Notice</span>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              {error}
            </p>
            <div className="pt-1">
              <button
                onClick={() => setShowRawCode(true)}
                className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1"
              >
                <Code2 className="w-3 h-3" />
                <span>View raw diagram code</span>
              </button>
            </div>
          </div>
        ) : svgContent ? (
          <div
            style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
            className="w-full flex items-center justify-center transition-transform duration-150"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        ) : (
          <div className="flex items-center gap-2 text-xs text-[#787774] dark:text-[#9b9a97]">
            <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <span>Rendering diagram...</span>
          </div>
        )}
      </div>
    </div>
  );
};
