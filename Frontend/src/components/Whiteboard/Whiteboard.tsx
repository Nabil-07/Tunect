import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  type ExcalidrawElement,
  type AppState,
  type ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { readToken } from '../../lib/apiClient';

const ExcalidrawAny: any = Excalidraw;

function toCollaboratorsMap(value: unknown): Map<string, unknown> {
  if (value instanceof Map) return value as Map<string, unknown>;
  if (Array.isArray(value)) {
    try {
      return new Map(value as Array<[string, unknown]>);
    } catch {
      return new Map<string, unknown>();
    }
  }
  if (value && typeof value === 'object') {
    return new Map(Object.entries(value as Record<string, unknown>));
  }
  return new Map<string, unknown>();
}

function normalizeIncomingAppState(appState: unknown): Partial<AppState> {
  const base = appState && typeof appState === 'object'
    ? { ...(appState as Record<string, unknown>) }
    : {};
  (base as any).collaborators = toCollaboratorsMap((base as any).collaborators);
  return base as Partial<AppState>;
}

function toSerializableAppState(appState: unknown): Record<string, unknown> {
  if (!appState || typeof appState !== 'object') return {};
  const out = { ...(appState as Record<string, unknown>) };
  // Excalidraw stores collaborators as a Map; serializing it to JSON becomes {}
  // and crashes consumers expecting a Map on read.
  delete (out as any).collaborators;
  return out;
}

/** Minimal shape for sync comparison — Excalidraw elements always have these. */
interface SyncElement {
  id: string;
  version: number;
  [key: string]: unknown;
}

interface WhiteboardProps {
  bookingId: string;
  isReadOnly?: boolean;
  /** If true, enable real-time sync via Socket.IO. */
  realtime?: boolean;
  /** Optional container class for embedding in panels. */
  className?: string;
  /** Emit latest scene to parent on every change for resilient save flows. */
  onSceneChange?: (scene: { elements: readonly ExcalidrawElement[]; appState: Partial<AppState> }) => void;
  /** Whether the current user is the tutor (always can edit) or student (needs permission). */
  isTutor?: boolean;
  /** Whether the student has been granted edit access by the tutor. */
  studentEditAllowed?: boolean;
  /** Socket.IO emit function — provided by parent via useWhiteboardSocket */
  socketEmit?: (elements: any[], appState?: any) => void;
  /** Called once when Whiteboard mounts, so parent can wire remote updates in */
  onMergeRemote?: (ref: { mergeRemote: (data: { elements: any[]; appState?: any }) => void }) => void;
}

export interface WhiteboardHandle {
  /** Return the current live scene data directly from Excalidraw (not from backend). */
  getSceneData: () => { elements: readonly ExcalidrawElement[]; appState: Partial<AppState> } | null;
  /** Immediately persist the current scene to the backend. */
  flushSave: () => Promise<void>;
  /** Add an image to the whiteboard canvas from a data URL. */
  addImageToBoard: (dataUrl: string, width: number, height: number) => void;
}

export const Whiteboard = forwardRef<WhiteboardHandle, WhiteboardProps>(({ bookingId, isReadOnly = false, realtime = false, className, onSceneChange, isTutor = true, studentEditAllowed = false, socketEmit, onMergeRemote }, ref) => {
  // Determine effective read-only state:
  // - Explicit isReadOnly always wins
  // - Tutors can always edit
  // - Students can only edit when studentEditAllowed is true
  const effectiveReadOnly = isReadOnly || (!isTutor && !studentEditAllowed);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingScene, setPendingScene] = useState<{ elements: readonly ExcalidrawElement[]; appState: AppState } | null>(null);
  const apiAvailableRef = useRef<boolean>(true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKnownSceneRef = useRef<{ elements: readonly ExcalidrawElement[]; appState: Partial<AppState> } | null>(null);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  // Stable callback ref to prevent Excalidraw API going null on re-renders
  const excalidrawRefCallback = useCallback((api: ExcalidrawImperativeAPI | null) => {
    excalidrawApiRef.current = api;
    if (api) {
      console.log('[WB] Excalidraw API ready');
    } else {
      console.log('[WB] Excalidraw API cleared');
    }
    if (api) setExcalidrawAPI(api);
  }, []);

  const getExcalidrawApi = useCallback(
    () => excalidrawApiRef.current ?? excalidrawAPI,
    [excalidrawAPI],
  );

  const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const whiteboardUrl = `${apiBase}/whiteboard/${bookingId}`;

  // Expose imperative methods to parent via ref
  useImperativeHandle(ref, () => ({
    getSceneData: () => {
      const api = getExcalidrawApi();
      if (!api) return lastKnownSceneRef.current;
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const scene = { elements, appState };
      lastKnownSceneRef.current = scene;
      return scene;
    },
    flushSave: async () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      const api = getExcalidrawApi();
      const scene = api
        ? {
            elements: api.getSceneElements(),
            appState: api.getAppState(),
          }
        : lastKnownSceneRef.current;
      if (!scene) return;
      lastKnownSceneRef.current = scene;
      // Force-save directly, bypassing apiAvailableRef check
      try {
        const token = readToken();
        await fetch(whiteboardUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(scene),
        });
      } catch (err) {
        console.error('flushSave failed:', err);
      }
    },
    addImageToBoard: (dataUrl: string, width: number, height: number) => {
      const api = getExcalidrawApi();
      if (!api) return;
      const fileId = `img_${Date.now()}` as any;
      const imgElement = {
        type: 'image' as const,
        id: `elem_${Date.now()}`,
        fileId,
        x: 50,
        y: 50,
        width: Math.min(width, 800),
        height: Math.min(height, 800 * (height / width)),
        strokeColor: 'transparent',
        backgroundColor: 'transparent',
        fillStyle: 'solid' as const,
        strokeWidth: 0,
        roughness: 0,
        opacity: 100,
        angle: 0,
        groupIds: [],
        boundElements: null,
        locked: false,
        link: null,
        updated: Date.now(),
        version: 1,
        versionNonce: Math.floor(Math.random() * 1000000),
        isDeleted: false,
        roundness: null,
        seed: Math.floor(Math.random() * 1000000),
        status: 'saved' as const,
        scale: [1, 1] as [number, number],
      };
      try {
        (api as any).updateScene({
          elements: [...api.getSceneElements(), imgElement as any],
          files: {
            [fileId]: {
              id: fileId,
              dataURL: dataUrl,
              mimeType: 'image/png',
              created: Date.now(),
              lastRetrieved: Date.now(),
            },
          },
        } as any);
        onSceneChange?.({
          elements: api.getSceneElements(),
          appState: api.getAppState(),
        });
        lastKnownSceneRef.current = {
          elements: api.getSceneElements(),
          appState: api.getAppState(),
        };
      } catch (err) {
        console.error('addImageToBoard failed:', err);
      }
    },
  }), [getExcalidrawApi, onSceneChange, whiteboardUrl]);

  useEffect(() => {
    // Load saved whiteboard data if exists
    loadWhiteboardData();
  }, [bookingId]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // ── Socket.IO-based realtime sync ──
  // Flag to prevent infinite loop: when we apply a remote update via
  // updateScene(), Excalidraw fires onChange. Without this flag, the student
  // would re-emit the received update back to the server → infinite loop.
  const isRemoteUpdateRef = useRef(false);

  // Queue for remote updates that arrive before excalidrawAPI is ready
  // (e.g. whiteboard tab is hidden → Excalidraw may not initialise canvas)
  const pendingRemoteQueueRef = useRef<{ elements: any[]; appState?: any }[]>([]);

  const mergeRemoteRef = useRef<(data: { elements: any[]; appState?: any }) => void>(() => {});

  mergeRemoteRef.current = (data: { elements: any[]; appState?: any }) => {
    const remoteElements = (data.elements || []) as ExcalidrawElement[];
    if (remoteElements.length === 0) return;
    const remoteAppState = normalizeIncomingAppState(data.appState);

    const api = getExcalidrawApi();
    if (!api) {
      // Queue the update — will be applied once excalidrawAPI becomes available
      console.log('[WB] excalidrawAPI not ready, queuing remote update (' + remoteElements.length + ' elements)');
      pendingRemoteQueueRef.current.push(data);
      return;
    }

    console.log('[WB] Applying remote update —', remoteElements.length, 'elements');

    const localElements = api.getSceneElements() as unknown as SyncElement[];
    const remotes = remoteElements as unknown as SyncElement[];
    const localMap = new Map(localElements.map((e) => [e.id, e]));
    const merged: SyncElement[] = [];
    const seen = new Set<string>();

    for (const remote of remotes) {
      const local = localMap.get(remote.id);
      merged.push(!local || remote.version >= local.version ? remote : local);
      seen.add(remote.id);
    }
    for (const local of localElements) {
      if (!seen.has(local.id)) merged.push(local);
    }

    // Set flag BEFORE updateScene so the onChange handler skips re-emitting
    isRemoteUpdateRef.current = true;
    api.updateScene({
      elements: merged as unknown as ExcalidrawElement[],
      appState: remoteAppState as AppState,
    });
    // Reset flag after a micro-task so Excalidraw's synchronous onChange sees it
    requestAnimationFrame(() => { isRemoteUpdateRef.current = false; });
  };

  // When excalidrawAPI becomes available, flush any queued remote updates
  useEffect(() => {
    if (!getExcalidrawApi()) return;
    const queue = pendingRemoteQueueRef.current;
    if (queue.length > 0) {
      console.log('[WB] excalidrawAPI ready — flushing', queue.length, 'queued remote updates');
      // Merge all queued snapshots: just apply the last one (it's always a full snapshot)
      const latest = queue.at(-1);
      pendingRemoteQueueRef.current = [];
      if (latest) mergeRemoteRef.current(latest);
    }
  }, [excalidrawAPI, getExcalidrawApi]);

  // Notify parent about the merge function so it can pipe socket events in
  useEffect(() => {
    if (onMergeRemote) {
      onMergeRemote({ mergeRemote: (data) => mergeRemoteRef.current(data) });
    }
  }, [onMergeRemote, excalidrawAPI]);

  useEffect(() => {
    if (!excalidrawAPI || !pendingScene) return;
    excalidrawAPI.updateScene(pendingScene);
    setPendingScene(null);
  }, [excalidrawAPI, pendingScene]);

  const loadWhiteboardData = async () => {
    try {
      const token = readToken();
      const response = await fetch(whiteboardUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (response.status === 404) {
        // 404 means no saved data yet (or booking not found) — keep saves enabled
        apiAvailableRef.current = true;
        console.warn('No existing whiteboard data (404), starting with empty board');
        return;
      }

      apiAvailableRef.current = response.ok;
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const data = await response.json();
        if (data) {
          const scene = {
            elements: data.elements || [],
            appState: normalizeIncomingAppState(data.appState),
          };
          lastKnownSceneRef.current = scene;
          onSceneChange?.(scene);
          if (excalidrawAPI) {
            excalidrawAPI.updateScene(scene);
          } else {
            setPendingScene(scene);
          }
        }
      } else {
        console.warn('Whiteboard API not available, starting with empty board');
      }
    } catch (error) {
      console.error('Failed to load whiteboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveWhiteboardData = async (data: any) => {
    if (apiAvailableRef.current === false) return;
    try {
      const token = readToken();
      const res = await fetch(whiteboardUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        console.warn('Whiteboard save failed:', res.status);
      }
    } catch (error) {
      console.error('Failed to save whiteboard:', error);
    }
  };

  // Throttled auto-save: saves at most once every 2 seconds during active drawing,
  // ensuring real-time sync while the user is still drawing.
  const lastSaveTimeRef = useRef<number>(0);
  const throttledAutoSave = useCallback((data: any) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    const now = Date.now();
    const elapsed = now - lastSaveTimeRef.current;
    const THROTTLE_MS = 2000;
    if (elapsed >= THROTTLE_MS) {
      lastSaveTimeRef.current = now;
      saveWhiteboardData(data);
    } else {
      // Schedule a trailing save so the last change is always persisted
      autoSaveTimerRef.current = setTimeout(() => {
        lastSaveTimeRef.current = Date.now();
        saveWhiteboardData(data);
      }, THROTTLE_MS - elapsed);
    }
  }, []);

  const handleChange = (elements: readonly ExcalidrawElement[], appState: AppState) => {
    if (effectiveReadOnly) return;
    // Skip re-emitting when the change was triggered by a remote updateScene()
    if (isRemoteUpdateRef.current) return;

    lastKnownSceneRef.current = { elements, appState };
    onSceneChange?.({ elements, appState });

    const serializableAppState = toSerializableAppState(appState);

    // Throttled HTTP auto-save (every 2s max) for persistence
    throttledAutoSave({
      elements,
      appState: serializableAppState,
    });

    // Real-time broadcast via Socket.IO (skip empty-element noise during init)
    if (realtime && socketEmit && elements.length > 0) {
      socketEmit([...elements] as any[], serializableAppState);
    }
  };

  const handleExport = async () => {
    if (!excalidrawAPI) return;

    const elements = excalidrawAPI.getSceneElements();
    const appState = excalidrawAPI.getAppState();

    // Export as JSON
    const dataStr = JSON.stringify({ elements, appState });
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `whiteboard-${bookingId}.json`;
    link.click();

    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-lg">Loading whiteboard...</div>
      </div>
    );
  }

  return (
    <div
      className={className || "min-h-screen w-full bg-slate-50"}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <ExcalidrawAny
        ref={excalidrawRefCallback}
        excalidrawAPI={excalidrawRefCallback}
        onChange={handleChange}
        viewModeEnabled={effectiveReadOnly}
        theme="light"
        UIOptions={{
          canvasActions: {
            saveAsImage: true,
            export: { saveFileToDisk: true },
            loadScene: true,
            clearCanvas: !effectiveReadOnly,
          },
        }}
      >
        <MainMenu>
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
          <MainMenu.Item onSelect={handleExport}>
            Export as JSON
          </MainMenu.Item>
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Hints.MenuHint />
          <WelcomeScreen.Hints.ToolbarHint />
        </WelcomeScreen>
      </ExcalidrawAny>
    </div>
  );
});

export default Whiteboard;

