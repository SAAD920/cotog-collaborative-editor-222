import React, { useState, useEffect, useRef, useCallback } from 'react';

// Mock useRoom hook for demonstration
const useRoom = () => ({
  getSocket: () => ({
    connected: true,
    emit: (event, data) => console.log(`Socket emit: ${event}`, data),
    on: (event, handler) => console.log(`Socket on: ${event}`),
    off: (event, handler) => console.log(`Socket off: ${event}`)
  }),
  isConnected: true,
  currentUser: 'demo_user',
  roomId: 'demo_room'
});

// Native WebRTC Peer Connection Manager (replaces simple-peer)
class WebRTCPeerManager {
  constructor(config = {}) {
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      ...config
    };
    this.peers = new Map();
    this.localStream = null;
    this.onRemoteStream = null;
    this.onConnectionState = null;
  }

  setLocalStream(stream) {
    this.localStream = stream;
  }

  async createPeerConnection(peerId, isInitiator = false) {
    const pc = new RTCPeerConnection(this.config);
    
    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (this.onRemoteStream) {
        this.onRemoteStream(peerId, remoteStream);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      if (this.onConnectionState) {
        this.onConnectionState(peerId, pc.connectionState);
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(peerId, event.candidate);
      }
    };

    this.peers.set(peerId, pc);

    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      return offer;
    }

    return pc;
  }

  async handleOffer(peerId, offer) {
    const pc = await this.createPeerConnection(peerId, false);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(peerId, answer) {
    const pc = this.peers.get(peerId);
    if (pc) {
      await pc.setRemoteDescription(answer);
    }
  }

  async handleIceCandidate(peerId, candidate) {
    const pc = this.peers.get(peerId);
    if (pc) {
      await pc.addIceCandidate(candidate);
    }
  }

  closePeerConnection(peerId) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
  }

  closeAllConnections() {
    this.peers.forEach((pc, peerId) => {
      pc.close();
    });
    this.peers.clear();
  }
}

const EnhancedWebRTCAudioComponent = () => {
  // Core state
  const [isAudioOn, setIsAudioOn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState([
    { id: 'user1', username: 'Alice', volume: 0.3, speaking: false },
    { id: 'user2', username: 'Bob', volume: 0.7, speaking: true },
    { id: 'user3', username: 'Charlie', volume: 0.1, speaking: false }
  ]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  // Audio visualization state
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceActivity, setVoiceActivity] = useState(false);
  const [audioSettings, setAudioSettings] = useState({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    voiceActivationThreshold: 0.1,
    visualizationSensitivity: 1.0
  });

  // Advanced features state
  const [pushToTalk, setPushToTalk] = useState(false);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState('good'); // good, fair, poor
  const [audioStats, setAudioStats] = useState({
    packetsLost: 0,
    jitter: 0,
    bitrate: 0,
    latency: 0
  });

  // Refs
  const streamRef = useRef(null);
  const analyzerRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationFrameRef = useRef(null);
  const mountedRef = useRef(true);
  const peerManagerRef = useRef(null);
  const audioElementsRef = useRef(new Map());

  const { getSocket, isConnected: roomConnected, currentUser, roomId } = useRoom();

  // Initialize WebRTC Peer Manager
  useEffect(() => {
    peerManagerRef.current = new WebRTCPeerManager({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    // Handle remote streams
    peerManagerRef.current.onRemoteStream = (peerId, remoteStream) => {
      createAudioElement(peerId, remoteStream);
    };

    // Handle connection state changes
    peerManagerRef.current.onConnectionState = (peerId, state) => {
      console.log(`Peer ${peerId} connection state: ${state}`);
      if (state === 'failed' || state === 'disconnected') {
        setConnectedUsers(prev => prev.filter(user => user.id !== peerId));
        removeAudioElement(peerId);
      }
    };

    // Handle ICE candidates
    peerManagerRef.current.onIceCandidate = (peerId, candidate) => {
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('ice-candidate', {
          roomId,
          targetPeer: peerId,
          candidate
        });
      }
    };

    return () => {
      if (peerManagerRef.current) {
        peerManagerRef.current.closeAllConnections();
      }
    };
  }, [roomId, getSocket]);

  // Create audio element for remote streams
  const createAudioElement = useCallback((peerId, remoteStream) => {
    try {
      if (!mountedRef.current || !remoteStream) return;

      // Remove existing audio element if any
      removeAudioElement(peerId);

      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      audio.volume = 0.8;
      
      audio.play().catch(error => {
        console.log(`Autoplay blocked for peer ${peerId}:`, error.message);
      });

      audioElementsRef.current.set(peerId, audio);
      console.log(`✅ Audio element created for peer: ${peerId}`);
    } catch (error) {
      console.error(`❌ Error creating audio element for ${peerId}:`, error);
    }
  }, []);

  // Remove audio element
  const removeAudioElement = useCallback((peerId) => {
    const audio = audioElementsRef.current.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audioElementsRef.current.delete(peerId);
      console.log(`🗑️ Audio element removed for peer: ${peerId}`);
    }
  }, []);

  // Handle WebRTC signaling via socket
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !isAudioOn) return;

    const handleWebRTCOffer = async ({ fromPeer, offer }) => {
      try {
        console.log(`📞 Received WebRTC offer from: ${fromPeer}`);
        const answer = await peerManagerRef.current.handleOffer(fromPeer, offer);
        
        socket.emit('webrtc-answer', {
          roomId,
          targetPeer: fromPeer,
          answer
        });
      } catch (error) {
        console.error('Error handling WebRTC offer:', error);
      }
    };

    const handleWebRTCAnswer = async ({ fromPeer, answer }) => {
      try {
        console.log(`📞 Received WebRTC answer from: ${fromPeer}`);
        await peerManagerRef.current.handleAnswer(fromPeer, answer);
      } catch (error) {
        console.error('Error handling WebRTC answer:', error);
      }
    };

    const handleIceCandidate = async ({ fromPeer, candidate }) => {
      try {
        await peerManagerRef.current.handleIceCandidate(fromPeer, candidate);
      } catch (error) {
        console.error('Error handling ICE candidate:', error);
      }
    };

    const handleUserJoinedVoice = async ({ userId, username }) => {
      if (userId !== currentUser && streamRef.current) {
        try {
          console.log(`👤 User ${username} joined voice chat - creating offer`);
          const offer = await peerManagerRef.current.createPeerConnection(userId, true);
          
          socket.emit('webrtc-offer', {
            roomId,
            targetPeer: userId,
            offer
          });

          setConnectedUsers(prev => [...prev.filter(u => u.id !== userId), { 
            id: userId, 
            username, 
            volume: 0, 
            speaking: false 
          }]);
        } catch (error) {
          console.error('Error creating peer connection:', error);
        }
      }
    };

    const handleUserLeftVoice = ({ userId }) => {
      console.log(`👋 User ${userId} left voice chat`);
      peerManagerRef.current.closePeerConnection(userId);
      removeAudioElement(userId);
      setConnectedUsers(prev => prev.filter(u => u.id !== userId));
    };

    // Register socket event handlers
    socket.on('webrtc-offer', handleWebRTCOffer);
    socket.on('webrtc-answer', handleWebRTCAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('user-joined-voice', handleUserJoinedVoice);
    socket.on('user-left-voice', handleUserLeftVoice);

    return () => {
      socket.off('webrtc-offer', handleWebRTCOffer);
      socket.off('webrtc-answer', handleWebRTCAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('user-joined-voice', handleUserJoinedVoice);
      socket.off('user-left-voice', handleUserLeftVoice);
    };
  }, [getSocket, isAudioOn, currentUser, roomId, removeAudioElement]);

  // Audio visualization setup
  const setupAudioVisualization = useCallback((stream) => {
    try {
      if (!mountedRef.current || !stream) return;

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyzerRef.current = audioContextRef.current.createAnalyser();
      
      analyzerRef.current.fftSize = 256;
      analyzerRef.current.smoothingTimeConstant = 0.8;
      source.connect(analyzerRef.current);

      const bufferLength = analyzerRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateAudioLevel = () => {
        if (!mountedRef.current || !analyzerRef.current) return;

        analyzerRef.current.getByteFrequencyData(dataArray);
        
        // Calculate RMS (Root Mean Square) for better volume representation
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / bufferLength);
        const normalizedLevel = (rms / 255) * audioSettings.visualizationSensitivity;
        
        setAudioLevel(normalizedLevel);
        setVoiceActivity(normalizedLevel > audioSettings.voiceActivationThreshold);

        animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      };

      updateAudioLevel();
    } catch (error) {
      console.error('Audio visualization setup error:', error);
    }
  }, [audioSettings.visualizationSensitivity, audioSettings.voiceActivationThreshold]);

  // Cleanup audio visualization
  const cleanupAudioVisualization = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    analyzerRef.current = null;
    setAudioLevel(0);
    setVoiceActivity(false);
  }, []);

  // Enhanced audio toggle with visualization
  const toggleAudio = useCallback(async () => {
    if (!isAudioOn) {
      setIsConnecting(true);
      setConnectionError(null);
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: audioSettings.echoCancellation,
            noiseSuppression: audioSettings.noiseSuppression,
            autoGainControl: audioSettings.autoGainControl,
            sampleRate: 48000,
            channelCount: 1
          }
        });

        if (!mountedRef.current) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        setIsAudioOn(true);
        setIsConnecting(false);
        
        // Set stream for WebRTC peer manager
        peerManagerRef.current.setLocalStream(stream);
        
        // Setup audio visualization
        setupAudioVisualization(stream);

        // Join voice room
        const socket = getSocket();
        if (socket?.connected) {
          socket.emit('join-voice-room', {
            roomId,
            userId: currentUser,
            username: currentUser
          });
        }

        // Simulate connection quality monitoring
        setTimeout(() => {
          const qualities = ['excellent', 'good', 'fair', 'poor'];
          setConnectionQuality(qualities[Math.floor(Math.random() * qualities.length)]);
          setAudioStats({
            packetsLost: Math.floor(Math.random() * 5),
            jitter: Math.floor(Math.random() * 20),
            bitrate: 64 + Math.floor(Math.random() * 64),
            latency: 50 + Math.floor(Math.random() * 100)
          });
        }, 2000);

      } catch (error) {
        console.error('Failed to get audio stream:', error);
        setConnectionError(`Microphone access failed: ${error.message}`);
        setIsConnecting(false);
      }
    } else {
      // Turn audio OFF
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // Close all WebRTC connections
      if (peerManagerRef.current) {
        peerManagerRef.current.closeAllConnections();
      }

      // Clean up audio elements
      audioElementsRef.current.forEach((audio, peerId) => {
        audio.pause();
        audio.srcObject = null;
      });
      audioElementsRef.current.clear();

      cleanupAudioVisualization();
      setIsAudioOn(false);
      setConnectedUsers([]);
      setConnectionError(null);
      
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('leave-voice-room', { roomId, userId: currentUser });
      }
    }
  }, [isAudioOn, audioSettings, setupAudioVisualization, cleanupAudioVisualization, getSocket, roomId, currentUser]);

  // Enhanced mute toggle
  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // Push-to-talk functionality
  useEffect(() => {
    if (!pushToTalk || !isAudioOn) return;

    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsPushToTalkActive(true);
        if (streamRef.current) {
          streamRef.current.getAudioTracks().forEach(track => {
            track.enabled = true;
          });
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPushToTalkActive(false);
        if (streamRef.current) {
          streamRef.current.getAudioTracks().forEach(track => {
            track.enabled = false;
          });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [pushToTalk, isAudioOn]);

  // Audio level visualization component
  const AudioLevelMeter = ({ level, isActive, size = 'normal' }) => {
    const barCount = size === 'small' ? 8 : 12;
    const maxHeight = size === 'small' ? 16 : 24;
    
    return (
      <div className="flex items-end space-x-0.5">
        {Array.from({ length: barCount }, (_, i) => {
          const threshold = i / barCount;
          const isLit = level > threshold;
          const height = Math.max(2, (isLit ? level * maxHeight : 2));
          
          return (
            <div
              key={i}
              className={`w-1 rounded-sm transition-all duration-75 ${
                isLit && isActive 
                  ? level > 0.7 ? 'bg-red-500' : level > 0.4 ? 'bg-yellow-500' : 'bg-green-500'
                  : 'bg-gray-300'
              }`}
              style={{ height: `${height}px` }}
            />
          );
        })}
      </div>
    );
  };

  // Connection quality indicator
  const getConnectionQualityColor = (quality) => {
    switch (quality) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cleanupAudioVisualization();
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      if (peerManagerRef.current) {
        peerManagerRef.current.closeAllConnections();
      }
      
      audioElementsRef.current.forEach((audio) => {
        audio.pause();
        audio.srcObject = null;
      });
      audioElementsRef.current.clear();
    };
  }, [cleanupAudioVisualization]);

  if (!roomConnected) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center">
          🎙️ Voice Chat
          {voiceActivity && isAudioOn && !isMuted && (
            <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full animate-pulse">
              Speaking
            </span>
          )}
        </h3>
        <div className={`text-xs px-2 py-1 rounded-full ${getConnectionQualityColor(connectionQuality)} bg-gray-100`}>
          {connectionQuality}
        </div>
      </div>

      {/* Connection Error */}
      {connectionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-xs">
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>{connectionError}</span>
          </div>
        </div>
      )}

      {/* Main Controls */}
      <div className="flex items-center space-x-3">
        <button
          onClick={toggleAudio}
          disabled={isConnecting}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            isConnecting
              ? 'bg-gray-400 cursor-not-allowed text-white'
              : !isAudioOn
              ? 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
          }`}
        >
          {isConnecting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
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
              <AudioLevelMeter level={audioLevel} isActive={voiceActivity && !isMuted} size="small" />
              <span>In Voice ({connectedUsers.length + 1})</span>
            </>
          )}
        </button>

        {isAudioOn && (
          <>
            <button
              onClick={toggleMute}
              className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                isMuted || (pushToTalk && !isPushToTalkActive)
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-gray-500 hover:bg-gray-600 text-white'
              }`}
            >
              {isMuted || (pushToTalk && !isPushToTalkActive) ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                </svg>
              )}
              <span className="text-xs">
                {pushToTalk ? (isPushToTalkActive ? 'PTT' : 'PTT Off') : (isMuted ? 'Muted' : 'Live')}
              </span>
            </button>

            <button
              onClick={() => setPushToTalk(!pushToTalk)}
              className={`px-2 py-2 rounded-lg text-xs transition-colors ${
                pushToTalk ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              title="Toggle Push-to-Talk (Space bar)"
            >
              PTT
            </button>
          </>
        )}
      </div>

      {/* Audio Level Visualization for Current User */}
      {isAudioOn && (
        <div className="bg-gray-50 p-3 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Your Audio Level</span>
            <span className="text-xs text-gray-500">
              {voiceActivity ? '🎤 Speaking' : '🔇 Silent'}
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <AudioLevelMeter level={audioLevel} isActive={voiceActivity && !isMuted} />
            <div className="text-xs text-gray-600">
              {(audioLevel * 100).toFixed(0)}%
            </div>
          </div>
          {pushToTalk && (
            <div className="mt-2 text-xs text-gray-600">
              Hold <kbd className="bg-gray-200 px-1 rounded">Space</kbd> to talk
            </div>
          )}
        </div>
      )}

      {/* Connected Users */}
      {isAudioOn && connectedUsers.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Voice Chat Participants</h4>
          {connectedUsers.map(user => (
            <div key={user.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${user.speaking ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
                <span className="text-sm text-gray-700">{user.username}</span>
                {user.speaking && <span className="text-xs text-green-600">Speaking</span>}
              </div>
              <AudioLevelMeter level={user.volume} isActive={user.speaking} size="small" />
            </div>
          ))}
        </div>
      )}

      {/* Audio Settings Panel */}
      <details className="group">
        <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 list-none">
          <div className="flex items-center justify-between">
            <span>⚙️ Audio Settings</span>
            <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </summary>
        
        <div className="mt-3 space-y-3 bg-gray-50 p-3 rounded-lg">
          <div className="grid grid-cols-1 gap-3">
            <label className="flex items-center justify-between text-xs">
              <span>Echo Cancellation</span>
              <input
                type="checkbox"
                checked={audioSettings.echoCancellation}
                onChange={(e) => setAudioSettings(prev => ({ ...prev, echoCancellation: e.target.checked }))}
                className="w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between text-xs">
              <span>Noise Suppression</span>
              <input
                type="checkbox"
                checked={audioSettings.noiseSuppression}
                onChange={(e) => setAudioSettings(prev => ({ ...prev, noiseSuppression: e.target.checked }))}
                className="w-4 h-4"
              />
            </label>
            <label className="flex items-center justify-between text-xs">
              <span>Auto Gain Control</span>
              <input
                type="checkbox"
                checked={audioSettings.autoGainControl}
                onChange={(e) => setAudioSettings(prev => ({ ...prev, autoGainControl: e.target.checked }))}
                className="w-4 h-4"
              />
            </label>
          </div>
          
          <div className="space-y-2">
            <label className="block text-xs text-gray-700">
              Voice Activation Threshold: {(audioSettings.voiceActivationThreshold * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.01"
              max="0.5"
              step="0.01"
              value={audioSettings.voiceActivationThreshold}
              onChange={(e) => setAudioSettings(prev => ({ ...prev, voiceActivationThreshold: parseFloat(e.target.value) }))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs text-gray-700">
              Visualization Sensitivity: {audioSettings.visualizationSensitivity.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.1"
              max="3.0"
              step="0.1"
              value={audioSettings.visualizationSensitivity}
              onChange={(e) => setAudioSettings(prev => ({ ...prev, visualizationSensitivity: parseFloat(e.target.value) }))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>
      </details>

      {/* Connection Stats */}
      {isAudioOn && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 list-none">
            <div className="flex items-center justify-between">
              <span>📊 Connection Stats</span>
              <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </summary>
          
          <div className="mt-3 bg-gray-50 p-3 rounded-lg">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-600">Quality:</span>
                <span className={`ml-1 font-medium ${getConnectionQualityColor(connectionQuality)}`}>
                  {connectionQuality}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Bitrate:</span>
                <span className="ml-1 text-gray-800">{audioStats.bitrate} kbps</span>
              </div>
              <div>
                <span className="text-gray-600">Latency:</span>
                <span className="ml-1 text-gray-800">{audioStats.latency} ms</span>
              </div>
              <div>
                <span className="text-gray-600">Packets Lost:</span>
                <span className="ml-1 text-gray-800">{audioStats.packetsLost}</span>
              </div>
              <div>
                <span className="text-gray-600">Jitter:</span>
                <span className="ml-1 text-gray-800">{audioStats.jitter} ms</span>
              </div>
              <div>
                <span className="text-gray-600">Codec:</span>
                <span className="ml-1 text-gray-800">Opus</span>
              </div>
            </div>
          </div>
        </details>
      )}

      {/* Status Messages */}
      {!isAudioOn && (
        <div className="text-center py-4">
          <div className="text-2xl mb-2">🎙️</div>
          <p className="text-sm text-gray-600 mb-1">Click "Join Voice" to start talking with your team</p>
          <p className="text-xs text-green-600 font-medium">✨ Enhanced with real-time audio visualization!</p>
        </div>
      )}

      {isAudioOn && connectedUsers.length === 0 && (
        <div className="text-center py-2">
          <p className="text-sm text-gray-600">🎙️ You're in voice chat</p>
          <p className="text-xs text-gray-500">Waiting for others to join...</p>
        </div>
      )}
    </div>
  );
};

export default EnhancedWebRTCAudioComponent;