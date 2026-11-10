const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const HOME = 'https://afriflow-africa.onrender.com/';
const allowed = new Set(['afriflow-africa.onrender.com','atayi-jo.github.io']);
function safeUrl(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && allowed.has(u.hostname); }
  catch { return false; }
}
function start() {
  const win = new BrowserWindow({
    width: 1200, height: 840, minWidth: 360, minHeight: 540,
    title: 'AfriFloW', autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(({url}) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return {action:'deny'};
  });
  win.webContents.on('will-navigate', (event,url) => {
    if (!safeUrl(url)) { event.preventDefault(); if(url.startsWith('https://')) shell.openExternal(url); }
  });
  win.loadURL(HOME);
}
app.whenReady().then(start);
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)start();});
