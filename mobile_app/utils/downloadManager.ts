import { useEffect, useState } from 'react';
import type { DownloadResumable } from 'expo-file-system/legacy';

import { ModelManager } from './ModelManager';
import { setModelsPresent } from './modelPresence';

// Active model downloads, owned at MODULE scope - not inside any screen. A
// download is kicked off from the Models screen, but it has to keep running when
// you leave that screen or switch tabs. Screens subscribe here for progress; the
// download itself lives here, can be paused/resumed/cancelled from anywhere (the
// banner and, in Stage 3b, the system notification), and finishes on its own.

export interface DownloadTask {
  modelId: string;
  progress: number; // 0..1
  written: number;
  total: number;
  speed: number; // bytes/sec, smoothed
  eta: number; // seconds remaining
  status: 'downloading' | 'paused';
}

export type DownloadState = Record<string, DownloadTask>;

let tasks: DownloadState = {};
let subscribers: ((s: DownloadState) => void)[] = [];
// The resumable objects, kept out of the public state (they're not serialisable
// and screens don't need them). Keyed by model id, parallel to `tasks`.
const resumables: Record<string, DownloadResumable> = {};
const lastTick: Record<string, { time: number; written: number }> = {};

// Fires whenever the set of downloads changes (start/finish/cancel). Stage 3b's
// notification/foreground-service layer subscribes to this to appear and vanish.
let changeListeners: (() => void)[] = [];
export function onDownloadsChanged(fn: () => void): () => void {
  changeListeners.push(fn);
  return () => {
    changeListeners = changeListeners.filter((f) => f !== fn);
  };
}

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
  if (!tasks[modelId] && !resumables[modelId]) return;
  const next = { ...tasks };
  delete next[modelId];
  tasks = next;
  delete resumables[modelId];
  delete lastTick[modelId];
  notify();
  changeListeners.forEach((f) => f());
};

export function isDownloading(modelId: string): boolean {
  return tasks[modelId]?.status === 'downloading';
}
export function isPaused(modelId: string): boolean {
  return tasks[modelId]?.status === 'paused';
}
export function getDownloads(): DownloadState {
  return tasks;
}

function progressCb(modelId: string) {
  return (info: { progress: number; written: number; total: number }) => {
    const now = Date.now();
    const last = lastTick[modelId];
    let speed = tasks[modelId]?.speed ?? 0;
    let eta = tasks[modelId]?.eta ?? 0;
    if (last && now - last.time > 500) {
      const instant = (info.written - last.written) / ((now - last.time) / 1000);
      if (instant > 0) {
        speed = instant;
        eta = info.total > 0 ? (info.total - info.written) / instant : 0;
      }
      lastTick[modelId] = { time: now, written: info.written };
    }
    patch(modelId, { progress: info.progress, written: info.written, total: info.total, speed, eta });
  };
}

// Called when downloadAsync / resumeAsync settles. A valid 2xx result means the
// file is here - promote it. `undefined` means it was paused (downloadAsync
// resolves undefined on pause), so we wait for resume to re-arm this. Any other
// status is a bad response - clean up.
function onSettled(modelId: string, result: { status: number } | undefined) {
  if (!tasks[modelId]) return; // cancelled while in flight
  if (!result) return; // paused - resume() will call onSettled again
  if (result.status >= 200 && result.status < 300) {
    ModelManager.finishDownload(modelId)
      .then(() => {
        remove(modelId);
        setModelsPresent(true);
      })
      .catch((e) => onFailed(modelId, e));
  } else {
    onFailed(modelId, new Error(`HTTP ${result.status}`));
  }
}

function onFailed(modelId: string, e: unknown) {
  console.error('Download failed', modelId, e);
  ModelManager.cleanupDownload(modelId).catch(() => {});
  remove(modelId);
}

/** Start a model download, or do nothing if it's already active (or paused). */
export function startModelDownload(modelId: string, url: string): void {
  if (tasks[modelId]) return;

  tasks = {
    ...tasks,
    [modelId]: { modelId, progress: 0.01, written: 0, total: 1, speed: 0, eta: 0, status: 'downloading' },
  };
  lastTick[modelId] = { time: Date.now(), written: 0 };
  const resumable = ModelManager.createDownload(url, modelId, progressCb(modelId));
  resumables[modelId] = resumable;
  notify();
  changeListeners.forEach((f) => f());

  resumable
    .downloadAsync()
    .then((r) => onSettled(modelId, r))
    .catch((e) => onFailed(modelId, e));
}

export function pauseDownload(modelId: string): void {
  const r = resumables[modelId];
  if (!r || tasks[modelId]?.status !== 'downloading') return;
  patch(modelId, { status: 'paused', speed: 0, eta: 0 });
  r.pauseAsync().catch(() => {});
  changeListeners.forEach((f) => f());
}

export function resumeDownload(modelId: string): void {
  const r = resumables[modelId];
  if (!r || tasks[modelId]?.status !== 'paused') return;
  patch(modelId, { status: 'downloading' });
  lastTick[modelId] = { time: Date.now(), written: tasks[modelId]?.written ?? 0 };
  changeListeners.forEach((f) => f());
  r.resumeAsync()
    .then((res) => onSettled(modelId, res))
    .catch((e) => onFailed(modelId, e));
}

export async function cancelDownload(modelId: string): Promise<void> {
  const r = resumables[modelId];
  remove(modelId); // clear the UI immediately
  try {
    if (r) await r.pauseAsync();
  } catch {
    // it may already be stopped
  }
  await ModelManager.cleanupDownload(modelId).catch(() => {});
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
