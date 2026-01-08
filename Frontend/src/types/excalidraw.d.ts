declare module '@excalidraw/excalidraw' {
  import * as React from 'react';

  export type ExcalidrawElement = Record<string, unknown>;
  export type AppState = Record<string, unknown>;

  export interface ExcalidrawImperativeAPI {
    updateScene(payload: { elements: readonly ExcalidrawElement[]; appState?: AppState }): void;
    getSceneElements(): readonly ExcalidrawElement[];
    getAppState(): AppState;
  }

  export interface ExcalidrawProps {
    onChange?: (elements: readonly ExcalidrawElement[], appState: AppState) => void;
    viewModeEnabled?: boolean;
    theme?: string;
    UIOptions?: Record<string, unknown>;
    children?: React.ReactNode;
  }

  export const Excalidraw: React.ForwardRefExoticComponent<
    ExcalidrawProps & React.RefAttributes<ExcalidrawImperativeAPI | null>
  >;
  export const MainMenu: React.FC<{ children?: React.ReactNode }> & {
    DefaultItems: Record<string, React.ComponentType | (() => JSX.Element)>;
    Item: React.ComponentType<{ onSelect?: () => void; children?: React.ReactNode }>;
  };
  export const WelcomeScreen: React.FC<{ children?: React.ReactNode }> & {
    Hints: Record<string, React.ComponentType>;
  };
}
