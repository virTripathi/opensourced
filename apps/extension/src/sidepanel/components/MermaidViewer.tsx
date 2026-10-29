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
} from 'lucide-react';

interface MermaidViewerProps {
  chart: string;
  isDark?: boolean;
  className?: string;
  title?: string;
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({
  chart,
  isDark = false,
  className = '',
  title,
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

  // Clean raw chart code (remove markdown fences if present)
  const cleanChart = React.useMemo(() => {
    if (!chart) return '';
    return chart
      .replace(/^```mermaid\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }, [chart]);

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
