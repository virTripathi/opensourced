import { useState, useEffect, useRef, useCallback } from 'react';

export type NarrationState = 'idle' | 'playing' | 'paused';

export interface UseDiagramNarratorReturn {
  state: NarrationState;
  isSupported: boolean;
  play: () => void;
  pause: () => void;
  stop: () => void;
  toggle: () => void;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  activeVoiceName: string | null;
}

/**
 * Filters out heavy, robotic, or novelty system voices (like Alex, Fred, Bruce on macOS)
 * in favor of articulate, lighter, natural neural voices.
 */
function isHeavyOrRoboticVoice(name: string): boolean {
  return /alex|fred|bruce|ralph|junior|albert|zarvox|trinoids|bad news|cellos|pipe organ|whisper|hysterical|deranged|boing|bells/i.test(
    name
  );
}

/**
 * Selects the highest quality, articulate, light English voice available in the current browser/OS.
 */
function selectBestNaturalVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const englishVoices = voices.filter((v) => v.lang.startsWith('en'));
  if (englishVoices.length === 0) return voices[0] || null;

  // 1. Google Web Speech neural voices in Chrome (Google US English, Google UK English Female - crisp & light)
  const googleNatural = englishVoices.find((v) =>
    /google\s+us\s+english|google\s+uk\s+english\s+female|google\s+uk\s+english\s+male/i.test(v.name)
  );
  if (googleNatural) return googleNatural;

  // 2. Microsoft Natural / Online voices (Edge / Windows / Chrome)
  const msNatural = englishVoices.find((v) => /natural|online|neural/i.test(v.name) && !isHeavyOrRoboticVoice(v.name));
  if (msNatural) return msNatural;

  // 3. Apple Enhanced / Premium clear voices on macOS
  const appleEnhanced = englishVoices.find(
    (v) => /(enhanced|premium)/i.test(v.name) && !isHeavyOrRoboticVoice(v.name)
  );
  if (appleEnhanced) return appleEnhanced;

  // 4. Light, articulate conversational voices (Ava, Samantha, Allison, Serena, Zoe, Victoria, Karen)
  const pleasantVoice = englishVoices.find(
    (v) => /ava|samantha|allison|serena|zoe|victoria|karen|kate|fiona/i.test(v.name) && !isHeavyOrRoboticVoice(v.name)
  );
  if (pleasantVoice) return pleasantVoice;

  // 5. Any English voice that is not heavy or robotic
  const cleanEnglish = englishVoices.find((v) => !isHeavyOrRoboticVoice(v.name));
  if (cleanEnglish) return cleanEnglish;

  return englishVoices[0];
}

export function useDiagramNarrator(textToSpeak: string): UseDiagramNarratorReturn {
  const [state, setState] = useState<NarrationState>('idle');
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [activeVoiceName, setActiveVoiceName] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  // Asynchronously listen for available voices (Chrome loads web voices dynamically)
  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        setVoices(v);
        const best = selectBestNaturalVoice(v);
        if (best) setActiveVoiceName(best.name);
      }
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, [isSupported]);

  // Stop speech when component unmounts or text changes
  useEffect(() => {
    return () => {
      if (isSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSupported, textToSpeak]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setState('idle');
  }, [isSupported]);

  const pause = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.pause();
    setState('paused');
  }, [isSupported]);

  const play = useCallback(() => {
    if (!isSupported || !textToSpeak.trim()) return;

    if (state === 'paused') {
      window.speechSynthesis.resume();
      setState('playing');
      return;
    }

    // Cancel any active speech before starting new one
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    // 1.05x speed and 1.08 pitch creates a crisp, light, articulate tone (no heavy drag)
    utterance.rate = playbackRate * 1.05;
    utterance.pitch = 1.08;

    const currentVoices = voices.length > 0 ? voices : window.speechSynthesis.getVoices();
    const bestVoice = selectBestNaturalVoice(currentVoices);

    if (bestVoice) {
      utterance.voice = bestVoice;
      setActiveVoiceName(bestVoice.name);
    }

    utterance.onstart = () => setState('playing');
    utterance.onpause = () => setState('paused');
    utterance.onresume = () => setState('playing');
    utterance.onend = () => {
      setState('idle');
      utteranceRef.current = null;
    };
    utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        console.warn('[useDiagramNarrator] Speech synthesis error:', e.error);
      }
      setState('idle');
      utteranceRef.current = null;
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [isSupported, textToSpeak, state, playbackRate, voices]);

  const toggle = useCallback(() => {
    if (state === 'playing') {
      pause();
    } else {
      play();
    }
  }, [state, pause, play]);

  return {
    state,
    isSupported,
    play,
    pause,
    stop,
    toggle,
    playbackRate,
    setPlaybackRate,
    activeVoiceName,
  };
}
