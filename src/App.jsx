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

  const rememberRegex = /\b(?:remember\s+that|remember|remind\s+me\s+to|remind\s+me\s+that|note\s*:\s*)\s+([^.!?\n]+)/i;
  const rememberMatch = text.match(rememberRegex);
  if (rememberMatch) {
    const val = rememberMatch[1].trim();
    if (val.length > 2) {
      extracted.push({ content: val, category: getCategory(val) });
    }
  }

  const nameRegex = /\bmy\s+name\s+is\s+([^.!?,\n]+)/i;
  const nameMatch = text.match(nameRegex);
  if (nameMatch) {
    const val = nameMatch[1].trim();
    if (val.length > 1) {
      extracted.push({ content: `My name is ${val}`, category: 'personal' });
    }
  }

  const collegeRegex = /\bi\s+(?:study\s+at|go\s+to|attend)\s+([^.!?,\n]+)/i;
  const collegeMatch = text.match(collegeRegex);
  if (collegeMatch) {
    const val = collegeMatch[1].trim();
    if (val.length > 2) {
      extracted.push({ content: `I study at ${val}`, category: 'class' });
    }
  }

  const semRegex = /\bi(?:\s+am|'m)\s+in\s+(?:my\s+)?([^.!?,\n]*semester)/i;
  const semMatch = text.match(semRegex);
  if (semMatch) {
    const val = semMatch[1].trim();
    extracted.push({ content: `I am in ${val}`, category: 'class' });
  }

  const examRegex = /\b(?:i\s+have\s+an?\s+)?(?:exam|midterm|final\s*exam|test)\s+(?:on|for|in)\s+([^.!?,\n]+)/i;
  const examMatch = text.match(examRegex);
  if (examMatch) {
    const val = examMatch[1].trim();
    if (val.length > 2) {
      extracted.push({ content: `Exam on ${val}`, category: 'exam' });
    }
  }

  const classRegex = /\b(?:i\s+have\s+)?class\s+(?:at|on|for)\s+([^.!?,\n]+)/i;
  const classMatch = text.match(classRegex);
  if (classMatch) {
    const val = classMatch[1].trim();
    if (val.length > 2) {
      extracted.push({ content: `Class on ${val}`, category: 'class' });
    }
  }

  const relRegex = /\bi(?:\s+am|'m)\s+(single|dating|married|engaged)\b/i;
  const relMatch = text.match(relRegex);
  if (relMatch) {
    extracted.push({ content: `Relationship status: ${relMatch[1]}`, category: 'personal' });
  }

  return extracted;
};

// Mock data for browser preview (when window.electronAPI is not available)
const MOCK_DATA = {
  screentime: [
    { name: 'VS Code', duration: 180 },
    { name: 'Chrome', duration: 90 },
    { name: 'Discord', duration: 45 },
    { name: 'Spotify', duration: 30 },
  ],
  monthlyActivity: Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return {
      date: date.toISOString().split('T')[0],
      apps: {
        'VS Code': Math.floor(Math.random() * 240) + 60,
        'Chrome': Math.floor(Math.random() * 180) + 30,
      }
    };
  }).reverse(),
  screentimeSource: 'Built-in Tracker',
  memories: [
    { id: 1, content: 'Exam on May 30th', category: 'exam', savedAt: new Date().toISOString() },
    { id: 2, content: 'My name is Ashborn', category: 'personal', savedAt: new Date().toISOString() },
    { id: 3, content: 'Class at 10 AM tomorrow', category: 'class', savedAt: new Date().toISOString() },
  ],
  chats: {
    '1': {
      title: 'Welcome Chat',
      date: new Date().toISOString().split('T')[0],
      messages: [
        { role: 'assistant', content: "Uncensored Assistant ready. How can I help?" },
        { role: 'user', content: "What's my screentime today?" },
        { role: 'assistant', content: "You've been using VS Code for ~3 hours, Chrome for ~1.5 hours, Discord for ~45 mins, and Spotify for ~30 mins. Your total screentime today is about 5.75 hours." },
      ]
    },
    '2': {
      title: 'New Chat',
      date: new Date().toISOString().split('T')[0],
      messages: [
        { role: 'assistant', content: "Uncensored Assistant ready. How can I help?" },
      ]
    }
  }
};

function App() {
  const [screentime, setScreentime] = useState([]);
  const [monthlyActivity, setMonthlyActivity] = useState([]);
  const [screentimeSource, setScreentimeSource] = useState('');
  const [memories, setMemories] = useState([]);
  const [newMemory, setNewMemory] = useState({ content: '', category: 'exam' });
  const [extractingMemories, setExtractingMemories] = useState(false);
  
  const [allChats, setAllChats] = useState({});
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const [aiProvider, setAIProvider] = useState({ provider: 'ollama', model: '' });
  const hasInitializedRef = useRef(false);
  
  const [loading, setLoading] = useState({ screentime: true, chat: false });
  const [, setError] = useState(null);
  const chatEndRef = useRef(null);

  // Helper to check if we're in browser preview mode
  const isBrowserPreview = !window.electronAPI;

  const fetchData = async () => {
    if (isBrowserPreview) {
      setScreentime(MOCK_DATA.screentime);
      setMonthlyActivity(MOCK_DATA.monthlyActivity);
      setScreentimeSource(MOCK_DATA.screentimeSource);
      setLoading(prev => ({ ...prev, screentime: false }));
      return;
    }
    
    setLoading(prev => ({ ...prev, screentime: true }));
    try {
      const data = await window.electronAPI.fetchScreentime();
      setScreentime(data.today);
      setScreentimeSource(data.source);
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
    if (isBrowserPreview) return MOCK_DATA.memories;
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
    if (isBrowserPreview) return MOCK_DATA.chats;
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
    if (isBrowserPreview) {
      setMemories(prev => prev.filter(m => m.id !== id));
      return;
    }
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
    
    if (isBrowserPreview) {
      const newEntry = { 
        content: newMemory.content, 
        category: newMemory.category, 
        id: Date.now(), 
        savedAt: new Date().toISOString() 
      };
      setMemories(prev => [...prev, newEntry]);
      setNewMemory({ content: '', category: 'exam' });
      return;
    }
    
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
    if (isBrowserPreview) return;
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
    
    if (!allChats[currentChatId]) {
      console.error('Current chat not found!');
      return;
    }

    const userMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');

    handleInstantMemoryExtraction(userMessage.content);

    setLoading(prev => ({ ...prev, chat: true }));

    const updatedChat = { 
      ...allChats[currentChatId], 
      messages: updatedMessages,
      title: allChats[currentChatId].title === 'New Chat' ? userMessage.content.slice(0, 20) : allChats[currentChatId].title
    };
    const newAllChats = { ...allChats, [currentChatId]: updatedChat };
    setAllChats(newAllChats);
    
    if (isBrowserPreview) {
      // Mock AI response for browser preview
      await new Promise(resolve => setTimeout(resolve, 1000));
      const assistantMessage = { role: 'assistant', content: "This is a browser preview! For full functionality, run the app using `npm start` in Electron." };
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      const finalChat = { ...updatedChat, messages: finalMessages };
      const finalAllChats = { ...newAllChats, [currentChatId]: finalChat };
      setAllChats(finalAllChats);
      setLoading(prev => ({ ...prev, chat: false }));
      return;
    }
    
    await window.electronAPI.saveChats(newAllChats);

    try {
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
    if (isBrowserPreview) {
      setExtractingMemories(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      setExtractingMemories(false);
      alert('Memory extraction is a preview! For full functionality, run in Electron.');
      return;
    }
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
    
    if (!isBrowserPreview) {
      window.electronAPI.saveChats(updatedChats);
    }
  };

  const switchChat = (id) => {
    setCurrentChatId(id);
    setMessages(allChats[id].messages);
  };

  const checkOllamaStatus = async () => {
    if (isBrowserPreview) {
      setOllamaRunning(true);
      return;
    }
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

      if (isBrowserPreview) {
        // Browser preview mode with mock data
        setAIProvider({ provider: 'ollama', model: 'mistral:7b-instruct-q4_K_M' });
        setOllamaRunning(true);
        const history = await loadChatHistory();
        await loadMemories();
        
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
        } else {
          const lastId = Object.keys(history).sort((a, b) => b[0].localeCompare(a[0]))[0];
          setCurrentChatId(lastId);
          if (history[lastId]) {
            setMessages(history[lastId].messages);
          }
        }
        
        await fetchData();
        setInitializing(false);
        return;
      }
      
      // Electron mode with real API
      const providerInfo = await window.electronAPI.getAIProvider();
      setAIProvider(providerInfo);
      
      await checkOllamaStatus();
      const history = await loadChatHistory();
      await loadMemories();
      
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
        const lastId = Object.keys(history).sort((a, b) => b[0].localeCompare(a[0]))[0];
        setCurrentChatId(lastId);
        if (history[lastId]) {
          setMessages(history[lastId].messages);
        }
      }
      
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
      {isBrowserPreview && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center">
          <div className="text-amber-800 text-xs font-bold flex items-center justify-center gap-2">
            <span className="text-amber-500">⚠️</span>
            Browser Preview Mode — Run <code className="bg-amber-100 px-1 rounded">npm start</code> for full functionality!
          </div>
        </div>
      )}
      <div className="max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-3rem)]">
        
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