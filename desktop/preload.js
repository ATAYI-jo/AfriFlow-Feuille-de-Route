const { contextBridge, ipcRenderer } = require('electron');
let background = false;
ipcRenderer.on('afriflow:window-visibility', (_event, hidden) => { background = !!hidden; });
contextBridge.exposeInMainWorld('AfriFlowNative', Object.freeze({
  isBackground: () => background,
  notify: (payload) => {
    if (!payload || typeof payload !== 'object') return;
    ipcRenderer.send('afriflow:notify', {
      title:String(payload.title || 'AfriFloW').slice(0,120),
      body:String(payload.body || '').slice(0,350),
      teamsUrl:String(payload.teamsUrl || '').slice(0,1600)
    });
  }
}));
