const { contextBridge, ipcRenderer } = require('electron');
let background = false;
ipcRenderer.on('afriflow:window-visibility', (_event, hidden) => { background = !!hidden; });
ipcRenderer.on('afriflow:refresh', () => {
  window.dispatchEvent(new Event('afriflow:refresh'));
});
let incomingMeetingHandler = null;
ipcRenderer.on('afriflow:incoming-meeting', (_event, payload) => {
  if (incomingMeetingHandler) incomingMeetingHandler(payload || {});
});
contextBridge.exposeInMainWorld('AfriFlowNative', Object.freeze({
  isBackground: () => background,
  notify: (payload) => {
    if (!payload || typeof payload !== 'object') return;
    ipcRenderer.send('afriflow:notify', {
      title:String(payload.title || 'AfriFloW').slice(0,120),
      body:String(payload.body || '').slice(0,350),
      teamsUrl:String(payload.teamsUrl || '').slice(0,1600),
      meetingTitle:String(payload.meetingTitle || '').slice(0,160)
    });
  },
  onIncomingMeeting: (handler) => {
    incomingMeetingHandler = typeof handler === 'function' ? handler : null;
  },
  presentIncomingMeeting: (payload) => {
    if (!payload || typeof payload !== 'object') return;
    ipcRenderer.send('afriflow:present-incoming-meeting', {
      meetingTitle:String(payload.meetingTitle || '').slice(0,160),
      teamsUrl:String(payload.teamsUrl || '').slice(0,1600)
    });
  }
}));
