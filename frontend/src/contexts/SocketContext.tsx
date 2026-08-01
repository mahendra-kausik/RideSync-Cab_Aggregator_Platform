import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '../types';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinRideRoom: (rideId: string) => void;
  leaveRideRoom: (rideId: string) => void;
  emitDriverLocationUpdate: (rideId: string, location: [number, number]) => void;
  emitDriverStatusChange: (driverId: string, isAvailable: boolean) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { isAuthenticated, token, user } = useAuth();
  // Track rooms we intend to be in so we can rejoin on reconnect
  const pendingRideRoomsRef = useRef<Set<string>>(new Set());
  // Depend on identity, not the user object reference - updateUser() (e.g. after
  // toggling driver availability) replaces the object every time, which would
  // otherwise tear down and recreate a perfectly healthy socket on every toggle.
  const userId = user?._id;
  const userRole = user?.role;

  useEffect(() => {
    if (isAuthenticated && token && userId) {
      // Initialize socket connection
      const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
      const newSocket = io(socketUrl, {
        auth: {
          token: token,
          userId: userId,
          role: userRole,
        },
        transports: ['websocket', 'polling'],
      });

      // Connection event handlers
      newSocket.on('connect', () => {
        console.log('Socket connected:', newSocket.id);
        setIsConnected(true);
        // Rejoin any pending ride rooms on connect
        pendingRideRoomsRef.current.forEach((rideId) => {
          try {
            newSocket.emit('ride:join-room', { rideId });
            console.log(`Rejoined ride room on connect: ${rideId}`);
          } catch (e) {
            console.warn('Failed to rejoin ride room on connect:', rideId, e);
          }
        });
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        setIsConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setIsConnected(false);
      });

      // Authentication error handler
      newSocket.on('auth_error', (error) => {
        console.error('Socket authentication error:', error);
        setIsConnected(false);
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
        setSocket(null);
        setIsConnected(false);
      };
    } else {
      // Clean up socket if user is not authenticated
      if (socket) {
        socket.close();
        setSocket(null);
        setIsConnected(false);
      }
    }
  }, [isAuthenticated, token, userId, userRole]);

  // Join ride room
  const joinRideRoom = (rideId: string) => {
    // Remember desired room
    pendingRideRoomsRef.current.add(rideId);
    if (socket && isConnected) {
      try {
        socket.emit('ride:join-room', { rideId });
        console.log(`Joined ride room: ${rideId}`);
      } catch (e) {
        console.warn('Failed to join ride room, will retry on reconnect:', rideId, e);
      }
    } else {
      console.log('Socket not connected yet; will join ride room on connect:', rideId);
    }
  };

  // Leave ride room
  const leaveRideRoom = (rideId: string) => {
    // Remove from desired rooms set
    pendingRideRoomsRef.current.delete(rideId);
    if (socket && isConnected) {
      try {
        socket.emit('ride:leave-room', { rideId });
        console.log(`Left ride room: ${rideId}`);
      } catch (e) {
        console.warn('Failed to leave ride room:', rideId, e);
      }
    }
  };

  // Emit driver location update
  const emitDriverLocationUpdate = (rideId: string, location: [number, number]) => {
    if (socket && isConnected && user?.role === 'driver') {
      const [lng, lat] = location;
      socket.emit('driver:location-update', {
        rideId,
        location: { latitude: lat, longitude: lng }
      });
    }
  };

  // Emit driver status change
  const emitDriverStatusChange = (driverId: string, isAvailable: boolean) => {
    if (socket && isConnected && user?.role === 'driver') {
      socket.emit('driver:status-change', { driverId, isAvailable });
    }
  };

  const value: SocketContextType = {
    socket,
    isConnected,
    joinRideRoom,
    leaveRideRoom,
    emitDriverLocationUpdate,
    emitDriverStatusChange,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

// Custom hook to use socket context
export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

// Custom hook for socket event listeners
export const useSocketEvent = <T extends keyof SocketEvents>(
  event: T,
  handler: SocketEvents[T]
) => {
  const { socket } = useSocket();

  useEffect(() => {
    if (socket) {
      socket.on(event, handler as any);
      return () => {
        socket.off(event, handler as any);
      };
    }
  }, [socket, event, handler]);
};