// src/pages/index.js - CLEANED VERSION WITH UNUSED CODE REMOVED
import React from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import EnterRoomCard from '@/components/EnterRoomCard';
import { useAuth } from '@/contexts/AuthContext';

// Common features data to avoid duplication
const platformFeatures = [
  {
    icon: "⚡",
    title: "Real-time Collaboration",
    description: "Work together with your team in real-time, making coding more efficient and interactive.",
    requiresAuth: true
  },
  {
    icon: "🌐",
    title: "Multiple Language Support", 
    description: "Supports JavaScript, Python, HTML, CSS, C++, Java, and more for versatile coding.",
    requiresAuth: false
  },
  {
    icon: "🎨",
    title: "Syntax Highlighting",
    description: "Enjoy a better coding experience with syntax highlighting for various programming languages.",
    requiresAuth: false
  },
  {
    icon: "🔗",
    title: "Code Sharing",
    description: "Easily share your code with others through unique room links.",
    requiresAuth: true
  },
  {
    icon: "💬",
    title: "Integrated Chat",
    description: "Communicate with your team directly within the editor for seamless collaboration.",
    requiresAuth: true
  },
  {
    icon: "🎙️",
    title: "Voice Communication",
    description: "Enhanced WebRTC voice chat for complex discussions and pair programming.",
    requiresAuth: true
  }
];

// Demo accounts data to avoid repetition
const demoAccounts = [
  { email: 'john.doe@example.com', role: 'Regular User' },
  { email: 'sarah.wilson@example.com', role: 'Admin' },
  { email: 'alex.kim@example.com', role: 'Moderator' }
];

const Home = () => {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div>
        <Navbar />
        <div className="container mx-auto p-4 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      
      {/* Main Hero Section */}
      <div className="container mx-auto p-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 text-gray-800">
            {isAuthenticated 
              ? `Welcome back, ${user?.firstName || user?.username}! 👋`
              : 'Welcome to COTOG'
            }
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            {isAuthenticated 
              ? 'Ready to collaborate? Create a new room or join an existing one to start coding with your team.'
              : 'COTOG is a collaborative code editor that allows you to work with your team in real-time. Create an account to access room features, or use the solo editor to get started right away.'
            }
          </p>
          
          {/* Quick Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            {isAuthenticated ? (
              <>
                <Link href="/create-room">
                  <button className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md">
                    🏠 Create New Room
                  </button>
                </Link>
                <Link href="/code-editor">
                  <button className="bg-purple-600 hover:bg-purple-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md">
                    💻 Solo Code Editor
                  </button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/signup">
                  <button className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md">
                    🚀 Create Free Account
                  </button>
                </Link>
                <Link href="/login">
                  <button className="bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md">
                    🔐 Sign In
                  </button>
                </Link>
                <Link href="/code-editor">
                  <button className="bg-gray-600 hover:bg-gray-700 text-white py-3 px-6 rounded-lg font-semibold transition-colors shadow-md">
                    💻 Try Solo Editor
                  </button>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Join Room Card for Authenticated Users */}
        {isAuthenticated && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Join a Room</h2>
            <EnterRoomCard />
          </div>
        )}

        {/* User Dashboard for Authenticated Users */}
        {isAuthenticated && user && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h3 className="text-xl font-bold mb-4 text-gray-800">Your COTOG Profile</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-800">Account Type</h4>
                <p className="text-blue-600 capitalize">{user.role || 'User'}</p>
                {user.role === 'admin' && <p className="text-xs text-blue-500 mt-1">Full system access</p>}
                {user.role === 'moderator' && <p className="text-xs text-blue-500 mt-1">Room moderation privileges</p>}
              </div>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-800">Member Since</h4>
                <p className="text-green-600">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Recently'}
                </p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <h4 className="font-semibold text-purple-800">Preferred Language</h4>
                <p className="text-purple-600 capitalize">
                  {user.preferences?.language || 'JavaScript'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Feature Comparison for Non-Authenticated Users */}
        {!isAuthenticated && (
          <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-6 mb-8 border border-blue-200">
            <h3 className="text-xl font-bold text-center mb-6 text-gray-800">What You Get With an Account</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-gray-800 mb-3">👤 Without Account (Solo Mode)</h4>
                <ul className="space-y-2 text-gray-600">
                  <li>✅ Full-featured code editor</li>
                  <li>✅ Syntax highlighting</li>
                  <li>✅ Multiple language support</li>
                  <li>✅ Local code saving</li>
                  <li>❌ No real-time collaboration</li>
                  <li>❌ No room creation</li>
                  <li>❌ No chat features</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-gray-800 mb-3">🎯 With Account (Full Access)</h4>
                <ul className="space-y-2 text-gray-600">
                  <li>✅ Everything in solo mode</li>
                  <li>✅ Create collaboration rooms</li>
                  <li>✅ Real-time code sharing</li>
                  <li>✅ Integrated team chat</li>
                  <li>✅ Voice communication</li>
                  <li>✅ Room management</li>
                  <li>✅ Persistent room history</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Demo Accounts Section for Non-Authenticated Users */}
        {!isAuthenticated && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
            <h3 className="text-lg font-bold text-yellow-800 mb-3">🎯 Try Demo Accounts</h3>
            <p className="text-yellow-700 mb-3">
              Want to test the collaboration features? Use these demo accounts:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-yellow-700">
              {demoAccounts.map(account => (
                <div key={account.email}>
                  <p><strong>{account.role}:</strong> {account.email}</p>
                </div>
              ))}
            </div>
            <p className="text-yellow-700 mt-2"><strong>Password for all:</strong> password123</p>
            <div className="mt-3 text-center">
              <Link href="/login">
                <button className="bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded-lg text-sm font-medium transition-colors">
                  Try Demo Account
                </button>
              </Link>
            </div>
          </div>
        )}

        {/* Collaboration Tips for Authenticated Users */}
        {isAuthenticated && (
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 mb-8">
            <h3 className="text-xl font-bold mb-4 text-gray-800">💡 Collaboration Tips</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-700">🚀 Getting Started:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Create a room and invite team members</li>
                  <li>• Use descriptive room names</li>
                  <li>• Set appropriate user limits</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-700">🤝 Best Practices:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Communicate through integrated chat</li>
                  <li>• Use voice features for complex discussions</li>
                  <li>• Share room links securely</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Platform Features Section */}
      <div className="container mx-auto p-4">
        <h2 className="text-3xl font-bold mb-8 text-center text-gray-800">Platform Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {platformFeatures.map((feature, index) => (
            <div key={index} className="border border-gray-200 p-6 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 bg-white">
              <div className="text-3xl mb-3">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-2 text-gray-800">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
              {!isAuthenticated && feature.requiresAuth && (
                <p className="text-sm text-blue-600 mt-2 font-medium">Requires account</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Call to Action Section */}
      <div className={`py-12 ${isAuthenticated ? 'bg-blue-50' : 'bg-gray-50'}`}>
        <div className="container mx-auto p-4 text-center">
          <h2 className="text-3xl font-bold mb-6 text-gray-800">
            {isAuthenticated ? 'Ready to Collaborate?' : 'Ready to Get Started?'}
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            {isAuthenticated 
              ? 'Create a room and start coding with your team in real-time'
              : 'Join thousands of developers who are already collaborating on COTOG'
            }
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {isAuthenticated ? (
              <>
                <Link href="/create-room">
                  <button className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-8 rounded-lg font-semibold transition-colors shadow-md">
                    🏠 Create New Room
                  </button>
                </Link>
                <Link href="/code-editor">
                  <button className="bg-purple-600 hover:bg-purple-700 text-white py-3 px-8 rounded-lg font-semibold transition-colors shadow-md">
                    💻 Solo Coding Session
                  </button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/signup">
                  <button className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-8 rounded-lg font-semibold transition-colors shadow-md">
                    Create Your Free Account
                  </button>
                </Link>
                <Link href="/code-editor">
                  <button className="bg-gray-600 hover:bg-gray-700 text-white py-3 px-8 rounded-lg font-semibold transition-colors shadow-md">
                    Try Solo Editor First
                  </button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer Section */}
      <footer className="bg-gray-800 text-white p-6 text-center">
        <div className="container mx-auto">
          <p className="mb-2">&copy; 2024 COTOG. All rights reserved.</p>
          <p className="text-sm text-gray-400">
            {isAuthenticated 
              ? `Logged in as ${user?.email} • ${user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'User'} Account` 
              : 'Sign up today to unlock collaborative features!'
            }
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Home;