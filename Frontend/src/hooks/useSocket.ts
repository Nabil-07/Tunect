import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { resolveSocketBaseUrl } from '../lib/runtimeApi';

const SOCKET_URL = resolveSocketBaseUrl();

export interface UseSocketOptions {
  namespace?: string;
  autoConnect?: boolean;
}

export function useSocket(options: UseSocketOptions = {}) {
  const { namespace = '/webrtc', autoConnect = true } = options;
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!autoConnect) return;

    // Get token from the same key used by REST auth
    const token =
      localStorage.getItem('tunect_access_token') ||
      localStorage.getItem('accessToken') ||
      localStorage.getItem('token');
    if (!token) {
      console.warn('No auth token found, cannot connect to WebSocket');
      return;
    }

    // Create socket connection
    const socket = io(`${SOCKET_URL}${namespace}`, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    // Connection event handlers
    socket.on('connect', () => {
      console.log(`[socket:${namespace}] connected`, socket.id);
      setIsConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[socket:${namespace}] disconnected`, reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error(`[socket:${namespace}] connect_error`, error);
      setIsConnected(false);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [namespace, autoConnect]);

  const emit = (event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit event:', event);
    }
  };

  const on = (event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler);
  };

  const off = (event: string, handler?: (...args: any[]) => void) => {
    if (handler) {
      socketRef.current?.off(event, handler);
    } else {
      socketRef.current?.off(event);
    }
  };

  return {
    socket: socketRef.current,
    isConnected,
    emit,
    on,
    off,
  };
}
