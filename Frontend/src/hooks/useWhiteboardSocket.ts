import { useEffect, useRef, useCallback, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { readToken, refreshAccessToken } from '../lib/apiClient';
import { resolveSocketBaseUrl } from '../lib/runtimeApi';

export interface WhiteboardSocketCallbacks {
  /** Called when remote elements arrive from another participant */
  onRemoteUpdate: (data: { elements: any[]; appState?: any }) => void;
}

export interface WhiteboardSocketHandle {
  /** Whether the socket is currently connected */
  isConnected: boolean;
  /** Send local element changes to the server */
  emitUpdate: (elements: any[], appState?: any) => void;
}

const WB_LOG = '[WB-Socket]';

/**
 * React hook that manages a Socket.IO connection to the whiteboard namespace.
 *
 * - Authenticates with the JWT from storage
 * - Joins the room identified by `bookingId`
 * - On join, receives initial state via `wb:state` event (NOT ack callback)
 * - Listens for `wb:remote-update` events from the other participant
 * - Exposes `emitUpdate` for sending local changes
 * - Handles reconnection automatically (Socket.IO built-in)
 */
export function useWhiteboardSocket(
  bookingId: string | null | undefined,
  callbacks: WhiteboardSocketCallbacks,
): WhiteboardSocketHandle {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  // Keep a stable ref to callbacks to avoid re-subscribing
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  // Track when we last received a remote update; used for periodic state sync
  const lastRemoteUpdateRef = useRef<number>(Date.now());
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    let disposed = false;
    let socket: Socket | null = null;

    const init = async () => {
      let token = readToken();
      if (!token) {
        token = await refreshAccessToken();
      }
      if (!token || disposed) {
        console.warn(WB_LOG, 'No JWT token found — skipping socket connection');
        return;
      }

      const socketBase = resolveSocketBaseUrl();
      console.log(WB_LOG, `Connecting to ${socketBase}/whiteboard ...`);

      socket = io(`${socketBase}/whiteboard`, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      socketRef.current = socket;

      // Prevent infinite auth-refresh reconnect loops
      let retriedAuthRefresh = false;

      socket.on('connect', () => {
        retriedAuthRefresh = false;
        console.log(WB_LOG, `Connected (id=${socket?.id}). Joining room ${bookingId}...`);
        setIsConnected(true);
        socket?.emit('wb:join', { bookingId });
        // Reset the last-received timestamp so the periodic sync doesn't
        // immediately fire a request-state right after we just got wb:state
        lastRemoteUpdateRef.current = Date.now();
      });

      socket.on('disconnect', (reason) => {
        console.log(WB_LOG, 'Disconnected:', reason);
        setIsConnected(false);
      });

      socket.on('connect_error', async (err) => {
        console.error(WB_LOG, 'Connection error:', err.message);
        const msg = String(err?.message || '').toLowerCase();
        const looksAuthError =
          msg.includes('jwt') || msg.includes('token') || msg.includes('unauthor') || msg.includes('forbidden');

        if (looksAuthError && !retriedAuthRefresh && socket) {
          retriedAuthRefresh = true;
          const freshToken = await refreshAccessToken();
          if (freshToken) {
            console.log(WB_LOG, 'Retrying socket connect after token refresh...');
            socket.auth = { token: freshToken };
            socket.connect();
          }
        }
      });

      socket.on('wb:state', (data: { elements: any[]; appState?: any }) => {
        console.log(WB_LOG, `Received wb:state — ${data?.elements?.length ?? 0} elements`);
        lastRemoteUpdateRef.current = Date.now();
        if (data) {
          cbRef.current.onRemoteUpdate(data);
        }
      });

      socket.on('wb:remote-update', (data: { elements: any[]; appState?: any }) => {
        console.log(WB_LOG, `Received wb:remote-update — ${data?.elements?.length ?? 0} elements`);
        lastRemoteUpdateRef.current = Date.now();
        cbRef.current.onRemoteUpdate(data);
      });

      // Periodic state sync — every 30s, if the socket is connected but we
      // haven't received any remote update in 30s, request a full state
      // snapshot. This catches zombie connections and missed updates.
      syncIntervalRef.current = setInterval(() => {
        if (!socket?.connected) return;
        const silentMs = Date.now() - lastRemoteUpdateRef.current;
        if (silentMs >= 30_000) {
          console.log(WB_LOG, `No remote updates in ${Math.round(silentMs / 1000)}s — requesting full state`);
          socket.emit('wb:request-state', { bookingId });
        }
      }, 30_000);
    };

    void init();

    return () => {
      disposed = true;
      console.log(WB_LOG, 'Disconnecting (cleanup)...');
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      socket?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [bookingId]);

  // Throttle socket emissions to ~100ms to avoid flooding with every mouse move
  const lastEmitRef = useRef<number>(0);
  const pendingEmitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitUpdate = useCallback(
    (elements: any[], appState?: any) => {
      const socket = socketRef.current;
      if (!socket?.connected || !bookingId) return;

      const THROTTLE_MS = 350;
      const now = Date.now();
      const elapsed = now - lastEmitRef.current;

      const doEmit = () => {
        lastEmitRef.current = Date.now();
        socket.emit('wb:update', { bookingId, elements, appState });
      };

      if (elapsed >= THROTTLE_MS) {
        doEmit();
      } else {
        // Schedule trailing emit so the last state is always sent
        if (pendingEmitRef.current) clearTimeout(pendingEmitRef.current);
        pendingEmitRef.current = setTimeout(doEmit, THROTTLE_MS - elapsed);
      }
    },
    [bookingId],
  );

  // Clean up pending timer on unmount
  useEffect(() => {
    return () => {
      if (pendingEmitRef.current) clearTimeout(pendingEmitRef.current);
    };
  }, []);

  return { isConnected, emitUpdate };
}

