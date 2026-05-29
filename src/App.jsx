import { useState, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LineChart, Line 
} from 'recharts';
import { 
  Activity, 
  Brain, 
  Clock, 
  Plus,
  Send,
  User,
  Bot,
  RefreshCcw,
  Trash2,
  History,
  MessageSquarePlus
} from 'lucide-react';



const extractMemoriesFromText = (text) => {
  const extracted = [];
  
  const getCategory = (content) => {
    const lower = content.toLowerCase();
    if (/\b(?:exam|midterm|test|quiz|final)\b/.test(lower)) return 'exam';
    if (/\b(?:class|lecture|course|semester|college|uni|university|school|study)\b/.test(lower)) return 'class';
    if (/\b(?:name|age|relationship|single|dating|married|live|born)\b/.test(lower)) return 'personal';
    return 'note';
  };

  // Rule 1: "remember (that) [something]" or "note: [something]" or "remind me (to/that) [something]"
  const rememberRegex = /\b(?:remember\s+that|remember|remind\s+me\s+to|remind\s+me\s+that|note\s*:\s*)\s+([^.!?\n]+)/i;
  const rememberMatch = text.match(rememberRegex);
  if (rememberMatch) {
    const val = rememberMatch[1].trim();
    if (val.length > 2) {
      extracted.push({ content: val, category: getCategory(val) });
    }
  }

  // Rule 2: "my name is [Name]"
  const nameRegex = /\bmy\s+name\s+is\s+([^.!?,\n]+)/i;
  const nameMatch = text.match(nameRegex);
  if (nameMatch) {
    const val = nameMatch[1].trim();
    if (val.length > 1) {
      extracted.push({ content: `My name is ${val}`, category: 'personal' });
    }
  }

  // Rule 3: "i study at [College]" or "i go to [College]" or "college: [College]"
  const collegeRegex = /\bi\s+(?:study\s+at|go\s+to|attend)\s+([^.!?,\n]+)/i;
  const collegeMatch = text.match(collegeRegex);
  if (collegeMatch) {
    const val = collegeMatch[1].trim();
    if (val.length > 2) {
      extracted.push({ content: `I study at ${val}`, category: 'class' });
    }
  }

  // Rule 4: "i am in [X] semester" or "i'm in [X] semester"
  const semRegex = /\bi(?:\s+am|'m)\s+in\s+(?:my\s+)?([^.!?,\n]*semester)/i;
  const semMatch = text.match(semRegex);
  if (semMatch) {
    const val = semMatch[1].trim();
    extracted.push({ content: `I am in ${val}`, category: 'class' });
  }

  // Rule 5: "exam on [X]" or "i have an exam on [X]" or "midterm on [X]"
  const examRegex = /\b(?:i\s+have\s+an?\s+)?(?:exam|midterm|final\s*exam|test)\s+(?:on|for|in)\s+([^.!?,\n]+)/i;
  const examMatch = text.match(examRegex);
  if (examMatch) {
    const val = examMatch[1].trim();
    if (val.length > 2) {
      extracted.push({ content: `Exam on ${val}`, category: 'exam' });
    }
  }

  // Rule 6: "class at [X]" or "class on [X]"
  const classRegex = /\b(?:i\s+have\s+)?class\s+(?:at|on|for)\s+([^.!?,\n]+)/i;
  const classMatch = text.match(classRegex);
  if (classMatch) {
    const val = classMatch[1].trim();
    if (val.length > 2) {
      extracted.push({ content: `Class on ${val}`, category: 'class' });
    }
  }

  // Rule 7: relationship status
  const relRegex = /\bi(?:\s+am|'m)\s+(single|dating|married|engaged)\b/i;
  const relMatch = text.match(relRegex);
  if (relMatch) {
    extracted.push({ content: `Relationship status: ${relMatch[1]}`, category: 'personal' });
  }

  return extracted;
};

function App() {
  const [screentime, setScreentime] = useState([]);
  const [monthlyActivity, setMonthlyActivity] = useState([]); // State for monthly data
  const [screentimeSource, setScreentimeSource] = useState('');
  const [memories, setMemories] = useState([]);
  const [newMemory, setNewMemory] = useState({ content: '', category: 'exam' });
  const [extractingMemories, setExtractingMemories] = useState(false);
  
  // Chat State
  const [allChats, setAllChats] = useState({}); // { id: { title, messages, date } }
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const hasInitializedRef = useRef(false);
  
  const [loading, setLoading] = useState({ screentime: true, chat: false });
  const [, setError] = useState(null);
  const chatEndRef = useRef(null);

  const fetchData = async () => {
    setLoading(prev => ({ ...prev, screentime: true }));
    try {
      // Fetch all screentime data in ONE call
      const data = await window.electronAPI.fetchScreentime();
      setScreentime(data.today);
      setScreentimeSource(data.source);
      // For UI backward compatibility, create dummy monthly activity if needed
      setMonthlyActivity(data.monthly || []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('AW Connection failed.');
    } finally {
      setLoading(prev => ({ ...prev, screentime: false }));
    }
  };

  const loadMemories = async () => {
    try {
      const data = await window.electronAPI.loadMemories();
      setMemories(data);
      return data;
    } catch (err) {
      console.error('Failed to load memories', err);
      return [];
    }
  };

  const loadChatHistory = async () => {
    try {
      const history = await window.electronAPI.loadChats();
      setAllChats(history);
      return history;
    } catch (err) {
      console.error('Failed to load chat history', err);
      return {};
    }
  };

  const handleDeleteMemory = async (id) => {
    try {
      await window.electronAPI.deleteMemory(id);
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('Failed to delete memory', err);
      alert('Failed to delete memory');
    }
  };

  const handleSaveMemory = async (e) => {
    e.preventDefault();
    if (!newMemory.content.trim()) return;
    try {
      await window.electronAPI.saveMemory(newMemory);
      const updated = await window.electronAPI.loadMemories();
      setMemories(updated);
      setNewMemory({ content: '', category: 'exam' });
    } catch (err) {
      console.error('Failed to save memory', err);
      alert('Failed to save memory');
    }
  };

  const handleInstantMemoryExtraction = async (text) => {
    try {
      const extracted = extractMemoriesFromText(text);
      if (extracted && extracted.length > 0) {
        let changed = false;
        for (const item of extracted) {
          if (item.content) {
            await window.electronAPI.saveMemory(item);
            changed = true;
          }
        }
        if (changed) {
          const updated = await window.electronAPI.loadMemories();
          setMemories(updated);
        }
      }
    } catch (err) {
      console.error('Instant memory extraction failed:', err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading.chat || !currentChatId || initializing) return;
    
    // Guard: Make sure current chat exists
    if (!allChats[currentChatId]) {
      console.error('Current chat not found!');
      return;
    }

    const userMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');

    // Extract memories instantly
    handleInstantMemoryExtraction(userMessage.content);

    setLoading(prev => ({ ...prev, chat: true }));

    // Save user message immediately
    const updatedChat = { 
      ...allChats[currentChatId], 
      messages: updatedMessages,
      title: allChats[currentChatId].title === 'New Chat' ? userMessage.content.slice(0, 20) : allChats[currentChatId].title
    };
    const newAllChats = { ...allChats, [currentChatId]: updatedChat };
    setAllChats(newAllChats);
    await window.electronAPI.saveChats(newAllChats);

    try {
      // Get fresh screentime data for chat
      const freshData = await window.electronAPI.fetchScreentime();
      setScreentime(freshData.today);
      const response = await window.electronAPI.chatWithAI(updatedMessages, freshData, memories);
      const assistantMessage = { role: 'assistant', content: response };
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      
      const finalChat = { ...updatedChat, messages: finalMessages };
      const finalAllChats = { ...newAllChats, [currentChatId]: finalChat };
      setAllChats(finalAllChats);
      await window.electronAPI.saveChats(finalAllChats);
    } catch (err) {
      console.error('Chat error', err);
      setMessages(prev => [...prev, { role: 'assistant', content: "Error: Could not reach Ollama." }]);
    } finally {
      setLoading(prev => ({ ...prev, chat: false }));
    }
  };

  const extractAndSaveMemories = async () => {
    if (!messages || messages.length < 2) return;
    setExtractingMemories(true);
    try {
      const extracted = await window.electronAPI.extractMemories(messages);
      if (extracted && Array.isArray(extracted) && extracted.length > 0) {
        let changed = false;
        for (const item of extracted) {
          if (item.content) {
            await window.electronAPI.saveMemory(item);
            changed = true;
          }
        }
        if (changed) {
          const updated = await window.electronAPI.loadMemories();
          setMemories(updated);
        }
      }
    } catch (err) {
      console.error('Extraction failed:', err);
    } finally {
      setExtractingMemories(false);
    }
  };

  const startNewChat = () => {
    const id = Date.now().toString();
    const newChat = {
      title: 'New Chat',
      date: new Date().toISOString().split('T')[0],
      messages: [{ role: 'assistant', content: "Uncensored Assistant ready. How can I help?" }]
    };
    const updatedChats = { ...allChats, [id]: newChat };
    setAllChats(updatedChats);
    setCurrentChatId(id);
    setMessages(newChat.messages);
    window.electronAPI.saveChats(updatedChats);
  };

  const switchChat = (id) => {
    setCurrentChatId(id);
    setMessages(allChats[id].messages);
  };

  const checkOllamaStatus = async () => {
    try {
      const status = await window.electronAPI.checkOllama();
      setOllamaRunning(status);
    } catch (e) {
      setOllamaRunning(false);
    }
  };
  
  useEffect(() => {
    const init = async () => {
      if (hasInitializedRef.current) return;
      hasInitializedRef.current = true;
      
      await checkOllamaStatus();
      const history = await loadChatHistory();
      await loadMemories();
      
      // Initialize chat immediately if no history exists
      if (Object.keys(history).length === 0) {
        const id = Date.now().toString();
        const newChat = {
          title: 'New Chat',
          date: new Date().toISOString().split('T')[0],
          messages: [{ role: 'assistant', content: "Uncensored Assistant ready. How can I help?" }]
        };
        const initialChats = { [id]: newChat };
        setAllChats(initialChats);
        setCurrentChatId(id);
        setMessages(newChat.messages);
        await window.electronAPI.saveChats(initialChats);
      } else {
        // If history exists, load the last chat
        const lastId = Object.keys(history).sort((a, b) => b - a)[0];
        setCurrentChatId(lastId);
        if (history[lastId]) {
          setMessages(history[lastId].messages);
        }
      }
      
      // Fetch screentime last
      await fetchData();
      setInitializing(false);
    };
    init();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="min-h-screen bg-[#fdfcfb] text-slate-900 p-4 lg:p-6 font-sans flex flex-col gap-4">
      <div className="max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-3rem)]">
        
        {/* Left Column: Stats & Memories */}
        <div className="lg:col-span-3 flex flex-col gap-6 overflow-hidden">
          <header className="flex items-center justify-between">
            <h1 className="text-xl font-black text-indigo-600 flex items-center gap-2">
              <Activity size={24} strokeWidth={3} /> RAW FOCUS
            </h1>
            <button onClick={fetchData} className="p-2 hover:bg-slate-100 rounded-full">
              <RefreshCcw size={16} className={loading.screentime ? 'animate-spin' : ''} />
            </button>
          </header>

          <section className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 h-40">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <Clock size={12} /> Usage
              </h2>
              {screentimeSource && (
                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {screentimeSource}
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={screentime} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={60} tick={{ fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <Bar dataKey="duration" radius={[0, 8, 8, 0]} barSize={10}>
                  {screentime.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#6366f1' : '#f1f5f9'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </section>

          {/* Monthly Activity Chart - Only show for ActivityWatch */}
          {screentimeSource === 'ActivityWatch' && (
            <section className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 h-52">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-2">
                <History size={12} /> Monthly Activity
              </h2>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={monthlyActivity.map(day => ({
                    date: new Date(day.date).getDate(),
                    minutes: Math.round(Object.values(day.apps).reduce((a, b) => a + b, 0) / 60)
                  }))}
                >
                  <XAxis dataKey="date" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 8 }} tickLine={false} axisLine={false} />
                  <Line 
                    type="monotone" 
                    dataKey="minutes" 
                    stroke="#6366f1" 
                    strokeWidth={2} 
                    dot={{ fill: '#6366f1', r: 3 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </section>
          )}

          <section className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
              <Brain size={12} /> Memories
            </h2>
            
            <form onSubmit={handleSaveMemory} className="flex gap-2 mb-3">
              <input 
                type="text"
                value={newMemory.content}
                onChange={e => setNewMemory(prev => ({ ...prev, content: e.target.value }))}
                placeholder="New memory..."
                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
              />
              <button type="submit" className="bg-indigo-600 text-white p-1.5 rounded-xl"><Plus size={16} /></button>
            </form>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {memories.slice().reverse().map((mem) => (
                <div key={mem.id} className="p-2.5 bg-slate-50 rounded-2xl border border-slate-100 group relative">
                  <button onClick={() => handleDeleteMemory(mem.id)} className="absolute top-2 right-2 p-1 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>
                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full mb-1 inline-block ${
                    mem.category === 'exam' ? 'bg-rose-100 text-rose-600' :
                    mem.category === 'personal' ? 'bg-purple-100 text-purple-600' :
                    'bg-slate-200 text-slate-600'
                  }`}>
                    {mem.category}
                  </span>
                  <p className="text-[11px] text-slate-700 font-semibold leading-tight">{mem.content}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Center: Chat Area */}
        <div className="lg:col-span-6 flex flex-col bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden relative">
          <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between bg-white/80 backdrop-blur-md z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-black rounded-2xl flex items-center justify-center text-white shadow-lg">
                <Bot size={20} />
              </div>
              <div>
                <h2 className="font-black text-slate-800 text-sm">RAW AI</h2>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase">
                  {loading.chat || loading.screentime ? (
                    <div className="flex items-center gap-1 text-indigo-500">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
                      Thinking...
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-emerald-500">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                      Uncensored
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={extractAndSaveMemories}
                disabled={extractingMemories || messages.length < 2}
                className="text-[10px] font-black uppercase px-2 py-1 rounded-full bg-purple-100 text-purple-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-200 transition-colors"
              >
                {extractingMemories ? 'Extracting...' : 'Extract memories'}
              </button>
              <div className="flex items-center gap-2 cursor-pointer hover:opacity-80" onClick={checkOllamaStatus}>
                {ollamaRunning ? (
                  <div className="flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-[10px] font-bold">Ollama ✓</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-2 py-1 bg-rose-100 text-rose-700 rounded-full">
                    <div className="w-2 h-2 bg-rose-500 rounded-full"></div>
                    <span className="text-[10px] font-bold">Ollama ✗</span>
                  </div>
                )}
              </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                  </div>
                  <div className={`px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed font-medium ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 text-white rounded-tr-none shadow-md' 
                      : 'bg-slate-50 text-slate-800 rounded-tl-none border border-slate-100'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}
            {loading.chat && (
              <div className="flex justify-start">
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center"><Bot size={14} /></div>
                  <div className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-2xl rounded-tl-none flex gap-1">
                    <div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"></div>
                    <div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                    <div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-6 bg-white border-t border-slate-50">
            <form onSubmit={handleSendMessage} className="relative flex items-center">
              <input 
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={initializing ? "Loading..." : "Ask anything, no limits..."}
                disabled={initializing}
                className="w-full pl-5 pr-14 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 text-xs font-bold disabled:opacity-50"
              />
              <button type="submit" disabled={!input.trim() || loading.chat || initializing} className="absolute right-2 p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg disabled:opacity-50">
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: History & Navigation */}
        <div className="lg:col-span-3 flex flex-col gap-6 overflow-hidden">
          <button 
            onClick={startNewChat}
            className="w-full py-3 bg-indigo-600 text-white rounded-[2rem] font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
          >
            <MessageSquarePlus size={18} /> NEW CHAT
          </button>

          <section className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
              <History size={12} /> Chat History
            </h2>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {Object.entries(allChats).sort((a, b) => b[0].localeCompare(a[0])).map(([id, chat]) => (
                <button
                  key={id}
                  onClick={() => switchChat(id)}
                  className={`w-full p-3 rounded-2xl text-left transition-all border ${
                    currentChatId === id 
                      ? 'bg-indigo-50 border-indigo-100 text-indigo-700' 
                      : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black uppercase">{chat.date}</span>
                  </div>
                  <p className="text-[10px] font-bold truncate opacity-80">
                    {chat.title}
                  </p>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default App;
