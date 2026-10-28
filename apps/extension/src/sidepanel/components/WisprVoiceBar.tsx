import React from 'react';
import { Mic, MicOff, Radio, Volume2 } from 'lucide-react';

interface WisprVoiceBarProps {
  isListening: boolean;
  voiceTranscript: string;
  toggleListening: () => void;
  onVoiceAction: (actionKey: string) => void;
}

export const WisprVoiceBar: React.FC<WisprVoiceBarProps> = ({
  isListening,
  voiceTranscript,
  toggleListening,
  onVoiceAction,
}) => {
  const quickCommands = [
    { label: 'Clone repo', action: 'clone' },
    { label: 'Scan issue', action: 'scan_issue' },
    { label: 'Run OWASP', action: 'owasp_check' },
    { label: 'Draft PR', action: 'draft_pr' },
    { label: 'Save to Drive', action: 'drive' },
  ];

  return (
    <div className="bg-[#f7f7f5] dark:bg-[#202020] border border-[#e9e9e7] dark:border-[#2e2e2e] rounded-lg p-2.5 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Green Mic Button */}
          <button
            onClick={toggleListening}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-all flex-shrink-0 ${
              isListening
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse shadow-sm shadow-emerald-600/30'
                : 'bg-white dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] hover:border-emerald-600 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
            }`}
            title={isListening ? 'Stop listening' : 'Start Wispr Flow Voice dictation'}
          >
            {isListening ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#37352f] dark:text-[#ebebeb]">
                Wispr Flow Voice
              </span>
              {isListening && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping inline-block" />
                  Listening...
                </span>
              )}
            </div>
            <div className="text-[10px] text-[#787774] dark:text-[#9b9a97] truncate">
              {voiceTranscript || 'Hands-free dictation ready: speak commands or click below'}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Voice Command Chips */}
      <div className="flex flex-wrap items-center gap-1 mt-2 pt-2 border-t border-[#e9e9e7]/70 dark:border-[#2e2e2e]/70">
        <span className="text-[10px] text-[#9b9a97] mr-0.5">Try:</span>
        {quickCommands.map((cmd) => (
          <button
            key={cmd.action}
            onClick={() => onVoiceAction(cmd.action)}
            className="text-[10px] px-1.5 py-0.5 rounded bg-white dark:bg-[#282828] border border-[#e9e9e7] dark:border-[#333333] hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 text-[#787774] dark:text-[#9b9a97] transition-colors"
          >
            "{cmd.label}"
          </button>
        ))}
      </div>
    </div>
  );
};
