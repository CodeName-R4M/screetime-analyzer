const { app, BrowserWindow, ipcMain, powerMonitor, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

let mainWindow = null;
let tray = null;

// Built-in screentime tracker state
let currentSession = null; // { app, title, start: Date }
let trackingInterval = null;
let screentimeLogPath = '';
let activeWinModule = null;

const getScreentimeLogPath = () => {
  if (!screentimeLogPath) {
    // Use the same path as standalone tracker for consistency
    const userDataPath = path.join(require('os').homedir(), 'AppData', 'Roaming', 'raw-force');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    screentimeLogPath = path.join(userDataPath, 'screentime-log.json');
  }
  return screentimeLogPath;
};

const loadScreentimeLog = () => {
  const logPath = getScreentimeLogPath();
  if (!fs.existsSync(logPath)) {
    return [];
  }
  try {
    const data = fs.readFileSync(logPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load screentime log:', err);
    return [];
  }
};

const saveScreentimeLog = (log) => {
  const logPath = getScreentimeLogPath();
  try {
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch (err) {
    console.error('Failed to save screentime log:', err);
  }
};

const appendSession = (session) => {
  const log = loadScreentimeLog();
  log.push(session);
  saveScreentimeLog(log);
};

const endCurrentSession = () => {
  if (currentSession) {
    const end = new Date();
    const duration = Math.round((end - currentSession.start) / 1000);
    if (duration > 0) {
      const sessionEntry = {
        app: currentSession.app,
        title: currentSession.title,
        start: currentSession.start.toISOString(),
        end: end.toISOString(),
        duration: duration
      };
      appendSession(sessionEntry);
    }
    currentSession = null;
  }
};

const getTodayTotal = () => {
  const log = loadScreentimeLog();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  let totalSeconds = 0;
  log.forEach(session => {
    const start = new Date(session.start);
    if (start >= startOfDay && start <= endOfDay) {
      totalSeconds += session.duration;
    }
  });

  if (currentSession) {
    const currentDuration = Math.round((now - currentSession.start) / 1000);
    totalSeconds += currentDuration;
  }

  return Math.round(totalSeconds / 60); // return total minutes
};

const startTracking = async () => {
  try {
    activeWinModule = await import('active-win');
  } catch (err) {
    console.error('Failed to import active-win:', err);
    return;
  }

  let isLocked = false;
  powerMonitor.on('lock-screen', () => {
    console.log('Screen locked, pausing tracking');
    isLocked = true;
    endCurrentSession();
  });

  powerMonitor.on('unlock-screen', () => {
    console.log('Screen unlocked, resuming tracking');
    isLocked = false;
  });

  powerMonitor.on('suspend', () => {
    console.log('System suspending, pausing tracking');
    isLocked = true;
    endCurrentSession();
  });

  powerMonitor.on('resume', () => {
    console.log('System resumed, resuming tracking');
    isLocked = false;
  });

  trackingInterval = setInterval(async () => {
    if (isLocked) return;
    
    try {
      const result = await activeWinModule.default();
      if (!result) return;

      const appName = result.owner?.name || result.executable?.name || 'Unknown';
      const windowTitle = result.title || 'Unknown';

      if (!currentSession || currentSession.app !== appName) {
        endCurrentSession();
        currentSession = { app: appName, title: windowTitle, start: new Date() };
      } else if (currentSession.title !== windowTitle) {
        // Same app, different window - update title
        currentSession.title = windowTitle;
      }
    } catch (err) {
      // Silently ignore errors from active-win
    }
  }, 5000);
};

const isDev = !app.isPackaged;

const MEMORY_FILE = path.join(app.getPath('userData'), 'memories.json');
const CHATS_FILE = path.join(app.getPath('userData'), 'chats.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(
    isDev
      ? VITE_DEV_SERVER_URL
      : `file://${path.join(__dirname, './dist/index.html')}`
  );

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
}

const createTray = () => {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 });
  
  // Fallback to empty icon if no icon file
  tray = new Tray(nativeImage.createEmpty()); 
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Hide Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Screentime today: 0 mins');
  tray.setContextMenu(contextMenu);
  
  // Update tooltip every 60 seconds
  setInterval(() => {
    const total = getTodayTotal();
    tray.setToolTip(`Screentime today: ${total} mins`);
  }, 60000);
};

// AI & Local Services Configuration
const AI_PROVIDER = process.env.AI_PROVIDER || 'ollama';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral:7b-instruct-q4_K_M';
const EXTERNAL_API_URL = process.env.EXTERNAL_API_URL;
const EXTERNAL_API_KEY = process.env.EXTERNAL_API_KEY;
const EXTERNAL_MODEL = process.env.EXTERNAL_MODEL;
const ACTIVITYWATCH_BASE_URL = process.env.ACTIVITYWATCH_BASE_URL || 'http://localhost:5600';
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

const checkOllamaHealth = async () => {
  if (AI_PROVIDER === 'external') {
    console.log(`[${new Date().toLocaleTimeString()}] ✅ Using external API: ${EXTERNAL_API_URL}`);
    return true;
  }
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.ok) {
      const data = await response.json();
      const modelNames = data.models.map(m => m.name);
      console.log(`[${new Date().toLocaleTimeString()}] ✅ Ollama is running! Available models: ${modelNames.join(', ')}`);
      
      if (!modelNames.includes(OLLAMA_MODEL) && !modelNames.some(m => m.startsWith(OLLAMA_MODEL.split(':')[0]))) {
        console.log(`[${new Date().toLocaleTimeString()}] ⚠️ WARNING: ${OLLAMA_MODEL} not found! Please run: ollama pull ${OLLAMA_MODEL}`);
      }
      return true;
    }
    return false;
  } catch (e) {
    console.log(`[${new Date().toLocaleTimeString()}] ❌ Ollama NOT running! Start it first: ollama serve`);
    return false;
  }
};

app.whenReady().then(async () => {
  console.log(`[${new Date().toLocaleTimeString()}] Electron: App is ready. Main Process logging active.`);

  // Set auto-startup with Windows
  app.setLoginItemSettings({
    openAtLogin: true,
    args: ['--hidden'] // Start hidden on boot
  });

  // Check if ActivityWatch is available
  const awAvailable = await isActivityWatchAvailable();

  // Only start built-in tracker if ActivityWatch is NOT available
  if (!awAvailable) {
    console.log(`[${new Date().toLocaleTimeString()}] Starting built-in screentime tracker`);
    startTracking();
  } else {
    console.log(`[${new Date().toLocaleTimeString()}] ActivityWatch is running - skipping built-in tracker`);
  }

  // Create tray
  createTray();

  // Check if --hidden flag is present
  const startHidden = process.argv.includes('--hidden');

  if (!startHidden) {
    await checkOllamaHealth();
    createWindow();
  }

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('before-quit', async () => {
  // Only end session if we were running the built-in tracker
  const awAvailable = await isActivityWatchAvailable();
  if (!awAvailable) {
    endCurrentSession();
    if (trackingInterval) {
      clearInterval(trackingInterval);
    }
  }
});

app.on('window-all-closed', () => {
  // Don't quit app when all windows are closed (we have a tray)
});

// --- IPC Handlers ---

ipcMain.handle('check-ollama', async () => {
  return await checkOllamaHealth();
});

ipcMain.handle('get-ai-provider', async () => {
  return {
    provider: AI_PROVIDER,
    model: AI_PROVIDER === 'ollama' ? OLLAMA_MODEL : EXTERNAL_MODEL
  };
});

// Helper function to fetch from ActivityWatch directly in main process
const fetchActivityWatchDirect = async (endpoint, params) => {
  const url = new URL(`${ACTIVITYWATCH_BASE_URL}/api/0/${endpoint}`);
  if (params) {
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  }
  const response = await fetch(url.toString());
  return await response.json();
};

// Check if ActivityWatch is available
const isActivityWatchAvailable = async () => {
  try {
    const buckets = await fetchActivityWatchDirect('buckets');
    return !!Object.keys(buckets).find(b => b.startsWith('aw-watcher-window'));
  } catch {
    return false;
  }
};

// Sync built-in tracker data to ActivityWatch
const syncBuiltinToActivityWatch = async () => {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] Syncing built-in tracker data to ActivityWatch...`);
    const buckets = await fetchActivityWatchDirect('buckets');
    const windowBucketKey = Object.keys(buckets).find(b => b.startsWith('aw-watcher-window'));
    if (!windowBucketKey) {
      console.log(`[${new Date().toLocaleTimeString()}] No ActivityWatch window bucket found, skipping sync`);
      return;
    }

    const log = loadScreentimeLog();
    if (log.length === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] No built-in tracker data to sync`);
      return;
    }

    // Convert built-in sessions to ActivityWatch events
    const events = log.map(session => ({
      timestamp: session.start,
      duration: session.duration,
      data: {
        app: session.app,
        title: session.title
      }
    }));

    // Fetch existing events to avoid duplicates
    const oldestSession = log.reduce((oldest, s) => {
      const d = new Date(s.start);
      return !oldest || d < new Date(oldest.start) ? s : oldest;
    }, null);
    const existingEvents = await fetchActivityWatchDirect(`buckets/${windowBucketKey}/events`, {
      start: oldestSession.start,
      limit: 100000
    });

    const existingEventKeys = new Set(existingEvents.map(e => `${e.timestamp}-${e.data.app}-${e.duration}`));
    const newEvents = events.filter(e => !existingEventKeys.has(`${e.timestamp}-${e.data.app}-${e.duration}`));

    if (newEvents.length === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] No new data to sync to ActivityWatch`);
      return;
    }

    // Send new events to ActivityWatch
    try {
      const url = new URL(`${ACTIVITYWATCH_BASE_URL}/api/0/buckets/${windowBucketKey}/heartbeat`);
      for (const event of newEvents) {
        await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: event.timestamp,
            duration: event.duration,
            data: event.data
          })
        });
      }
      console.log(`[${new Date().toLocaleTimeString()}] Synced ${newEvents.length} events to ActivityWatch`);
    } catch (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Failed to send events to ActivityWatch:`, err);
    }
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Failed to sync built-in data to ActivityWatch:`, error);
  }
};

// Sync ActivityWatch data to built-in tracker
const syncActivityWatchToBuiltin = async () => {
  try {
    console.log(`[${new Date().toLocaleTimeString()}] Syncing ActivityWatch data to built-in tracker...`);
    const buckets = await fetchActivityWatchDirect('buckets');
    const windowBucketKey = Object.keys(buckets).find(b => b.startsWith('aw-watcher-window'));
    if (!windowBucketKey) {
      console.log(`[${new Date().toLocaleTimeString()}] No ActivityWatch window bucket found, skipping sync`);
      return;
    }

    // Fetch all ActivityWatch events
    const now = new Date();
    const startOfTime = new Date(0).toISOString(); // Get all events
    const awEvents = await fetchActivityWatchDirect(`buckets/${windowBucketKey}/events`, {
      start: startOfTime,
      limit: 100000
    });

    if (awEvents.length === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] No ActivityWatch data to sync`);
      return;
    }

    // Convert ActivityWatch events to built-in sessions
    const awSessions = awEvents.map(event => ({
      app: event.data.app || 'Unknown',
      title: event.data.title || 'Unknown',
      start: event.timestamp,
      end: new Date(new Date(event.timestamp).getTime() + event.duration * 1000).toISOString(),
      duration: event.duration
    }));

    // Load existing log
    const log = loadScreentimeLog();
    const existingKeys = new Set(log.map(s => `${s.start}-${s.app}-${s.duration}`));
    const newSessions = awSessions.filter(s => !existingKeys.has(`${s.start}-${s.app}-${s.duration}`));

    if (newSessions.length === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] No new data to sync from ActivityWatch`);
      return;
    }

    // Add new sessions to log
    const updatedLog = [...log, ...newSessions];
    saveScreentimeLog(updatedLog);
    console.log(`[${new Date().toLocaleTimeString()}] Synced ${newSessions.length} events from ActivityWatch to built-in tracker`);
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Failed to sync ActivityWatch data to built-in tracker:`, error);
  }
};

// Get data from built-in tracker
const getBuiltinScreentimeData = () => {
  const log = loadScreentimeLog();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  
  // 1. Today's data
  const todaySessions = log.filter(s => {
    const startDate = new Date(s.start);
    return startDate >= startOfDay && startDate <= endOfDay;
  });
  
  const todayAppMap = {};
  todaySessions.forEach(s => {
    todayAppMap[s.app] = (todayAppMap[s.app] || 0) + s.duration;
  });
  
  const todayData = Object.entries(todayAppMap)
    .map(([name, duration]) => ({ name, duration: Math.round(duration / 60) }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10);
  const todayTotalMinutes = todayData.reduce((sum, app) => sum + app.duration, 0);
  
  // 2. 30-day data
  const startOf30Days = new Date(now);
  startOf30Days.setDate(now.getDate() - 30);
  startOf30Days.setHours(0,0,0,0);
  
  const thirtyDaySessions = log.filter(s => {
    const startDate = new Date(s.start);
    return startDate >= startOf30Days && startDate <= endOfDay;
  });
  
  const appTotalMinutes = {};
  const dailyData = {};
  
  thirtyDaySessions.forEach(s => {
    const dateStr = new Date(s.start).toISOString().split('T')[0];
    const durationMins = Math.round(s.duration / 60);
    
    appTotalMinutes[s.app] = (appTotalMinutes[s.app] || 0) + durationMins;
    
    if (!dailyData[dateStr]) dailyData[dateStr] = 0;
    dailyData[dateStr] += durationMins;
  });
  
  const numDays = Object.keys(dailyData).length || 1;
  const averageData = Object.entries(appTotalMinutes)
    .map(([name, totalMins]) => ({ 
      name, 
      duration: Math.round(totalMins / numDays) 
    }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 7);
    
  const averageTotalMinutes = Math.round(Object.values(dailyData).reduce((sum, mins) => sum + mins, 0) / numDays);
  const comparisonMinutes = todayTotalMinutes - averageTotalMinutes;
  
  return {
    today: todayData,
    todayTotalMinutes,
    average: averageData,
    averageTotalMinutes,
    comparisonMinutes
  };
};

ipcMain.handle('get-builtin-screentime', async () => {
  return getBuiltinScreentimeData();
});

// Fetch complete screentime data (today + monthly) in ONE call
ipcMain.handle('fetch-screentime', async (event) => {
  const startTime = Date.now();
  const awAvailable = await isActivityWatchAvailable();

  if (awAvailable) {
    console.log(`[${new Date().toLocaleTimeString()}] Screentime: Using ActivityWatch`);
    try {
      // Always sync ActivityWatch data to our local log first
      await syncActivityWatchToBuiltin();

      // Get buckets ONCE
      const buckets = await fetchActivityWatchDirect('buckets');
      const windowBucketKey = Object.keys(buckets).find(b => b.startsWith('aw-watcher-window'));
      if (!windowBucketKey) throw new Error('ActivityWatch window bucket not found');

      const now = new Date();
      
      // 1. Fetch TODAY'S data
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
      const todayEvents = await fetchActivityWatchDirect(`buckets/${windowBucketKey}/events`, {
        start: startOfDay,
        end: endOfDay,
        limit: 10000
      });
      
      // Process today's data
      const todayAppMap = {};
      todayEvents.forEach(event => {
        const appName = event.data.app || 'Unknown';
        const duration = event.duration || 0;
        todayAppMap[appName] = (todayAppMap[appName] || 0) + duration;
      });
      const todayData = Object.entries(todayAppMap)
        .map(([name, duration]) => ({ name, duration: Math.round(duration / 60) }))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 7);
      const todayTotalMinutes = todayData.reduce((sum, app) => sum + app.duration, 0);

      // 2. Fetch PAST 30 DAYS data
      const startOf30Days = new Date(now);
      startOf30Days.setDate(now.getDate() - 30);
      startOf30Days.setHours(0,0,0,0);
      const monthlyEvents = await fetchActivityWatchDirect(`buckets/${windowBucketKey}/events`, {
        start: startOf30Days.toISOString(),
        end: endOfDay,
        limit: 100000
      });

      // Process into daily aggregated data for 30-day average
      const appTotalMinutes = {};
      const dailyData = {};
      
      monthlyEvents.forEach(event => {
        if (event.data.app && event.duration) {
          const dateStr = new Date(event.timestamp).toISOString().split('T')[0];
          const durationMins = Math.round(event.duration / 60);
          
          // Track per-app total over 30 days
          appTotalMinutes[event.data.app] = (appTotalMinutes[event.data.app] || 0) + durationMins;
          
          // Track daily totals for average total calculation
          if (!dailyData[dateStr]) dailyData[dateStr] = 0;
          dailyData[dateStr] += durationMins;
        }
      });
      
      // Calculate 30-day averages
      const numDays = Object.keys(dailyData).length || 1;
      const averageData = Object.entries(appTotalMinutes)
        .map(([name, totalMins]) => ({ 
          name, 
          duration: Math.round(totalMins / numDays) 
        }))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 7);
        
      const averageTotalMinutes = Math.round(Object.values(dailyData).reduce((sum, mins) => sum + mins, 0) / numDays);
      
      // Calculate comparison
      const comparisonMinutes = todayTotalMinutes - averageTotalMinutes;

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[${new Date().toLocaleTimeString()}] ActivityWatch: Data fetched in ${duration}s (${numDays} days)`);
      
      return {
        ...{ today: todayData, todayTotalMinutes, average: averageData, averageTotalMinutes, comparisonMinutes },
        source: 'ActivityWatch',
        monthly: Object.entries(dailyData).map(([date, minutes]) => ({ date, apps: { total: minutes } }))
      };
    } catch (error) {
      console.error('ActivityWatch failed, falling back to built-in tracker:', error);
      const builtinData = getBuiltinScreentimeData();
      return {
        ...builtinData,
        source: 'Built-in Tracker',
        monthly: []
      };
    }
  } else {
    console.log(`[${new Date().toLocaleTimeString()}] Screentime: Using built-in tracker (ActivityWatch not available)`);
    const builtinData = getBuiltinScreentimeData();
    return {
      ...builtinData,
      source: 'Built-in Tracker',
      monthly: []
    };
  }
});

// Memories Storage
ipcMain.handle('save-memory', async (event, entry) => {
  try {
    const existing = fs.existsSync(MEMORY_FILE) ? JSON.parse(fs.readFileSync(MEMORY_FILE)) : [];
    
    // Normalize content for duplicate check
    const normalizedContent = entry.content.trim().toLowerCase();
    const duplicate = existing.find(m => m.content.trim().toLowerCase() === normalizedContent);
    
    if (duplicate) {
      return duplicate; // Already exists, return existing
    }
    
    const newEntry = { 
      content: entry.content.trim(), 
      category: entry.category || 'other', 
      id: Date.now(), 
      savedAt: new Date().toISOString() 
    };
    existing.push(newEntry);
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(existing, null, 2));
    return newEntry;
  } catch (error) {
    console.error('Save Memory Error:', error);
    throw error;
  }
});

ipcMain.handle('load-memories', async () => {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return [];
    return JSON.parse(fs.readFileSync(MEMORY_FILE));
  } catch (error) {
    console.error('Load Memories Error:', error);
    throw error;
  }
});

ipcMain.handle('delete-memory', async (event, id) => {
  try {
    if (!fs.existsSync(MEMORY_FILE)) return;
    const existing = JSON.parse(fs.readFileSync(MEMORY_FILE));
    const filtered = existing.filter(m => m.id !== id);
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(filtered, null, 2));
    return true;
  } catch (error) {
    console.error('Delete Memory Error:', error);
    throw error;
  }
});

// Chats Storage
ipcMain.handle('save-chats', async (event, chats) => {
  try {
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
    return true;
  } catch (error) {
    console.error('Save Chats Error:', error);
    throw error;
  }
});

ipcMain.handle('load-chats', async () => {
  try {
    if (!fs.existsSync(CHATS_FILE)) return {};
    return JSON.parse(fs.readFileSync(CHATS_FILE));
  } catch (error) {
    console.error('Load Chats Error:', error);
    throw error;
  }
});

// Helper to make AI calls
const makeAICall = async (systemPrompt, userPrompt, useJSON = false) => {
  if (AI_PROVIDER === 'external') {
    // Use OpenAI-compatible external API
    const headers = {
      'Content-Type': 'application/json',
    };
    if (EXTERNAL_API_KEY) {
      headers['Authorization'] = `Bearer ${EXTERNAL_API_KEY}`;
    }
    
    const response = await fetch(EXTERNAL_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: EXTERNAL_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        response_format: useJSON ? { type: 'json_object' } : undefined,
      })
    });
    
    if (!response.ok) throw new Error(`External API error: ${response.statusText}`);
    const result = await response.json();
    return result.choices[0].message.content;
    
  } else {
    // Use Ollama
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        format: useJSON ? 'json' : undefined,
        options: useJSON ? { temperature: 0 } : undefined,
      })
    });
    
    if (!response.ok) throw new Error(`Ollama API error: ${response.statusText}`);
    const result = await response.json();
    return result.message.content;
  }
};

// Ollama Chat Proxy
ipcMain.handle('chat-with-ai', async (event, { messages, screentimeData, memories }) => {
  // AI CALL — only runs on explicit user request, never automatically
  const startTime = Date.now();
  console.log(`[${new Date().toLocaleTimeString()}] AI Chat: Request started...`);
  try {
    // Format screentime data EXACTLY as requested
    const todayStr = screentimeData?.today && screentimeData.today.length > 0
      ? `[TODAY: ${screentimeData.today.map(app => `${app.name}=${app.duration}mins`).join(', ')} | TOTAL=${screentimeData.todayTotalMinutes || 0}mins]`
      : `[TODAY: No data | TOTAL=0mins]`;

    const averageStr = screentimeData?.average && screentimeData.average.length > 0
      ? `[30-DAY DAILY AVERAGE: ${screentimeData.average.map(app => `${app.name}=${app.duration}mins`).join(', ')} | AVERAGE TOTAL=${screentimeData.averageTotalMinutes || 0}mins]`
      : `[30-DAY DAILY AVERAGE: No data | AVERAGE TOTAL=0mins]`;

    const comparisonStr = screentimeData?.comparisonMinutes !== undefined
      ? `[COMPARISON: Today you are ${screentimeData.comparisonMinutes > 0 ? screentimeData.comparisonMinutes + 'mins above' : Math.abs(screentimeData.comparisonMinutes) + 'mins below'} your monthly average]`
      : `[COMPARISON: No comparison data]`;

    // Process messages into a single prompt (easier for both providers)
    const conversationText = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
    
    const finalUserPrompt = `${todayStr}
${averageStr}
${comparisonStr}

Conversation history:
${conversationText}

Continue the conversation as the assistant.`;

    const systemPrompt = `You are a personal digital wellness assistant for anyone who uses this app. You have access to the user's real screentime data for today and their 30-day daily average. Use these guidelines when analyzing screentime: Healthy total daily screentime for an adult is under 4 hours (240 mins) for recreational use. Over 6 hours (360 mins) is concerning. Over 8 hours (480 mins) is unhealthy unless work-related. For any single app, over 2 hours daily recreational use is worth flagging. Always compare today vs the monthly average and tell the user if today is better or worse than usual and by how much. Classify apps automatically — browsers (chrome, firefox, librewolf, msedge, brave) = browsing, steam/epic/roblox/minecraft/valorant/gamepass = gaming, discord/whatsapp/telegram/teams = communication, vscode/cursor/trae/figma = productive work. Never write code. Answer in plain English, max 5 sentences. Be honest and direct like a friend, not a robot.`;

    const aiResponse = await makeAICall(systemPrompt, finalUserPrompt, false);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${new Date().toLocaleTimeString()}] AI Chat: Response received in ${duration}s`);
    return aiResponse;
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] AI Chat Error:`, error);
    
    if (AI_PROVIDER === 'external') {
      return "Error: Could not connect to external API. Please check your .env file and API key.";
    }
    
    if (error.cause?.code === 'ECONNREFUSED') {
      return "Error: Ollama is not running. Please start Ollama and try again.";
    }
    return "Error: Could not connect to Ollama. Please make sure Ollama is running.";
  }
});

// Memory Extraction Proxy
ipcMain.handle('extract-memories', async (event, { lastMessages }) => {
  // AI CALL — only runs on explicit user request, never automatically
  const startTime = Date.now();
  console.log(`[${new Date().toLocaleTimeString()}] Memory Extraction: Started...`);
  try {
    const systemPrompt = `
      You are a specialized JSON extraction engine. 
      Analyze the conversation and extract ALL important personal details, events, tasks, and identity facts.
      Include: Name, College, Semester, Relationship status, Feelings, Deadlines, Goals.
      
      OUTPUT RULES:
      1. Return ONLY a valid JSON array of objects.
      2. Each object MUST have "content" (string) and "category" (one of: exam, class, note, personal, other).
      3. If no new info is found, return {"memories": []}.
      4. DO NOT include any explanation or conversational text.
    `;

    const userPrompt = `Extract facts from this chat: ${JSON.stringify(lastMessages)}`;
    
    const aiResponse = await makeAICall(systemPrompt, userPrompt, true);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${new Date().toLocaleTimeString()}] Memory Extraction: Finished in ${duration}s`);
    try {
      const content = aiResponse;
      // Handle potential markdown formatting if the model ignores the prompt
      const jsonStr = content.includes('[') ? content.substring(content.indexOf('['), content.lastIndexOf(']') + 1) : content;
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed : (parsed.memories || []);
    } catch (e) {
      console.error('Failed to parse extraction result:', content);
      return [];
    }
  } catch (error) {
    console.error(`[${new Date().toLocaleTimeString()}] Memory Extraction Error:`, error);
    return [];
  }
});
