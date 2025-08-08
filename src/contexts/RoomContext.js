// src/contexts/RoomContext.js 
import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import io from 'socket.io-client';

const RoomContext = createContext();

// Room action types
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
  AUDIO_UPDATE: 'AUDIO_UPDATE',
  AUDIO_PERMISSION_REQUEST: 'AUDIO_PERMISSION_REQUEST',
  AUDIO_PERMISSION_RESPONSE: 'AUDIO_PERMISSION_RESPONSE',
  AUDIO_PERMISSIONS_UPDATE: 'AUDIO_PERMISSIONS_UPDATE',
  SPEAKING_USERS_UPDATE: 'SPEAKING_USERS_UPDATE',
  REMOVE_PERMISSION_REQUEST: 'REMOVE_PERMISSION_REQUEST',
  RESET_ROOM: 'RESET_ROOM'
};

// Initial room state
const initialState = {
  // Connection state
  socket: null,
  isConnected: false,
  isLoading: true,
  error: null,
  
  // Room information
  roomId: null,
  roomInfo: null,
  users: [],
  currentUser: null,
  userRole: null,
  
  // Chat state
  messages: [],
  typingUsers: [],
  
  // Code editor state
  code: '// Welcome to collaborative coding!\n// Start typing to share your code with the team...',
  language: 'javascript',
  lastEditUser: null,
  
  // Audio state
  audioConnected: false,
  audioUsers: [],
  isMuted: true,
  speakingUsers: [],
  
  // Audio permission system
  audioPermissions: {}, // { username: boolean }
  pendingAudioRequests: [], // [{ username, timestamp }]
  
  // UI state
  activeTab: 'chat'
};

// Room reducer
const roomReducer = (state, action) => {
  switch (action.type) {
    case ROOM_ACTIONS.CONNECTING:
      return {
        ...state,
        isLoading: true,
        error: null
      };

    case ROOM_ACTIONS.CONNECTED:
      return {
        ...state,
        socket: action.payload.socket,
        isConnected: true,
        isLoading: true, // Still loading until joined room
        error: null
      };

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
      return {
        ...state,
        socket: null,
        isConnected: false,
        isLoading: false
      };

    case ROOM_ACTIONS.ERROR:
      return {
        ...state,
        error: action.payload.error,
        isLoading: false
      };

    case ROOM_ACTIONS.UPDATE_USERS:
      return {
        ...state,
        users: action.payload.users
      };

    case ROOM_ACTIONS.UPDATE_ROOM_INFO:
      return {
        ...state,
        roomInfo: { ...state.roomInfo, ...action.payload.roomInfo }
      };

    case ROOM_ACTIONS.NEW_MESSAGE:
      return {
        ...state,
        messages: [...state.messages, action.payload.message]
      };

    case ROOM_ACTIONS.SET_MESSAGES:
      return {
        ...state,
        messages: action.payload.messages
      };

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
      return {
        ...state,
        typingUsers: action.payload.typingUsers
      };

    case ROOM_ACTIONS.AUDIO_UPDATE:
      return {
        ...state,
        audioConnected: action.payload.connected !== undefined ? action.payload.connected : state.audioConnected,
        audioUsers: action.payload.users || state.audioUsers,
        isMuted: action.payload.muted !== undefined ? action.payload.muted : state.isMuted
      };

    case ROOM_ACTIONS.AUDIO_PERMISSION_REQUEST:
      // Check if request already exists to prevent duplicates
      const existingRequest = state.pendingAudioRequests.find(
        req => req.username === action.payload.username
      );
      
      if (existingRequest) {
        return state; // Don't add duplicate request
      }
      
      return {
        ...state,
        pendingAudioRequests: [
          ...state.pendingAudioRequests,
          {
            username: action.payload.username,
            timestamp: action.payload.timestamp
          }
        ]
      };

    case ROOM_ACTIONS.AUDIO_PERMISSION_RESPONSE:
      return {
        ...state,
        // Remove the request from pending when responded to
        pendingAudioRequests: state.pendingAudioRequests.filter(
          req => req.username !== action.payload.username
        ),
        // Update permissions
        audioPermissions: {
          ...state.audioPermissions,
          [action.payload.username]: action.payload.granted
        }
      };

    case ROOM_ACTIONS.AUDIO_PERMISSIONS_UPDATE:
      return {
        ...state,
        audioPermissions: action.payload.permissions
      };

    case ROOM_ACTIONS.SPEAKING_USERS_UPDATE:
      return {
        ...state,
        speakingUsers: action.payload.speakingUsers
      };

    case ROOM_ACTIONS.REMOVE_PERMISSION_REQUEST:
      return {
        ...state,
        pendingAudioRequests: state.pendingAudioRequests.filter(
          req => req.username !== action.payload.username
        )
      };

    case ROOM_ACTIONS.RESET_ROOM:
      return {
        ...initialState,
        socket: null,
        isLoading: false
      };

    default:
      return state;
  }
};

// Room Provider Component
export const RoomProvider = ({ children }) => {
  const [state, dispatch] = useReducer(roomReducer, initialState);
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  
  // 🔧 FIX 1: Enhanced initialization state tracking to prevent double joins
  const initializationRef = useRef({
    isInitializing: false,
    lastRoomId: null,
    lastPassword: null,
    lastInitTime: 0,
    joinAttemptId: null, // Unique identifier for join attempts
    hasSuccessfullyJoined: false // Track successful joins
  });

  // 🔧 FIX 2: Enhanced cleanup function with better state reset
  const cleanup = useCallback(() => {
    console.log('🧹 [CLIENT] Cleaning up room connection');
    
    // Reset initialization state
    initializationRef.current = {
      isInitializing: false,
      lastRoomId: null,
      lastPassword: null,
      lastInitTime: 0,
      joinAttemptId: null,
      hasSuccessfullyJoined: false
    };
    
    if (socketRef.current) {
      try {
        socketRef.current.removeAllListeners();
        if (socketRef.current.connected) {
          socketRef.current.disconnect();
        }
      } catch (error) {
        console.error('Error during socket cleanup:', error);
      }
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    socketRef.current = null;
    
    dispatch({ type: ROOM_ACTIONS.RESET_ROOM });
  }, []);

  // Setup socket event handlers
  const setupSocketHandlers = useCallback((socket, roomId, roomPassword) => {
    console.log('🔧 [CLIENT] Setting up socket handlers with audio permissions');

    // Remove any existing listeners
    socket.removeAllListeners();

    // Connection events
    socket.on('connect', () => {
      console.log('🔌 [CLIENT] Connected to room server');
      dispatch({ type: ROOM_ACTIONS.CONNECTED, payload: { socket } });
      
      // 🔧 FIX 3: Add delay and verification before joining
      const currentAttemptId = initializationRef.current.joinAttemptId;
      
      setTimeout(() => {
        // Verify this is still the current attempt
        if (initializationRef.current.joinAttemptId === currentAttemptId && 
            !initializationRef.current.hasSuccessfullyJoined) {
          
          console.log('🚪 [CLIENT] Attempting to join room:', roomId);
          socket.emit('joinRoom', {
            roomId,
            roomPassword
          });
        } else {
          console.log('🚫 [CLIENT] Skipping join - attempt superseded or already joined');
        }
      }, 100); // Small delay to ensure socket is fully ready
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 [CLIENT] Disconnected from room server:', reason);
      dispatch({ type: ROOM_ACTIONS.DISCONNECTED });
      
      // Reset initialization state on disconnect
      initializationRef.current.isInitializing = false;
      initializationRef.current.hasSuccessfullyJoined = false;
    });

    socket.on('connect_error', (error) => {
      console.error('❌ [CLIENT] Connection error:', error);
      dispatch({ 
        type: ROOM_ACTIONS.ERROR, 
        payload: { error: `Connection failed: ${error.message}` } 
      });
      
      // Reset initialization state on error
      initializationRef.current.isInitializing = false;
      initializationRef.current.hasSuccessfullyJoined = false;
    });

    // 🔧 FIX 4: Enhanced room events with better error handling
    socket.on('joinSuccess', (data) => {
      console.log('✅ [CLIENT] Successfully joined room:', data);
      
      // Mark as successfully joined
      initializationRef.current.hasSuccessfullyJoined = true;
      initializationRef.current.isInitializing = false;
      
      dispatch({
        type: ROOM_ACTIONS.JOINED_ROOM,
        payload: {
          roomId: data.roomId,
          roomInfo: data.roomInfo,
          username: data.username,
          userRole: data.userRole
        }
      });
      
      // Initialize audio permissions if provided
      if (data.audioPermissions) {
        dispatch({
          type: ROOM_ACTIONS.AUDIO_PERMISSIONS_UPDATE,
          payload: { permissions: data.audioPermissions }
        });
      }
    });

    socket.on('error', (errorData) => {
      console.error('❌ [CLIENT] Socket error received:', errorData);
      
      // Special handling for "already in room" error
      if (errorData.message && errorData.message.includes('already in this room')) {
        console.log('⚠️ [CLIENT] User already in room - cleaning up and retrying');
        
        // Mark as failed and cleanup
        initializationRef.current.hasSuccessfullyJoined = false;
        initializationRef.current.isInitializing = false;
        
        // Emit leave and retry after a delay
        setTimeout(() => {
          if (socket.connected) {
            socket.emit('leaveRoom', { roomId });
            
            // Retry join after leaving
            setTimeout(() => {
              if (socket.connected && !initializationRef.current.hasSuccessfullyJoined) {
                console.log('🔄 [CLIENT] Retrying join after leave');
                socket.emit('joinRoom', { roomId, roomPassword });
              }
            }, 500);
          }
        }, 200);
        
        return; // Don't dispatch error for this case
      }
      
      dispatch({ 
        type: ROOM_ACTIONS.ERROR, 
        payload: { error: errorData.message || 'Failed to join room' } 
      });
      
      // Reset initialization state on error
      initializationRef.current.isInitializing = false;
      initializationRef.current.hasSuccessfullyJoined = false;
    });

    // User management events
    socket.on('roomUsers', (users) => {
      console.log('👥 [CLIENT] Room users updated:', users);
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
      console.log('📝 [CLIENT] Code update received:', { 
        codeLength: data.code?.length, 
        language: data.language, 
        username: data.username 
      });
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
      console.log('🔧 [CLIENT] Language update received:', data);
      dispatch({
        type: ROOM_ACTIONS.LANGUAGE_UPDATE,
        payload: {
          language: data.language,
          code: data.code,
          username: data.username
        }
      });
    });

    // Audio permission events
    socket.on('audioPermissionRequest', (data) => {
      console.log('🎤 [CLIENT] Audio permission request received:', data);
      dispatch({
        type: ROOM_ACTIONS.AUDIO_PERMISSION_REQUEST,
        payload: {
          username: data.username,
          timestamp: data.timestamp
        }
      });
    });

    socket.on('audioPermissionResponse', (data) => {
      console.log('🎤 [CLIENT] Audio permission response received:', data);
      
      dispatch({
        type: ROOM_ACTIONS.AUDIO_PERMISSION_RESPONSE,
        payload: {
          username: data.username,
          granted: data.granted
        }
      });
    });

    socket.on('audioPermissionsUpdate', (data) => {
      console.log('🎤 [CLIENT] Audio permissions updated:', data);
      dispatch({
        type: ROOM_ACTIONS.AUDIO_PERMISSIONS_UPDATE,
        payload: { permissions: data.permissions }
      });
    });

    // Audio status events
    socket.on('audioUsersUpdate', (data) => {
      console.log('🎤 [CLIENT] Audio users updated:', data);
      dispatch({
        type: ROOM_ACTIONS.AUDIO_UPDATE,
        payload: { users: data.audioUsers }
      });
    });

    socket.on('speakingUsersUpdate', (data) => {
      console.log('🎤 [CLIENT] Speaking users updated:', data);
      dispatch({
        type: ROOM_ACTIONS.SPEAKING_USERS_UPDATE,
        payload: { speakingUsers: data.speakingUsers }
      });
    });

    // Room management events
    socket.on('roomDeleted', (data) => {
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: 'This room has been deleted' } });
      setTimeout(() => leaveRoom(), 3000);
    });

    socket.on('kicked', (data) => {
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: 'You have been removed from the room' } });
      setTimeout(() => leaveRoom(), 3000);
    });

    socket.on('serverShutdown', (data) => {
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: 'Server is shutting down' } });
    });

  }, [state.typingUsers]);

  // 🔧 FIX 5: Completely rewritten join room function with comprehensive deduplication
  const joinRoom = useCallback(async (roomId, roomPassword) => {
    const currentTime = Date.now();
    
    // Create unique attempt identifier
    const attemptId = `${roomId}-${roomPassword}-${currentTime}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log('🎯 [CLIENT] Join room called:', { 
      roomId, 
      attemptId,
      isAuthenticated, 
      user: !!user,
      isInitializing: initializationRef.current.isInitializing,
      hasSuccessfullyJoined: initializationRef.current.hasSuccessfullyJoined,
      timeSinceLastInit: currentTime - initializationRef.current.lastInitTime
    });

    // 🔧 Enhanced deduplication checks
    
    // 1. Prevent rapid successive calls (debounce with 2 seconds)
    if (currentTime - initializationRef.current.lastInitTime < 2000) {
      console.log('🚫 [CLIENT] Too soon since last initialization, skipping...');
      return false;
    }

    // 2. Prevent double initialization
    if (initializationRef.current.isInitializing) {
      console.log('🚫 [CLIENT] Already initializing, skipping...');
      return false;
    }

    // 3. Check if already successfully joined this room
    if (initializationRef.current.hasSuccessfullyJoined && 
        initializationRef.current.lastRoomId === roomId) {
      console.log('🚫 [CLIENT] Already successfully joined this room, skipping...');
      return true;
    }

    // 4. Check if we're trying to join the same room with same password and already connected
    const { lastRoomId, lastPassword } = initializationRef.current;
    if (lastRoomId === roomId && 
        lastPassword === roomPassword && 
        state.isConnected && 
        state.roomInfo &&
        !state.error) {
      console.log('🚫 [CLIENT] Already connected to this room with no errors, skipping...');
      return true;
    }

    // 5. Basic validation
    if (!isAuthenticated || !user) {
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: 'Authentication required' } });
      return false;
    }

    if (!roomId || !roomPassword) {
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: 'Room ID and password are required' } });
      return false;
    }

    // Set initialization state with unique attempt ID
    initializationRef.current = {
      isInitializing: true,
      lastRoomId: roomId,
      lastPassword: roomPassword,
      lastInitTime: currentTime,
      joinAttemptId: attemptId,
      hasSuccessfullyJoined: false
    };

    dispatch({ type: ROOM_ACTIONS.CONNECTING });
    
    try {
      // Clean up any existing connection
      cleanup();

      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      console.log('🔐 [CLIENT] Creating socket connection with token for attempt:', attemptId);

      const socket = io('https://cotog-backend.onrender.com', {
        auth: { token },
        autoConnect: false,
        forceNew: true,
        timeout: 15000, // Increased timeout
        transports: ['websocket', 'polling']
      });

      socketRef.current = socket;
      setupSocketHandlers(socket, roomId, roomPassword);
      
      // Connect with timeout handling
      const connectPromise = new Promise((resolve, reject) => {
        const connectTimeout = setTimeout(() => {
          reject(new Error('Connection timeout after 15 seconds'));
        }, 15000);

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

      console.log('✅ [CLIENT] Socket connected successfully for attempt:', attemptId);
      return true;

    } catch (error) {
      console.error('❌ [CLIENT] Error joining room:', error);
      dispatch({ type: ROOM_ACTIONS.ERROR, payload: { error: error.message } });
      
      // Reset initialization state on error
      initializationRef.current = {
        isInitializing: false,
        lastRoomId: null,
        lastPassword: null,
        lastInitTime: 0,
        joinAttemptId: null,
        hasSuccessfullyJoined: false
      };
      
      return false;
    }
  }, [isAuthenticated, user, cleanup, setupSocketHandlers, state.isConnected, state.roomInfo, state.error]);

  // Leave room function
  const leaveRoom = useCallback(() => {
    console.log('👋 [CLIENT] Leaving room...');
    cleanup();
    router.push('/');
  }, [cleanup, router]);

  // Send chat message
  const sendMessage = useCallback((message) => {
    if (socketRef.current && state.isConnected && state.roomId) {
      socketRef.current.emit('chatMessage', {
        message: message.trim(),
        roomId: state.roomId
      });
      return true;
    }
    return false;
  }, [state.isConnected, state.roomId]);

  // Send typing indicator
  const sendTyping = useCallback((isTyping) => {
    if (socketRef.current && state.isConnected && state.roomId) {
      socketRef.current.emit('typing', {
        roomId: state.roomId,
        isTyping
      });
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
    console.log('🔧 [CLIENT] sendLanguageChange called:', { 
      language, 
      codeLength: code?.length, 
      isConnected: state.isConnected, 
      roomId: state.roomId, 
      userRole: state.userRole
    });

    if (!socketRef.current?.connected || !state.isConnected || !state.roomId || !user) {
      return false;
    }

    // Check permissions
    const hasPermission = ['owner', 'moderator'].includes(state.userRole);
    if (!hasPermission) {
      return false;
    }

    try {
      const payload = {
        roomId: state.roomId,
        language,
        code: code || state.code,
        userId: user.id,
        username: user.username
      };
      
      socketRef.current.emit('languageChange', payload);
      return true;
    } catch (error) {
      console.error('❌ [CLIENT] Error sending language change:', error);
      return false;
    }
  }, [state.isConnected, state.roomId, state.userRole, state.code, user]);

  // Audio permission functions  
  const sendAudioPermissionRequest = useCallback(() => {
    if (socketRef.current && state.isConnected && state.roomId && user) {
      console.log('🎤 [CLIENT] Sending audio permission request');
      socketRef.current.emit('audioPermissionRequest', {
        roomId: state.roomId,
        username: user.username
      });
    }
  }, [state.isConnected, state.roomId, user]);

  const sendAudioPermissionResponse = useCallback((username, granted) => {
    if (socketRef.current && state.isConnected && state.roomId && (state.userRole === 'owner' || state.userRole === 'moderator')) {
      console.log('🎤 [CLIENT] Sending audio permission response:', { username, granted });
      socketRef.current.emit('audioPermissionResponse', {
        roomId: state.roomId,
        username,
        granted
      });
      
      // Immediately remove from local pending requests for instant UI feedback
      dispatch({
        type: ROOM_ACTIONS.REMOVE_PERMISSION_REQUEST,
        payload: { username }
      });
    }
  }, [state.isConnected, state.roomId, state.userRole]);

  // Audio functions
  const toggleAudio = useCallback(() => {
    const newConnectedState = !state.audioConnected;
    
    if (socketRef.current && state.isConnected && state.roomId && user) {
      socketRef.current.emit('audioToggle', {
        roomId: state.roomId,
        username: user.username,
        connected: newConnectedState
      });
    }
    
    dispatch({
      type: ROOM_ACTIONS.AUDIO_UPDATE,
      payload: { connected: newConnectedState }
    });
  }, [state.audioConnected, state.isConnected, state.roomId, user]);

  const toggleMute = useCallback(() => {
    const newMutedState = !state.isMuted;
    
    if (socketRef.current && state.isConnected && state.roomId && user) {
      socketRef.current.emit('audioMute', {
        roomId: state.roomId,
        username: user.username,
        muted: newMutedState
      });
    }
    
    dispatch({
      type: ROOM_ACTIONS.AUDIO_UPDATE,
      payload: { muted: newMutedState }
    });
  }, [state.isMuted, state.isConnected, state.roomId, user]);

  const updateSpeakingStatus = useCallback((isSpeaking) => {
    if (socketRef.current && state.isConnected && state.roomId && user && state.audioConnected) {
      socketRef.current.emit('speakingUpdate', {
        roomId: state.roomId,
        username: user.username,
        isSpeaking
      });
    }
  }, [state.isConnected, state.roomId, user, state.audioConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 [CLIENT] RoomProvider unmounting - cleaning up');
      cleanup();
    };
  }, [cleanup]);

  // Context value
  const value = {
    // State
    ...state,
    
    // Actions
    joinRoom,
    leaveRoom,
    sendMessage,
    sendTyping,
    sendCodeChange,
    sendLanguageChange,
    
    // Audio functions
    toggleAudio,
    toggleMute,
    updateSpeakingStatus,
    sendAudioPermissionRequest,
    sendAudioPermissionResponse,
    
    // Utilities
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

// Custom hook to use room context
export const useRoom = () => {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
};