import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web Speech API wrapper for voice input.
 *
 * Browser-native, so there is no audio upload and no per-request cost — but
 * support is genuinely uneven: Chrome and Edge implement it, Safari partially,
 * and Firefox not at all by default. So `supported` is exposed and the UI hides
 * the feature rather than offering a button that silently does nothing.
 *
 * Chrome also routes recognition through a Google service, which means it needs
 * a network connection; that failure mode is surfaced as an error rather than
 * appearing as an unresponsive button.
 */

const getRecognition = () => {
  if (typeof window === 'undefined') return null;
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
};

/** Human-readable text for the API's terse error codes. */
const ERROR_MESSAGES = {
  'not-allowed':
    'Microphone access was blocked. Allow it in your browser settings to use voice input.',
  'service-not-allowed':
    'Microphone access was blocked. Allow it in your browser settings to use voice input.',
  'no-speech': "I didn't catch anything — try again a little closer to the mic.",
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs a network connection and could not reach the service.',
  aborted: null, // user-initiated stop; not worth surfacing
};

export const useSpeechRecognition = ({ onResult } = {}) => {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  // Keep the latest callback without re-creating the recogniser on every render.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const recognition = getRecognition();
    if (!recognition) {
      setSupported(false);
      return undefined;
    }

    setSupported(true);
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setError(null);
      setTranscript('');
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }

      // Show interim text live so the user can see it is working.
      setTranscript(final || interim);
      if (final) onResultRef.current?.(final.trim());
    };

    recognition.onerror = (event) => {
      const message = ERROR_MESSAGES[event.error];
      if (message !== null) {
        setError(message ?? `Voice input failed (${event.error}).`);
      }
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;

    return () => {
      // Detach handlers before aborting so onend/onerror don't fire into a
      // component that has already unmounted.
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current || listening) return;
    setError(null);
    try {
      recognitionRef.current.start();
    } catch {
      // start() throws if called while already running; harmless.
    }
  }, [listening]);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      /* already stopped */
    }
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, transcript, error, start, stop, toggle, setError };
};
