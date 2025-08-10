// src/components/CollaborativeCodeEditor.js - CLEANED VERSION WITH UNUSED CODE REMOVED
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
    isRoomOwner,
    isRoomModerator,
    lastEditUser,
    users,
    isConnected,
    currentUser
  } = useRoom();

  const [localCode, setLocalCode] = useState('// Welcome to collaborative coding!\n// Start typing to share your code with the team...');
  const [output, setOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  
  // Simplified refs - removed complex tracking
  const lastSentCodeRef = useRef('');
  const timeoutRef = useRef(null);
  const isInitialized = useRef(false);

  // Initialize with room code
  useEffect(() => {
    if (roomCode !== undefined && !isInitialized.current) {
      setLocalCode(roomCode);
      lastSentCodeRef.current = roomCode;
      isInitialized.current = true;
    }
  }, [roomCode]);

  // Sync with room updates from other users
  useEffect(() => {
    if (isInitialized.current && 
        roomCode !== undefined && 
        roomCode !== localCode && 
        roomCode !== lastSentCodeRef.current &&
        lastEditUser &&
        lastEditUser !== currentUser) {
      
      setLocalCode(roomCode);
    }
  }, [roomCode, localCode, lastEditUser, currentUser]);

  // Simplified debounced send
  const debouncedSendCodeChange = useCallback((newCode) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      if (isConnected && 
          newCode !== lastSentCodeRef.current && 
          newCode !== roomCode) {
        
        sendCodeChange(newCode, language || 'javascript');
        lastSentCodeRef.current = newCode;
      }
    }, 300);
  }, [sendCodeChange, language, isConnected, roomCode]);

  // Handle editor changes
  const handleEditorChange = useCallback((value) => {
    setLocalCode(value);
    debouncedSendCodeChange(value);
  }, [debouncedSendCodeChange]);

  // Handle language change
  const handleLanguageChange = useCallback((event) => {
    const newLanguage = event.target.value;
    
    if (!isConnected) {
      setStatusMessage('❌ Not connected to room');
      event.target.value = language || 'javascript';
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    const canChangeLanguage = isRoomOwner() || isRoomModerator();
    if (!canChangeLanguage) {
      setStatusMessage('❌ Only room owner or moderator can change language');
      event.target.value = language || 'javascript';
      setTimeout(() => setStatusMessage(''), 3000);
      return;
    }

    try {
      setStatusMessage(`🔄 Changing language to ${newLanguage.toUpperCase()}...`);
      
      const success = sendLanguageChange(newLanguage, localCode);
      
      if (success) {
        setStatusMessage(`✅ Language changed to ${newLanguage.toUpperCase()}`);
      } else {
        throw new Error('Failed to send language change');
      }
      
      setTimeout(() => setStatusMessage(''), 3000);
      
    } catch (error) {
      setStatusMessage('❌ Failed to change language');
      event.target.value = language || 'javascript';
      setTimeout(() => setStatusMessage(''), 3000);
    }
  }, [sendLanguageChange, localCode, isRoomOwner, isRoomModerator, isConnected, language]);

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

  // Simplified language templates
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

  // Execute code - simplified
  const executeCode = async () => {
    setIsExecuting(true);
    const currentLang = language || 'javascript';
    
    try {
      switch (currentLang) {
        case 'javascript':
          executeJavaScript();
          break;
        case 'python':
          executePythonSimple();
          break;
        case 'html':
          executeHTML();
          break;
        case 'css':
          executeCSS();
          break;
        case 'cpp':
          executeCppSimple();
          break;
        case 'java':
          executeJavaSimple();
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

  // JavaScript execution (real)
  const executeJavaScript = () => {
    try {
      const logs = [];
      const originalLog = console.log;
      
      console.log = (...args) => {
        logs.push(args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '));
        originalLog(...args);
      };

      const result = eval(localCode);
      console.log = originalLog;
      
      let output = '';
      if (logs.length > 0) {
        output += 'Console Output:\n' + logs.join('\n') + '\n\n';
      }
      if (result !== undefined) {
        output += 'Return Value:\n' + (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
      }
      
      setOutput(output || 'Code executed successfully (no output)');
    } catch (error) {
      setOutput(`JavaScript Error: ${error.message}`);
    }
  };

  // Simplified Python execution
  const executePythonSimple = () => {
    try {
      let output = '';
      const lines = localCode.split('\n');
      const variables = {};
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) continue;
        
        // Handle print statements
        if (trimmedLine.includes('print(')) {
          const printMatch = trimmedLine.match(/print\((.+)\)/);
          if (printMatch) {
            let content = printMatch[1];
            
            if (content.match(/^["'].*["']$/)) {
              output += content.slice(1, -1) + '\n';
            } else if (variables[content]) {
              output += variables[content] + '\n';
            } else {
              output += content + '\n';
            }
          }
        }
        
        // Handle simple variable assignments
        else if (trimmedLine.includes('=') && !trimmedLine.includes('==')) {
          const assignMatch = trimmedLine.match(/(\w+)\s*=\s*(.+)/);
          if (assignMatch) {
            const varName = assignMatch[1];
            let value = assignMatch[2];
            
            if (value.match(/^["'].*["']$/)) {
              variables[varName] = value.slice(1, -1);
            } else if (!isNaN(value)) {
              variables[varName] = Number(value);
            }
          }
        }
      }
      
      setOutput(output || 'Python code executed (basic simulation)');
    } catch (error) {
      setOutput(`Python execution error: ${error.message}`);
    }
  };

  // HTML execution
  const executeHTML = () => {
    setOutput(localCode);
  };

  // CSS execution
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
        <h2>Sample Content</h2>
        <button>Sample Button</button>
    </div>
</body>
</html>`;
    setOutput(htmlTemplate);
  };

  // Simplified C++ execution
  const executeCppSimple = () => {
    setOutput('C++ Output:\nHello, World!\n\nNote: This is a mock execution. For real C++ compilation, integrate with an online compiler service.');
  };

  // Simplified Java execution
  const executeJavaSimple = () => {
    setOutput('Java Output:\nHello, World!\n\nNote: This is a mock execution. For real Java compilation, integrate with an online compiler service.');
  };

  // Clear editor
  const clearEditor = () => {
    if (confirm('Clear the editor? This will reset to the default template.')) {
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
                disabled={!isConnected || (!isRoomOwner() && !isRoomModerator())}
                className={`px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                  !isConnected || (!isRoomOwner() && !isRoomModerator())
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
              {(!isRoomOwner() && !isRoomModerator()) && (
                <span className="text-xs text-gray-500">(Owner/Moderator only)</span>
              )}
            </div>

            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600">
                {isConnected ? 'Connected' : 'Disconnected'}
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
          </div>
          <div className="flex items-center space-x-4">
            <span>Language: <strong>{currentLanguage.toUpperCase()}</strong></span>
            <span>Lines: {localCode.split('\n').length}</span>
            <span>Characters: {localCode.length}</span>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">{statusMessage}</p>
          </div>
        )}
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
                
                {/* Language execution info */}
                <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
                  <h4 className="text-sm font-semibold text-blue-800 mb-2">
                    {currentLanguage.toUpperCase()} Execution:
                  </h4>
                  <div className="text-xs text-blue-700">
                    {currentLanguage === 'javascript' && (
                      <div>Real browser execution with console.log capture</div>
                    )}
                    {currentLanguage === 'python' && (
                      <div>Basic simulation (for real Python, integrate Pyodide)</div>
                    )}
                    {currentLanguage === 'html' && (
                      <div>Live HTML preview in iframe</div>
                    )}
                    {currentLanguage === 'css' && (
                      <div>Live CSS preview with sample HTML</div>
                    )}
                    {(currentLanguage === 'cpp' || currentLanguage === 'java') && (
                      <div>Mock output (integrate online compiler for real execution)</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollaborativeCodeEditor;