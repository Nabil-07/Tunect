import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
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
}

export interface WhiteboardHandle {
  /** Return the current live scene data directly from Excalidraw (not from backend). */
  getSceneData: () => { elements: readonly ExcalidrawElement[]; appState: Partial<AppState> } | null;
  /** Immediately persist the current scene to the backend. */
  flushSave: () => Promise<void>;
}

export const Whiteboard = forwardRef<WhiteboardHandle, WhiteboardProps>(({ bookingId, isReadOnly = false, realtime = false, className }, ref) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingScene, setPendingScene] = useState<{ elements: readonly ExcalidrawElement[]; appState: AppState } | null>(null);
  const apiAvailableRef = useRef<boolean | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const whiteboardUrl = `${apiBase}/whiteboard/${bookingId}`;

  // Expose imperative methods to parent via ref
  useImperativeHandle(ref, () => ({
    getSceneData: () => {
      if (!excalidrawAPI) return null;
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      return { elements, appState };
    },
    flushSave: async () => {
      if (!excalidrawAPI) return;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      await saveWhiteboardData({ elements, appState });
    },
  }), [excalidrawAPI]);

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
        apiAvailableRef.current = false;
        console.warn('Whiteboard API not available (404), starting with empty board');
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
        if (res.status === 404) apiAvailableRef.current = false;
        console.warn('Whiteboard save skipped (API not available)');
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
        ref={(api: ExcalidrawImperativeAPI | null) => setExcalidrawAPI(api)}
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

