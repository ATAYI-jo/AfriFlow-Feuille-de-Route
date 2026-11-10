const { app, BrowserWindow, shell, Tray, Menu, Notification, ipcMain, nativeImage } = require('electron');
const path = require('path');
const HOME = 'https://afriflow-africa.onrender.com/';
const allowed = new Set(['afriflow-africa.onrender.com','atayi-jo.github.io']);
const teamsHosts = new Set(['teams.microsoft.com','teams.live.com','teams.microsoft.us']);
const single = app.requestSingleInstanceLock();
let win, tray, quitting = false;

function parseSafeUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && allowed.has(u.hostname);
  } catch { return false; }
}
function teamsUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && teamsHosts.has(u.hostname) ? u.href : '';
  } catch { return ''; }
}
if (!single) {
  app.quit();
} else {
  app.on('second-instance', () => reveal());
}
function reveal() {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
}
function notifyFromRenderer(event, details) {
  // A compromised website outside AfriFloW must never invoke privileged APIs.
  if (!event.sender || !parseSafeUrl(event.sender.getURL())) return;
  if (!details || typeof details !== 'object') return;
  const title = String(details.title || 'AfriFloW').slice(0, 120);
  const body = String(details.body || '').slice(0, 350);
  const teams = teamsUrl(String(details.teamsUrl || ''));
  const notification = new Notification({
    title, body, icon: path.join(__dirname,'assets','icon.png'),
    silent: false
  });
  notification.on('click', () => {
    reveal();
    if (teams) shell.openExternal(teams).catch(()=>{});
  });
  notification.show();
}
ipcMain.on('afriflow:notify',notifyFromRenderer);
function createWindow() {
  win = new BrowserWindow({
    width:1200, height:840, minWidth:360, minHeight:540,
    title:'AfriFloW',autoHideMenuBar:true,
    show:false,
    icon:path.join(__dirname,'assets','icon.png'),
    webPreferences:{
      preload:path.join(__dirname,'preload.js'),
      nodeIntegration:false,contextIsolation:true,sandbox:true,
      backgroundThrottling:false
    }
  });
  win.webContents.setWindowOpenHandler(({url}) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url).catch(()=>{});
    return {action:'deny'};
  });
  win.webContents.on('will-navigate',(event,url)=>{
    if(!parseSafeUrl(url)){
      event.preventDefault();
      if(/^https:\/\//i.test(url))shell.openExternal(url).catch(()=>{});
    }
  });
  win.on('close',(event)=>{
    if(!quitting){
      event.preventDefault();
      win.hide(); // Keep the authenticated session and notification polling alive.
    }
  });
  win.once('ready-to-show',()=>{
    if(!process.argv.includes('--hidden'))reveal();
  });
  win.loadURL(HOME);
}
function createTray() {
  const file = path.join(__dirname,'assets','icon.png');
  const icon = nativeImage.createFromPath(file).resize({width:20,height:20});
  tray = new Tray(icon);
  tray.setToolTip('AfriFloW — notifications actives');
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'Ouvrir AfriFloW', click:reveal},
    {label:'Quitter complètement', click:()=>{quitting=true;app.quit()}}
  ]));
  tray.on('double-click',reveal);
}
app.whenReady().then(()=>{
  if(!single)return;
  if(process.platform==='win32'){
    app.setAppUserModelId('africa.afriflow.desktop');
    if(app.isPackaged){
      app.setLoginItemSettings({openAtLogin:true,args:['--hidden']});
    }
  }
  createTray();
  createWindow();
});
app.on('window-all-closed',()=>{ /* Stay in tray until explicit Quit */ });
app.on('activate',reveal);
app.on('before-quit',()=>{quitting=true});
