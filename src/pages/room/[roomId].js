// src/pages/room/[roomId].js - ROLE SYSTEM INDICATORS REMOVED
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

  const [hasAttemptedJoin, setHasAttemptedJoin] = useState(false);
  const [isFooterVisible, setIsFooterVisible] = useState(true);

  // Simplified room credentials validation
  const roomCredentials = useMemo(() => {
    if (!roomId || typeof roomId !== 'string' || roomId.includes('[') || roomId.includes(']')) {
      return null;
    }
    
    if (!router.query.roomPassword) {
      return null;
    }
    
    return {
      roomId: String(roomId),
      roomPassword: String(router.query.roomPassword),
      maxUsers: router.query.maxUsers ? Number(router.query.maxUsers) : undefined
    };
  }, [roomId, router.query.roomPassword, router.query.maxUsers]);

  // Simplified join function
  const handleJoinRoom = useCallback(async (credentials) => {
    if (!credentials || !user || hasAttemptedJoin) {
      return false;
    }

    if (isConnected && roomInfo && !error) {
      return true; // Already connected
    }

    setHasAttemptedJoin(true);
    return await joinRoom(credentials.roomId, credentials.roomPassword);
  }, [joinRoom, user, hasAttemptedJoin, isConnected, roomInfo, error]);

  // Simplified useEffect for joining
  useEffect(() => {
    if (roomCredentials && user && !hasAttemptedJoin) {
      handleJoinRoom(roomCredentials);
    }
  }, [roomCredentials, user, hasAttemptedJoin, handleJoinRoom]);

  // Reset join state when leaving
  useEffect(() => {
    return () => {
      setHasAttemptedJoin(false);
    };
  }, []);

  // Simplified loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Connecting to Room</h2>
            <p className="text-gray-600 mb-4">Setting up collaborative workspace...</p>
            
            <div className="mt-4 space-y-1 text-sm text-gray-500">
              <p>🔌 Establishing connection...</p>
              <p>🔐 Authenticating...</p>
              <p>💬 Loading chat...</p>
              <p>💻 Preparing editor...</p>
              <p>🎙️ Setting up voice chat...</p>
            </div>

            <div className="mt-6 space-x-2">
              <button
                onClick={() => window.location.reload()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                🔄 Refresh
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

  // Simplified error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Navbar />
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold mb-2 text-red-600">Connection Error</h2>
            <p className="text-gray-700 mb-6">{error}</p>
            
            <div className="space-y-3">
              <button
                onClick={() => {
                  setHasAttemptedJoin(false);
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

  // Get role display text
  const getRoleDisplayText = (role) => {
    switch (role) {
      case 'owner':
        return 'Room Creator';
      case 'member':
        return 'Member';
      default:
        return 'Member';
    }
  };

  // Get role icon
  const getRoleIcon = (role) => {
    switch (role) {
      case 'owner':
        return '👑';
      default:
        return '👤';
    }
  };

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
                      <span>🎙️ Voice Chat Ready</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* User Role Display */}
              <div className="text-sm bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
                <span className="text-blue-800 font-medium">
                  {getRoleIcon(userRole)} {getRoleDisplayText(userRole)}
                </span>
              </div>
              
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

          {/* Language Control Info */}
          {userRole === 'owner' && (
            <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="text-sm text-green-800">
                <span className="font-semibold">Language Control:</span>
                As the room creator, you can change the programming language.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Room Content Layout with Error Boundaries */}
      <div className="container mx-auto p-4" style={{ paddingBottom: isFooterVisible ? '120px' : '60px' }}>
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

      {/* Collapsible Room Status Bar */}
      <div className={`fixed bottom-0 left-0 right-0 bg-gray-800 text-white z-50 transition-transform duration-300 ease-in-out ${
        isFooterVisible ? 'transform translate-y-0' : 'transform translate-y-full'
      }`}>
        {/* Toggle Button - Always visible */}
        <button
          onClick={() => setIsFooterVisible(!isFooterVisible)}
          className={`absolute top-0 right-4 transform -translate-y-full bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded-t-md text-xs transition-colors ${
            !isFooterVisible ? 'bg-blue-600 hover:bg-blue-700' : ''
          }`}
          title={isFooterVisible ? 'Hide status bar' : 'Show status bar'}
        >
          {isFooterVisible ? (
            <>
              <svg className="w-3 h-3 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              Hide
            </>
          ) : (
            <>
              <svg className="w-3 h-3 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Show
            </>
          )}
        </button>

        {/* Status Bar Content */}
        <div className="py-2 px-4">
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
                <span className="text-sm hidden lg:inline">
                  Role: <span className="capitalize font-medium">
                    {getRoleIcon(userRole)} {getRoleDisplayText(userRole)}
                  </span>
                </span>
              </div>
              
              <div className="flex items-center space-x-4">
                <span className="text-sm">👥 {users.length} online</span>
                {roomInfo && (
                  <span className="text-sm hidden sm:inline">
                    {roomInfo.maxUsers} max
                  </span>
                )}
                
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} 
                       title={isConnected ? 'Connected to room' : 'Disconnected from room'}>
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
                    <span>🎙️ Voice Ready</span>
                    <span>
                      {userRole === 'owner' ? 'Creator (can change language)' : 'Member (equal access)'}
                    </span>
                  </>
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
    </div>
  );
};

// Main room page component
const RoomPage = () => {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  // Simplified redirect handling
  useEffect(() => {
    if (!isAuthenticated) {
      const currentPath = router.asPath;
      
      if (currentPath.includes('[roomId]')) {
        router.push('/login');
        return;
      }
      
      const redirectUrl = `/login?redirect=${encodeURIComponent(currentPath)}`;
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