const { contextBridge, ipcRenderer } = require('electron');
let background = false;
ipcRenderer.on('afriflow:window-visibility', (_event, hidden) => { background = !!hidden; });
ipcRenderer.on('afriflow:refresh', () => {
  window.dispatchEvent(new Event('afriflow:refresh'));
});
let incomingMeetingHandler = null;
let pendingMeeting = null;
ipcRenderer.on('afriflow:incoming-meeting', (_event, payload) => {
  const details = meetingDetails(payload);
  if (!details) return;
  if (incomingMeetingHandler) incomingMeetingHandler(details);
  else pendingMeeting = details;
});
function meetingDetails(payload) {
  if (!payload || !/^m[a-z0-9]{5,35}$/.test(String(payload.meetingId || ''))) return null;
  return { meetingId: String(payload.meetingId), meetingTitle: String(payload.meetingTitle || '').slice(0,160),
    start: Number(payload.start) || 0, dur: Number(payload.dur) || 0, end: Number(payload.end) || 0,
    stage: payload.stage === 'soon' ? 'soon' : 'start', expiresAt: Number(payload.expiresAt) || 0 };
}
contextBridge.exposeInMainWorld('AfriFlowNative', Object.freeze({
  meetingInvitationsVersion: 1,
  isBackground: () => background,
  openTeams: (url) => ipcRenderer.invoke('afriflow:open-teams', String(url || '').slice(0, 2048)),
  notify: (payload) => {
    if (!payload || typeof payload !== 'object') return;
    ipcRenderer.send('afriflow:notify', {
      title:String(payload.title || 'AfriFlow').slice(0,120),
      body:String(payload.body || '').slice(0,350),
      ...meetingDetails(payload)
    });
  },
  onIncomingMeeting: (handler) => {
    incomingMeetingHandler = typeof handler === 'function' ? handler : null;
    if (incomingMeetingHandler && pendingMeeting) {
      const details = pendingMeeting; pendingMeeting = null;
      incomingMeetingHandler(details);
    }
  },
  presentIncomingMeeting: (payload) => {
    const details = meetingDetails(payload); if (!details) return;
    ipcRenderer.send('afriflow:present-incoming-meeting', details);
  }
}));
