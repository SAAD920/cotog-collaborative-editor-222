// src/components/WebRTCAudioComponent.js - FIXED VERSION WITH PROPER RESOURCE MANAGEMENT
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'simple-peer';
import { useRoom } from '@/contexts/RoomContext';

// ============================================================================
// WEBRTC VOICE CHAT COMPONENT - FIXED MEMORY MANAGEMENT
// ============================================================================
const WebRTCVoiceChat = ({ roomId, user, onUserCountChange }) => {
  const [peers, setPeers] = useState({});
  const [stream, setStream] = useState(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [volume, setVolume] = useState(50);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [error, setError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [speakingUsers, setSpeakingUsers] = useState(new Set());

  const peersRef = useRef({});
  const streamRef = useRef(null);
  const speakingTimeoutRef = useRef({});

  // 🆕 FIXED: Enhanced resource tracking with cleanup state
  const resourcesRef = useRef({
    audioContext: null,
    mediaStream: null,
    analyser: null,
    isCleaningUp: false,
    animationFrameId: null
  });

  const { getSocket, isConnected: roomConnected } = useRoom();

  // 🆕 FIXED: Safe AudioContext management with proper state checking
  const setupSpeakingDetection = useCallback((mediaStream) => {
    try {
      // Don't create if already cleaning up
      if (resourcesRef.current.isCleaningUp) {
        console.log('🚫 Skipping audio setup - component is cleaning up');
        return;
      }
      
      // Close existing context first
      if (resourcesRef.current.audioContext && 
          resourcesRef.current.audioContext.state !== 'closed') {
        console.log('🔄 Closing existing AudioContext before creating new one');
        resourcesRef.current.audioContext.close().catch(console.warn);
      }
      
      // Create new context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      
      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyser);
      
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      // Store references safely
      resourcesRef.current.audioContext = audioContext;
      resourcesRef.current.analyser = analyser;
      
      const checkSpeaking = () => {
        // Exit early if cleaning up or context is closed
        if (resourcesRef.current.isCleaningUp || 
            !resourcesRef.current.analyser ||
            !audioContext ||
            audioContext.state === 'closed') {
          console.log('🛑 Stopping speaking detection - context closed or cleaning up');
          return;
        }
        
        try {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
          const normalizedLevel = (average / 128) * 100;
          
          const isSpeaking = normalizedLevel > 5 && !isMuted;
          
          if (isSpeaking) {
            setSpeakingUsers(prev => new Set([...prev, user.username]));
            
            // Clear previous timeout
            if (speakingTimeoutRef.current[user.username]) {
              clearTimeout(speakingTimeoutRef.current[user.username]);
            }
            
            // Set timeout to stop speaking indication
            speakingTimeoutRef.current[user.username] = setTimeout(() => {
              setSpeakingUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(user.username);
                return newSet;
              });
            }, 500);
          }
          
          // Continue checking if not cleaning up and stream still exists
          if (!resourcesRef.current.isCleaningUp && 
              resourcesRef.current.mediaStream &&
              resourcesRef.current.mediaStream.active) {
            resourcesRef.current.animationFrameId = requestAnimationFrame(checkSpeaking);
          }
        } catch (error) {
          console.error('🚨 Speaking detection error:', error);
          // Don't continue on error
        }
      };
      
      // Start the detection loop
      resourcesRef.current.animationFrameId = requestAnimationFrame(checkSpeaking);
      console.log('✅ Speaking detection initialized successfully');
      
    } catch (error) {
      console.error('❌ Speaking detection setup failed:', error);
    }
  }, [isMuted, user.username]);

  // 🆕 FIXED: Initialize audio stream with proper resource tracking
  const initializeAudioStream = useCallback(async () => {
    try {
      setIsConnecting(true);
      setError('');

      // Don't proceed if already cleaning up
      if (resourcesRef.current.isCleaningUp) {
        console.log('🚫 Skipping audio initialization - component is cleaning up');
        throw new Error('Component is cleaning up');
      }

      console.log('🎤 Requesting microphone access...');
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });

      // Check again after async operation
      if (resourcesRef.current.isCleaningUp) {
        console.log('🚫 Component cleaned up during initialization - stopping stream');
        mediaStream.getTracks().forEach(track => track.stop());
        throw new Error('Component was cleaned up during initialization');
      }

      // Store stream references
      setStream(mediaStream);
      streamRef.current = mediaStream;
      resourcesRef.current.mediaStream = mediaStream;
      
      // Initially mute the stream
      mediaStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });

      // Setup audio analysis for speaking detection
      setupSpeakingDetection(mediaStream);

      console.log('✅ Audio stream initialized successfully');
      return mediaStream;

    } catch (error) {
      console.error('❌ Failed to get audio stream:', error);
      
      // Set user-friendly error messages
      let errorMessage = 'Microphone access failed';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Microphone permission denied. Please allow microphone access and try again.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Microphone is being used by another application.';
      } else if (error.message !== 'Component is cleaning up' && error.message !== 'Component was cleaned up during initialization') {
        errorMessage = `Microphone error: ${error.message}`;
      }
      
      setError(errorMessage);
      setIsConnecting(false);
      throw error;
    }
  }, [isMuted, setupSpeakingDetection]);

  // 🆕 FIXED: Comprehensive cleanup function with proper error handling
  const handleLeaveVoice = useCallback(() => {
    console.log('👋 Starting comprehensive voice chat cleanup...');
    
    // Set cleanup flag immediately to prevent new operations
    resourcesRef.current.isCleaningUp = true;
    
    try {
      const socket = getSocket();
      
      // 1. Cancel any ongoing animation frames
      if (resourcesRef.current.animationFrameId) {
        cancelAnimationFrame(resourcesRef.current.animationFrameId);
        resourcesRef.current.animationFrameId = null;
      }
      
      // 2. Close all peer connections first (most important)
      console.log('🔗 Closing peer connections...');
      Object.values(peersRef.current).forEach(peer => {
        if (peer && typeof peer.destroy === 'function') {
          try {
            // Stop the peer's audio element
            if (peer.audioElement) {
              peer.audioElement.pause();
              peer.audioElement.srcObject = null;
              peer.audioElement = null;
            }
            peer.destroy();
          } catch (error) {
            console.warn('⚠️ Error destroying peer:', error);
          }
        }
      });
      
      // 3. Stop local media stream tracks
      console.log('🛑 Stopping media stream...');
      if (resourcesRef.current.mediaStream) {
        resourcesRef.current.mediaStream.getTracks().forEach(track => {
          try {
            track.stop();
            console.log(`✅ Stopped ${track.kind} track`);
          } catch (error) {
            console.warn('⚠️ Error stopping track:', error);
          }
        });
        resourcesRef.current.mediaStream = null;
      }
      
      // 4. Close audio context safely
      console.log('🔊 Closing AudioContext...');
      if (resourcesRef.current.audioContext) {
        const audioContext = resourcesRef.current.audioContext;
        if (audioContext.state !== 'closed') {
          audioContext.close()
            .then(() => console.log('✅ AudioContext closed successfully'))
            .catch(error => console.warn('⚠️ Error closing AudioContext:', error));
        } else {
          console.log('ℹ️ AudioContext was already closed');
        }
        resourcesRef.current.audioContext = null;
        resourcesRef.current.analyser = null;
      }
      
      // 5. Clear all timeouts
      console.log('⏰ Clearing timeouts...');
      Object.values(speakingTimeoutRef.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
      speakingTimeoutRef.current = {};
      
      // 6. Notify server we're leaving
      if (socket && socket.connected) {
        console.log('📡 Notifying server...');
        socket.emit('leave-voice-room', {
          roomId,
          userId: user.id
        });
      }

      // 7. Reset all component state
      console.log('🔄 Resetting component state...');
      setPeers({});
      peersRef.current = {};
      setStream(null);
      streamRef.current = null;
      setIsConnected(false);
      setConnectedUsers([]);
      setSpeakingUsers(new Set());
      setError('');
      setIsConnecting(false);
      
      console.log('✅ Voice chat cleanup completed successfully');

    } catch (error) {
      console.error('❌ Error during voice chat cleanup:', error);
      // Even if cleanup fails, reset the state
      setPeers({});
      peersRef.current = {};
      setStream(null);
      streamRef.current = null;
      setIsConnected(false);
      setConnectedUsers([]);
      setSpeakingUsers(new Set());
    } finally {
      // Reset cleanup flag after a brief delay to allow any pending operations to complete
      setTimeout(() => {
        resourcesRef.current.isCleaningUp = false;
      }, 100);
    }
  }, [roomId, user.id, getSocket]);

  // Join voice chat
  const handleJoinVoice = useCallback(async () => {
    try {
      const socket = getSocket();
      if (!socket || !roomConnected) {
        setError('Room connection required');
        return;
      }

      console.log('🎙️ Joining voice chat...');
      const mediaStream = await initializeAudioStream();
      
      // Join the voice room
      socket.emit('join-voice-room', {
        roomId,
        userId: user.id,
        username: user.username
      });

      setIsConnected(true);
      setIsConnecting(false);
      
      console.log('✅ Successfully joined voice chat room');

    } catch (error) {
      console.error('❌ Failed to join voice chat:', error);
      setIsConnecting(false);
      // Error message is already set by initializeAudioStream
    }
  }, [roomId, user, initializeAudioStream, getSocket, roomConnected]);

  // Toggle mute with proper error handling
  const handleToggleMute = useCallback(() => {
    try {
      if (resourcesRef.current.mediaStream && !resourcesRef.current.isCleaningUp) {
        const audioTracks = resourcesRef.current.mediaStream.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = isMuted; // Toggle the current state
        });
        setIsMuted(prev => {
          const newMutedState = !prev;
          console.log(`🎙️ ${newMutedState ? 'Muted' : 'Unmuted'} microphone`);
          return newMutedState;
        });
      } else {
        console.warn('⚠️ Cannot toggle mute - no active stream');
        setError('No active audio stream');
      }
    } catch (error) {
      console.error('❌ Error toggling mute:', error);
      setError('Failed to toggle microphone');
    }
  }, [isMuted]);

  // Create peer connection with enhanced error handling
  const createPeer = useCallback((userToCall, callerID, stream) => {
    try {
      console.log(`📞 Creating peer connection to call ${userToCall}`);
      
      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: stream,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      peer.on('signal', signal => {
        const socket = getSocket();
        if (socket && socket.connected) {
          console.log(`📡 Sending signal to ${userToCall}`);
          socket.emit('sending-signal', { 
            userToCall, 
            callerID, 
            signal,
            roomId
          });
        }
      });

      peer.on('stream', remoteStream => {
        console.log(`🔊 Received stream from user ${userToCall}`);
        
        try {
          // Create audio element and play
          const audio = new Audio();
          audio.srcObject = remoteStream;
          audio.volume = volume / 100;
          audio.autoplay = true;
          
          // Store audio element for volume control
          peer.audioElement = audio;
          
          // Handle audio play promise (required by some browsers)
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.warn('Audio autoplay failed:', error);
              // User interaction required for autoplay
            });
          }
        } catch (error) {
          console.error('Error setting up remote audio:', error);
        }
      });

      peer.on('error', err => {
        console.error(`❌ Peer connection error with ${userToCall}:`, err);
        // Clean up this specific peer
        if (peersRef.current[userToCall] === peer) {
          delete peersRef.current[userToCall];
          setPeers(prev => {
            const newPeers = { ...prev };
            delete newPeers[userToCall];
            return newPeers;
          });
        }
      });

      peer.on('close', () => {
        console.log(`🔗 Peer connection closed for user ${userToCall}`);
        // Clean up audio element
        if (peer.audioElement) {
          peer.audioElement.pause();
          peer.audioElement.srcObject = null;
        }
      });

      return peer;
    } catch (error) {
      console.error('Error creating peer:', error);
      return null;
    }
  }, [getSocket, roomId, volume]);

  // Add peer (when someone calls us)
  const addPeer = useCallback((incomingSignal, callerID, stream) => {
    try {
      console.log(`📞 Adding peer for incoming call from ${callerID}`);
      
      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: stream,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      peer.on('signal', signal => {
        const socket = getSocket();
        if (socket && socket.connected) {
          console.log(`📡 Returning signal to ${callerID}`);
          socket.emit('returning-signal', { 
            signal, 
            callerID,
            roomId
          });
        }
      });

      peer.on('stream', remoteStream => {
        console.log(`🔊 Received stream from caller ${callerID}`);
        
        try {
          // Create audio element and play
          const audio = new Audio();
          audio.srcObject = remoteStream;
          audio.volume = volume / 100;
          audio.autoplay = true;
          
          // Store audio element for volume control
          peer.audioElement = audio;
          
          // Handle audio play promise
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(error => {
              console.warn('Audio autoplay failed:', error);
            });
          }
        } catch (error) {
          console.error('Error setting up remote audio:', error);
        }
      });

      peer.on('error', err => {
        console.error(`❌ Peer connection error with ${callerID}:`, err);
        // Clean up this specific peer
        if (peersRef.current[callerID] === peer) {
          delete peersRef.current[callerID];
          setPeers(prev => {
            const newPeers = { ...prev };
            delete newPeers[callerID];
            return newPeers;
          });
        }
      });

      peer.on('close', () => {
        console.log(`🔗 Peer connection closed for caller ${callerID}`);
        // Clean up audio element
        if (peer.audioElement) {
          peer.audioElement.pause();
          peer.audioElement.srcObject = null;
        }
      });

      try {
        peer.signal(incomingSignal);
      } catch (error) {
        console.error('Error signaling peer:', error);
        peer.destroy();
        return null;
      }

      return peer;
    } catch (error) {
      console.error('Error adding peer:', error);
      return null;
    }
  }, [getSocket, roomId, volume]);

  // Socket event handlers with enhanced error handling
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // When a new user joins voice chat
    const handleUserJoinedVoice = ({ userId, username, signal }) => {
      console.log(`👤 User ${username} joined voice chat`);
      
      if (resourcesRef.current.mediaStream && userId !== user.id && !resourcesRef.current.isCleaningUp) {
        try {
          const peer = addPeer(signal, userId, resourcesRef.current.mediaStream);
          if (peer) {
            peersRef.current[userId] = peer;
            setPeers(prev => ({ ...prev, [userId]: peer }));
            setConnectedUsers(prev => [...prev.filter(u => u.id !== userId), { id: userId, username }]);
          }
        } catch (error) {
          console.error('Error handling user joined voice:', error);
        }
      }
    };

    // When receiving a call signal
    const handleReceivingSignal = ({ signal, id }) => {
      console.log(`📞 Receiving signal from user ${id}`);
      
      try {
        if (peersRef.current[id]) {
          peersRef.current[id].signal(signal);
        } else {
          console.warn(`No peer found for user ${id}`);
        }
      } catch (error) {
        console.error('Error handling signal:', error);
      }
    };

    // When someone wants to call us
    const handleUserCalling = ({ signal, from, username }) => {
      console.log(`📞 Incoming call from ${username}`);
      
      if (resourcesRef.current.mediaStream && from !== user.id && !resourcesRef.current.isCleaningUp) {
        try {
          const peer = addPeer(signal, from, resourcesRef.current.mediaStream);
          if (peer) {
            peersRef.current[from] = peer;
            setPeers(prev => ({ ...prev, [from]: peer }));
            setConnectedUsers(prev => [...prev.filter(u => u.id !== from), { id: from, username }]);
          }
        } catch (error) {
          console.error('Error handling incoming call:', error);
        }
      }
    };

    // When a user leaves voice chat
    const handleUserLeftVoice = ({ userId, username }) => {
      console.log(`👋 User ${username} left voice chat`);
      
      try {
        if (peersRef.current[userId]) {
          const peer = peersRef.current[userId];
          if (peer.audioElement) {
            peer.audioElement.pause();
            peer.audioElement.srcObject = null;
          }
          peer.destroy();
          delete peersRef.current[userId];
        }
        
        setPeers(prev => {
          const newPeers = { ...prev };
          delete newPeers[userId];
          return newPeers;
        });
        
        setConnectedUsers(prev => prev.filter(u => u.id !== userId));
        setSpeakingUsers(prev => {
          const newSet = new Set(prev);
          newSet.delete(username);
          return newSet;
        });
      } catch (error) {
        console.error('Error handling user left voice:', error);
      }
    };

    // When room users update, call new users
    const handleVoiceRoomUsers = ({ users: voiceUsers }) => {
      console.log('🔄 Voice room users updated:', voiceUsers);
      
      if (resourcesRef.current.mediaStream && isConnected && !resourcesRef.current.isCleaningUp) {
        voiceUsers.forEach(voiceUser => {
          if (voiceUser.userId !== user.id && !peersRef.current[voiceUser.userId]) {
            console.log(`📞 Calling user ${voiceUser.username}`);
            
            try {
              const peer = createPeer(voiceUser.userId, user.id, resourcesRef.current.mediaStream);
              if (peer) {
                peersRef.current[voiceUser.userId] = peer;
                setPeers(prev => ({ ...prev, [voiceUser.userId]: peer }));
                setConnectedUsers(prev => [...prev.filter(u => u.id !== voiceUser.userId), voiceUser]);
              }
            } catch (error) {
              console.error('Error calling user:', error);
            }
          }
        });
      }
    };

    // Register event handlers
    socket.on('user-joined-voice', handleUserJoinedVoice);
    socket.on('receiving-returned-signal', handleReceivingSignal);
    socket.on('user-calling', handleUserCalling);
    socket.on('user-left-voice', handleUserLeftVoice);
    socket.on('voice-room-users', handleVoiceRoomUsers);

    // Cleanup function
    return () => {
      socket.off('user-joined-voice', handleUserJoinedVoice);
      socket.off('receiving-returned-signal', handleReceivingSignal);
      socket.off('user-calling', handleUserCalling);
      socket.off('user-left-voice', handleUserLeftVoice);
      socket.off('voice-room-users', handleVoiceRoomUsers);
    };
  }, [getSocket, user.id, user.username, isConnected, createPeer, addPeer]);

  // Update volume for all audio elements
  useEffect(() => {
    try {
      Object.values(peersRef.current).forEach(peer => {
        if (peer && peer.audioElement) {
          peer.audioElement.volume = volume / 100;
        }
      });
    } catch (error) {
      console.error('Error updating volume:', error);
    }
  }, [volume]);

  // Update user count
  useEffect(() => {
    const totalUsers = connectedUsers.length + (isConnected ? 1 : 0);
    onUserCountChange?.(totalUsers);
  }, [connectedUsers.length, isConnected, onUserCountChange]);

  // 🆕 ENHANCED: Cleanup on unmount with error handling
  useEffect(() => {
    return () => {
      console.log('🧹 WebRTCVoiceChat component unmounting - initiating cleanup');
      handleLeaveVoice();
    };
  }, [handleLeaveVoice]);

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="text-center">
        <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs ${
          isConnected ? 'bg-green-100 text-green-700' : 
          isConnecting ? 'bg-yellow-100 text-yellow-700' :
          error ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-600'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500' : 
            isConnecting ? 'bg-yellow-500 animate-pulse' :
            error ? 'bg-red-500' :
            'bg-gray-400'
          }`}></div>
          <span>
            {isConnected ? 'Connected to Voice Chat' :
             isConnecting ? 'Connecting...' :
             error ? 'Connection Failed' :
             'Ready to Connect'
            }
          </span>
        </div>
      </div>

      {/* Voice Chat Users */}
      <div className="bg-blue-50 rounded-lg p-3">
        <div className="text-sm font-medium text-blue-800 mb-2 flex items-center justify-between">
          <span>🎙️ Voice Chat</span>
          <span className="text-blue-600">
            {connectedUsers.length + (isConnected ? 1 : 0)} connected
          </span>
        </div>
        
        <div className="space-y-2">
          {/* Local User */}
          {isConnected && (
            <div className="flex items-center justify-between bg-white p-2 rounded border border-blue-200">
              <div className="flex items-center space-x-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold relative ${
                  speakingUsers.has(user.username) ? 'bg-green-500' :
                  isMuted ? 'bg-red-500' : 'bg-blue-500'
                }`}>
                  {user.username?.charAt(0).toUpperCase()}
                  
                  {/* Speaking indicator */}
                  {speakingUsers.has(user.username) && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  )}
                </div>
                <span className="text-sm font-medium text-green-600">
                  {user.username} (You)
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-xs text-gray-500">
                  {speakingUsers.has(user.username) ? '🎙️ Speaking' :
                   isMuted ? '🔇 Muted' : '🎙️ Live'}
                </span>
              </div>
            </div>
          )}

          {/* Remote Users */}
          {connectedUsers.map((connectedUser) => (
            <div key={connectedUser.id} className="flex items-center justify-between bg-white p-2 rounded border border-blue-200">
              <div className="flex items-center space-x-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold relative ${
                  speakingUsers.has(connectedUser.username) ? 'bg-green-500' : 'bg-blue-500'
                }`}>
                  {connectedUser.username?.charAt(0).toUpperCase()}
                  
                  {/* Speaking indicator */}
                  {speakingUsers.has(connectedUser.username) && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                  )}
                </div>
                <span className="text-sm font-medium text-blue-600">
                  {connectedUser.username}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-xs text-gray-500">
                  {speakingUsers.has(connectedUser.username) ? '🎙️ Speaking' : '🔗 Connected'}
                </span>
              </div>
            </div>
          ))}

          {/* No users message */}
          {!isConnected && connectedUsers.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-4">
              No one in voice chat yet
            </div>
          )}
        </div>
      </div>

      {/* Audio Controls */}
      <div className="space-y-3">
        {/* Main Control Button */}
        {!isConnected ? (
          <button
            onClick={handleJoinVoice}
            disabled={isConnecting || !roomConnected}
            className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
              isConnecting || !roomConnected
                ? 'bg-gray-400 cursor-not-allowed text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isConnecting ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Connecting...</span>
              </div>
            ) : !roomConnected ? (
              'Room Connection Required'
            ) : (
              '🎙️ Join Voice Chat'
            )}
          </button>
        ) : (
          <div className="space-y-2">
            {/* Mute/Unmute */}
            <button
              onClick={handleToggleMute}
              className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                isMuted
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              {isMuted ? '🔇 Unmute Microphone' : '🎙️ Mute Microphone'}
            </button>

            {/* Leave Voice Chat */}
            <button
              onClick={handleLeaveVoice}
              className="w-full py-2 px-4 rounded-lg font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              📞 Leave Voice Chat
            </button>
          </div>
        )}

        {/* Volume Control */}
        {isConnected && (
          <div className="bg-gray-50 p-3 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🔊 Audio Volume: {volume}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => setVolume(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="text-sm text-red-800">
            <div className="flex items-center space-x-1 mb-1">
              <span>⚠️</span>
              <span className="font-medium">Voice Chat Error:</span>
            </div>
            <p>{error}</p>
            {error.includes('permission') && (
              <div className="mt-2 text-xs text-red-600">
                <p>To enable voice chat:</p>
                <ol className="list-decimal list-inside mt-1 space-y-1">
                  <li>Click the microphone icon in your browser's address bar</li>
                  <li>Select "Allow" for microphone access</li>
                  <li>Refresh the page and try again</li>
                </ol>
              </div>
            )}
            <button
              onClick={() => setError('')}
              className="mt-2 text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Debug Info (Development Only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <details className="text-sm">
            <summary className="font-medium text-yellow-800 cursor-pointer">🐛 WebRTC Debug</summary>
            <div className="mt-2 space-y-1 text-yellow-700 text-xs">
              <div>Room ID: {roomId}</div>
              <div>User ID: {user.id}</div>
              <div>Connected: {isConnected.toString()}</div>
              <div>Peers: {Object.keys(peers).length}</div>
              <div>Connected Users: {connectedUsers.length}</div>
              <div>Muted: {isMuted.toString()}</div>
              <div>Speaking Users: {Array.from(speakingUsers).join(', ')}</div>
              <div>Stream Active: {resourcesRef.current.mediaStream?.active?.toString() || 'false'}</div>
              <div>AudioContext State: {resourcesRef.current.audioContext?.state || 'none'}</div>
              <div>Is Cleaning Up: {resourcesRef.current.isCleaningUp.toString()}</div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN WEBRTC AUDIO COMPONENT WITH PERMISSION SYSTEM
// ============================================================================
const WebRTCAudioComponent = () => {
  const { 
    currentUser,
    users,
    isConnected,
    roomId,
    isRoomOwner,
    isRoomModerator,
    sendAudioPermissionRequest,
    sendAudioPermissionResponse,
    audioPermissions,
    pendingAudioRequests
  } = useRoom();

  const [showPermissionPanel, setShowPermissionPanel] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [voiceChatUsers, setVoiceChatUsers] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState('');

  // Check if current user has audio permission
  const hasAudioPermission = () => {
    return isRoomOwner() || 
           isRoomModerator() || 
           audioPermissions?.[currentUser];
  };

  // Handle audio permission request
  const handleRequestPermission = () => {
    setIsRequestingPermission(true);
    sendAudioPermissionRequest();
    
    // Show requesting status
    setPermissionStatus('🔄 Permission request sent...');
    
    // Clear status after 5 seconds if no response
    setTimeout(() => {
      if (isRequestingPermission) {
        setPermissionStatus('⏳ Still waiting for response...');
      }
    }, 5000);
    
    // Clear completely after 10 seconds
    setTimeout(() => {
      setPermissionStatus('');
    }, 10000);
  };

  // Handle permission response (owner/moderator only)
  const handlePermissionResponse = (username, granted) => {
    sendAudioPermissionResponse(username, granted);
    
    // Show feedback for the action
    const action = granted ? 'granted' : 'denied';
    setPermissionStatus(`✅ Permission ${action} for ${username}`);
    
    // Clear status after 3 seconds
    setTimeout(() => {
      setPermissionStatus('');
    }, 3000);
  };

  // Handle voice chat user count update
  const handleVoiceUserCountChange = (count) => {
    setVoiceChatUsers(count);
  };

  // Listen for permission responses from the room context
  useEffect(() => {
    // Reset requesting state when permission is granted/denied
    if (hasAudioPermission() && isRequestingPermission) {
      setIsRequestingPermission(false);
      setPermissionStatus('✅ Permission granted! You can now use voice chat.');
      setTimeout(() => {
        setPermissionStatus('');
      }, 3000);
    }
  }, [audioPermissions, currentUser, isRequestingPermission, hasAudioPermission]);

  // Auto-close permission panel when no pending requests
  useEffect(() => {
    if (pendingAudioRequests?.length === 0 && showPermissionPanel) {
      setTimeout(() => {
        setShowPermissionPanel(false);
      }, 1000);
    }
  }, [pendingAudioRequests?.length, showPermissionPanel]);

  return (
    <div className="h-full bg-white flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 bg-gray-100 border-b border-gray-200 px-3 py-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center">
            🎵 Voice Chat
            <div className={`ml-auto w-2 h-2 rounded-full ${voiceChatUsers > 0 ? 'bg-green-500' : 'bg-gray-400'}`}></div>
          </h3>
          {(isRoomOwner() || isRoomModerator()) && pendingAudioRequests?.length > 0 && (
            <button
              onClick={() => setShowPermissionPanel(!showPermissionPanel)}
              className="text-xs bg-orange-500 text-white px-2 py-1 rounded-full hover:bg-orange-600 transition-colors animate-pulse"
            >
              {pendingAudioRequests.length} request{pendingAudioRequests.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Permission Panel (Owner/Moderator only) */}
      {showPermissionPanel && (isRoomOwner() || isRoomModerator()) && pendingAudioRequests?.length > 0 && (
        <div className="bg-orange-50 border-b border-orange-200 p-3">
          <div className="text-sm font-medium text-orange-800 mb-2 flex items-center justify-between">
            <span>🎤 Audio Permission Requests:</span>
            <button
              onClick={() => setShowPermissionPanel(false)}
              className="text-orange-600 hover:text-orange-800 text-xs"
            >
              ✕ Close
            </button>
          </div>
          <div className="space-y-2">
            {pendingAudioRequests?.map((request, index) => (
              <div key={`${request.username}-${request.timestamp}-${index}`} className="flex items-center justify-between bg-white p-2 rounded border border-orange-200">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {request.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium">{request.username}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(request.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => handlePermissionResponse(request.username, true)}
                    className="bg-green-500 hover:bg-green-600 text-white text-xs px-2 py-1 rounded transition-colors"
                  >
                    ✓ Allow
                  </button>
                  <button
                    onClick={() => handlePermissionResponse(request.username, false)}
                    className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded transition-colors"
                  >
                    ✗ Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Permission Status Notification */}
      {permissionStatus && (
        <div className="bg-blue-50 border-b border-blue-200 p-2">
          <div className="text-sm text-blue-800 text-center">
            {permissionStatus}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 p-3 overflow-y-auto">
        {/* Connection Check */}
        {!isConnected ? (
          <div className="text-center py-8">
            <div className="text-gray-500 mb-4">⚠️</div>
            <p className="text-sm text-gray-600">
              Please connect to the room first to use voice chat.
            </p>
          </div>
        ) : !hasAudioPermission() ? (
          /* Permission Request UI */
          <div className="text-center py-8">
            <div className="text-yellow-500 mb-4 text-4xl">🔒</div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Voice Chat Permission Required</h3>
            <p className="text-sm text-gray-600 mb-4">
              You need permission from the room owner to use voice chat.
            </p>
            
            {isRequestingPermission ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center justify-center space-x-2 text-yellow-700">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-yellow-600 border-t-transparent"></div>
                  <span className="text-sm">Permission request sent...</span>
                </div>
                <p className="text-xs text-yellow-600 mt-2">
                  Waiting for room owner approval
                </p>
              </div>
            ) : (
              <button
                onClick={handleRequestPermission}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                🎤 Request Voice Permission
              </button>
            )}

            {/* Show who can grant permission */}
            <div className="mt-4 text-xs text-gray-500">
              <p>Room owners and moderators can grant voice chat access</p>
              {(isRoomOwner() || isRoomModerator()) && (
                <p className="text-green-600 mt-1">You have permission management privileges</p>
              )}
            </div>
          </div>
        ) : (
          /* WebRTC Voice Chat Component */
          <WebRTCVoiceChat 
            roomId={roomId}
            user={{ id: currentUser, username: currentUser }}
            onUserCountChange={handleVoiceUserCountChange}
          />
        )}
      </div>

      {/* Footer Info */}
      <div className="flex-shrink-0 p-3 border-t border-gray-200">
        <div className="text-center text-xs text-gray-500">
          {hasAudioPermission() ? (
            <>🎙️ P2P voice chat via WebRTC</>
          ) : (
            <>🔒 Voice chat requires permission</>
          )}
          {pendingAudioRequests?.length > 0 && (isRoomOwner() || isRoomModerator()) && (
            <div className="mt-1 text-orange-600 font-medium">
              {pendingAudioRequests.length} pending request{pendingAudioRequests.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WebRTCAudioComponent;