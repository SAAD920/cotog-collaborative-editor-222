// src/components/WebRTCAudioComponent.js - COMPLETE FIXED VERSION FOR CHROME
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'simple-peer';
import { useRoom } from '@/contexts/RoomContext';

// ============================================================================
// WEBRTC VOICE CHAT COMPONENT - FIXED FOR CHROME COMPATIBILITY
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
  const [audioOutputDevice, setAudioOutputDeviceState] = useState('default');
  const [availableOutputDevices, setAvailableOutputDevices] = useState([]);

  const peersRef = useRef({});
  const streamRef = useRef(null);
  const speakingTimeoutRef = useRef({});
  const isStableConnectionRef = useRef(false);

  // Enhanced resource tracking with Chrome compatibility
  const resourcesRef = useRef({
    audioContext: null,
    mediaStream: null,
    analyser: null,
    isCleaningUp: false,
    animationFrameId: null,
    audioElements: new Map(),
    manualPlayButtons: new Set()
  });

  const { getSocket, isConnected: roomConnected } = useRoom();

  // ============================================================================
  // CHROME-COMPATIBLE AUDIO OUTPUT DEVICE MANAGEMENT
  // ============================================================================
  const getAudioOutputDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices.enumerateDevices) {
        console.log('📱 Device enumeration not supported');
        return [];
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputDevices = devices
        .filter(device => device.kind === 'audiooutput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Audio Output ${device.deviceId.slice(0, 8)}...`
        }));

      console.log('🔊 Available audio output devices:', audioOutputDevices);
      setAvailableOutputDevices(audioOutputDevices);
      return audioOutputDevices;
    } catch (error) {
      console.error('❌ Failed to get audio output devices:', error);
      return [];
    }
  }, []);

  const setAudioOutputDevice = useCallback(async (deviceId) => {
    console.log(`🔊 Setting audio output device to: ${deviceId}`);
    
    try {
      for (const [userId, audioElement] of resourcesRef.current.audioElements) {
        if (audioElement && audioElement.setSinkId) {
          try {
            await audioElement.setSinkId(deviceId);
            console.log(`✅ Audio output set for user ${userId}`);
          } catch (sinkError) {
            console.error(`❌ Failed to set audio output for user ${userId}:`, sinkError);
          }
        }
      }
      
      setAudioOutputDeviceState(deviceId);
      console.log(`✅ Audio output device updated to: ${deviceId}`);
    } catch (error) {
      console.error('❌ Failed to set audio output device:', error);
    }
  }, []);

  const selectAudioOutputDevice = useCallback(async () => {
    try {
      if (!navigator.mediaDevices.selectAudioOutput) {
        console.log('❌ Manual audio output selection not supported in this browser');
        alert('Audio output selection not supported in this browser. Use browser settings.');
        return;
      }
      
      const device = await navigator.mediaDevices.selectAudioOutput();
      await setAudioOutputDevice(device.deviceId);
      
    } catch (error) {
      console.error('❌ Manual audio output selection failed:', error);
      if (error.name !== 'NotAllowedError') {
        alert('Failed to select audio output device');
      }
    }
  }, [setAudioOutputDevice]);

  // ============================================================================
  // FIXED: CHROME-COMPATIBLE AUDIO ELEMENT CREATION
  // ============================================================================
  const createAudioElement = useCallback(async (remoteStream, userId, username) => {
    try {
      console.log(`🎵 Creating audio element for ${username} (${userId})`);
      
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.volume = volume / 100;
      audio.autoplay = true;
      audio.muted = false;
      audio.preload = 'auto';
      
      // Chrome-specific attributes
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      
      if (audio.setSinkId && audioOutputDevice !== 'default') {
        try {
          await audio.setSinkId(audioOutputDevice);
          console.log(`🔊 Audio output device set for ${username}`);
        } catch (sinkError) {
          console.warn(`⚠️ Could not set audio output device for ${username}:`, sinkError);
        }
      }

      // Enhanced event handlers
      audio.addEventListener('loadedmetadata', async () => {
        console.log(`📊 Audio metadata loaded for ${username}`);
        try {
          await audio.play();
          console.log(`✅ Auto-play successful for ${username}`);
        } catch (playError) {
          console.warn(`⚠️ Auto-play failed for ${username}:`, playError);
          showManualPlayButton(audio, username);
        }
      });

      audio.addEventListener('play', () => {
        console.log(`▶️ Audio started playing for ${username}`);
      });

      audio.addEventListener('error', (event) => {
        console.error(`❌ Audio error for ${username}:`, event.target.error);
      });

      resourcesRef.current.audioElements.set(userId, audio);
      return audio;

    } catch (error) {
      console.error(`❌ Failed to create audio element for ${username}:`, error);
      return null;
    }
  }, [volume, audioOutputDevice]);

  // ============================================================================
  // MANUAL PLAY BUTTON FOR CHROME AUTOPLAY RESTRICTIONS
  // ============================================================================
  const showManualPlayButton = useCallback((audioElement, username) => {
    const buttonId = `play-button-${username}`;
    
    // Don't create duplicate buttons
    if (resourcesRef.current.manualPlayButtons.has(buttonId)) return;
    
    const playButton = document.createElement('button');
    playButton.id = buttonId;
    playButton.innerHTML = `🔊 Click to hear ${username}`;
    playButton.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10000;
      background: linear-gradient(45deg, #4CAF50, #45a049);
      color: white;
      padding: 15px 25px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
      animation: pulse 2s infinite;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { transform: translate(-50%, -50%) scale(1); }
        50% { transform: translate(-50%, -50%) scale(1.05); }
        100% { transform: translate(-50%, -50%) scale(1); }
      }
    `;
    document.head.appendChild(style);

    playButton.onclick = async () => {
      try {
        await audioElement.play();
        console.log(`✅ Manual audio play successful for ${username}`);
        
        // Clean up
        document.body.removeChild(playButton);
        document.head.removeChild(style);
        resourcesRef.current.manualPlayButtons.delete(buttonId);
      } catch (manualError) {
        console.error(`❌ Manual audio play failed for ${username}:`, manualError);
        playButton.innerHTML = `❌ Audio failed for ${username}`;
        playButton.style.background = '#f44336';
      }
    };

    document.body.appendChild(playButton);
    resourcesRef.current.manualPlayButtons.add(buttonId);

    // Auto-remove after 15 seconds
    setTimeout(() => {
      if (document.body.contains(playButton)) {
        document.body.removeChild(playButton);
        document.head.removeChild(style);
        resourcesRef.current.manualPlayButtons.delete(buttonId);
      }
    }, 15000);
  }, []);

  // ============================================================================
  // FIXED: CHROME-OPTIMIZED PEER CONNECTION
  // ============================================================================
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
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:stun.services.mozilla.com' },
            { urls: 'stun:stun.softjoys.com' }
          ],
          sdpSemantics: 'unified-plan',
          iceCandidatePoolSize: 10
        },
        offerOptions: {
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
          voiceActivityDetection: true
        }
      });

      peer.on('signal', signal => {
        const socket = getSocket();
        if (socket && socket.connected) {
          console.log(`📡 Sending ${signal.type} signal to ${userToCall}`);
          socket.emit('sending-signal', { 
            userToCall, 
            callerID, 
            signal,
            roomId
          });
        }
      });

      peer.on('stream', async remoteStream => {
        console.log(`🔊 Received stream from user ${userToCall}`);
        
        try {
          await new Promise(resolve => setTimeout(resolve, 300)); // Chrome stability delay
          
          const audioElement = await createAudioElement(remoteStream, userToCall, userToCall);
          if (audioElement) {
            peer.audioElement = audioElement;
            console.log(`✅ Audio setup complete for user ${userToCall}`);
          }
        } catch (error) {
          console.error(`❌ Error setting up audio for user ${userToCall}:`, error);
        }
      });

      peer.on('connect', () => {
        console.log(`🔗 Peer connected to ${userToCall}`);
        isStableConnectionRef.current = true;
      });

      peer.on('error', err => {
        console.error(`❌ Peer connection error with ${userToCall}:`, err);
        
        // Clean up failed peer
        if (peersRef.current[userToCall] === peer) {
          delete peersRef.current[userToCall];
          setPeers(prev => {
            const newPeers = { ...prev };
            delete newPeers[userToCall];
            return newPeers;
          });
          
          if (resourcesRef.current.audioElements.has(userToCall)) {
            const audioElement = resourcesRef.current.audioElements.get(userToCall);
            if (audioElement) {
              audioElement.pause();
              audioElement.srcObject = null;
            }
            resourcesRef.current.audioElements.delete(userToCall);
          }
        }
      });

      peer.on('close', () => {
        console.log(`🔗 Peer connection closed for user ${userToCall}`);
        if (peer.audioElement) {
          peer.audioElement.pause();
          peer.audioElement.srcObject = null;
        }
        
        if (resourcesRef.current.audioElements.has(userToCall)) {
          resourcesRef.current.audioElements.delete(userToCall);
        }
      });

      return peer;
    } catch (error) {
      console.error('❌ Error creating peer:', error);
      return null;
    }
  }, [getSocket, roomId, createAudioElement]);

  // ============================================================================
  // FIXED: ADD PEER WITH VALIDATION
  // ============================================================================
  const addPeer = useCallback((incomingSignal, callerID, stream) => {
    try {
      console.log(`📞 Adding peer for incoming call from ${callerID}`);
      
      // FIXED: Validate incoming signal
      if (!incomingSignal || typeof incomingSignal !== 'object') {
        console.error('❌ Invalid incoming signal:', incomingSignal);
        return null;
      }

      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: stream,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:stun.services.mozilla.com' },
            { urls: 'stun:stun.softjoys.com' }
          ],
          sdpSemantics: 'unified-plan',
          iceCandidatePoolSize: 10
        }
      });

      peer.on('signal', signal => {
        const socket = getSocket();
        if (socket && socket.connected) {
          console.log(`📡 Returning ${signal.type} signal to ${callerID}`);
          socket.emit('returning-signal', { 
            signal, 
            callerID,
            roomId
          });
        }
      });

      peer.on('stream', async remoteStream => {
        console.log(`🔊 Received stream from caller ${callerID}`);
        
        try {
          await new Promise(resolve => setTimeout(resolve, 300)); // Chrome stability delay
          
          const audioElement = await createAudioElement(remoteStream, callerID, callerID);
          if (audioElement) {
            peer.audioElement = audioElement;
            console.log(`✅ Caller audio setup complete for ${callerID}`);
          }
        } catch (error) {
          console.error(`❌ Error setting up caller audio for ${callerID}:`, error);
        }
      });

      peer.on('connect', () => {
        console.log(`🔗 Peer connected to caller ${callerID}`);
        isStableConnectionRef.current = true;
      });

      peer.on('error', err => {
        console.error(`❌ Peer connection error with ${callerID}:`, err);
        
        if (peersRef.current[callerID] === peer) {
          delete peersRef.current[callerID];
          setPeers(prev => {
            const newPeers = { ...prev };
            delete newPeers[callerID];
            return newPeers;
          });
          
          if (resourcesRef.current.audioElements.has(callerID)) {
            const audioElement = resourcesRef.current.audioElements.get(callerID);
            if (audioElement) {
              audioElement.pause();
              audioElement.srcObject = null;
            }
            resourcesRef.current.audioElements.delete(callerID);
          }
        }
      });

      peer.on('close', () => {
        console.log(`🔗 Peer connection closed for caller ${callerID}`);
        if (peer.audioElement) {
          peer.audioElement.pause();
          peer.audioElement.srcObject = null;
        }
        
        if (resourcesRef.current.audioElements.has(callerID)) {
          resourcesRef.current.audioElements.delete(callerID);
        }
      });

      // FIXED: Safe signal handling
      try {
        if (incomingSignal.type && (incomingSignal.sdp || incomingSignal.candidate)) {
          peer.signal(incomingSignal);
        } else {
          console.error('❌ Invalid signal structure:', incomingSignal);
          peer.destroy();
          return null;
        }
      } catch (error) {
        console.error('❌ Error signaling peer:', error);
        peer.destroy();
        return null;
      }

      return peer;
    } catch (error) {
      console.error('❌ Error adding peer:', error);
      return null;
    }
  }, [getSocket, roomId, createAudioElement]);

  // ============================================================================
  // CHROME-OPTIMIZED AUDIO STREAM INITIALIZATION
  // ============================================================================
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
          sampleRate: 44100,
          channelCount: 1,
          latency: 0.01,
          // Chrome-specific optimizations
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true
        }
      });

      if (resourcesRef.current.isCleaningUp) {
        mediaStream.getTracks().forEach(track => track.stop());
        throw new Error('Component was cleaned up during initialization');
      }

      setStream(mediaStream);
      streamRef.current = mediaStream;
      resourcesRef.current.mediaStream = mediaStream;
      
      mediaStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
        console.log('🎤 Audio track settings:', track.getSettings());
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
      } else if (error.message !== 'Component is cleaning up' && error.message !== 'Component was cleaned up during initialization') {
        errorMessage = `Microphone error: ${error.message}`;
      }
      
      setError(errorMessage);
      setIsConnecting(false);
      throw error;
    }
  }, [isMuted]);

  // ============================================================================
  // SPEAKING DETECTION
  // ============================================================================
  const setupSpeakingDetection = useCallback((mediaStream) => {
    try {
      if (resourcesRef.current.isCleaningUp) {
        console.log('🚫 Skipping audio setup - component is cleaning up');
        return;
      }
      
      if (resourcesRef.current.audioContext && 
          resourcesRef.current.audioContext.state !== 'closed') {
        console.log('🔄 Closing existing AudioContext before creating new one');
        resourcesRef.current.audioContext.close().catch(console.warn);
      }
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      
      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyser);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      resourcesRef.current.audioContext = audioContext;
      resourcesRef.current.analyser = analyser;
      
      const checkSpeaking = () => {
        if (resourcesRef.current.isCleaningUp || 
            !resourcesRef.current.analyser ||
            !audioContext ||
            audioContext.state === 'closed') {
          return;
        }
        
        try {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
          const normalizedLevel = (average / 128) * 100;
          
          const isSpeaking = normalizedLevel > 8 && !isMuted;
          
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
          
          if (!resourcesRef.current.isCleaningUp && 
              resourcesRef.current.mediaStream &&
              resourcesRef.current.mediaStream.active) {
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

  // ============================================================================
  // ENHANCED CLEANUP
  // ============================================================================
  const handleLeaveVoice = useCallback(() => {
    console.log('👋 Starting comprehensive voice chat cleanup...');
    
    resourcesRef.current.isCleaningUp = true;
    
    try {
      const socket = getSocket();
      
      // Cancel animation frames
      if (resourcesRef.current.animationFrameId) {
        cancelAnimationFrame(resourcesRef.current.animationFrameId);
        resourcesRef.current.animationFrameId = null;
      }
      
      // Close all peer connections
      console.log('🔗 Closing peer connections...');
      Object.values(peersRef.current).forEach(peer => {
        if (peer && typeof peer.destroy === 'function') {
          try {
            if (peer.audioElement) {
              peer.audioElement.pause();
              peer.audioElement.srcObject = null;
            }
            peer.destroy();
          } catch (error) {
            console.warn('⚠️ Error destroying peer:', error);
          }
        }
      });
      
      // Clean up all audio elements
      console.log('🔊 Cleaning up audio elements...');
      for (const [userId, audioElement] of resourcesRef.current.audioElements) {
        try {
          if (audioElement) {
            audioElement.pause();
            audioElement.srcObject = null;
          }
        } catch (error) {
          console.warn(`⚠️ Error cleaning up audio element for ${userId}:`, error);
        }
      }
      resourcesRef.current.audioElements.clear();
      
      // Clean up manual play buttons
      resourcesRef.current.manualPlayButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button && document.body.contains(button)) {
          document.body.removeChild(button);
        }
      });
      resourcesRef.current.manualPlayButtons.clear();
      
      // Stop media stream
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
      
      // Close audio context
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
      
      // Clear timeouts
      Object.values(speakingTimeoutRef.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
      speakingTimeoutRef.current = {};
      
      // Notify server
      if (socket && socket.connected) {
        socket.emit('leave-voice-room', {
          roomId,
          userId: user.id
        });
      }

      // Reset state
      setPeers({});
      peersRef.current = {};
      setStream(null);
      streamRef.current = null;
      setIsConnected(false);
      setConnectedUsers([]);
      setSpeakingUsers(new Set());
      setError('');
      setIsConnecting(false);
      isStableConnectionRef.current = false;
      
      console.log('✅ Voice chat cleanup completed successfully');

    } catch (error) {
      console.error('❌ Error during voice chat cleanup:', error);
      // Reset state even if cleanup fails
      setPeers({});
      peersRef.current = {};
      setStream(null);
      streamRef.current = null;
      setIsConnected(false);
      setConnectedUsers([]);
      setSpeakingUsers(new Set());
      isStableConnectionRef.current = false;
    } finally {
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
      
      socket.emit('join-voice-room', {
        roomId,
        userId: user.id,
        username: user.username
      });

      setTimeout(() => {
        if (!resourcesRef.current.isCleaningUp) {
          isStableConnectionRef.current = true;
          setIsConnected(true);
          setIsConnecting(false);
          console.log('✅ Connection stabilized after timeout');
        }
      }, 2000);
      
      console.log('✅ Successfully joined voice chat room');

    } catch (error) {
      console.error('❌ Failed to join voice chat:', error);
      setIsConnecting(false);
    }
  }, [roomId, user, initializeAudioStream, getSocket, roomConnected]);

  // Toggle mute
  const handleToggleMute = useCallback(() => {
    try {
      if (resourcesRef.current.mediaStream && !resourcesRef.current.isCleaningUp) {
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

  // Update volume for all audio elements
  useEffect(() => {
    try {
      for (const [userId, audioElement] of resourcesRef.current.audioElements) {
        if (audioElement) {
          audioElement.volume = volume / 100;
        }
      }
    } catch (error) {
      console.error('❌ Error updating volume:', error);
    }
  }, [volume]);

  // Get available audio devices on component mount
  useEffect(() => {
    getAudioOutputDevices();
  }, [getAudioOutputDevices]);

  // Socket event handlers with enhanced audio management
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

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
          console.error('❌ Error handling user joined voice:', error);
        }
      }
    };

    const handleReceivingSignal = ({ signal, id }) => {
      console.log(`📞 Receiving signal from user ${id}`);
      
      try {
        if (peersRef.current[id] && signal) {
          peersRef.current[id].signal(signal);
        }
      } catch (error) {
        console.error('❌ Error handling signal:', error);
      }
    };

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
          console.error('❌ Error handling incoming call:', error);
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
        
        if (resourcesRef.current.audioElements.has(userId)) {
          const audioElement = resourcesRef.current.audioElements.get(userId);
          if (audioElement) {
            audioElement.pause();
            audioElement.srcObject = null;
          }
          resourcesRef.current.audioElements.delete(userId);
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
        console.error('❌ Error handling user left voice:', error);
      }
    };

    const handleVoiceRoomUsers = ({ users: voiceUsers }) => {
      console.log('🔄 Voice room users updated:', voiceUsers);
      
      if (resourcesRef.current.mediaStream && isConnected && !resourcesRef.current.isCleaningUp) {
        voiceUsers.forEach(voiceUser => {
          if (voiceUser.userId !== user.id && !peersRef.current[voiceUser.userId]) {
            console.log(`📞 Calling user ${voiceUser.username}`);
            
            try {
              const delay = Math.random() * 1000 + 500; // 500-1500ms delay
              setTimeout(() => {
                if (!resourcesRef.current.isCleaningUp && resourcesRef.current.mediaStream) {
                  const peer = createPeer(voiceUser.userId, user.id, resourcesRef.current.mediaStream);
                  if (peer) {
                    peersRef.current[voiceUser.userId] = peer;
                    setPeers(prev => ({ ...prev, [voiceUser.userId]: peer }));
                    setConnectedUsers(prev => [...prev.filter(u => u.id !== voiceUser.userId), voiceUser]);
                  }
                }
              }, delay);
            } catch (error) {
              console.error('❌ Error calling user:', error);
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

    return () => {
      socket.off('user-joined-voice', handleUserJoinedVoice);
      socket.off('receiving-returned-signal', handleReceivingSignal);
      socket.off('user-calling', handleUserCalling);
      socket.off('user-left-voice', handleUserLeftVoice);
      socket.off('voice-room-users', handleVoiceRoomUsers);
    };
  }, [getSocket, user.id, user.username, isConnected, createPeer, addPeer]);

  // Update user count
  useEffect(() => {
    const totalUsers = connectedUsers.length + (isConnected ? 1 : 0);
    onUserCountChange?.(totalUsers);
  }, [connectedUsers.length, isConnected, onUserCountChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isStableConnectionRef.current) {
        console.log('🧹 WebRTCVoiceChat component unmounting - initiating cleanup');
        handleLeaveVoice();
      }
    };
  }, [handleLeaveVoice]);

  // Audio output test function
  const testAudioOutput = useCallback(() => {
    try {
      console.log('🎵 Testing audio output...');
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      
      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        audioContext.close();
        console.log('🎵 Audio test completed - you should have heard a beep');
      }, 500);
      
    } catch (error) {
      console.error('❌ Audio test failed:', error);
    }
  }, []);

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
            isConnected ? 'bg-green-500 animate-pulse' : 
            isConnecting ? 'bg-yellow-500 animate-pulse' :
            error ? 'bg-red-500' :
            'bg-gray-400'
          }`}></div>
          <span>
            {isConnected ? 'Connected to Voice Chat (Chrome Optimized)' :
             isConnecting ? 'Connecting...' :
             error ? 'Connection Failed' :
             'Ready to Connect'
            }
          </span>
        </div>
      </div>

      {/* Audio Output Device Selection */}
      {availableOutputDevices.length > 1 && (
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="text-sm font-medium text-blue-800 mb-2 flex items-center justify-between">
            <span>🔊 Audio Output Device</span>
            <button
              onClick={selectAudioOutputDevice}
              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
            >
              Select Device
            </button>
          </div>
          <select
            value={audioOutputDevice}
            onChange={(e) => setAudioOutputDevice(e.target.value)}
            className="w-full text-xs p-2 border border-blue-200 rounded"
          >
            <option value="default">Default Audio Output</option>
            {availableOutputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Chrome Compatibility Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="text-sm text-blue-800">
          <div className="flex items-center space-x-2 mb-2">
            <span>🌐</span>
            <span className="font-semibold">Chrome WebRTC Enhanced</span>
          </div>
          <ul className="text-xs space-y-1">
            <li>• Fixed peer connection signaling</li>
            <li>• Chrome autoplay restrictions handled</li>
            <li>• Enhanced error recovery</li>
            <li>• Optimized audio stream processing</li>
          </ul>
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
                <div className={`w-2 h-2 rounded-full ${
                  resourcesRef.current.audioElements.has(connectedUser.id) ? 'bg-green-400' : 'bg-gray-400'
                }`} title={`Audio ${resourcesRef.current.audioElements.has(connectedUser.id) ? 'Active' : 'Inactive'}`}></div>
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
              '🎙️ Join Voice Chat (Chrome Fixed)'
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

        {/* Audio Test Button */}
        <button
          onClick={testAudioOutput}
          className="w-full py-2 px-4 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors text-sm"
        >
          🎵 Test Audio Output
        </button>
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
                <p><strong>Chrome Setup Instructions:</strong></p>
                <ol className="list-decimal list-inside mt-1 space-y-1">
                  <li>Click the microphone icon in Chrome's address bar</li>
                  <li>Select "Always allow" for microphone access</li>
                  <li>Refresh the page and try again</li>
                  <li>Check Chrome settings: chrome://settings/content/microphone</li>
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

      {/* Audio Status Indicators */}
      {isConnected && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="text-sm text-green-800">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">🎵 Audio Status:</span>
              <span className="text-xs">
                {resourcesRef.current.audioElements.size} active stream{resourcesRef.current.audioElements.size !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="font-medium">Microphone:</span> {isMuted ? '🔇 Muted' : '🎙️ Active'}
              </div>
              <div>
                <span className="font-medium">Output:</span> {audioOutputDevice === 'default' ? '🔊 Default' : '🎧 Custom'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug Info (Development Only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <details className="text-sm">
            <summary className="font-medium text-yellow-800 cursor-pointer">🐛 Chrome WebRTC Debug</summary>
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
              <div>Audio Elements: {resourcesRef.current.audioElements.size}</div>
              <div>Manual Play Buttons: {resourcesRef.current.manualPlayButtons.size}</div>
              <div>Audio Output Device: {audioOutputDevice}</div>
              <div>Available Devices: {availableOutputDevices.length}</div>
              <div>Is Cleaning Up: {resourcesRef.current.isCleaningUp.toString()}</div>
              <div>Stable Connection: {isStableConnectionRef.current.toString()}</div>
              <div>Chrome Compatibility: Enhanced</div>
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

  // Handle permission response (owner/moderator only)
  const handlePermissionResponse = (username, granted) => {
    sendAudioPermissionResponse(username, granted);
    
    const action = granted ? 'granted' : 'denied';
    setPermissionStatus(`✅ Permission ${action} for ${username}`);
    
    setTimeout(() => {
      setPermissionStatus('');
    }, 3000);
  };

  // Handle voice chat user count update
  const handleVoiceUserCountChange = (count) => {
    setVoiceChatUsers(count);
  };

  // Listen for permission responses
  useEffect(() => {
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
            🎵 Chrome WebRTC Voice Chat
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

            <div className="mt-4 text-xs text-gray-500">
              <p>Room owners and moderators can grant voice chat access</p>
              {(isRoomOwner() || isRoomModerator()) && (
                <p className="text-green-600 mt-1">You have permission management privileges</p>
              )}
            </div>
          </div>
        ) : (
          /* Enhanced WebRTC Voice Chat Component */
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
            <>🎙️ Chrome WebRTC voice chat with enhanced compatibility</>
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