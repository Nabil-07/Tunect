import React, { useEffect, useRef, useState } from 'react';
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  type ExcalidrawElement,
  type AppState,
  type ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw';
import { readToken } from '../../lib/apiClient';

interface WhiteboardProps {
  bookingId: string;
  isReadOnly?: boolean;
  /** If true, sync the board (reserved for future livekit data sync). */
  realtime?: boolean;
  /** Optional container class for embedding in panels. */
  className?: string;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({ bookingId, isReadOnly = false, realtime = false, className }) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const apiAvailableRef = useRef<boolean | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  const whiteboardUrl = `${apiBase}/whiteboard/${bookingId}`;

  useEffect(() => {
    // Load saved whiteboard data if exists
    loadWhiteboardData();
  }, [bookingId]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!realtime) return;
    // LiveKit-based realtime sync can be added later via data channels.
  }, [realtime]);

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
        if (data && excalidrawAPI) {
          excalidrawAPI.updateScene({
            elements: data.elements || [],
            appState: data.appState || {},
          });
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
    <div className={className || "min-h-screen w-full bg-slate-50"}>
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
};

export default Whiteboard;
