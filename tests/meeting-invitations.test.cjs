const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const meetings=read('modules/collaboration/meetings.js'),html=read('index.html');
const checkin=read('supabase/functions/afriflow-meeting-checkin/index.ts');
const sql=read('supabase/migrations/20261121200000_meeting_invitees_attendance.sql');
test('Censeur can invite all members or a chosen group',()=>{
 assert.match(meetings,/id="csAudience"/);
 assert.match(meetings,/id="csPeople"/);
 assert.match(meetings,/data-cs-invite/);
 assert.match(meetings,/invitees:invitees/);
 assert.match(meetings,/Sélectionnez au moins une personne invitée/);
});
test('Only invited attendees see new meetings in personal register',()=>{
 assert.match(meetings,/function invited\(m,email\)/);
 assert.match(meetings,/visibleMeeting\(v\)/);
 assert.match(html,/v\.invitees\.some/);
 assert.match(sql,/value->'invitees'/);
});
test('Server validates identity, invitee and time before creating first checkin',()=>{
 assert.match(checkin,/service\.auth\.getUser\(token\)/);
 assert.match(checkin,/!invitees\.includes\(email\)/);
 assert.match(checkin,/now<start-15\*60000\|\|now>end/);
 assert.match(checkin,/if\(old\?\.value\)/);
 assert.match(meetings,/afriflow-meeting-checkin/);
 assert.match(sql,/drop policy if exists af_meet_att_insert_own/);
});

test('Teams opens its tab before awaiting check-in, preventing mobile popup blocking',()=>{
 const event=meetings.indexOf('document.addEventListener("click",async function(e)');
 const opener=meetings.indexOf('window.open("about:blank","_blank")',event);
 const checkin=meetings.indexOf('var saved=await mark(p.m)',event);
 assert.ok(event>=0&&opener>event&&checkin>opener,'Teams tab should open in the direct click handler');
 assert.match(meetings,/if\(!saved\)\{try\{tab\.close\(\)\}/);
 assert.match(meetings,/tab\.location\.replace\(target\)/);
});

// Windows app: no popup is required, and access is granted only after check-in.
test('Native Teams launch waits for check-in and personal attendance includes administrators',()=>{
 const native=meetings.indexOf('if(nativeOpen){');
 const checkin=meetings.indexOf('if(!await mark(selected.m))return;',native);
 const launch=meetings.indexOf('await window.AfriFlowNative.openTeams(target)',native);
 assert.ok(native>=0&&checkin>native&&launch>checkin);
 assert.match(html,/if\(!me\(\)\|\|!cfg2\)\{if\(has\)has\.parentNode\.remove\(\);return\}/);
 const main=read('desktop/main.js'),preload=read('desktop/preload.js');
 assert.match(main,/ipcMain\.handle\('afriflow:open-teams'/);
 assert.match(main,/const url = teamsUrl\(String\(rawUrl \|\| ''\)\)/);
 assert.match(preload,/openTeams: \(url\) => ipcRenderer\.invoke\('afriflow:open-teams'/);
});

test('Justification refusals require a reason and resubmissions reopen review',()=>{
 assert.match(html,/function askJustificationRefusal\(\)/);
 assert.match(html,/aria-labelledby="afJfRejectTitle"/);
 assert.match(html,/value\.length<10/);
 assert.match(html,/reason=await askJustificationRefusal\(\)/);
 assert.doesNotMatch(html,/reason=window\.prompt\(/);
 assert.match(html,/Corriger et renvoyer/);
 assert.match(html,/Number\(jd\.at\)>=Number\(jf\.at\)/);
 assert.match(html,/Historique des décisions/);
 assert.match(html,/history:history/);
});
test('Decisions notify active sessions via the AfriFlow alerts system',()=>{
 const alerts=read('afriflow-alerts.js');
 assert.match(alerts,/att:jd-%:/);
 assert.match(alerts,/Justificatif refusé/);
 assert.match(alerts,/knownDecisions/);
});

test('Censeur can issue an explicit permission separately from personal justification',()=>{
 assert.match(html,/id="csGrant"/);
 assert.match(html,/function openCensorPermission\(\)/);
 assert.match(html,/att:perm-/);
 assert.match(html,/censeur_permission/);
 assert.match(html,/Permission accordée/);
 assert.match(html,/if\(text\.length<10\|\|text\.length>800\)/);
 assert.match(html,/var perm=P\[m\.id\]/);
 assert.doesNotMatch(html,/id="csMine"/);
});
