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

/** Minimal shape for sync comparison — Excalidraw elements always have these. */
interface SyncElement {
  id: string;
  version: number;
  [key: string]: unknown;
}

interface WhiteboardProps {
  bookingId: string;
  isReadOnly?: boolean;
  /** If true, sync the board (reserved for future livekit data sync). */
  realtime?: boolean;
  /** Optional container class for embedding in panels. */
  className?: string;
  /** Emit latest scene to parent on every change for resilient save flows. */
  onSceneChange?: (scene: { elements: readonly ExcalidrawElement[]; appState: Partial<AppState> }) => void;
}

export interface WhiteboardHandle {
  /** Return the current live scene data directly from Excalidraw (not from backend). */
  getSceneData: () => { elements: readonly ExcalidrawElement[]; appState: Partial<AppState> } | null;
  /** Immediately persist the current scene to the backend. */
  flushSave: () => Promise<void>;
  /** Add an image to the whiteboard canvas from a data URL. */
  addImageToBoard: (dataUrl: string, width: number, height: number) => void;
}

export const Whiteboard = forwardRef<WhiteboardHandle, WhiteboardProps>(({ bookingId, isReadOnly = false, realtime = false, className, onSceneChange }, ref) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingScene, setPendingScene] = useState<{ elements: readonly ExcalidrawElement[]; appState: AppState } | null>(null);
  const apiAvailableRef = useRef<boolean>(true);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKnownSceneRef = useRef<{ elements: readonly ExcalidrawElement[]; appState: Partial<AppState> } | null>(null);

  // Stable callback ref to prevent Excalidraw API going null on re-renders
  const excalidrawRefCallback = useCallback((api: ExcalidrawImperativeAPI | null) => {
    if (api) setExcalidrawAPI(api);
  }, []);

  const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const whiteboardUrl = `${apiBase}/whiteboard/${bookingId}`;

  // Expose imperative methods to parent via ref
  useImperativeHandle(ref, () => ({
    getSceneData: () => {
      if (!excalidrawAPI) return lastKnownSceneRef.current;
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const scene = { elements, appState };
      lastKnownSceneRef.current = scene;
      return scene;
    },
    flushSave: async () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      const scene = excalidrawAPI
        ? {
            elements: excalidrawAPI.getSceneElements(),
            appState: excalidrawAPI.getAppState(),
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
      if (!excalidrawAPI) return;
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
        (excalidrawAPI as any).updateScene({
          elements: [...excalidrawAPI.getSceneElements(), imgElement as any],
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
          elements: excalidrawAPI.getSceneElements(),
          appState: excalidrawAPI.getAppState(),
        });
        lastKnownSceneRef.current = {
          elements: excalidrawAPI.getSceneElements(),
          appState: excalidrawAPI.getAppState(),
        };
      } catch (err) {
        console.error('addImageToBoard failed:', err);
      }
    },
  }), [excalidrawAPI, onSceneChange, whiteboardUrl]);

  useEffect(() => {
    // Load saved whiteboard data if exists
    loadWhiteboardData();
  }, [bookingId]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  // Poll-based realtime sync: periodically fetch latest whiteboard data
  // so both participants see each other's changes.
  useEffect(() => {
    if (!realtime || !excalidrawAPI) return;
    const POLL_INTERVAL = 3000; // 3 seconds

    const buildFingerprint = (elements: readonly ExcalidrawElement[]) =>
      (elements as unknown as SyncElement[])
        .map((e) => `${e.id}:${e.version}`)
        .sort((a, b) => a.localeCompare(b))
        .join(',');

    const mergeElements = (
      localElements: readonly ExcalidrawElement[],
      remoteElements: ExcalidrawElement[],
    ): ExcalidrawElement[] => {
      const locals = localElements as unknown as SyncElement[];
      const remotes = remoteElements as unknown as SyncElement[];
      const localMap = new Map(locals.map((e) => [e.id, e]));
      const merged: SyncElement[] = [];
      const seen = new Set<string>();

      for (const remote of remotes) {
        const local = localMap.get(remote.id);
        merged.push(!local || remote.version >= local.version ? remote : local);
        seen.add(remote.id);
      }
      // Keep any local-only elements (not yet saved to backend)
      for (const local of locals) {
        if (!seen.has(local.id)) merged.push(local);
      }
      return merged as unknown as ExcalidrawElement[];
    };

    const pollLatest = async () => {
      try {
        const tkn = readToken();
        const response = await fetch(whiteboardUrl, {
          headers: tkn ? { Authorization: `Bearer ${tkn}` } : undefined,
        });
        if (!response.ok) return;
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return;
        const data = await response.json();
        if (!data?.elements) return;

        const localElements = excalidrawAPI.getSceneElements();
        const remoteElements = (data.elements || []) as ExcalidrawElement[];

        if (buildFingerprint(localElements) !== buildFingerprint(remoteElements)) {
          excalidrawAPI.updateScene({ elements: mergeElements(localElements, remoteElements) });
        }
      } catch {
        // Silently ignore poll errors
      }
    };

    const iv = setInterval(pollLatest, POLL_INTERVAL);
    return () => clearInterval(iv);
  }, [realtime, excalidrawAPI, whiteboardUrl]);

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
            appState: data.appState || {},
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

  const handleChange = (elements: readonly ExcalidrawElement[], appState: AppState) => {
    if (isReadOnly) return;

    lastKnownSceneRef.current = { elements, appState };
    onSceneChange?.({ elements, appState });

    // Auto-save every 5 seconds
    debounceAutoSave({
      elements,
      appState,
    });

    if (realtime) {
      // reserved for future livekit data channel sync
    }
  };

  // Debounced auto-save function
  const debounceAutoSave = (() => {
    return (data: any) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(() => {
        saveWhiteboardData(data);
      }, 5000);
    };
  })();

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
      <Excalidraw
        ref={excalidrawRefCallback}
        onChange={handleChange}
        viewModeEnabled={isReadOnly}
        theme="light"
        UIOptions={{
          canvasActions: {
            saveAsImage: true,
            export: { saveFileToDisk: true },
            loadScene: true,
            clearCanvas: !isReadOnly,
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
      </Excalidraw>
    </div>
  );
});

export default Whiteboard;

