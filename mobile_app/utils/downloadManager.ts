import { useEffect, useState } from 'react';

import { ModelManager } from './ModelManager';
import { setModelsPresent } from './modelPresence';

// Active model downloads, owned at MODULE scope - not inside any screen. That's
// the whole point: a download is kicked off from the Models screen (or setup),
// but it has to keep running when you leave that screen, switch tabs, or the app
// gets backgrounded. Screens subscribe to this for progress; the download itself
// lives here and finishes on its own whether or not anyone is watching.
//
// Deliberately NOT persisted: an in-flight download can't survive the process
// being killed anyway (the native task dies with it), and the .part file plus
// isModelDownloaded already make a half-finished download simply "not installed"
// rather than a corrupt one. Resuming across a real background/kill is Stage 3.

export interface DownloadTask {
  modelId: string;
  progress: number; // 0..1
  written: number;
  total: number;
  speed: number; // bytes/sec, smoothed
  eta: number; // seconds remaining
  status: 'downloading';
}

export type DownloadState = Record<string, DownloadTask>;

let tasks: DownloadState = {};
let subscribers: ((s: DownloadState) => void)[] = [];
// Per-download sampling point for the speed/ETA readout. Module-level so it
// survives the component that started the download unmounting.
const lastTick: Record<string, { time: number; written: number }> = {};

const notify = () => {
  const snapshot = tasks;
  subscribers.forEach((fn) => fn(snapshot));
};

const patch = (modelId: string, next: Partial<DownloadTask>) => {
  const prev = tasks[modelId];
  if (!prev) return;
  tasks = { ...tasks, [modelId]: { ...prev, ...next } };
  notify();
};

const remove = (modelId: string) => {
  if (!tasks[modelId]) return;
  const next = { ...tasks };
  delete next[modelId];
  tasks = next;
  delete lastTick[modelId];
  notify();
};

/** Whether a model is downloading right now. */
export function isDownloading(modelId: string): boolean {
  return tasks[modelId]?.status === 'downloading';
}

/** The current active downloads, for one-off reads (hooks below for React). */
export function getDownloads(): DownloadState {
  return tasks;
}

/**
 * Start a model download, or do nothing if it's already running. Fire and
 * forget: the download runs to completion here regardless of who called it or
 * whether they stayed mounted. On success the model is installed and the task
 * clears; on failure the task clears and the .part file is cleaned up by
 * ModelManager, so the model is simply "not installed" and the row returns to
 * "Get".
 */
export function startModelDownload(modelId: string, url: string): void {
  if (tasks[modelId]?.status === 'downloading') return;

  tasks = {
    ...tasks,
    [modelId]: { modelId, progress: 0.01, written: 0, total: 1, speed: 0, eta: 0, status: 'downloading' },
  };
  lastTick[modelId] = { time: Date.now(), written: 0 };
  notify();

  ModelManager.startDownload(url, modelId, (info) => {
    const now = Date.now();
    const last = lastTick[modelId];
    let speed = tasks[modelId]?.speed ?? 0;
    let eta = tasks[modelId]?.eta ?? 0;
    // Sample at most twice a second so the number is readable, not a blur.
    if (last && now - last.time > 500) {
      const instant = (info.written - last.written) / ((now - last.time) / 1000);
      if (instant > 0) {
        speed = instant;
        eta = info.total > 0 ? (info.total - info.written) / instant : 0;
      }
      lastTick[modelId] = { time: now, written: info.written };
    }
    patch(modelId, { progress: info.progress, written: info.written, total: info.total, speed, eta });
  })
    .then(() => {
      remove(modelId);
      setModelsPresent(true);
    })
    .catch((e) => {
      console.error('Download failed', modelId, e);
      remove(modelId);
    });
}

/** Live map of active downloads. Re-renders the caller on any progress tick. */
export function useDownloads(): DownloadState {
  const [state, setState] = useState<DownloadState>(tasks);
  useEffect(() => {
    setState(tasks);
    const fn = (s: DownloadState) => setState(s);
    subscribers.push(fn);
    return () => {
      subscribers = subscribers.filter((x) => x !== fn);
    };
  }, []);
  return state;
}
