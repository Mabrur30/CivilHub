import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO_MAX_SECONDS } from "../lib/messageAttachments";

export type RecorderStatus = "idle" | "requesting" | "recording" | "recorded";

export interface RecordedAudio {
  blob: Blob;
  url: string;
  mimeType: string;
  durationSeconds: number;
}

// Chrome and Firefox record webm/ogg; Safari only records mp4.
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

const pickMimeType = (): string =>
  PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ??
  "";

const describeMicrophoneError = (error: unknown): string => {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access is blocked. Allow it in your browser's site settings, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone was found. Connect one and try again.";
  }
  if (name === "NotSupportedError") {
    return "Voice messages aren't supported in this browser.";
  }
  if (name === "NotReadableError") {
    return "Your microphone is being used by another app. Close it and try again.";
  }
  return "Recording could not start. Check your microphone and try again.";
};

export const isAudioRecordingSupported = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.MediaRecorder !== "undefined" &&
  Boolean(navigator.mediaDevices?.getUserMedia);

export function useAudioRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [recording, setRecording] = useState<RecordedAudio | null>(null);
  const [error, setError] = useState<string>("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const discardOnStopRef = useRef<boolean>(false);

  const releaseStream = (): void => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stop = useCallback((): void => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const start = useCallback(async (): Promise<void> => {
    setError("");

    if (!isAudioRecordingSupported()) {
      setError("Voice messages aren't supported in this browser.");
      return;
    }

    setStatus("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (permissionError: unknown) {
      setStatus("idle");
      setError(describeMicrophoneError(permissionError));
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );

    streamRef.current = stream;
    recorderRef.current = recorder;
    chunksRef.current = [];
    discardOnStopRef.current = false;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const durationSeconds = Math.min(
        (Date.now() - startedAtRef.current) / 1000,
        AUDIO_MAX_SECONDS,
      );
      releaseStream();
      recorderRef.current = null;

      if (discardOnStopRef.current || chunksRef.current.length === 0) {
        setStatus("idle");
        return;
      }

      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      setRecording({
        blob,
        url: URL.createObjectURL(blob),
        mimeType: type,
        durationSeconds,
      });
      setStatus("recorded");
    };

    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    recorder.start(250);
    setStatus("recording");

    timerRef.current = window.setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      setElapsedSeconds(elapsed);
      if (elapsed >= AUDIO_MAX_SECONDS) stop();
    }, 250);
  }, [stop]);

  const discard = useCallback((): void => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      discardOnStopRef.current = true;
      recorderRef.current.stop();
    }
    setRecording((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setElapsedSeconds(0);
    setStatus("idle");
  }, []);

  useEffect(
    () => () => {
      discardOnStopRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      releaseStream();
    },
    [],
  );

  useEffect(
    () => () => {
      if (recording) URL.revokeObjectURL(recording.url);
    },
    [recording],
  );

  return {
    status,
    elapsedSeconds,
    recording,
    error,
    clearError: () => setError(""),
    start,
    stop,
    discard,
  };
}
