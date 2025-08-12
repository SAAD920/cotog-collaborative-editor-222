// src/components/EnterRoomCard.js - UPDATED VERSION WITH ENHANCED SECURITY SECTION REMOVED
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';

const EnterRoomCard = () => {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  
  const [formData, setFormData] = useState({
    roomId: '',
    roomPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (error) setError('');
  };

  const validateForm = () => {
    if (!isAuthenticated) {
      setError("Please log in to join a room");
      return false;
    }
    
    if (!formData.roomId.trim()) {
      setError("Room ID is required");
      return false;
    }
    
    if (!formData.roomPassword) {
      setError("Room password is required");
      return false;
    }
    
    return true;
  };

  const checkRoomExists = async (roomId) => {
    try {
      const response = await fetch(`https://cotog-backend.onrender.com/api/room/${roomId}`);
      
      if (response.ok) {
        const roomData = await response.json();
        return roomData;
      } else if (response.status === 404) {
        throw new Error('Room not found');
      } else {
        throw new Error('Failed to verify room');
      }
    } catch (err) {
      throw new Error(err.message || 'Failed to connect to server');
    }
  };

  // 🔧 CRITICAL FIX: Enhanced room joining with proper URL construction
  const handleJoinRoom = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    setError('');

    try {
      // First, check if the room exists
      const roomData = await checkRoomExists(formData.roomId.trim());
      
      console.log('✅ Room found:', roomData);
      
      // 🔧 CRITICAL FIX: Validate roomId format and construct proper URL
      const roomId = formData.roomId.trim();
      
      // Enhanced validation
      if (!roomId || roomId.length < 3) {
        throw new Error('Room ID must be at least 3 characters');
      }
      
      if (roomId.includes('[') || roomId.includes(']')) {
        throw new Error('Invalid room ID format - contains template literals');
      }
      
      if (!/^[a-zA-Z0-9_-]+$/.test(roomId)) {
        throw new Error('Room ID can only contain letters, numbers, underscores, and hyphens');
      }
      
      // 🔧 CRITICAL FIX: Construct URL with proper encoding
      const queryParams = new URLSearchParams({
        roomPassword: formData.roomPassword,
        maxUsers: roomData.maxUsers.toString(),
        username: user.username,
        joinedAt: new Date().toISOString()
      });
      
      // Construct the room URL properly
      const roomUrl = `/room/${encodeURIComponent(roomId)}?${queryParams.toString()}`;
      
      console.log('🚀 Enhanced navigation to room:', {
        roomId,
        roomUrl,
        encodedRoomId: encodeURIComponent(roomId),
        queryString: queryParams.toString()
      });
      
      // 🔧 CRITICAL FIX: Use router.push with proper URL encoding
      await router.push(roomUrl);
      
    } catch (err) {
      setError(err.message || 'Failed to join room. Please try again.');
      console.error('❌ Error joining room:', err);
    } finally {
      setLoading(false);
    }
  };

  const goToCreateRoom = () => {
    if (!isAuthenticated) {
      setError("Please log in to create a room");
      return;
    }
    router.push('/create-room');
  };

  // Show login prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="bg-black text-white p-6 rounded-lg shadow-lg max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🔐</div>
          <h3 className="text-2xl font-bold">Authentication Required</h3>
          <p className="text-gray-300 text-sm">Please log in to join or create rooms</p>
        </div>
        
        <div className="space-y-3">
          <button
            onClick={() => router.push('/login')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded font-semibold transition-colors"
          >
            Login
          </button>
          <button
            onClick={() => router.push('/signup')}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded font-semibold transition-colors"
          >
            Sign Up
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black text-white p-6 rounded-lg shadow-lg max-w-md mx-auto">
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">🚪</div>
        <h3 className="text-2xl font-bold">Join Room</h3>
        <p className="text-gray-300 text-sm">
          Joining as: <span className="text-blue-400 font-semibold">{user?.firstName} {user?.lastName}</span>
        </p>
      </div>

      {error && (
        <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded mb-4">
          <p className="text-sm">{error}</p>
        </div>
      )}
      
      <div className="space-y-5">
        {/* Room ID with Enhanced Validation */}
        <div>
          <label htmlFor="roomId" className="block text-sm font-medium mb-2">
            Room ID *
          </label>
          <input
            type="text"
            id="roomId"
            name="roomId"
            value={formData.roomId}
            onChange={handleInputChange}
            className="w-full p-3 bg-gray-800 text-white rounded border border-gray-700 focus:border-blue-500 focus:outline-none transition-colors"
            placeholder="Enter Room ID"
            required
            disabled={loading}
            maxLength={50}
            pattern="[a-zA-Z0-9_-]+"
            title="Room ID can only contain letters, numbers, underscores, and hyphens"
          />
          <div className="mt-1 space-y-1">
            <p className="text-xs text-gray-400">3-50 characters, letters, numbers, _ and - only</p>
            {formData.roomId && (
              <div className="text-xs">
                {formData.roomId.length >= 3 ? (
                  <span className="text-green-400">✓ Valid length</span>
                ) : (
                  <span className="text-red-400">✗ Too short (min 3)</span>
                )}
                {/^[a-zA-Z0-9_-]*$/.test(formData.roomId) ? (
                  <span className="text-green-400 ml-3">✓ Valid characters</span>
                ) : (
                  <span className="text-red-400 ml-3">✗ Invalid characters</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Room Password */}
        <div>
          <label htmlFor="roomPassword" className="block text-sm font-medium mb-2">
            Room Password *
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              id="roomPassword"
              name="roomPassword"
              value={formData.roomPassword}
              onChange={handleInputChange}
              className="w-full p-3 bg-gray-800 text-white rounded border border-gray-700 focus:border-blue-500 focus:outline-none transition-colors pr-10"
              placeholder="Enter Room Password"
              required
              disabled={loading}
              maxLength={100}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
              disabled={loading}
            >
              {showPassword ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L12 12m-3.122-3.122a3 3 0 013.122 3.122M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Case-sensitive password</p>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleJoinRoom}
          disabled={loading || !formData.roomId.trim() || !formData.roomPassword || !/^[a-zA-Z0-9_-]+$/.test(formData.roomId)}
          className={`w-full py-3 rounded font-semibold transition-all duration-200 ${
            loading || !formData.roomId.trim() || !formData.roomPassword || !/^[a-zA-Z0-9_-]+$/.test(formData.roomId)
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 transform hover:scale-[1.02]'
          } text-white`}
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Joining Room...
            </div>
          ) : (
            'Join Room'
          )}
        </button>
      </div>

      {/* Create Room Link */}
      <div className="mt-6 text-center">
        <p className="text-gray-400 text-sm mb-2">Don't have a room?</p>
        <button
          onClick={goToCreateRoom}
          className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
          disabled={loading}
        >
          Create New Room
        </button>
      </div>
    </div>
  );
};

export default EnterRoomCard;

