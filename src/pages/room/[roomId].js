// src/pages/room/[roomId].js - FIXED VERSION WITH ENHANCED URL HANDLING
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import Navbar from '@/components/Navbar';
import CollaborativeCodeEditor from '@/components/CollaborativeCodeEditor';
import Chat from '@/components/Chat';
import WebRTCAudioComponent from '@/components/WebRTCAudioComponent';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useAuth, ProtectedRoute } from '@/contexts/AuthContext';
import { RoomProvider, useRoom } from '@/contexts/RoomContext';

// Room content component
const RoomContent = () => {
  const router = useRouter();
  const { roomId } = router.query;
  const { user } = useAuth();
  const { 
    isLoading, 
    error, 
    isConnected, 
    roomInfo, 
    users, 
    joinRoom, 
    leaveRoom,
    currentUser,
    userRole
  } = useRoom();

  const [debugInfo, setDebugInfo] = useState([]);
  const [joinState, setJoinState] = useState({
    hasAttempted: false,
    isProcessing: false,
    lastAttemptTime: 0,
    attemptId: null
  });

  // 🔧 CRITICAL FIX: Enhanced room credentials with validation
  const roomCredentials = useMemo(() => {
    // Validate roomId is not a template literal
    if (!roomId || typeof roomId !== 'string' || roomId.includes('[') || roomId.includes(']')) {
      console.warn('⚠️ Invalid roomId detected:', roomId);
      return null;
    }
    
    if (!router.query.roomPassword) {
      console.warn('⚠️ Missing room password');
      return null;
    }
    
    return {
      roomId: String(roomId),
      roomPassword: String(router.query.roomPassword),
      maxUsers: router.query.maxUsers ? Number(router.query.maxUsers) : undefined
    };
  }, [roomId, router.query.roomPassword, router.query.maxUsers]);

  // Debug logging function
  const addDebugLog = useCallback((message) => {
    console.log(`🐛 [Room Debug]: ${message}`);
    setDebugInfo(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

  // 🔧 CRITICAL FIX: Enhanced join function with validation
  const handleJoinRoom = useCallback(async (credentials) => {
    const currentTime = Date.now();
    const attemptId = `${credentials.roomId}-${currentTime}-${Math.random().toString(36).substr(2, 5)}`;
    
    // Enhanced validation
    if (!credentials || !credentials.roomId || !credentials.roomPassword) {
      addDebugLog('Invalid credentials provided');
      return false;
    }
    
    // Prevent rapid successive calls
    if (currentTime - joinState.lastAttemptTime < 3000) {
      addDebugLog(`Skipping join - too soon since last attempt (${currentTime - joinState.lastAttemptTime}ms ago)`);
      return false;
    }

    // Prevent duplicate processing
    if (joinState.isProcessing) {
      addDebugLog('Skipping join - already processing');
      return false;
    }

    // Check if already successfully connected
    if (isConnected && roomInfo && !error) {
      addDebugLog('Skipping join - already connected and no errors');
      return true;
    }

    addDebugLog(`Starting enhanced join attempt: ${attemptId}`);
    
    setJoinState({
      hasAttempted: true,
      isProcessing: true,
      lastAttemptTime: currentTime,
      attemptId
    });

    try {
      const success = await joinRoom(credentials.roomId, credentials.roomPassword);
      addDebugLog(`Enhanced join attempt ${attemptId} result: ${success}`);
      
      setJoinState(prev => ({ ...prev, isProcessing: false }));
      return success;
    } catch (error) {
      addDebugLog(`Enhanced join attempt ${attemptId} failed: ${error.message}`);
      setJoinState(prev => ({ ...prev, isProcessing: false }));
      return false;
    }
  }, [joinRoom, joinState.lastAttemptTime, joinState.isProcessing, isConnected, roomInfo, error, addDebugLog]);

  // 🔧 CRITICAL FIX: Enhanced useEffect with better dependency management
  useEffect(() => {
    // Only proceed if we have valid credentials and user
    if (!roomCredentials || !user) {
      addDebugLog(`Missing requirements - credentials: ${!!roomCredentials}, user: ${!!user}`);
      return;
    }

    // Don't attempt if already processing
    if (joinState.isProcessing) {
      addDebugLog('Join already in progress, skipping');
      return;
    }

    // Don't attempt if already successfully connected
    if (isConnected && roomInfo && !error && joinState.hasAttempted) {
      addDebugLog('Already connected successfully, skipping');
      return;
    }

    // Don't attempt if we recently tried (enhanced debounce)
    const timeSinceLastAttempt = Date.now() - joinState.lastAttemptTime;
    if (joinState.hasAttempted && timeSinceLastAttempt < 5000) {
      addDebugLog(`Recently attempted join ${timeSinceLastAttempt}ms ago, waiting...`);
      return;
    }

    // Proceed with join attempt
    addDebugLog(`Initiating enhanced join for room ${roomCredentials.roomId}`);
    handleJoinRoom(roomCredentials);

  }, [
    roomCredentials?.roomId, // Only depend on roomId to prevent unnecessary re-runs
    roomCredentials?.roomPassword, // Only depend on password
    user?.id, // Only depend on user ID
    joinState.isProcessing,
    joinState.hasAttempted,
    joinState.lastAttemptTime,
    isConnected,
    roomInfo,
    error,
    handleJoinRoom,
    addDebugLog
  ]);

  // Reset join state when leaving/unmounting
  useEffect(() => {
    return () => {
      setJoinState({
        hasAttempted: false,
        isProcessing: false,
        lastAttemptTime: 0,
        attemptId: null
      });
    };
  }, []);

  // 🔧 CRITICAL FIX: Enhanced loading state with better debugging
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Connecting to Room</h2>
            <p className="text-gray-600 mb-4">Setting up collaborative workspace...</p>
            
            {/* Enhanced Debug Information */}
            <div className="bg-gray-50 rounded-lg p-4 text-left">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">🔧 Connection Status:</h3>
              <div className="space-y-1 text-xs text-gray-600 max-h-32 overflow-y-auto">
                <div>Room ID: {roomCredentials?.roomId || 'Invalid/Missing'}</div>
                <div>User: {user?.username || 'Not authenticated'}</div>
                <div>Password: {roomCredentials?.roomPassword ? 'Provided' : 'Missing'}</div>
                <div>Credentials Valid: {roomCredentials ? 'Yes' : 'No'}</div>
                <div>Has Attempted: {joinState.hasAttempted.toString()}</div>
                <div>Is Processing: {joinState.isProcessing.toString()}</div>
                <div>Is Connected: {isConnected.toString()}</div>
                <div>Current User: {currentUser || 'None'}</div>
                <div>Attempt ID: {joinState.attemptId || 'None'}</div>
                <div className="border-t pt-2 mt-2">
                  <div className="font-semibold">Recent logs:</div>
                  {debugInfo.slice(-5).map((log, i) => (
                    <div key={i} className="text-xs">{log}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-1 text-sm text-gray-500">
              <p>🔌 Establishing secure connection...</p>
              <p>🔐 Authenticating with server...</p>
              <p>💬 Initializing chat system...</p>
              <p>💻 Loading collaborative editor...</p>
              <p>🎙️ Setting up WebRTC voice chat...</p>
            </div>

            {/* Emergency Actions */}
            <div className="mt-6 space-x-2">
              <button
                onClick={() => {
                  addDebugLog('Manual refresh triggered');
                  window.location.reload();
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                🔄 Refresh
              </button>
              <button
                onClick={() => {
                  addDebugLog('Manual retry triggered');
                  setJoinState({
                    hasAttempted: false,
                    isProcessing: false,
                    lastAttemptTime: 0,
                    attemptId: null
                  });
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                🔁 Retry Join
              </button>
              <button
                onClick={() => router.push('/')}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                🏠 Go Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 🔧 CRITICAL FIX: Enhanced error state with detailed information
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold mb-2 text-red-600">Connection Error</h2>
            <p className="text-gray-700 mb-6">{error}</p>
            
            {/* Enhanced Debug Information for Errors */}
            <div className="bg-red-50 rounded-lg p-4 text-left mb-6">
              <h3 className="text-sm font-semibold text-red-700 mb-2">🔧 Error Details:</h3>
              <div className="space-y-1 text-xs text-red-600">
                <div>Room ID: {roomCredentials?.roomId || 'Invalid'}</div>
                <div>Credentials Valid: {roomCredentials ? 'Yes' : 'No'}</div>
                <div>User: {user?.username || 'Not authenticated'}</div>
                <div>Auth Token: {localStorage.getItem('auth_token') ? 'Present' : 'Missing'}</div>
                <div>Server URL: https://cotog-backend.onrender.com</div>
                <div>Join State: {JSON.stringify(joinState, null, 2)}</div>
                <div className="border-t pt-2 mt-2">
                  <div className="font-semibold">Debug logs:</div>
                  {debugInfo.map((log, i) => (
                    <div key={i} className="text-xs">{log}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  addDebugLog('Error retry button clicked');
                  setJoinState({
                    hasAttempted: false,
                    isProcessing: false,
                    lastAttemptTime: 0,
                    attemptId: null
                  });
                  window.location.reload();
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors mr-3"
              >
                🔄 Try Again
              </button>
              <button
                onClick={() => router.push('/')}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                🏠 Go Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main room interface
  return (
    <div className="min-h-screen bg-gray-100 room-page">
      <Navbar />
      
      {/* Room Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                  {roomInfo?.roomName || `Room ${roomId}`}
                  {userRole === 'owner' && <span className="ml-2 text-lg">👑</span>}
                  {userRole === 'moderator' && <span className="ml-2 text-lg">🛡️</span>}
                </h1>
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <span className="flex items-center">
                    {isConnected ? (
                      <span className="text-green-600 flex items-center">
                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                        Connected
                      </span>
                    ) : (
                      <span className="text-red-600 flex items-center">
                        <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                        Disconnected
                      </span>
                    )}
                  </span>
                  {roomInfo && (
                    <>
                      <span>👥 {users.length}/{roomInfo.maxUsers} users</span>
                      <span>👤 Created by {roomInfo.createdBy}</span>
                      {roomInfo.isPrivate && <span>🔒 Private</span>}
                      <span>🎙️ Enhanced WebRTC Voice</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                Room ID: <code className="font-mono font-semibold">{roomId}</code>
              </div>
              <button
                onClick={leaveRoom}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center space-x-2"
              >
                <span>🚪</span>
                <span>Leave Room</span>
              </button>
            </div>
          </div>
          
          {roomInfo?.description && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-blue-800 text-sm">
                <span className="font-semibold">Description:</span> {roomInfo.description}
              </p>
            </div>
          )}

          {/* Enhanced Debug Panel */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <details className="text-sm">
                <summary className="font-semibold text-yellow-800 cursor-pointer">🔧 Enhanced Debug Info</summary>
                <div className="mt-2 space-y-1 text-yellow-700 text-xs">
                  <div>Connected: {isConnected.toString()}</div>
                  <div>Current User: {currentUser}</div>
                  <div>User Role: {userRole}</div>
                  <div>Users Count: {users.length}</div>
                  <div>Room Loaded: {!!roomInfo}</div>
                  <div>Join State: {JSON.stringify(joinState, null, 2)}</div>
                  <div>Credentials Valid: {!!roomCredentials}</div>
                  <div>Room ID Valid: {roomCredentials?.roomId && !roomCredentials.roomId.includes('[')}</div>
                  <div>WebRTC Component: Enhanced v2.0</div>
                  <div>Browser WebRTC Support: {typeof RTCPeerConnection !== 'undefined' ? 'Yes' : 'No'}</div>
                  <div className="max-h-20 overflow-y-auto">
                    Recent logs: {debugInfo.slice(-3).join(' | ')}
                  </div>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>

      {/* Room Content Layout with Error Boundaries */}
      <div className="container mx-auto p-4 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 room-content" style={{ height: 'calc(100vh - 320px)' }}>
          
          {/* Left Sidebar - Chat and WebRTC Audio */}
          <div className="lg:col-span-1 room-sidebar">
            
            {/* Chat Component with Error Boundary */}
            <div className="chat-container">
              <ErrorBoundary>
                <Chat />
              </ErrorBoundary>
            </div>

            {/* WebRTC Audio Component with Error Boundary */}
            <div className="audio-container">
              <ErrorBoundary>
                <WebRTCAudioComponent />
              </ErrorBoundary>
            </div>
            
          </div>

          {/* Main Content - Code Editor */}
          <div className="lg:col-span-3 h-full">
            <div className="h-full bg-white rounded-lg shadow-lg overflow-hidden">
              <ErrorBoundary>
                <CollaborativeCodeEditor />
              </ErrorBoundary>
            </div>
          </div>
          
        </div>
      </div>

      {/* Enhanced Room Status Bar */}
      <div id="room-status-bar" className="fixed bottom-0 left-0 right-0 bg-gray-800 text-white py-2 px-4 z-50">
        <div className="container mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                <span className="text-sm font-medium">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </span>
              <span className="text-sm">Room: <code className="bg-gray-700 px-1 rounded">{roomId}</code></span>
              <span className="text-sm hidden md:inline">User: <span className="font-medium">{currentUser}</span></span>
              <span className="text-sm hidden lg:inline">Role: <span className="capitalize font-medium">{userRole}</span></span>
              <span className="text-sm hidden xl:inline">🎙️ Enhanced WebRTC</span>
              {joinState.isProcessing && (
                <span className="text-sm text-yellow-300">⏳ Connecting...</span>
              )}
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm">👥 {users.length} online</span>
              {roomInfo && (
                <span className="text-sm hidden sm:inline">
                  {roomInfo.maxUsers} max
                </span>
              )}
              
              {/* Status Indicators */}
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} 
                     title={isConnected ? 'Connected to room' : 'Disconnected from room'}>
                </div>
                <div className={`w-3 h-3 rounded-full ${typeof RTCPeerConnection !== 'undefined' ? 'bg-blue-400' : 'bg-gray-400'}`} 
                     title={typeof RTCPeerConnection !== 'undefined' ? 'WebRTC supported' : 'WebRTC not supported'}>
                </div>
                <button
                  onClick={leaveRoom}
                  className="text-xs hover:bg-red-600 bg-red-700 px-2 py-1 rounded transition-colors"
                  title="Leave room"
                >
                  🚪
                </button>
              </div>
            </div>
          </div>
          
          {/* Additional Status Info */}
          <div className="mt-1 text-xs text-gray-300 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {roomInfo && (
                <>
                  <span>📝 {roomInfo.roomName}</span>
                  {roomInfo.isPrivate && <span>🔒 Private</span>}
                  <span>🎙️ Enhanced WebRTC v2.0</span>
                </>
              )}
              {joinState.attemptId && (
                <span>🔍 Attempt: {joinState.attemptId.slice(-8)}</span>
              )}
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <span>Server: cotog-backend.onrender.com</span>
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main room page component
const RoomPage = () => {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  // 🔧 CRITICAL FIX: Enhanced redirect handling with URL validation
  useEffect(() => {
    if (!isAuthenticated) {
      // Validate current URL to prevent [roomId] interpolation
      const currentPath = router.asPath;
      
      // Check for template literal in URL
      if (currentPath.includes('[roomId]')) {
        console.warn('⚠️ Template literal detected in URL, redirecting to login without redirect');
        router.push('/login');
        return;
      }
      
      // Safe redirect with validated URL
      const redirectUrl = `/login?redirect=${encodeURIComponent(currentPath)}`;
      console.log('🔐 Enhanced redirect to login:', redirectUrl);
      router.push(redirectUrl);
    }
  }, [isAuthenticated, router.asPath, router]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <RoomProvider>
        <RoomContent />
      </RoomProvider>
    </ProtectedRoute>
  );
};

export default RoomPage;