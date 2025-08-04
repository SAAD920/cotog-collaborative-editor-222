// FILE 1: src/components/WebRTCAudioComponent.js - COMPLETE FIXED VERSION
// =============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'simple-peer';
import { useRoom } from '@/contexts/RoomContext';

// ============================================================================
// WEBRTC VOICE CHAT COMPONENT - FIXED WITH STABLE CONNECTIONS
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

  // FIXED: Enhanced refs with stability tracking
  const peersRef = useRef({});
  const streamRef = useRef(null);
  const speakingTimeoutRef = useRef({});
  const isStableConnectionRef = useRef(false); // Prevents premature cleanup
  const connectionTimeoutRef = useRef(null);

  const resourcesRef = useRef({
    audioContext: null,
    mediaStream: null,
    analyser: null,
    isCleaningUp: false,
    animationFrameId: null
  });

  const { getSocket, isConnected: roomConnected } = useRoom();

  // FIXED: Enhanced STUN/TURN server configuration
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ];

  // FIXED: Safe speaking detection with stability checks
  const setupSpeakingDetection = useCallback((mediaStream) => {
    try {
      if (resourcesRef.current.isCleaningUp || !isStableConnectionRef.current) {
        console.log('🚫 Skipping audio setup - not stable');
        return;
      }
      
      if (resourcesRef.current.audioContext && 
          resourcesRef.current.audioContext.state !== 'closed') {
        resourcesRef.current.audioContext.close().catch(console.warn);
      }
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyser);
      
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      resourcesRef.current.audioContext = audioContext;
      resourcesRef.current.analyser = analyser;
      
      const checkSpeaking = () => {
        if (resourcesRef.current.isCleaningUp || 
            !resourcesRef.current.analyser ||
            !isStableConnectionRef.current ||
            audioContext.state === 'closed') {
          return;
        }
        
        try {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
          const normalizedLevel = (average / 128) * 100;
          const isSpeaking = normalizedLevel > 5 && !isMuted;
          
          if (isSpeaking) {
            setSpeakingUsers(prev => new Set([...prev, user.username]));
            
            if (speakingTimeoutRef.current[user.username]) {
              clearTimeout(speakingTimeoutRef.current[user.username]);
            }
            
            speakingTimeoutRef.current[user.username] = setTimeout(() => {
              setSpeakingUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(user.username);
                return newSet;
              });
            }, 500);
          }
          
          if (isStableConnectionRef.current && resourcesRef.current.mediaStream?.active) {
            resourcesRef.current.animationFrameId = requestAnimationFrame(checkSpeaking);
          }
        } catch (error) {
          console.error('🚨 Speaking detection error:', error);
        }
      };
      
      resourcesRef.current.animationFrameId = requestAnimationFrame(checkSpeaking);
      console.log('✅ Speaking detection initialized successfully');
      
    } catch (error) {
      console.error('❌ Speaking detection setup failed:', error);
    }
  }, [isMuted, user.username]);

  // FIXED: Initialize audio with stability tracking
  const initializeAudioStream = useCallback(async () => {
    try {
      setIsConnecting(true);
      setError('');

      if (resourcesRef.current.isCleaningUp) {
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

      if (resourcesRef.current.isCleaningUp) {
        mediaStream.getTracks().forEach(track => track.stop());
        throw new Error('Component was cleaned up during initialization');
      }

      // FIXED: Set stability flag after successful stream creation
      isStableConnectionRef.current = true;

      setStream(mediaStream);
      streamRef.current = mediaStream;
      resourcesRef.current.mediaStream = mediaStream;
      
      mediaStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });

      setupSpeakingDetection(mediaStream);

      console.log('✅ Audio stream initialized successfully');
      return mediaStream;

    } catch (error) {
      console.error('❌ Failed to get audio stream:', error);
      
      let errorMessage = 'Microphone access failed';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Microphone permission denied. Please allow microphone access and try again.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Microphone is being used by another application.';
      } else if (!error.message.includes('cleaning up')) {
        errorMessage = `Microphone error: ${error.message}`;
      }
      
      setError(errorMessage);
      setIsConnecting(false);
      isStableConnectionRef.current = false;
      throw error;
    }
  }, [isMuted, setupSpeakingDetection]);

  // FIXED: Enhanced cleanup with stability tracking
  const handleLeaveVoice = useCallback(() => {
    console.log('👋 Starting comprehensive voice chat cleanup...');
    
    // Clear stability flag first
    isStableConnectionRef.current = false;
    resourcesRef.current.isCleaningUp = true;
    
    try {
      const socket = getSocket();
      
      // Clear connection timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      if (resourcesRef.current.animationFrameId) {
        cancelAnimationFrame(resourcesRef.current.animationFrameId);
        resourcesRef.current.animationFrameId = null;
      }
      
      console.log('🔗 Closing peer connections...');
      Object.values(peersRef.current).forEach(peer => {
        if (peer && typeof peer.destroy === 'function') {
          try {
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
      
      console.log('🔊 Closing AudioContext...');
      if (resourcesRef.current.audioContext) {
        const audioContext = resourcesRef.current.audioContext;
        if (audioContext.state !== 'closed') {
          audioContext.close()
            .then(() => console.log('✅ AudioContext closed successfully'))
            .catch(error => console.warn('⚠️ Error closing AudioContext:', error));
        }
        resourcesRef.current.audioContext = null;
        resourcesRef.current.analyser = null;
      }
      
      Object.values(speakingTimeoutRef.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
      speakingTimeoutRef.current = {};
      
      if (socket && socket.connected) {
        console.log('📡 Notifying server...');
        socket.emit('leave-voice-room', {
          roomId,
          userId: user.id
        });
      }

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
      // Reset state anyway
      setPeers({});
      peersRef.current = {};
      setStream(null);
      streamRef.current = null;
      setIsConnected(false);
      setConnectedUsers([]);
      setSpeakingUsers(new Set());
    } finally {
      setTimeout(() => {
        resourcesRef.current.isCleaningUp = false;
      }, 100);
    }
  }, [roomId, user.id, getSocket]);

  // FIXED: Enhanced join with stability timeout
  const handleJoinVoice = useCallback(async () => {
    try {
      const socket = getSocket();
      if (!socket || !roomConnected) {
        setError('Room connection required');
        return;
      }

      console.log('🎙️ Joining voice chat...');
      const mediaStream = await initializeAudioStream();
      
      // FIXED: Set connection timeout to ensure stability
      connectionTimeoutRef.current = setTimeout(() => {
        if (isStableConnectionRef.current) {
          setIsConnected(true);
          setIsConnecting(false);
          console.log('✅ Connection stabilized after timeout');
        }
      }, 2000);

      socket.emit('join-voice-room', {
        roomId,
        userId: user.id,
        username: user.username
      });

      console.log('✅ Successfully joined voice chat room');

    } catch (error) {
      console.error('❌ Failed to join voice chat:', error);
      setIsConnecting(false);
      isStableConnectionRef.current = false;
    }
  }, [roomId, user, initializeAudioStream, getSocket, roomConnected]);

  // FIXED: Enhanced peer creation with better error handling
  const createPeer = useCallback((userToCall, callerID, stream) => {
    try {
      console.log(`📞 Creating peer connection to call ${userToCall}`);
      
      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: stream,
        config: {
          iceServers: ICE_SERVERS,
          sdpSemantics: 'unified-plan'
        },
        offerOptions: {
          offerToReceiveAudio: true,
          offerToReceiveVideo: false
        }
      });

      peer.on('signal', signal => {
        const socket = getSocket();
        if (socket && socket.connected && isStableConnectionRef.current) {
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
          const audio = new Audio();
          audio.srcObject = remoteStream;
          audio.volume = volume / 100;
          audio.autoplay = true;
          audio.muted = false;
          
          peer.audioElement = audio;
          
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => console.log(`✅ Playing audio from ${userToCall}`))
              .catch(error => {
                console.warn('Audio autoplay failed, user interaction required:', error);
              });
          }
        } catch (error) {
          console.error('Error setting up remote audio:', error);
        }
      });

      peer.on('error', err => {
        console.error(`❌ Peer connection error with ${userToCall}:`, err);
        
        setTimeout(() => {
          if (peersRef.current[userToCall] === peer && isStableConnectionRef.current) {
            console.log(`🔄 Attempting to recreate peer connection with ${userToCall}`);
            delete peersRef.current[userToCall];
            setPeers(prev => {
              const newPeers = { ...prev };
              delete newPeers[userToCall];
              return newPeers;
            });
            
            setTimeout(() => {
              if (resourcesRef.current.mediaStream && isStableConnectionRef.current) {
                const newPeer = createPeer(userToCall, callerID, resourcesRef.current.mediaStream);
                if (newPeer) {
                  peersRef.current[userToCall] = newPeer;
                  setPeers(prev => ({ ...prev, [userToCall]: newPeer }));
                }
              }
            }, 1000);
          }
        }, 2000);
      });

      peer.on('close', () => {
        console.log(`🔗 Peer connection closed for user ${userToCall}`);
        if (peer.audioElement) {
          peer.audioElement.pause();
          peer.audioElement.srcObject = null;
        }
      });

      peer.on('connect', () => {
        console.log(`🔗 Peer connected to ${userToCall}`);
      });

      return peer;
    } catch (error) {
      console.error('Error creating peer:', error);
      return null;
    }
  }, [getSocket, roomId, volume]);

  // FIXED: Enhanced add peer with better error handling
  const addPeer = useCallback((incomingSignal, callerID, stream) => {
    try {
      console.log(`📞 Adding peer for incoming call from ${callerID}`);
      
      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: stream,
        config: {
          iceServers: ICE_SERVERS,
          sdpSemantics: 'unified-plan'
        }
      });

      peer.on('signal', signal => {
        const socket = getSocket();
        if (socket && socket.connected && isStableConnectionRef.current) {
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
          const audio = new Audio();
          audio.srcObject = remoteStream;
          audio.volume = volume / 100;
          audio.autoplay = true;
          audio.muted = false;
          
          peer.audioElement = audio;
          
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => console.log(`✅ Playing audio from ${callerID}`))
              .catch(error => {
                console.warn('Audio autoplay failed:', error);
              });
          }
        } catch (error) {
          console.error('Error setting up remote audio:', error);
        }
      });

      peer.on('error', err => {
        console.error(`❌ Peer connection error with ${callerID}:`, err);
        
        setTimeout(() => {
          if (peersRef.current[callerID] === peer && isStableConnectionRef.current) {
            delete peersRef.current[callerID];
            setPeers(prev => {
              const newPeers = { ...prev };
              delete newPeers[callerID];
              return newPeers;
            });
          }
        }, 2000);
      });

      peer.on('close', () => {
        console.log(`🔗 Peer connection closed for caller ${callerID}`);
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

  // Toggle mute
  const handleToggleMute = useCallback(() => {
    try {
      if (resourcesRef.current.mediaStream && isStableConnectionRef.current) {
        const audioTracks = resourcesRef.current.mediaStream.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = isMuted;
        });
        setIsMuted(prev => {
          const newMutedState = !prev;
          console.log(`🎙️ ${newMutedState ? 'Muted' : 'Unmuted'} microphone`);
          return newMutedState;
        });
      }
    } catch (error) {
      console.error('❌ Error toggling mute:', error);
      setError('Failed to toggle microphone');
    }
  }, [isMuted]);

  // FIXED: Enhanced socket event handlers with stability checks
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleUserJoinedVoice = ({ userId, username }) => {
      console.log(`👤 User ${username} joined voice chat`);
      
      if (resourcesRef.current.mediaStream && 
          userId !== user.id && 
          isStableConnectionRef.current &&
          !resourcesRef.current.isCleaningUp) {
        
        setTimeout(() => {
          if (isStableConnectionRef.current && !peersRef.current[userId]) {
            try {
              const peer = createPeer(userId, user.id, resourcesRef.current.mediaStream);
              if (peer) {
                peersRef.current[userId] = peer;
                setPeers(prev => ({ ...prev, [userId]: peer }));
                setConnectedUsers(prev => [...prev.filter(u => u.id !== userId), { id: userId, username }]);
              }
            } catch (error) {
              console.error('Error handling user joined voice:', error);
            }
          }
        }, 500);
      }
    };

    const handleReceivingSignal = ({ signal, id }) => {
      console.log(`📞 Receiving signal from user ${id}`);
      
      try {
        if (peersRef.current[id] && isStableConnectionRef.current) {
          peersRef.current[id].signal(signal);
        }
      } catch (error) {
        console.error('Error handling signal:', error);
      }
    };

    const handleUserCalling = ({ signal, from, username }) => {
      console.log(`📞 Incoming call from ${username}`);
      
      if (resourcesRef.current.mediaStream && 
          from !== user.id && 
          isStableConnectionRef.current &&
          !resourcesRef.current.isCleaningUp) {
        
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

    const handleVoiceRoomUsers = ({ users: voiceUsers }) => {
      console.log('🔄 Voice room users updated:', voiceUsers);
      
      if (resourcesRef.current.mediaStream && 
          isConnected && 
          isStableConnectionRef.current &&
          !resourcesRef.current.isCleaningUp) {
        
        voiceUsers.forEach(voiceUser => {
          if (voiceUser.userId !== user.id && !peersRef.current[voiceUser.userId]) {
            console.log(`📞 Calling user ${voiceUser.username}`);
            
            setTimeout(() => {
              if (isStableConnectionRef.current && !peersRef.current[voiceUser.userId]) {
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
            }, Math.random() * 1000);
          }
        });
      }
    };

    socket.on('user-joined-voice', handleUserJoinedVoice);
    socket.on('receiving-returned-signal', handleReceivingSignal);
    socket.on('user-calling', handleUserCalling);
    socket.on('user-left-voice', handleUserLeftVoice);
    socket.on('voice-room-users', handleVoiceRoomUsers);

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

  // Enhanced cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 WebRTCVoiceChat component unmounting - initiating cleanup');
      if (isStableConnectionRef.current) {
        handleLeaveVoice();
      }
    };
  }, [handleLeaveVoice]);

  // Connection stabilization effect
  useEffect(() => {
    if (isConnected && !isStableConnectionRef.current) {
      isStableConnectionRef.current = true;
      console.log('🔗 Connection stabilized');
    }
  }, [isConnected]);

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

      {/* Connection Quality Indicator */}
      {isConnected && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="text-sm text-green-800">
            <div className="flex items-center justify-between">
              <span className="font-medium">Connection Quality:</span>
              <div className="flex items-center space-x-1">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-3 rounded-sm ${
                      connectedUsers.length > i ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  />
                ))}
                <span className="ml-2 text-xs">
                  {connectedUsers.length > 2 ? 'Excellent' :
                   connectedUsers.length > 1 ? 'Good' :
                   connectedUsers.length > 0 ? 'Fair' : 'Connecting...'}
                </span>
              </div>
            </div>
            <div className="mt-1 text-xs text-green-600">
              P2P connections: {Object.keys(peersRef.current).length} active
            </div>
          </div>
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

  const hasAudioPermission = () => {
    return isRoomOwner() || 
           isRoomModerator() || 
           audioPermissions?.[currentUser];
  };

  const handleRequestPermission = () => {
    setIsRequestingPermission(true);
    sendAudioPermissionRequest();
    
    setPermissionStatus('🔄 Permission request sent...');
    
    setTimeout(() => {
      if (isRequestingPermission) {
        setPermissionStatus('⏳ Still waiting for response...');
      }
    }, 5000);
    
    setTimeout(() => {
      setPermissionStatus('');
    }, 10000);
  };

  const handlePermissionResponse = (username, granted) => {
    sendAudioPermissionResponse(username, granted);
    
    const action = granted ? 'granted' : 'denied';
    setPermissionStatus(`✅ Permission ${action} for ${username}`);
    
    setTimeout(() => {
      setPermissionStatus('');
    }, 3000);
  };

  const handleVoiceUserCountChange = (count) => {
    setVoiceChatUsers(count);
  };

  useEffect(() => {
    if (hasAudioPermission() && isRequestingPermission) {
      setIsRequestingPermission(false);
      setPermissionStatus('✅ Permission granted! You can now use voice chat.');
      setTimeout(() => {
        setPermissionStatus('');
      }, 3000);
    }
  }, [audioPermissions, currentUser, isRequestingPermission, hasAudioPermission]);

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
            🎵 Voice Chat (Fixed)
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

      {/* Permission Panel */}
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

      {/* Permission Status */}
      {permissionStatus && (
        <div className="bg-blue-50 border-b border-blue-200 p-2">
          <div className="text-sm text-blue-800 text-center">
            {permissionStatus}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 p-3 overflow-y-auto">
        {!isConnected ? (
          <div className="text-center py-8">
            <div className="text-gray-500 mb-4">⚠️</div>
            <p className="text-sm text-gray-600">
              Please connect to the room first to use voice chat.
            </p>
          </div>
        ) : !hasAudioPermission() ? (
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

            <div className="mt-4 text-xs text-gray-500">
              <p>Room owners and moderators can grant voice chat access</p>
              {(isRoomOwner() || isRoomModerator()) && (
                <p className="text-green-600 mt-1">You have permission management privileges</p>
              )}
            </div>
          </div>
        ) : (
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
            <>🎙️ Enhanced P2P voice chat via WebRTC</>
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