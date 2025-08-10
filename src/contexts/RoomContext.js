// src/contexts/RoomContext.js - CLEANED VERSION WITH UNUSED CODE REMOVED
import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import io from 'socket.io-client';

const RoomContext = createContext();

// Room action types - REMOVED: AUDIO_UPDATE, SPEAKING_USERS_UPDATE (unused in favor of WebRTC component state)
const ROOM_ACTIONS = {
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  JOINED_ROOM: 'JOINED_ROOM',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR',
  UPDATE_USERS: 'UPDATE_USERS',
  UPDATE_ROOM_INFO: 'UPDATE_ROOM_INFO',
  NEW_MESSAGE: 'NEW_MESSAGE',
  SET_MESSAGES: 'SET_MESSAGES',
  CODE_UPDATE: 'CODE_UPDATE',
  LANGUAGE_UPDATE: 'LANGUAGE_UPDATE',
  TYPING_UPDATE: 'TYPING_UPDATE',
  RESET_ROOM: 'RESET_ROOM'
};

// Initial room state - REMOVED: audio-related state (handled by WebRTC component), activeTab (no tab UI)
const initialState = {
  socket: null,
  isConnected: false,
  isLoading: true,
  error: null,
  roomId: null,
  roomInfo: null,
  users: [],
  currentUser: null,
  userRole: null,
  messages: [],
  typingUsers: [],
  code: '// Welcome to collaborative coding!\n// Start typing to share your code with the team...',
  language: 'javascript',
  lastEditUser: null
};

const roomReducer = (state, action) => {
  switch (action.type) {
    case ROOM_ACTIONS.CONNECTING:
      return { ...state, isLoading: true, error: null };

    case ROOM_ACTIONS.CONNECTED:
      return { ...state, socket: action.payload.socket, isConnected: true, isLoading: true, error: null };

    case ROOM_ACTIONS.JOINED_ROOM:
      return {
        ...state,
        roomId: action.payload.roomId,
        roomInfo: action.payload.roomInfo,
        currentUser: action.payload.username,
        userRole: action.payload.userRole,
        language: action.payload.roomInfo?.currentLanguage || 'javascript',
        isLoading: false,
        error: null
      };

    case ROOM_ACTIONS.DISCONNECTED:
      return { ...state, socket: null, isConnected: false, isLoading: false };

    case ROOM_ACTIONS.ERROR:
      return { ...state, error: action.payload.error, isLoading: false };

    case ROOM_ACTIONS.UPDATE_USERS:
      return { ...state, users: action.payload.users };

    case ROOM_ACTIONS.UPDATE_ROOM_INFO:
      return { ...state, roomInfo: { ...state.roomInfo, ...action.payload.roomInfo } };

    case ROOM_ACTIONS.NEW_MESSAGE:
      return { ...state, messages: [...state.messages, action.payload.message] };

    case ROOM_ACTIONS.SET_MESSAGES:
      return { ...state, messages: action.payload.messages };

    case ROOM_ACTIONS.CODE_UPDATE:
      return {
        ...state,
        code: action.payload.code,
        language: action.payload.language || state.language,
        lastEditUser: action.payload.username
      };

    case ROOM_ACTIONS.LANGUAGE_UPDATE:
      return {
        ...state,
        language: action.payload.language,
        code: action.payload.code !== undefined ? action.payload.code : state.code,
        lastEditUser: action.payload.username
      };

    case ROOM_ACTIONS.TYPING_UPDATE:
      return { ...state, typingUsers: action.payload.typingUsers };

    case ROOM_ACTIONS.RESET_ROOM:
      return { ...initialState, socket: null, isLoading: false };

    default:
      return state;
  }
};

export const RoomProvider = ({ children }) => {
  const [state, dispatch] = useReducer(roomReducer, initialState);
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  
  // Enhanced connection state management
  const connectionStateRef = useRef({
    isConnecting: false,
    lastConnectAttempt: 0,
    connectAttemptId: null,
    hasSuccessfulConnection: false,
    lastRoomId: null,
    lastPassword: null,
    reconnectCount: 0,
    maxReconnectAttempts: 3,
    connectionTimeout: null,
    isCleaningUp: false
  });

  // Enhanced cleanup with connection state reset
  const cleanup = useCallback(() => {
    console.log('🧹 [CLIENT] Enhanced cleanup initiated');
    
    connectionStateRef.current.isCleaningUp = true;
    
    if (connectionStateRef.current.connectionTimeout) {
      clearTimeout(connectionStateRef.current.connectionTimeout);
      connectionStateRef.current.connectionTimeout = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (socketRef.current) {
      try {
        socketRef.current.removeAllListeners();
        if (socketRef.current.connected) {
          socketRef.current.disconnect();
        }
      } catch (error) {
        console.error('Socket cleanup error:', error);
      }
      socketRef.current = null;
    }
    
    connectionStateRef.current = {
      isConnecting: false,
      lastConnectAttempt: 0,
      connectAttemptId: null,
      hasSuccessfulConnection: false,
      lastRoomId: null,
      lastPassword: null,
      reconnectCount: 0,
      maxReconnectAttempts: 3,
      connectionTimeout: null,
      isCleaningUp: false
    };
    
    dispatch({ type: ROOM_ACTIONS.RESET_ROOM });
    console.log('✅ [CLIENT] Enhanced cleanup completed');
  }, []);

  // Enhanced socket setup with better error handling
  const setupSocketHandlers = useCallback((socket, roomId, roomPassword) => {
    console.log('🔧 [CLIENT] Setting up enhanced socket handlers');

    socket.removeAllListeners();

    // Connection events with enhanced handling
    socket.on('connect', () => {
      console.log('🔌 [CLIENT] Socket connected successfully');
      dispatch({ type: ROOM_ACTIONS.CONNECTED, payload: { socket } });
      
      if (connectionStateRef.current.connectionTimeout) {
        clearTimeout(connectionStateRef.current.connectionTimeout);
        connectionStateRef.current.connectionTimeout = null;
      }
      
      const currentAttemptId = connectionStateRef.current.connectAttemptId;
      
      setTimeout(() => {
        if (connectionStateRef.current.connectAttemptId === currentAttemptId && 
            !connectionStateRef.current.hasSuccessfulConnection &&
            !connectionStateRef.current.isCleaningUp) {
          
          console.log(`🚪 [CLIENT] Joining room: ${roomId}`);
          socket.emit('joinRoom', { roomId, roomPassword });
        }
      }, 200);
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 [CLIENT] Socket disconnected: ${reason}`);
      dispatch({ type: ROOM_ACTIONS.DISCONNECTED });
      
      connectionStateRef.current.isConnecting = false;
      connectionStateRef.current.hasSuccessfulConnection = false;
      
      if (reason !== 'io client disconnect' && 
          connectionStateRef.current.reconnectCount < connectionStateRef.current.maxReconnectAttempts &&
          !connectionStateRef.current.isCleaningUp) {
        
        connectionStateRef.current.reconnectCount++;
        const delay = Math.min(1000 * Math.pow(2, connectionStateRef.current.reconnectCount), 10000);
        
        console.log(`🔄 [CLIENT] Auto-reconnecting in ${delay}ms (attempt ${connectionStateRef.current.reconnectCount})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!connectionStateRef.current.isCleaningUp) {
            joinRoom(roomId, roomPassword);
          }
        }, delay);
      }
    });

    socket.on('connect_error', (error) => {
      console.error('❌ [CLIENT] Connection error:', error);
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: `Connection failed: ${error.message}` } });
      
      connectionStateRef.current.isConnecting = false;
      connectionStateRef.current.hasSuccessfulConnection = false;
    });

    // Enhanced room join handling
    socket.on('joinSuccess', (data) => {
      console.log('✅ [CLIENT] Room join successful:', data);
      
      connectionStateRef.current.hasSuccessfulConnection = true;
      connectionStateRef.current.isConnecting = false;
      connectionStateRef.current.reconnectCount = 0;
      
      dispatch({
        type: ROOM_ACTIONS.JOINED_ROOM,
        payload: {
          roomId: data.roomId,
          roomInfo: data.roomInfo,
          username: data.username,
          userRole: data.userRole
        }
      });
    });

    // Enhanced error handling with retry logic
    socket.on('error', (errorData) => {
      console.error('❌ [CLIENT] Socket error:', errorData);
      
      if (errorData.message && errorData.message.includes('already in this room')) {
        console.log('⚠️ [CLIENT] Already in room - attempting recovery');
        
        setTimeout(() => {
          if (socket.connected && !connectionStateRef.current.isCleaningUp) {
            socket.emit('leaveRoom', { roomId });
            
            setTimeout(() => {
              if (socket.connected && !connectionStateRef.current.hasSuccessfulConnection) {
                console.log('🔄 [CLIENT] Retrying join after leave');
                socket.emit('joinRoom', { roomId, roomPassword });
              }
            }, 1000);
          }
        }, 500);
        
        return;
      }
      
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: errorData.message || 'Failed to join room' } });
      connectionStateRef.current.isConnecting = false;
      connectionStateRef.current.hasSuccessfulConnection = false;
    });

    // Room management events
    socket.on('roomUsers', (users) => {
      dispatch({ type: ROOM_ACTIONS.UPDATE_USERS, payload: { users } });
    });

    // Chat events
    socket.on('message', (message) => {
      dispatch({ type: ROOM_ACTIONS.NEW_MESSAGE, payload: { message } });
    });

    socket.on('chatHistory', (messages) => {
      dispatch({ type: ROOM_ACTIONS.SET_MESSAGES, payload: { messages } });
    });

    socket.on('userTyping', ({ username, isTyping }) => {
      dispatch({
        type: ROOM_ACTIONS.TYPING_UPDATE,
        payload: {
          typingUsers: isTyping 
            ? [...state.typingUsers.filter(u => u !== username), username]
            : state.typingUsers.filter(u => u !== username)
        }
      });
    });

    // Code editor events
    socket.on('codeUpdate', (data) => {
      dispatch({
        type: ROOM_ACTIONS.CODE_UPDATE,
        payload: {
          code: data.code,
          language: data.language,
          username: data.username
        }
      });
    });

    socket.on('languageUpdate', (data) => {
      dispatch({
        type: ROOM_ACTIONS.LANGUAGE_UPDATE,
        payload: {
          language: data.language,
          code: data.code,
          username: data.username
        }
      });
    });

    // Room lifecycle events
    socket.on('roomDeleted', () => {
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: 'This room has been deleted' } });
      setTimeout(() => leaveRoom(), 3000);
    });

    socket.on('kicked', () => {
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: 'You have been removed from the room' } });
      setTimeout(() => leaveRoom(), 3000);
    });

    socket.on('serverShutdown', () => {
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: 'Server is shutting down' } });
    });

  }, [state.typingUsers]);

  // Completely rewritten join function with advanced deduplication
  const joinRoom = useCallback(async (roomId, roomPassword) => {
    const currentTime = Date.now();
    const attemptId = `${roomId}-${currentTime}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('🎯 [CLIENT] Enhanced join room called:', { 
      roomId, 
      attemptId,
      isAuthenticated, 
      user: !!user,
      connectionState: connectionStateRef.current
    });

    // Enhanced deduplication checks
    if (connectionStateRef.current.isCleaningUp) {
      console.log('🚫 [CLIENT] Cleanup in progress, skipping join');
      return false;
    }

    if (currentTime - connectionStateRef.current.lastConnectAttempt < 3000) {
      console.log('🚫 [CLIENT] Too soon since last attempt, skipping');
      return false;
    }

    if (connectionStateRef.current.isConnecting) {
      console.log('🚫 [CLIENT] Already connecting, skipping');
      return false;
    }

    if (connectionStateRef.current.hasSuccessfulConnection && 
        connectionStateRef.current.lastRoomId === roomId) {
      console.log('🚫 [CLIENT] Already connected to this room');
      return true;
    }

    if (!isAuthenticated || !user) {
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: 'Authentication required' } });
      return false;
    }

    if (!roomId || !roomPassword) {
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: 'Room ID and password required' } });
      return false;
    }

    // Update connection state
    connectionStateRef.current.isConnecting = true;
    connectionStateRef.current.lastConnectAttempt = currentTime;
    connectionStateRef.current.connectAttemptId = attemptId;
    connectionStateRef.current.lastRoomId = roomId;
    connectionStateRef.current.lastPassword = roomPassword;

    dispatch({ type: ROOM_ACTIONS.CONNECTING });
    
    try {
      cleanup();

      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log('🔐 [CLIENT] Creating enhanced socket connection');

      const socket = io('https://cotog-backend.onrender.com', {
        auth: { token },
        autoConnect: false,
        forceNew: true,
        timeout: 20000,
        transports: ['websocket', 'polling'],
        reconnection: false
      });

      socketRef.current = socket;
      setupSocketHandlers(socket, roomId, roomPassword);
      
      connectionStateRef.current.connectionTimeout = setTimeout(() => {
        if (connectionStateRef.current.isConnecting && 
            !connectionStateRef.current.hasSuccessfulConnection) {
          console.error('❌ [CLIENT] Connection timeout');
          cleanup();
          dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: 'Connection timeout' } });
        }
      }, 20000);

      const connectPromise = new Promise((resolve, reject) => {
        const connectTimeout = setTimeout(() => {
          reject(new Error('Connection timeout after 20 seconds'));
        }, 20000);

        socket.once('connect', () => {
          clearTimeout(connectTimeout);
          resolve();
        });

        socket.once('connect_error', (error) => {
          clearTimeout(connectTimeout);
          reject(error);
        });
      });

      socket.connect();
      await connectPromise;

      console.log('✅ [CLIENT] Enhanced socket connection successful');
      return true;

    } catch (error) {
      console.error('❌ [CLIENT] Enhanced join error:', error);
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: error.message } });
      
      connectionStateRef.current.isConnecting = false;
      connectionStateRef.current.hasSuccessfulConnection = false;
      
      return false;
    }
  }, [isAuthenticated, user, cleanup, setupSocketHandlers]);

  // Leave room function
  const leaveRoom = useCallback(() => {
    console.log('👋 [CLIENT] Enhanced leave room');
    cleanup();
    router.push('/');
  }, [cleanup, router]);

  // Send chat message
  const sendMessage = useCallback((message) => {
    if (socketRef.current && state.isConnected && state.roomId) {
      socketRef.current.emit('chatMessage', { message: message.trim(), roomId: state.roomId });
      return true;
    }
    return false;
  }, [state.isConnected, state.roomId]);

  // Send typing indicator
  const sendTyping = useCallback((isTyping) => {
    if (socketRef.current && state.isConnected && state.roomId) {
      socketRef.current.emit('typing', { roomId: state.roomId, isTyping });
    }
  }, [state.isConnected, state.roomId]);

  // Send code change
  const sendCodeChange = useCallback((code, language) => {
    if (socketRef.current && state.isConnected && state.roomId && user) {
      socketRef.current.emit('codeChange', {
        roomId: state.roomId,
        code,
        language,
        userId: user.id,
        username: user.username
      });
    }
  }, [state.isConnected, state.roomId, user]);

  // Send language change
  const sendLanguageChange = useCallback((language, code) => {
    if (!socketRef.current?.connected || !state.isConnected || !state.roomId || !user) {
      return false;
    }

    const hasPermission = ['owner', 'moderator'].includes(state.userRole);
    if (!hasPermission) {
      return false;
    }

    try {
      socketRef.current.emit('languageChange', {
        roomId: state.roomId,
        language,
        code: code || state.code,
        userId: user.id,
        username: user.username
      });
      return true;
    } catch (error) {
      console.error('❌ [CLIENT] Language change error:', error);
      return false;
    }
  }, [state.isConnected, state.roomId, state.userRole, state.code, user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 [CLIENT] RoomProvider unmounting');
      cleanup();
    };
  }, [cleanup]);

  const value = {
    ...state,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendTyping,
    sendCodeChange,
    sendLanguageChange,
    isRoomOwner: () => state.userRole === 'owner',
    isRoomModerator: () => ['owner', 'moderator'].includes(state.userRole),
    getSocket: () => socketRef.current
  };

  return (
    <RoomContext.Provider value={value}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRoom = () => {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
};