// src/components/WebRTCAudioComponent.js - FIXED WITH COMPREHENSIVE ERROR HANDLING
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'simple-peer';
import { useRoom } from '@/contexts/RoomContext';

const WebRTCAudioComponent = () => {
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  const peersRef = useRef({});
  const streamRef = useRef(null);
  const audioElementsRef = useRef(new Map());
  const mountedRef = useRef(true);
  const connectionAttemptsRef = useRef({});

  const { getSocket, isConnected: roomConnected, currentUser, roomId } = useRoom();

  // 🔧 FIX 1: Enhanced createAudioElement with error handling
  const createAudioElement = useCallback((remoteStream, userId) => {
    try {
      if (!mountedRef.current || !remoteStream) {
        console.log('🚫 Skipping audio element creation - unmounted or no stream');
        return null;
      }

      // Check if audio element already exists
      if (audioElementsRef.current.has(userId)) {
        const existingAudio = audioElementsRef.current.get(userId);
        existingAudio.srcObject = remoteStream;
        return existingAudio;
      }

      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      audio.volume = 0.8;
      
      // Enhanced autoplay handling
      const playAudio = async () => {
        try {
          await audio.play();
          console.log(`✅ Audio playing for user: ${userId}`);
        } catch (error) {
          console.log(`⚠️ Autoplay blocked for user ${userId}, user interaction needed:`, error.message);
          // Store for later manual play
          audio.dataset.needsPlay = 'true';
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

  // 🔧 FIX 2: Enhanced createPeer with comprehensive error handling
  const createPeer = useCallback((userToCall, callerID, stream) => {
    try {
      if (!stream) {
        console.error('❌ Cannot create peer without stream');
        return null;
      }

      // Clean up any existing peer for this user
      if (peersRef.current[userToCall]) {
        console.log(`🧹 Cleaning up existing peer for ${userToCall}`);
        try {
          peersRef.current[userToCall].destroy();
        } catch (cleanupError) {
          console.error('Error cleaning up existing peer:', cleanupError);
        }
        delete peersRef.current[userToCall];
      }

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

      // Track connection attempts
      connectionAttemptsRef.current[userToCall] = (connectionAttemptsRef.current[userToCall] || 0) + 1;

      peer.on('signal', signal => {
        try {
          const socket = getSocket();
          if (socket && socket.connected && mountedRef.current) {
            socket.emit('sending-signal', { 
              userToCall, 
              callerID, 
              signal,
              roomId
            });
            console.log(`📞 Signal sent to ${userToCall} (type: ${signal.type})`);
          } else {
            console.error('❌ Cannot send signal - socket not available');
          }
        } catch (signalError) {
          console.error('❌ Error sending signal:', signalError);
        }
      });

      peer.on('stream', remoteStream => {
        try {
          if (mountedRef.current) {
            console.log(`🎵 Received stream from ${userToCall}`);
            createAudioElement(remoteStream, userToCall);
          }
        } catch (streamError) {
          console.error('❌ Error handling remote stream:', streamError);
        }
      });

      peer.on('connect', () => {
        console.log(`✅ Peer connection established with ${userToCall}`);
        connectionAttemptsRef.current[userToCall] = 0; // Reset attempts on success
        setConnectionError(null);
      });

      peer.on('close', () => {
        console.log(`🔌 Peer connection closed with ${userToCall}`);
        if (peersRef.current[userToCall]) {
          delete peersRef.current[userToCall];
        }
        
        // Clean up audio element
        if (audioElementsRef.current.has(userToCall)) {
          const audio = audioElementsRef.current.get(userToCall);
          audio.pause();
          audio.srcObject = null;
          audioElementsRef.current.delete(userToCall);
        }
        
        setConnectedUsers(prev => prev.filter(u => u.id !== userToCall));
      });

      peer.on('error', err => {
        console.error(`❌ Peer error with ${userToCall}:`, err);
        setConnectionError(`Connection failed with ${userToCall}: ${err.message}`);
        
        // Clean up failed peer
        if (peersRef.current[userToCall]) {
          try {
            peersRef.current[userToCall].destroy();
          } catch (destroyError) {
            console.error('Error destroying failed peer:', destroyError);
          }
          delete peersRef.current[userToCall];
        }
        
        // Retry logic for temporary failures
        const attempts = connectionAttemptsRef.current[userToCall] || 0;
        if (attempts < 3 && mountedRef.current) {
          setTimeout(() => {
            if (mountedRef.current && streamRef.current) {
              console.log(`🔄 Retrying connection to ${userToCall} (attempt ${attempts + 1})`);
              createPeer(userToCall, callerID, streamRef.current);
            }
          }, (attempts + 1) * 2000); // Exponential backoff
        }
      });

      return peer;
    } catch (error) {
      console.error('❌ Error creating peer:', error);
      setConnectionError(`Failed to create peer connection: ${error.message}`);
      return null;
    }
  }, [getSocket, roomId, createAudioElement]);

  // 🔧 FIX 3: Enhanced addPeer with null checking and error handling
  const addPeer = useCallback((incomingSignal, callerID, stream) => {
    try {
      // ✅ CRITICAL FIX: Validate inputs before proceeding
      if (!incomingSignal) {
        console.error('❌ Invalid incoming signal - signal is null/undefined');
        return null;
      }

      if (!callerID) {
        console.error('❌ Invalid caller ID - callerID is null/undefined');
        return null;
      }

      if (!stream) {
        console.error('❌ Invalid stream - stream is null/undefined');
        return null;
      }

      if (!mountedRef.current) {
        console.log('🚫 Component unmounted, skipping peer creation');
        return null;
      }

      console.log(`📞 Creating peer for incoming call from ${callerID}`);

      // Clean up any existing peer for this caller
      if (peersRef.current[callerID]) {
        console.log(`🧹 Cleaning up existing peer for ${callerID}`);
        try {
          peersRef.current[callerID].destroy();
        } catch (cleanupError) {
          console.error('Error cleaning up existing peer:', cleanupError);
        }
        delete peersRef.current[callerID];
      }

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

      // Verify peer was created successfully
      if (!peer) {
        console.error('❌ Failed to create peer object');
        return null;
      }

      peer.on('signal', signal => {
        try {
          const socket = getSocket();
          if (socket && socket.connected && mountedRef.current) {
            socket.emit('returning-signal', { 
              signal, 
              callerID,
              roomId
            });
            console.log(`📞 Return signal sent to ${callerID} (type: ${signal.type})`);
          } else {
            console.error('❌ Cannot send return signal - socket not available');
          }
        } catch (signalError) {
          console.error('❌ Error sending return signal:', signalError);
        }
      });

      peer.on('stream', remoteStream => {
        try {
          if (mountedRef.current) {
            console.log(`🎵 Received stream from caller ${callerID}`);
            createAudioElement(remoteStream, callerID);
          }
        } catch (streamError) {
          console.error('❌ Error handling remote stream from caller:', streamError);
        }
      });

      peer.on('connect', () => {
        console.log(`✅ Peer connection established with caller ${callerID}`);
        setConnectionError(null);
      });

      peer.on('close', () => {
        console.log(`🔌 Peer connection closed with caller ${callerID}`);
        if (peersRef.current[callerID]) {
          delete peersRef.current[callerID];
        }
        
        // Clean up audio element
        if (audioElementsRef.current.has(callerID)) {
          const audio = audioElementsRef.current.get(callerID);
          audio.pause();
          audio.srcObject = null;
          audioElementsRef.current.delete(callerID);
        }
        
        setConnectedUsers(prev => prev.filter(u => u.id !== callerID));
      });

      peer.on('error', err => {
        console.error(`❌ Peer error with caller ${callerID}:`, err);
        setConnectionError(`Connection failed with ${callerID}: ${err.message}`);
        
        // Clean up failed peer
        if (peersRef.current[callerID]) {
          try {
            peersRef.current[callerID].destroy();
          } catch (destroyError) {
            console.error('Error destroying failed peer:', destroyError);
          }
          delete peersRef.current[callerID];
        }
      });

      // ✅ CRITICAL FIX: Validate peer and signal before calling signal()
      if (peer && typeof peer.signal === 'function' && incomingSignal) {
        try {
          peer.signal(incomingSignal);
          console.log(`✅ Successfully signaled peer for ${callerID}`);
        } catch (signalError) {
          console.error(`❌ Error signaling peer for ${callerID}:`, signalError);
          // Clean up failed peer
          try {
            peer.destroy();
          } catch (destroyError) {
            console.error('Error destroying peer after signal failure:', destroyError);
          }
          return null;
        }
      } else {
        console.error('❌ Invalid peer or signal data:', { 
          peerExists: !!peer, 
          signalExists: !!incomingSignal,
          signalFunction: typeof peer?.signal 
        });
        
        // Clean up invalid peer
        if (peer) {
          try {
            peer.destroy();
          } catch (destroyError) {
            console.error('Error destroying invalid peer:', destroyError);
          }
        }
        return null;
      }

      return peer;
    } catch (error) {
      console.error('❌ Error in addPeer:', error);
      setConnectionError(`Failed to add peer: ${error.message}`);
      return null;
    }
  }, [getSocket, roomId, createAudioElement]);

  // 🔧 FIX 4: Enhanced toggleAudio with better error handling
  const toggleAudio = useCallback(async () => {
    if (!isAudioOn) {
      // Turn audio ON
      setIsConnecting(true);
      setConnectionError(null);
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        if (!mountedRef.current) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        setIsAudioOn(true);
        setIsConnecting(false);

        // Join voice room
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('join-voice-room', {
            roomId,
            userId: currentUser,
            username: currentUser
          });
          console.log('🎙️ Joined voice room successfully');
        } else {
          throw new Error('Socket not connected');
        }
      } catch (error) {
        console.error('❌ Failed to get audio stream:', error);
        setConnectionError(`Failed to access microphone: ${error.message}`);
        setIsConnecting(false);
        
        if (error.name === 'NotAllowedError') {
          alert('Microphone access denied. Please allow microphone access and try again.');
        } else if (error.name === 'NotFoundError') {
          alert('No microphone found. Please connect a microphone and try again.');
        } else {
          alert(`Failed to access microphone: ${error.message}`);
        }
      }
    } else {
      // Turn audio OFF
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Close all peer connections with error handling
        Object.entries(peersRef.current).forEach(([userId, peer]) => {
          try {
            if (peer && typeof peer.destroy === 'function') {
              peer.destroy();
            }
          } catch (error) {
            console.error(`Error destroying peer for ${userId}:`, error);
          }
        });
        peersRef.current = {};

        // Stop all audio elements
        audioElementsRef.current.forEach((audio, userId) => {
          try {
            audio.pause();
            audio.srcObject = null;
          } catch (error) {
            console.error(`Error stopping audio for ${userId}:`, error);
          }
        });
        audioElementsRef.current.clear();

        setIsAudioOn(false);
        setConnectedUsers([]);
        setConnectionError(null);

        // Leave voice room
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('leave-voice-room', {
            roomId,
            userId: currentUser
          });
        }
        
        console.log('🎙️ Left voice room successfully');
      } catch (error) {
        console.error('❌ Error turning off audio:', error);
        setConnectionError(`Error disconnecting: ${error.message}`);
      }
    }
  }, [isAudioOn, getSocket, roomId, currentUser]);

  // 🔧 FIX 5: Enhanced toggleMute with error handling
  const toggleMute = useCallback(() => {
    try {
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach(track => {
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

  // Socket event handlers with enhanced error handling
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !isAudioOn) return;

    const handleUserJoinedVoice = ({ userId, username }) => {
      try {
        if (userId !== currentUser && streamRef.current && mountedRef.current) {
          console.log(`👤 User ${username} joined voice chat`);
          const peer = createPeer(userId, currentUser, streamRef.current);
          if (peer) {
            peersRef.current[userId] = peer;
            setConnectedUsers(prev => [...prev.filter(u => u.id !== userId), { id: userId, username }]);
          }
        }
      } catch (error) {
        console.error('❌ Error handling user joined voice:', error);
      }
    };

    const handleUserCalling = ({ signal, from, username }) => {
      try {
        if (from !== currentUser && streamRef.current && mountedRef.current) {
          console.log(`📞 Incoming call from ${username}`);
          const peer = addPeer(signal, from, streamRef.current);
          if (peer) {
            peersRef.current[from] = peer;
            setConnectedUsers(prev => [...prev.filter(u => u.id !== from), { id: from, username }]);
          }
        }
      } catch (error) {
        console.error('❌ Error handling incoming call:', error);
      }
    };

    const handleReceivingSignal = ({ signal, id }) => {
      try {
        const peer = peersRef.current[id];
        if (peer && typeof peer.signal === 'function' && signal) {
          peer.signal(signal);
          console.log(`✅ Successfully processed return signal from ${id}`);
        } else {
          console.error('❌ Invalid peer or signal for return signal:', { 
            peerExists: !!peer, 
            signalExists: !!signal,
            signalFunction: typeof peer?.signal 
          });
        }
      } catch (error) {
        console.error('❌ Error processing return signal:', error);
      }
    };

    const handleUserLeftVoice = ({ userId }) => {
      try {
        if (peersRef.current[userId]) {
          console.log(`👋 User ${userId} left voice chat`);
          try {
            peersRef.current[userId].destroy();
          } catch (destroyError) {
            console.error('Error destroying peer on user leave:', destroyError);
          }
          delete peersRef.current[userId];
        }
        
        if (audioElementsRef.current.has(userId)) {
          const audio = audioElementsRef.current.get(userId);
          try {
            audio.pause();
            audio.srcObject = null;
          } catch (audioError) {
            console.error('Error cleaning up audio element:', audioError);
          }
          audioElementsRef.current.delete(userId);
        }
        
        setConnectedUsers(prev => prev.filter(u => u.id !== userId));
      } catch (error) {
        console.error('❌ Error handling user left voice:', error);
      }
    };

    const handleVoiceRoomUsers = ({ users: voiceUsers }) => {
      try {
        if (streamRef.current && mountedRef.current) {
          voiceUsers.forEach(voiceUser => {
            if (voiceUser.userId !== currentUser && !peersRef.current[voiceUser.userId]) {
              setTimeout(() => {
                if (streamRef.current && mountedRef.current) {
                  const peer = createPeer(voiceUser.userId, currentUser, streamRef.current);
                  if (peer) {
                    peersRef.current[voiceUser.userId] = peer;
                    setConnectedUsers(prev => [...prev.filter(u => u.id !== voiceUser.userId), voiceUser]);
                  }
                }
              }, Math.random() * 1000);
            }
          });
        }
      } catch (error) {
        console.error('❌ Error handling voice room users:', error);
      }
    };

    // Add event listeners
    socket.on('user-joined-voice', handleUserJoinedVoice);
    socket.on('user-calling', handleUserCalling);
    socket.on('receiving-returned-signal', handleReceivingSignal);
    socket.on('user-left-voice', handleUserLeftVoice);
    socket.on('voice-room-users', handleVoiceRoomUsers);

    return () => {
      socket.off('user-joined-voice', handleUserJoinedVoice);
      socket.off('user-calling', handleUserCalling);
      socket.off('receiving-returned-signal', handleReceivingSignal);
      socket.off('user-left-voice', handleUserLeftVoice);
      socket.off('voice-room-users', handleVoiceRoomUsers);
    };
  }, [getSocket, isAudioOn, currentUser, createPeer, addPeer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      Object.values(peersRef.current).forEach(peer => {
        try {
          if (peer && typeof peer.destroy === 'function') {
            peer.destroy();
          }
        } catch (error) {
          console.error('Error destroying peer on unmount:', error);
        }
      });
      
      audioElementsRef.current.forEach((audio) => {
        try {
          audio.pause();
          audio.srcObject = null;
        } catch (error) {
          console.error('Error cleaning up audio on unmount:', error);
        }
      });
    };
  }, []);

  if (!roomConnected) {
    return null;
  }

  return (
    <div className="flex flex-col space-y-2">
      {/* Connection Error Display */}
      {connectionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-xs">
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{connectionError}</span>
          </div>
          <button 
            onClick={() => setConnectionError(null)}
            className="mt-1 text-xs underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center space-x-2">
        {/* Main Audio Toggle Button */}
        <button
          onClick={toggleAudio}
          disabled={isConnecting}
          className={`flex items-center space-x-1 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            isConnecting
              ? 'bg-gray-400 cursor-not-allowed text-white'
              : !isAudioOn
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isConnecting ? (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
              <span>Connecting...</span>
            </>
          ) : !isAudioOn ? (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
              <span>Turn On Audio</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
              <span>Audio On ({connectedUsers.length + 1})</span>
            </>
          )}
        </button>

        {/* Mute Button (only when audio is on) */}
        {isAudioOn && (
          <button
            onClick={toggleMute}
            className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs transition-colors ${
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
                <span>Mute</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Connected Users Display */}
      {isAudioOn && connectedUsers.length > 0 && (
        <div className="text-xs text-gray-600">
          <p className="font-medium">In voice chat:</p>
          <ul className="mt-1 space-y-1">
            {connectedUsers.map(user => (
              <li key={user.id} className="flex items-center">
                <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
                {user.username}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default WebRTCAudioComponent;