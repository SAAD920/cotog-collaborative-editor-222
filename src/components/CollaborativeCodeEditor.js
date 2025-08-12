// src/components/CollaborativeCodeEditor.js - SIMPLIFIED ROLE SYSTEM
import React, { useState, useEffect, useCallback, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { autocompletion } from '@codemirror/autocomplete';
import { useRoom } from '@/contexts/RoomContext';

const CollaborativeCodeEditor = () => {
  const { 
    code: roomCode, 
    language, 
    sendCodeChange, 
    sendLanguageChange,
    isRoomOwner, // SIMPLIFIED: Only room owner can change language
    lastEditUser,
    users,
    isConnected,
    currentUser,
    userRole // SIMPLIFIED: Will be 'owner' or 'member'
  } = useRoom();

  const [localCode, setLocalCode] = useState('// Welcome to collaborative coding!\n// Start typing to share your code with the team...');
  const [isTyping, setIsTyping] = useState(false);
  const [output, setOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [languageChangeStatus, setLanguageChangeStatus] = useState('');
  
  // Critical refs for preventing loops
  const lastSentCodeRef = useRef('');
  const lastReceivedCodeRef = useRef('');
  const isInitializedRef = useRef(false);
  const typingTimeoutRef = useRef(null);
  const sendTimeoutRef = useRef(null);

  // Initialize once when room code is available
  useEffect(() => {
    if (roomCode !== undefined && !isInitializedRef.current) {
      console.log('🔄 Initializing editor with room code');
      setLocalCode(roomCode);
      lastSentCodeRef.current = roomCode;
      lastReceivedCodeRef.current = roomCode;
      isInitializedRef.current = true;
    }
  }, [roomCode]);

  // FIXED: Only sync if it's actually from another user
  useEffect(() => {
    if (isInitializedRef.current && 
        roomCode !== undefined && 
        roomCode !== localCode && 
        roomCode !== lastSentCodeRef.current &&
        roomCode !== lastReceivedCodeRef.current &&
        lastEditUser &&
        lastEditUser !== currentUser &&
        lastEditUser !== 'System') {
      
      console.log('📝 Syncing code from room (other user edit):', lastEditUser);
      setLocalCode(roomCode);
      lastReceivedCodeRef.current = roomCode;
    }
  }, [roomCode, localCode, lastEditUser, currentUser]);

  // FIXED: Debounced send with proper loop prevention
  const debouncedSendCodeChange = useCallback((() => {
    return (newCode) => {
      // Clear any existing timeout
      if (sendTimeoutRef.current) {
        clearTimeout(sendTimeoutRef.current);
      }
      
      // Set new timeout
      sendTimeoutRef.current = setTimeout(() => {
        // Only send if connected, code changed, and not already sent
        if (isConnected && 
            newCode !== lastSentCodeRef.current && 
            newCode !== lastReceivedCodeRef.current &&
            newCode !== roomCode) {
          
          console.log('📡 Sending code to room:', newCode.length, 'characters');
          
          sendCodeChange(newCode, language || 'javascript');
          lastSentCodeRef.current = newCode;
        }
      }, 300);
    };
  })(), [sendCodeChange, language, isConnected, roomCode]);

  // Handle editor changes - Clean and simple
  const handleEditorChange = useCallback((value) => {
    // Update local state immediately for responsive UI
    setLocalCode(value);
    
    // Handle typing indicator
    if (!isTyping) {
      setIsTyping(true);
    }
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1000);

    // Debounced send
    debouncedSendCodeChange(value);
  }, [debouncedSendCodeChange, isTyping]);

  // Handle language change - SIMPLIFIED: Only room owner can change language
  const handleLanguageChange = useCallback(async (event) => {
    const newLanguage = event.target.value;
    
    if (!isConnected) {
      setLanguageChangeStatus('❌ Not connected to room');
      event.target.value = language || 'javascript';
      setTimeout(() => setLanguageChangeStatus(''), 3000);
      return;
    }

    // SIMPLIFIED: Only room owner can change language
    const canChangeLanguage = isRoomOwner();
    if (!canChangeLanguage) {
      setLanguageChangeStatus('❌ Only room creator can change language');
      event.target.value = language || 'javascript';
      setTimeout(() => setLanguageChangeStatus(''), 3000);
      return;
    }

    try {
      setLanguageChangeStatus(`🔄 Changing language to ${newLanguage.toUpperCase()}...`);
      
      const success = sendLanguageChange(newLanguage, localCode);
      
      if (success) {
        setLanguageChangeStatus(`✅ Language changed to ${newLanguage.toUpperCase()}`);
      } else {
        throw new Error('Failed to send language change');
      }
      
      setTimeout(() => setLanguageChangeStatus(''), 3000);
      
    } catch (error) {
      console.error('Language change error:', error);
      setLanguageChangeStatus('❌ Failed to change language');
      event.target.value = language || 'javascript';
      setTimeout(() => setLanguageChangeStatus(''), 3000);
    }
  }, [sendLanguageChange, localCode, isRoomOwner, isConnected, language]);

  // Get language extension for CodeMirror
  const getLanguageExtension = (lang) => {
    const currentLang = lang || language || 'javascript';
    switch (currentLang) {
      case 'javascript': return javascript();
      case 'python': return python();
      case 'html': return html();
      case 'css': return css();
      case 'cpp': return cpp();
      case 'java': return java();
      default: return javascript();
    }
  };

  // Get default code template for language
  const getLanguageTemplate = (lang) => {
    switch (lang) {
      case 'javascript':
        return '// JavaScript Code\nconsole.log("Hello, World!");';
      case 'python':
        return '# Python Code\nprint("Hello, World!")';
      case 'html':
        return '<!DOCTYPE html>\n<html>\n<head>\n    <title>Hello World</title>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n</body>\n</html>';
      case 'css':
        return '/* CSS Styles */\nbody {\n    font-family: Arial, sans-serif;\n    margin: 0;\n    padding: 20px;\n    background-color: #f5f5f5;\n}';
      case 'cpp':
        return '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}';
      case 'java':
        return 'public class HelloWorld {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}';
      default:
        return '// Start coding here...\n';
    }
  };

  // Execute code with support for all languages
  const executeCode = async () => {
    setIsExecuting(true);
    const currentLang = language || 'javascript';
    
    try {
      switch (currentLang) {
        case 'javascript':
          await executeJavaScript();
          break;
        case 'python':
          await executePython();
          break;
        case 'html':
          executeHTML();
          break;
        case 'css':
          executeCSS();
          break;
        case 'cpp':
          await executeCpp();
          break;
        case 'java':
          await executeJava();
          break;
        default:
          setOutput('Language not supported for execution');
      }
    } catch (error) {
      setOutput(`Error: ${error.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // JavaScript execution (browser eval) - ENHANCED
  const executeJavaScript = async () => {
    try {
      const logs = [];
      const originalLog = console.log;
      const originalError = console.error;
      const originalWarn = console.warn;
      
      console.log = (...args) => {
        logs.push('LOG: ' + args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '));
        originalLog(...args);
      };
      
      console.error = (...args) => {
        logs.push('ERROR: ' + args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '));
        originalError(...args);
      };
      
      console.warn = (...args) => {
        logs.push('WARN: ' + args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '));
        originalWarn(...args);
      };

      const result = eval(localCode);
      
      // Restore console methods
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      
      let output = '';
      if (logs.length > 0) {
        output += 'Console Output:\n' + logs.join('\n') + '\n\n';
      }
      if (result !== undefined) {
        output += 'Return Value:\n' + (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
      }
      
      setOutput(output || 'Code executed successfully (no output)');
    } catch (error) {
      setOutput(`JavaScript Error: ${error.message}\n\nStack Trace:\n${error.stack}`);
    }
  };

  // Python execution (using Pyodide - browser Python) - ENHANCED
  const executePython = async () => {
    try {
      setOutput('Loading Python environment...');
      
      if (window.pyodide) {
        await runPythonCode();
      } else {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
        script.onload = async () => {
          try {
            setOutput('Initializing Python environment...');
            window.pyodide = await loadPyodide();
            setOutput('Python ready! Running your code...');
            await runPythonCode();
          } catch (error) {
            setOutput(`Python initialization failed: ${error.message}\n\nFalling back to enhanced simulation...`);
            await executePythonEnhanced();
          }
        };
        script.onerror = async () => {
          setOutput('Python environment failed to load. Running enhanced simulation...');
          await executePythonEnhanced();
        };
        document.head.appendChild(script);
      }
    } catch (error) {
      setOutput(`Python execution error: ${error.message}`);
    }
  };

  const runPythonCode = async () => {
    try {
      window.pyodide.runPython(`
import sys
from io import StringIO
import contextlib

old_stdout = sys.stdout
old_stderr = sys.stderr
sys.stdout = mystdout = StringIO()
sys.stderr = mystderr = StringIO()
      `);
      
      const result = window.pyodide.runPython(localCode);
      
      const stdout = window.pyodide.runPython('mystdout.getvalue()');
      const stderr = window.pyodide.runPython('mystderr.getvalue()');
      
      window.pyodide.runPython(`
sys.stdout = old_stdout
sys.stderr = old_stderr
      `);
      
      let output = 'Python Output:\n';
      if (stdout) output += stdout;
      if (stderr) output += '\nErrors:\n' + stderr;
      if (result !== undefined && result !== null) {
        output += '\nReturn Value: ' + String(result);
      }
      
      setOutput(output || 'Python code executed successfully (no output)');
    } catch (error) {
      setOutput(`Python Runtime Error: ${error.message}`);
    }
  };

  // Enhanced Python execution (fallback)
  const executePythonEnhanced = async () => {
    try {
      let output = '';
      const lines = localCode.split('\n');
      const variables = {};
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;
        
        // Handle print statements
        if (line.includes('print(')) {
          const printMatch = line.match(/print\((.+)\)/);
          if (printMatch) {
            let content = printMatch[1];
            
            // Handle f-strings
            if (content.includes('f"') || content.includes("f'")) {
              const fStringMatch = content.match(/f["']([^"']*?)["']/);
              if (fStringMatch) {
                let fString = fStringMatch[1];
                Object.keys(variables).forEach(varName => {
                  fString = fString.replace(new RegExp(`{${varName}}`, 'g'), variables[varName]);
                });
                output += fString + '\n';
              }
            }
            // Handle string literals
            else if (content.match(/^["'].*["']$/)) {
              output += content.slice(1, -1) + '\n';
            }
            // Handle variables
            else if (variables[content]) {
              output += variables[content] + '\n';
            }
            // Handle expressions
            else {
              try {
                const expr = content.replace(/\w+/g, (match) => variables[match] || match);
                const result = eval(expr);
                output += result + '\n';
              } catch {
                output += content + '\n';
              }
            }
          }
        }
        
        // Handle variable assignments
        else if (line.includes('=') && !line.includes('==') && !line.includes('!=') && !line.includes('<=') && !line.includes('>=')) {
          const assignMatch = line.match(/(\w+)\s*=\s*(.+)/);
          if (assignMatch) {
            const varName = assignMatch[1];
            let value = assignMatch[2];
            
            if (value.match(/^["'].*["']$/)) {
              variables[varName] = value.slice(1, -1);
            } else if (!isNaN(value)) {
              variables[varName] = Number(value);
            } else {
              try {
                const expr = value.replace(/\w+/g, (match) => variables[match] || match);
                variables[varName] = eval(expr);
              } catch {
                variables[varName] = value;
              }
            }
          }
        }
        
        // Handle for loops
        else if (line.startsWith('for ')) {
          const forMatch = line.match(/for\s+(\w+)\s+in\s+range\((\d+)(?:,\s*(\d+))?\)/);
          if (forMatch) {
            const varName = forMatch[1];
            const start = forMatch[3] ? Number(forMatch[2]) : 0;
            const end = forMatch[3] ? Number(forMatch[3]) : Number(forMatch[2]);
            
            // Find the loop body
            let j = i + 1;
            const loopBody = [];
            while (j < lines.length && (lines[j].startsWith('    ') || lines[j].trim() === '')) {
              if (lines[j].trim()) {
                loopBody.push(lines[j].replace(/^    /, ''));
              }
              j++;
            }
            
            // Execute loop
            for (let k = start; k < end; k++) {
              variables[varName] = k;
              for (const bodyLine of loopBody) {
                if (bodyLine.includes('print(')) {
                  const printMatch = bodyLine.match(/print\((.+)\)/);
                  if (printMatch) {
                    let content = printMatch[1];
                    if (content.includes('f"') || content.includes("f'")) {
                      const fStringMatch = content.match(/f["']([^"']*?)["']/);
                      if (fStringMatch) {
                        let fString = fStringMatch[1];
                        Object.keys(variables).forEach(v => {
                          fString = fString.replace(new RegExp(`{${v}}`, 'g'), variables[v]);
                        });
                        output += fString + '\n';
                      }
                    } else if (content.match(/^["'].*["']$/)) {
                      output += content.slice(1, -1) + '\n';
                    } else {
                      try {
                        const result = eval(content.replace(/\w+/g, (match) => variables[match] || match));
                        output += result + '\n';
                      } catch {
                        output += content + '\n';
                      }
                    }
                  }
                }
              }
            }
            i = j - 1;
          }
        }
      }
      
      setOutput(output || 'Python code executed (no output)');
    } catch (error) {
      setOutput(`Python execution error: ${error.message}`);
    }
  };

  // HTML execution (iframe rendering)
  const executeHTML = () => {
    setOutput(localCode);
  };

  // CSS execution (live preview)
  const executeCSS = () => {
    const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        ${localCode}
    </style>
</head>
<body>
    <h1>CSS Preview</h1>
    <p>This is a paragraph to demonstrate your CSS styles.</p>
    <div class="container">
        <div class="box">Box 1</div>
        <div class="box">Box 2</div>
        <div class="box">Box 3</div>
    </div>
    <button>Sample Button</button>
    <ul>
        <li>List item 1</li>
        <li>List item 2</li>
        <li>List item 3</li>
    </ul>
</body>
</html>`;
    setOutput(htmlTemplate);
  };

  // C++ execution (mock)
  const executeCpp = async () => {
    setOutput('Compiling C++ code...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      let output = getMockCppOutput();
      setOutput('C++ Output:\n' + output + '\n\nCompilation and execution completed.');
    } catch (error) {
      setOutput(`C++ execution error: ${error.message}`);
    }
  };

  const getMockCppOutput = () => {
    if (localCode.includes('cout')) {
      const coutMatches = localCode.match(/cout\s*<<\s*["']([^"']*)["']/g);
      if (coutMatches) {
        return coutMatches.map(match => {
          const content = match.match(/cout\s*<<\s*["']([^"']*)["']/)[1];
          return content;
        }).join('\n');
      }
      
      if (localCode.includes('Hello') || localCode.includes('hello')) {
        return 'Hello, World!';
      }
    }
    
    return 'C++ program compiled and executed successfully.';
  };

  // Java execution (mock)
  const executeJava = async () => {
    setOutput('Compiling Java code...');
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    try {
      let output = getMockJavaOutput();
      setOutput('Java Output:\n' + output + '\n\nCompilation and execution completed.');
    } catch (error) {
      setOutput(`Java execution error: ${error.message}`);
    }
  };

  const getMockJavaOutput = () => {
    if (localCode.includes('System.out.println')) {
      const printMatches = localCode.match(/System\.out\.println\(['"`]([^'"`]*)['"`]\)/g);
      if (printMatches) {
        return printMatches.map(match => {
          const content = match.match(/System\.out\.println\(['"`]([^'"`]*)['"`]\)/)[1];
          return content;
        }).join('\n');
      }
      
      if (localCode.includes('Hello') || localCode.includes('hello')) {
        return 'Hello, World!';
      }
    }
    
    return 'Java program compiled and executed successfully.';
  };

  // Save code to localStorage
  const saveCode = () => {
    try {
      const currentLang = language || 'javascript';
      localStorage.setItem(`cotog_code_${currentLang}`, localCode);
      setLanguageChangeStatus(`💾 Code saved locally!`);
      setTimeout(() => setLanguageChangeStatus(''), 2000);
    } catch (error) {
      setLanguageChangeStatus('❌ Failed to save code');
      setTimeout(() => setLanguageChangeStatus(''), 2000);
    }
  };

  // Load code from localStorage
  const loadCode = () => {
    try {
      const currentLang = language || 'javascript';
      const savedCode = localStorage.getItem(`cotog_code_${currentLang}`);
      if (savedCode) {
        setLocalCode(savedCode);
        if (isConnected) {
          debouncedSendCodeChange(savedCode);
        }
        setLanguageChangeStatus(`📂 Code loaded!`);
        setTimeout(() => setLanguageChangeStatus(''), 2000);
      } else {
        setLanguageChangeStatus(`ℹ️ No saved code found`);
        setTimeout(() => setLanguageChangeStatus(''), 2000);
      }
    } catch (error) {
      setLanguageChangeStatus('❌ Failed to load code');
      setTimeout(() => setLanguageChangeStatus(''), 2000);
    }
  };

  // Clear editor
  const clearEditor = () => {
    if (confirm('Clear the editor?')) {
      const template = getLanguageTemplate(language);
      setLocalCode(template);
      if (isConnected) {
        debouncedSendCodeChange(template);
      }
    }
  };

  const currentLanguage = language || 'javascript';

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Editor Header */}
      <div className="flex-shrink-0 bg-gray-100 border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {/* Language Selector */}
            <div className="flex items-center space-x-2">
              <label htmlFor="language" className="text-sm font-medium text-gray-700">
                Language:
              </label>
              <select
                id="language"
                value={currentLanguage}
                onChange={handleLanguageChange}
                disabled={!isConnected || !isRoomOwner()} // SIMPLIFIED: Only room owner can change
                className={`px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                  !isConnected || !isRoomOwner()
                    ? 'bg-gray-100 cursor-not-allowed text-gray-500' 
                    : 'bg-white hover:border-blue-400'
                }`}
              >
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="html">HTML</option>
                <option value="css">CSS</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
              </select>
              {!isRoomOwner() && (
                <span className="text-xs text-gray-500">(Room creator only)</span>
              )}
            </div>

            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {/* User Role Display */}
            <div className="flex items-center space-x-2">
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                {userRole === 'owner' ? '👑 Room Creator' : '👤 Member'}
              </span>
            </div>
          </div>

          {/* Editor Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={executeCode}
              disabled={isExecuting || !isConnected}
              className="flex items-center space-x-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm px-3 py-1 rounded-md transition-colors"
            >
              {isExecuting ? (
                <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
              ) : (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
              )}
              <span>Run</span>
            </button>

            <button
              onClick={saveCode}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded-md transition-colors"
            >
              💾 Save
            </button>

            <button
              onClick={loadCode}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-3 py-1 rounded-md transition-colors"
            >
              📂 Load
            </button>

            <button
              onClick={clearEditor}
              className="bg-red-600 hover:bg-red-700 text-white text-sm px-3 py-1 rounded-md transition-colors"
            >
              🗑️ Clear
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-4">
            <span>👥 {users.length} users online</span>
            {lastEditUser && lastEditUser !== currentUser && lastEditUser !== 'System' && (
              <span>✏️ Last edit by: {lastEditUser}</span>
            )}
            {isTyping && (
              <span className="text-blue-600">⌨️ You are typing...</span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <span>Language: <strong>{currentLanguage.toUpperCase()}</strong></span>
            <span>Lines: {localCode.split('\n').length}</span>
            <span>Characters: {localCode.length}</span>
          </div>
        </div>

        {/* Language Change Status */}
        {languageChangeStatus && (
          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">{languageChangeStatus}</p>
          </div>
        )}

        {/* Simplified Role System Info */}
        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-md">
          <div className="text-xs text-green-800">
            <div className="flex items-center justify-between">
              <span>
                <strong>🔧 Simplified Role System:</strong> 
                {userRole === 'owner' ? ' You created this room and can change the language' : ' Room creator controls language selection'}
              </span>
              <span className="text-green-600 font-medium">
                ✅ No Admin/Moderator complexity!
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex min-h-0">
        {/* Code Editor */}
        <div className="flex-1 relative">
          <CodeMirror
            value={localCode}
            height="100%"
            extensions={[
              getLanguageExtension(currentLanguage),
              autocompletion()
            ]}
            onChange={handleEditorChange}
            theme="light"
            className="h-full"
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              dropCursor: false,
              allowMultipleSelections: false,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              highlightSelectionMatches: true,
              highlightActiveLine: true,
              searchKeymap: true
            }}
            style={{
              fontSize: '14px',
              fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
              height: '100%'
            }}
          />
          
          {/* Loading Overlay */}
          {!isConnected && (
            <div className="absolute inset-0 bg-gray-100 bg-opacity-75 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                <p className="text-gray-600">Connecting to collaboration...</p>
              </div>
            </div>
          )}
        </div>

        {/* Output Panel */}
        <div className="w-1/3 border-l border-gray-200 flex flex-col bg-gray-50">
          <div className="flex-shrink-0 bg-gray-200 px-4 py-2 border-b border-gray-300">
            <h3 className="text-sm font-semibold text-gray-700">Output ({currentLanguage.toUpperCase()})</h3>
          </div>
          <div className="flex-1 p-4 overflow-auto">
            {(currentLanguage === 'html' || currentLanguage === 'css') && output ? (
              <iframe
                title={`${currentLanguage.toUpperCase()} Output`}
                className="w-full h-full border border-gray-300 rounded"
                srcDoc={output}
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div>
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono bg-black text-green-400 p-3 rounded">
                  {output || `Click 'Run' to execute your ${currentLanguage.toUpperCase()} code...`}
                </pre>
                
                {/* Language-specific execution info */}
                <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
                  <h4 className="text-sm font-semibold text-blue-800 mb-2">
                    {currentLanguage.toUpperCase()} Execution Info:
                  </h4>
                  <div className="text-xs text-blue-700">
                    {currentLanguage === 'javascript' && (
                      <div>
                        • Direct browser execution with console.log capture<br/>
                        • Supports all JavaScript features and APIs<br/>
                        • Real-time error reporting
                      </div>
                    )}
                    {currentLanguage === 'python' && (
                      <div>
                        • Uses Pyodide (Python in WebAssembly)<br/>
                        • Supports most Python standard library<br/>
                        • Falls back to mock execution if Pyodide fails to load
                      </div>
                    )}
                    {currentLanguage === 'html' && (
                      <div>
                        • Live HTML preview in iframe<br/>
                        • Supports all HTML tags and attributes<br/>
                        • Sandboxed execution for security
                      </div>
                    )}
                    {currentLanguage === 'css' && (
                      <div>
                        • Live CSS preview with sample HTML elements<br/>
                        • Demonstrates styling on common elements<br/>
                        • Responsive preview in iframe
                      </div>
                    )}
                    {currentLanguage === 'cpp' && (
                      <div>
                        • Mock execution with pattern recognition<br/>
                        • Simulates compilation process<br/>
                        • Can be extended with online compiler APIs
                      </div>
                    )}
                    {currentLanguage === 'java' && (
                      <div>
                        • Mock execution with pattern recognition<br/>
                        • Simulates compilation and execution<br/>
                        • Can be extended with online compiler APIs
                      </div>
                    )}
                  </div>
                </div>

                {/* Simplified Role System Notice */}
                <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                  <p className="text-xs text-green-800">
                    <strong>🔧 Simplified Roles:</strong> 
                    {userRole === 'owner' ? ' As room creator, you can change the language above.' : ' Only the room creator can change the programming language.'}
                  </p>
                </div>

                {/* Online Compiler Integration Notice */}
                {(currentLanguage === 'cpp' || currentLanguage === 'java') && (
                  <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                    <p className="text-xs text-yellow-800">
                      💡 <strong>Tip:</strong> For real {currentLanguage.toUpperCase()} execution, 
                      this could be integrated with services like JDoodle, CodeChef IDE, or Sphere Engine.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollaborativeCodeEditor;