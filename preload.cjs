const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  fetchScreentime: () => ipcRenderer.invoke('fetch-screentime'),
  checkOllama: () => ipcRenderer.invoke('check-ollama'),
  saveMemory: (entry) => ipcRenderer.invoke('save-memory', entry),
  loadMemories: () => ipcRenderer.invoke('load-memories'),
  deleteMemory: (id) => ipcRenderer.invoke('delete-memory', id),
  saveChats: (chats) => ipcRenderer.invoke('save-chats', chats),
  loadChats: () => ipcRenderer.invoke('load-chats'),
  chatWithAI: (messages, screentimeData, memories) => ipcRenderer.invoke('chat-with-ai', { messages, screentimeData, memories }),
  extractMemories: (lastMessages) => ipcRenderer.invoke('extract-memories', { lastMessages }),
});
