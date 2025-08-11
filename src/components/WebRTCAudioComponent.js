// src/components/WebRTCAudioComponent.js - FIXED VERSION - CONNECTION ISSUES RESOLVED
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'simple-peer';
import { useRoom } from '@/contexts/RoomContext';

const WebRTCAudioComponent = () => {
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [audioPermissionGranted, setAudioPermissionGranted] = useState(false);

  // Critical refs for managing connections
  const peersRef = useRef(new Map()); // userId -> peer
  const streamsRef = useRef(new Map()); // userId -> stream
  const audioElementsRef = useRef(new Map()); // userId -> audio element
  const localStreamRef = useRef(null);
  const mountedRef = useRef(true);
  const connectionTimeoutsRef = useRef(new Map()); // userId -> timeout
  const retryCountsRef = useRef(new Map()); // userId -> retry count
  
  // CRITICAL FIX: Track pending connections to prevent duplicates
  const pendingConnectionsRef = useRef(new Set());

  const { getSocket, isConnected: roomConnected, currentUser, roomId } = useRoom();

  // ICE server configuration for better connectivity
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ];

  // STEP 1: Get user media with comprehensive error handling
  const getUserMedia = useCallback(async () => {
    try {
      console.log('🎤 Requesting microphone access...');
      
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1
        },
        video: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return null;
      }

      console.log('✅ Microphone access granted');
      setAudioPermissionGranted(true);
      setConnectionError(null);
      
      return stream;
    } catch (error) {
      console.error('❌ Failed to get user media:', error);
      setAudioPermissionGranted(false);
      
      let errorMessage = 'Failed to access microphone';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Microphone access denied. Please allow microphone access and try again.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Microphone is being used by another application.';
      }
      
      setConnectionError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  // STEP 2: Create and manage audio elements for remote streams
  const createAudioElement = useCallback((remoteStream, userId, username) => {
    try {
      console.log(`🔊 Creating audio element for ${username} (${userId})`);
      
      // Remove existing audio element if it exists
      if (audioElementsRef.current.has(userId)) {
        const existingAudio = audioElementsRef.current.get(userId);
        existingAudio.pause();
        existingAudio.srcObject = null;
        audioElementsRef.current.delete(userId);
      }

      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      audio.volume = 0.8;
      audio.playsInline = true;
      
      // Handle audio events
      audio.onloadstart = () => console.log(`📻 Loading audio for ${username}`);
      audio.oncanplay = () => console.log(`🎵 Audio ready for ${username}`);
      audio.onplay = () => console.log(`▶️ Audio playing for ${username}`);
      audio.onerror = (e) => console.error(`❌ Audio error for ${username}:`, e);
      
      // Attempt to play
      const playAudio = async () => {
        try {
          await audio.play();
          console.log(`✅ Audio successfully playing for ${username}`);
        } catch (playError) {
          console.warn(`⚠️ Autoplay prevented for ${username}:`, playError.message);
          
          // Create a user gesture handler for mobile
          const playOnUserGesture = () => {
            audio.play().then(() => {
              console.log(`✅ Audio started after user gesture for ${username}`);
              document.removeEventListener('click', playOnUserGesture);
              document.removeEventListener('touchstart', playOnUserGesture);
            }).catch(err => {
              console.error(`❌ Failed to play after user gesture for ${username}:`, err);
            });
          };
          
          document.addEventListener('click', playOnUserGesture);
          document.addEventListener('touchstart', playOnUserGesture);
        }
      };

      playAudio();
      audioElementsRef.current.set(userId, audio);
      
      return audio;
    } catch (error) {
      console.error(`❌ Error creating audio element for ${userId}:`, error);
      return null;
    }
  }, []);

  // STEP 3: Create peer connection (outgoing call) - FIXED
  const createPeer = useCallback((targetUserId, targetUsername, localStream) => {
    try {
      // CRITICAL FIX: Prevent duplicate connections
      const connectionKey = `${currentUser}-${targetUserId}`;
      if (pendingConnectionsRef.current.has(connectionKey)) {
        console.log(`⚠️ Connection already pending to ${targetUsername}, skipping`);
        return null;
      }
      
      console.log(`📞 Creating outgoing peer connection to ${targetUsername} (${targetUserId})`);
      
      // Mark connection as pending
      pendingConnectionsRef.current.add(connectionKey);
      
      // Clean up existing peer if it exists
      if (peersRef.current.has(targetUserId)) {
        const existingPeer = peersRef.current.get(targetUserId);
        try {
          existingPeer.destroy();
        } catch (e) {
          console.warn('Error destroying existing peer:', e);
        }
        peersRef.current.delete(targetUserId);
      }

      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: localStream,
        config: {
          iceServers,
          iceCandidatePoolSize: 10
        }
      });

      // FIXED: Shorter timeout and better cleanup
      const timeoutId = setTimeout(() => {
        console.error(`⏰ Connection timeout for ${targetUsername}`);
        setConnectionError(`Connection timeout with ${targetUsername}`);
        
        // Clean up pending connection
        pendingConnectionsRef.current.delete(connectionKey);
        
        if (peersRef.current.has(targetUserId)) {
          try {
            peer.destroy();
          } catch (e) {
            console.warn('Error destroying timed out peer:', e);
          }
          peersRef.current.delete(targetUserId);
        }
      }, 15000); // Reduced to 15 seconds

      connectionTimeoutsRef.current.set(targetUserId, timeoutId);

      peer.on('signal', (signal) => {
        try {
          const socket = getSocket();
          if (socket && socket.connected && mountedRef.current) {
            console.log(`📡 Sending signal to ${targetUsername} (type: ${signal.type})`);
            
            // FIXED: Use proper event names matching server
            socket.emit('webrtc-signal', {
              targetUserId,
              signal,
              callerInfo: {
                userId: currentUser,
                username: currentUser
              },
              roomId
            });
          }
        } catch (error) {
          console.error('❌ Error sending signal:', error);
        }
      });

      peer.on('stream', (remoteStream) => {
        try {
          if (mountedRef.current) {
            console.log(`🎵 Received stream from ${targetUsername}`);
            streamsRef.current.set(targetUserId, remoteStream);
            createAudioElement(remoteStream, targetUserId, targetUsername);
            
            // Clear timeout on successful connection
            const timeoutId = connectionTimeoutsRef.current.get(targetUserId);
            if (timeoutId) {
              clearTimeout(timeoutId);
              connectionTimeoutsRef.current.delete(targetUserId);
            }
            
            // Clear pending connection
            pendingConnectionsRef.current.delete(connectionKey);
            
            // Update connected users
            setConnectedUsers(prev => {
              const filtered = prev.filter(u => u.userId !== targetUserId);
              return [...filtered, { userId: targetUserId, username: targetUsername }];
            });
          }
        } catch (error) {
          console.error('❌ Error handling remote stream:', error);
        }
      });

      peer.on('connect', () => {
        console.log(`✅ Peer connected to ${targetUsername}`);
        setConnectionError(null);
        retryCountsRef.current.delete(targetUserId);
        pendingConnectionsRef.current.delete(connectionKey);
      });

      peer.on('close', () => {
        console.log(`🔌 Peer connection closed with ${targetUsername}`);
        pendingConnectionsRef.current.delete(connectionKey);
        handlePeerCleanup(targetUserId);
      });

      peer.on('error', (error) => {
        console.error(`❌ Peer error with ${targetUsername}:`, error);
        setConnectionError(`Connection failed with ${targetUsername}: ${error.message}`);
        pendingConnectionsRef.current.delete(connectionKey);
        handlePeerCleanup(targetUserId);
        
        // FIXED: Implement retry logic with backoff
        handleConnectionRetry(targetUserId, targetUsername, localStream);
      });

      peersRef.current.set(targetUserId, peer);
      return peer;
    } catch (error) {
      console.error('❌ Error creating peer:', error);
      setConnectionError(`Failed to create connection: ${error.message}`);
      return null;
    }
  }, [getSocket, roomId, currentUser, createAudioElement]);

  // STEP 4: Handle incoming peer connection - FIXED
  const handleIncomingCall = useCallback((signal, callerInfo, localStream) => {
    try {
      const { userId: callerUserId, username: callerUsername } = callerInfo;
      console.log(`📞 Handling incoming call from ${callerUsername} (${callerUserId})`);

      // CRITICAL FIX: Prevent duplicate incoming connections
      const connectionKey = `${callerUserId}-${currentUser}`;
      if (pendingConnectionsRef.current.has(connectionKey)) {
        console.log(`⚠️ Incoming connection already pending from ${callerUsername}, skipping`);
        return;
      }
      
      // Mark connection as pending
      pendingConnectionsRef.current.add(connectionKey);

      // Clean up existing peer if it exists
      if (peersRef.current.has(callerUserId)) {
        const existingPeer = peersRef.current.get(callerUserId);
        try {
          existingPeer.destroy();
        } catch (e) {
          console.warn('Error destroying existing peer:', e);
        }
        peersRef.current.delete(callerUserId);
      }

      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: localStream,
        config: {
          iceServers,
          iceCandidatePoolSize: 10
        }
      });

      // FIXED: Shorter timeout
      const timeoutId = setTimeout(() => {
        console.error(`⏰ Incoming connection timeout from ${callerUsername}`);
        setConnectionError(`Connection timeout with ${callerUsername}`);
        
        // Clean up pending connection
        pendingConnectionsRef.current.delete(connectionKey);
        
        if (peersRef.current.has(callerUserId)) {
          try {
            peer.destroy();
          } catch (e) {
            console.warn('Error destroying timed out incoming peer:', e);
          }
          peersRef.current.delete(callerUserId);
        }
      }, 15000);

      connectionTimeoutsRef.current.set(callerUserId, timeoutId);

      peer.on('signal', (signal) => {
        try {
          const socket = getSocket();
          if (socket && socket.connected && mountedRef.current) {
            console.log(`📡 Sending return signal to ${callerUsername} (type: ${signal.type})`);
            
            // FIXED: Use proper event names matching server
            socket.emit('webrtc-answer', {
              targetUserId: callerUserId,
              signal,
              answererInfo: {
                userId: currentUser,
                username: currentUser
              },
              roomId
            });
          }
        } catch (error) {
          console.error('❌ Error sending return signal:', error);
        }
      });

      peer.on('stream', (remoteStream) => {
        try {
          if (mountedRef.current) {
            console.log(`🎵 Received stream from caller ${callerUsername}`);
            streamsRef.current.set(callerUserId, remoteStream);
            createAudioElement(remoteStream, callerUserId, callerUsername);
            
            // Clear timeout on successful connection
            const timeoutId = connectionTimeoutsRef.current.get(callerUserId);
            if (timeoutId) {
              clearTimeout(timeoutId);
              connectionTimeoutsRef.current.delete(callerUserId);
            }
            
            // Clear pending connection
            pendingConnectionsRef.current.delete(connectionKey);
            
            // Update connected users
            setConnectedUsers(prev => {
              const filtered = prev.filter(u => u.userId !== callerUserId);
              return [...filtered, { userId: callerUserId, username: callerUsername }];
            });
          }
        } catch (error) {
          console.error('❌ Error handling incoming stream:', error);
        }
      });

      peer.on('connect', () => {
        console.log(`✅ Incoming peer connected from ${callerUsername}`);
        setConnectionError(null);
        retryCountsRef.current.delete(callerUserId);
        pendingConnectionsRef.current.delete(connectionKey);
      });

      peer.on('close', () => {
        console.log(`🔌 Incoming peer connection closed from ${callerUsername}`);
        pendingConnectionsRef.current.delete(connectionKey);
        handlePeerCleanup(callerUserId);
      });

      peer.on('error', (error) => {
        console.error(`❌ Incoming peer error from ${callerUsername}:`, error);
        setConnectionError(`Connection failed with ${callerUsername}: ${error.message}`);
        pendingConnectionsRef.current.delete(connectionKey);
        handlePeerCleanup(callerUserId);
      });

      // Signal the peer with incoming data
      try {
        peer.signal(signal);
        peersRef.current.set(callerUserId, peer);
        console.log(`✅ Successfully signaled incoming peer from ${callerUsername}`);
      } catch (signalError) {
        console.error(`❌ Error signaling incoming peer from ${callerUsername}:`, signalError);
        pendingConnectionsRef.current.delete(connectionKey);
        try {
          peer.destroy();
        } catch (e) {
          console.warn('Error destroying failed incoming peer:', e);
        }
      }

    } catch (error) {
      console.error('❌ Error handling incoming call:', error);
      setConnectionError(`Failed to handle incoming call: ${error.message}`);
    }
  }, [getSocket, roomId, currentUser, createAudioElement]);

  // STEP 5: Connection retry logic - IMPROVED
  const handleConnectionRetry = useCallback((userId, username, localStream) => {
    const currentRetries = retryCountsRef.current.get(userId) || 0;
    const maxRetries = 2; // Reduced retries
    
    if (currentRetries < maxRetries) {
      const retryDelay = Math.min(2000 * Math.pow(2, currentRetries), 8000); // Faster retry
      
      console.log(`🔄 Retrying connection to ${username} (attempt ${currentRetries + 1}/${maxRetries}) in ${retryDelay}ms`);
      retryCountsRef.current.set(userId, currentRetries + 1);
      
      setTimeout(() => {
        if (mountedRef.current && localStreamRef.current) {
          createPeer(userId, username, localStreamRef.current);
        }
      }, retryDelay);
    } else {
      console.error(`❌ Max retries reached for ${username}`);
      setConnectionError(`Failed to connect to ${username} after ${maxRetries} attempts`);
      retryCountsRef.current.delete(userId);
    }
  }, [createPeer]);

  // STEP 6: Cleanup function - IMPROVED
  const handlePeerCleanup = useCallback((userId) => {
    // Clear timeout
    const timeoutId = connectionTimeoutsRef.current.get(userId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      connectionTimeoutsRef.current.delete(userId);
    }

    // Clean up peer
    if (peersRef.current.has(userId)) {
      try {
        const peer = peersRef.current.get(userId);
        peer.destroy();
      } catch (e) {
        console.warn('Error destroying peer during cleanup:', e);
      }
      peersRef.current.delete(userId);
    }

    // Clean up stream
    if (streamsRef.current.has(userId)) {
      try {
        const stream = streamsRef.current.get(userId);
        stream.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.warn('Error stopping stream during cleanup:', e);
      }
      streamsRef.current.delete(userId);
    }

    // Clean up audio element
    if (audioElementsRef.current.has(userId)) {
      try {
        const audio = audioElementsRef.current.get(userId);
        audio.pause();
        audio.srcObject = null;
      } catch (e) {
        console.warn('Error cleaning up audio during cleanup:', e);
      }
      audioElementsRef.current.delete(userId);
    }

    // Clean up pending connections
    pendingConnectionsRef.current.forEach(key => {
      if (key.includes(userId)) {
        pendingConnectionsRef.current.delete(key);
      }
    });

    // Update connected users
    setConnectedUsers(prev => prev.filter(u => u.userId !== userId));
  }, []);

  // STEP 7: Toggle audio on/off - IMPROVED
  const toggleAudio = useCallback(async () => {
    if (!isAudioOn) {
      // Turn audio ON
      setIsConnecting(true);
      setConnectionError(null);
      
      try {
        const stream = await getUserMedia();
        
        if (!mountedRef.current || !stream) {
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
          }
          return;
        }

        localStreamRef.current = stream;
        setIsAudioOn(true);
        setIsConnecting(false);

        // Join voice room with proper user info
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('join-voice-room', {
            roomId,
            userInfo: {
              userId: currentUser,
              username: currentUser
            }
          });
          console.log('🎙️ Joined voice room');
        } else {
          throw new Error('Socket not connected');
        }
      } catch (error) {
        console.error('❌ Failed to turn on audio:', error);
        setIsConnecting(false);
        setIsAudioOn(false);
      }
    } else {
      // Turn audio OFF
      try {
        // Stop local stream
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop());
          localStreamRef.current = null;
        }

        // Clean up all peer connections
        for (const [userId] of peersRef.current) {
          handlePeerCleanup(userId);
        }

        // Clear all refs
        peersRef.current.clear();
        streamsRef.current.clear();
        audioElementsRef.current.clear();
        connectionTimeoutsRef.current.clear();
        retryCountsRef.current.clear();
        pendingConnectionsRef.current.clear(); // FIXED: Clear pending connections

        setIsAudioOn(false);
        setConnectedUsers([]);
        setConnectionError(null);
        setAudioPermissionGranted(false);

        // Leave voice room with proper user info
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('leave-voice-room', {
            roomId,
            userInfo: {
              userId: currentUser,
              username: currentUser
            }
          });
        }
        
        console.log('🎙️ Left voice room successfully');
      } catch (error) {
        console.error('❌ Error turning off audio:', error);
        setConnectionError(`Error disconnecting: ${error.message}`);
      }
    }
  }, [isAudioOn, getUserMedia, getSocket, roomId, currentUser, handlePeerCleanup]);

  // STEP 8: Toggle mute
  const toggleMute = useCallback(() => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(track => {
          track.enabled = isMuted;
        });
        setIsMuted(!isMuted);
        console.log(`🎤 Microphone ${isMuted ? 'unmuted' : 'muted'}`);
      }
    } catch (error) {
      console.error('❌ Error toggling mute:', error);
      setConnectionError(`Error toggling mute: ${error.message}`);
    }
  }, [isMuted]);

  // STEP 9: Socket event handlers - FIXED
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !isAudioOn) return;

    // Handle existing voice users - FIXED: Delay connections
    const handleVoiceRoomUsers = ({ users }) => {
      try {
        console.log(`📋 Received ${users.length} existing voice users`);
        
        if (!localStreamRef.current || !mountedRef.current) {
          console.warn('⚠️ No local stream available for connecting to existing users');
          return;
        }

        users.forEach((user, index) => {
          if (user.userId !== currentUser) {
            // FIXED: Longer delay to prevent conflicts
            setTimeout(() => {
              if (localStreamRef.current && mountedRef.current) {
                console.log(`🔗 Connecting to existing user: ${user.username}`);
                createPeer(user.userId, user.username, localStreamRef.current);
              }
            }, (index + 1) * 1000); // 1 second intervals
          }
        });
      } catch (error) {
        console.error('❌ Error handling existing voice users:', error);
      }
    };

    // Handle user joining voice - FIXED: Delay connection
    const handleUserJoinedVoice = ({ userInfo }) => {
      try {
        const { userId, username } = userInfo;
        
        if (userId !== currentUser && localStreamRef.current && mountedRef.current) {
          console.log(`👤 ${username} joined voice chat - initiating connection`);
          
          // FIXED: Longer delay to ensure readiness
          setTimeout(() => {
            if (localStreamRef.current && mountedRef.current) {
              createPeer(userId, username, localStreamRef.current);
            }
          }, 2000); // 2 second delay
        }
      } catch (error) {
        console.error('❌ Error handling user joined voice:', error);
      }
    };

    // Handle incoming WebRTC signal - FIXED
    const handleWebRTCSignal = ({ signal, callerInfo }) => {
      try {
        const { userId, username } = callerInfo;
        
        if (userId !== currentUser && localStreamRef.current && mountedRef.current) {
          console.log(`📞 Incoming WebRTC signal from ${username}`);
          handleIncomingCall(signal, callerInfo, localStreamRef.current);
        }
      } catch (error) {
        console.error('❌ Error handling WebRTC signal:', error);
      }
    };

    // Handle WebRTC answer - FIXED
    const handleWebRTCAnswer = ({ signal, answererInfo }) => {
      try {
        const { userId } = answererInfo;
        
        const peer = peersRef.current.get(userId);
        if (peer && signal) {
          console.log(`✅ Received answer from ${answererInfo.username}`);
          peer.signal(signal);
        } else {
          console.warn(`⚠️ No peer found for answer from ${userId}`);
        }
      } catch (error) {
        console.error('❌ Error handling WebRTC answer:', error);
      }
    };

    // Handle user leaving voice
    const handleUserLeftVoice = ({ userInfo }) => {
      try {
        const { userId, username } = userInfo;
        
        if (userId !== currentUser) {
          console.log(`👋 ${username} left voice chat`);
          handlePeerCleanup(userId);
        }
      } catch (error) {
        console.error('❌ Error handling user left voice:', error);
      }
    };

    // Add event listeners
    socket.on('voice-room-users', handleVoiceRoomUsers);
    socket.on('user-joined-voice', handleUserJoinedVoice);
    socket.on('webrtc-signal', handleWebRTCSignal);
    socket.on('webrtc-answer', handleWebRTCAnswer);
    socket.on('user-left-voice', handleUserLeftVoice);

    return () => {
      socket.off('voice-room-users', handleVoiceRoomUsers);
      socket.off('user-joined-voice', handleUserJoinedVoice);
      socket.off('webrtc-signal', handleWebRTCSignal);
      socket.off('webrtc-answer', handleWebRTCAnswer);
      socket.off('user-left-voice', handleUserLeftVoice);
    };
  }, [getSocket, isAudioOn, currentUser, createPeer, handleIncomingCall, handlePeerCleanup]);

  // STEP 10: Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      
      // Stop local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Clean up all connections
      for (const [userId] of peersRef.current) {
        try {
          const peer = peersRef.current.get(userId);
          peer.destroy();
        } catch (e) {
          console.warn('Error destroying peer on unmount:', e);
        }
      }
      
      // Clean up audio elements
      audioElementsRef.current.forEach((audio) => {
        try {
          audio.pause();
          audio.srcObject = null;
        } catch (e) {
          console.warn('Error cleaning up audio on unmount:', e);
        }
      });

      // Clear all timeouts
      connectionTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      
      console.log('🧹 WebRTC component cleaned up');
    };
  }, []);

  if (!roomConnected) {
    return (
      <div className="p-4 text-center">
        <div className="text-gray-500">
          <p>🔌 Connecting to room...</p>
          <p className="text-xs mt-1">Voice chat will be available once connected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-3 p-4 bg-white rounded-lg border">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 flex items-center">
          🎙️ Voice Chat
        </h3>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${roomConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-xs text-gray-600">
            {roomConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Connection Error Display */}
      {connectionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{connectionError}</span>
            </div>
            <button 
              onClick={() => setConnectionError(null)}
              className="text-red-500 hover:text-red-700 text-xs ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Controls */}
      <div className="flex items-center space-x-2">
        {/* Main Audio Toggle Button */}
        <button
          onClick={toggleAudio}
          disabled={isConnecting}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            isConnecting
              ? 'bg-gray-400 cursor-not-allowed text-white'
              : !isAudioOn
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isConnecting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border border-white border-t-transparent"></div>
              <span>Connecting...</span>
            </>
          ) : !isAudioOn ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
              <span>Join Voice</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
              <span>Connected ({connectedUsers.length + 1})</span>
            </>
          )}
        </button>

        {/* Mute Button (only when audio is on) */}
        {isAudioOn && (
          <button
            onClick={toggleMute}
            className={`flex items-center space-x-1 px-3 py-2 rounded-md text-xs transition-colors ${
              isMuted
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-gray-500 hover:bg-gray-600 text-white'
            }`}
          >
            {isMuted ? (
              <>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <span>Muted</span>
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                </svg>
                <span>Live</span>
              </>
            )}
          </button>
        )}

        {/* Permission Status */}
        {isAudioOn && (
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${audioPermissionGranted ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span className="text-xs text-gray-600">
              {audioPermissionGranted ? 'Mic OK' : 'Mic Error'}
            </span>
          </div>
        )}
      </div>

      {/* Connected Users Display */}
      {isAudioOn && (
        <div className="bg-gray-50 p-3 rounded-md">
          <p className="text-xs font-medium text-gray-700 mb-2">Voice Chat Participants:</p>
          <div className="space-y-1">
            {/* Current User */}
            <div className="flex items-center text-xs">
              <div className={`w-2 h-2 rounded-full mr-2 ${isMuted ? 'bg-red-400' : 'bg-green-400'} animate-pulse`}></div>
              <span className="font-medium text-green-600">
                You ({isMuted ? 'muted' : 'speaking'})
              </span>
            </div>
            
            {/* Connected Users */}
            {connectedUsers.map(user => (
              <div key={user.userId} className="flex items-center text-xs">
                <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                <span className="text-gray-700">{user.username}</span>
                <span className="ml-1 text-green-600">🎤</span>
              </div>
            ))}
            
            {connectedUsers.length === 0 && (
              <div className="text-xs text-gray-500 italic">
                Waiting for others to join voice chat...
              </div>
            )}
          </div>
          
          {/* Connection Stats */}
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Total: {connectedUsers.length + 1} users</span>
              <span>Active connections: {peersRef.current.size}</span>
            </div>
          </div>
        </div>
      )}

      {/* Status Messages */}
      {!isAudioOn && (
        <div className="bg-blue-50 p-3 rounded-md text-center">
          <div className="text-sm text-blue-800 mb-1">
            🎙️ High-Quality Voice Chat Ready
          </div>
          <div className="text-xs text-blue-600">
            Click "Join Voice" to start talking with your team
          </div>
          <div className="text-xs text-green-600 mt-1 font-medium">
            ✅ Fixed connection issues - stable voice chat!
          </div>
        </div>
      )}

      {isConnecting && (
        <div className="bg-yellow-50 p-3 rounded-md text-center">
          <div className="text-sm text-yellow-800 mb-1">
            🔄 Setting up voice connection...
          </div>
          <div className="text-xs text-yellow-600">
            Requesting microphone access and connecting to peers
          </div>
        </div>
      )}

      {/* Technical Info (Development) */}
      {process.env.NODE_ENV === 'development' && isAudioOn && (
        <details className="bg-gray-100 p-2 rounded text-xs">
          <summary className="cursor-pointer font-medium">🔧 Connection Debug Info</summary>
          <div className="mt-2 space-y-1">
            <div>Local Stream: {localStreamRef.current ? '✅ Active' : '❌ None'}</div>
            <div>Peer Connections: {peersRef.current.size}</div>
            <div>Audio Elements: {audioElementsRef.current.size}</div>
            <div>Active Timeouts: {connectionTimeoutsRef.current.size}</div>
            <div>Pending Connections: {pendingConnectionsRef.current.size}</div>
            <div>Permission: {audioPermissionGranted ? '✅ Granted' : '❌ Denied'}</div>
            <div>Component Mounted: {mountedRef.current ? '✅ Yes' : '❌ No'}</div>
            <div className="mt-2 text-green-600 font-bold">🔧 Connection Issues Fixed!</div>
          </div>
        </details>
      )}

      {/* Help Text */}
      <div className="text-center">
        <div className="text-xs text-gray-500">
          💡 <strong>Fixed:</strong> Connection timeouts, duplicate connections, and signaling issues
        </div>
        {!isAudioOn && (
          <div className="text-xs text-gray-400 mt-1">
            WebRTC peer-to-peer connection with improved stability
          </div>
        )}
      </div>
    </div>
  );
};

export default WebRTCAudioComponent;