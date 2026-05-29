const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config();

// Built-in screentime tracker state
let currentSession = null; // { app, title, start: Date }
let trackingInterval = null;
let activeWinModule = null;

const getScreentimeLogPath = () => {
  // Use appdata directory for user data (like Electron does)
  const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'fkinrouund');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  return path.join(userDataPath, 'screentime-log.json');
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
      console.log(`[${new Date().toLocaleTimeString()}] Saved session: ${currentSession.app} (${duration}s)`);
    }
    currentSession = null;
  }
};

const startTracking = async () => {
  try {
    activeWinModule = await import('active-win');
    console.log(`[${new Date().toLocaleTimeString()}] Screentime tracker initialized and running!`);
    console.log(`[${new Date().toLocaleTimeString()}] Log file: ${getScreentimeLogPath()}`);
  } catch (err) {
    console.error('Failed to import active-win:', err);
    return;
  }

  trackingInterval = setInterval(async () => {
    try {
      const result = await activeWinModule.default();
      if (!result) return;

      const appName = result.owner?.name || result.executable?.name || 'Unknown';
      const windowTitle = result.title || 'Unknown';

      if (!currentSession || currentSession.app !== appName) {
        endCurrentSession();
        currentSession = { app: appName, title: windowTitle, start: new Date() };
        console.log(`[${new Date().toLocaleTimeString()}] New session: ${appName}`);
      } else if (currentSession.title !== windowTitle) {
        // Same app, different window - update title
        currentSession.title = windowTitle;
      }
    } catch (err) {
      // Silently ignore errors from active-win
    }
  }, 5000);
};

// Handle app termination
process.on('SIGINT', () => {
  console.log('\nShutting down screentime tracker...');
  endCurrentSession();
  if (trackingInterval) {
    clearInterval(trackingInterval);
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down screentime tracker...');
  endCurrentSession();
  if (trackingInterval) {
    clearInterval(trackingInterval);
  }
  process.exit(0);
});

// Start tracker
console.log('=' .repeat(50));
console.log('      RAW Focus Screentime Tracker');
console.log('=' .repeat(50));
startTracking();