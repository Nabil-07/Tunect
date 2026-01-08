import React, { useState, useEffect } from 'react';
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  type ExcalidrawElement,
  type AppState,
  type ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw';

interface WhiteboardProps {
  bookingId: string;
  isReadOnly?: boolean;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({ bookingId, isReadOnly = false }) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load saved whiteboard data if exists
    loadWhiteboardData();
  }, [bookingId]);

  const loadWhiteboardData = async () => {
    try {
      const response = await fetch(`/api/whiteboard/${bookingId}`);
      if (response.ok) {
        const data = await response.json();
        if (data && excalidrawAPI) {
          excalidrawAPI.updateScene({
            elements: data.elements || [],
            appState: data.appState || {},
          });
        }
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
  };

  // Debounced auto-save function
  const debounceAutoSave = (() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return (data: any) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        saveWhiteboardData(data);
      }, 5000);
    };
  })();

  const saveWhiteboardData = async (data: any) => {
    try {
      await fetch(`/api/whiteboard/${bookingId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(data),
      });
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
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading whiteboard...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full">
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
