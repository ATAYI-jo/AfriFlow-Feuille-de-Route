const { app, BrowserWindow, shell, Tray, Menu, Notification, ipcMain, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const HOME = 'https://afriflow-africa.onrender.com/';
const allowed = new Set(['afriflow-africa.onrender.com','atayi-jo.github.io']);
const teamsHosts = new Set(['teams.microsoft.com','teams.live.com','teams.microsoft.us']);
const single = app.requestSingleInstanceLock();
let win, tray, quitting = false;
let startAtLogin = true;
let lastRecovery = 0;
function preferencesPath(){return path.join(app.getPath('userData'),'desktop-preferences.json');}
function readPreferences(){
  try {
    const saved=JSON.parse(fs.readFileSync(preferencesPath(),'utf8'));
    if(typeof saved.startAtLogin==='boolean')startAtLogin=saved.startAtLogin;
  }catch(_){}
}
function savePreferences(){
  try{fs.mkdirSync(app.getPath('userData'),{recursive:true});fs.writeFileSync(preferencesPath(),JSON.stringify({startAtLogin}));}
  catch(err){console.warn('AfriFloW settings could not be saved:',err.message);}
}
function configureStartup(){
  if(process.platform!=='win32'||!app.isPackaged)return;
  try{app.setLoginItemSettings({openAtLogin:startAtLogin,path:process.execPath,args:['--hidden'],name:'AfriFloW'});}
  catch(err){console.warn('AfriFloW startup registration failed:',err.message);}
}
function recover(reason){
  if(quitting||!win||win.isDestroyed()||Date.now()-lastRecovery<12000)return;
  lastRecovery=Date.now();
  console.warn('AfriFloW background recovery:',reason);
  win.webContents.loadURL(HOME).catch(err=>console.warn('AfriFloW reload failed:',err.message));
}

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
  const meetingTitle = String(details.meetingTitle || '').slice(0, 160);
  const notification = new Notification({
    title, body, icon: path.join(__dirname,'assets','icon.png'),
    silent: false
  });
  notification.on('click', () => {
    reveal();
    // Keep the decision visible: the user can answer or decline before Teams opens.
    if (teams && win && !win.isDestroyed()) {
      win.webContents.send('afriflow:incoming-meeting', { title: meetingTitle || title, teamsUrl: teams });
    }
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
  win.webContents.on('did-finish-load',()=>{
    if(!win.isDestroyed())win.webContents.send('afriflow:window-visibility',!win.isVisible());
  });
  win.webContents.on('render-process-gone',(_event,details)=>recover('renderer: '+details.reason));
  win.webContents.on('did-fail-load',(_event,code,description,validatedURL,isMainFrame)=>{
    if(isMainFrame&&code!==-3)console.warn('AfriFloW page not loaded:',description,validatedURL);
  });
  win.webContents.on('will-navigate',(event,url)=>{
    if(!parseSafeUrl(url)){
      event.preventDefault();
      if(/^https:\/\//i.test(url))shell.openExternal(url).catch(()=>{});
    }
  });
  win.on('hide',()=>{
    if(!win.isDestroyed())win.webContents.send('afriflow:window-visibility',true);
  });
  win.on('show',()=>{
    if(!win.isDestroyed())win.webContents.send('afriflow:window-visibility',false);
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
  const file=path.join(__dirname,'assets','icon.png');
  const icon=nativeImage.createFromPath(file).resize({width:20,height:20});
  tray=new Tray(icon);
  tray.setToolTip('AfriFloW — actif en arrière-plan');
  function updateMenu(){
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:'Ouvrir AfriFloW',click:reveal},
      {label:'Lancer au démarrage de Windows',type:'checkbox',checked:startAtLogin,
        click:(item)=>{startAtLogin=item.checked;savePreferences();configureStartup();updateMenu();}},
      {label:'Tester une notification Windows',click:()=>{
        if(!Notification.isSupported()){
          console.warn('Notifications système Windows non prises en charge sur cet ordinateur');
          reveal();
          return;
        }
        const test=new Notification({
          title:'AfriFloW — test de notification',
          body:'Les alertes Windows fonctionnent. AfriFloW continue en arrière-plan.',
          icon:path.join(__dirname,'assets','icon.png'),
          silent:false
        });
        test.on('click',reveal);
        test.show();
      }},
      {type:'separator'},
      {label:'Quitter complètement',click:()=>{quitting=true;app.quit();}}
    ]));
  }
  updateMenu();
  tray.on('double-click',reveal);
}
app.whenReady().then(()=>{
  if(!single)return;
  if(process.platform==='win32')app.setAppUserModelId('africa.afriflow.desktop');
  readPreferences();
  // Enable background launch by default on the first run, but honor manual opt-out.
  configureStartup();
  createTray();
  createWindow();
  powerMonitor.on('resume',()=>{
    if(win&&!win.isDestroyed())win.webContents.send('afriflow:refresh');
  });
});
app.on('window-all-closed',()=>{ /* Stay in tray until explicit Quit */ });
app.on('activate',reveal);
app.on('before-quit',()=>{quitting=true});
