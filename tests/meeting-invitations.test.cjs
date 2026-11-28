const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const meetings=read('modules/collaboration/meetings.js'),html=read('index.html');
const attendance=read('modules/collaboration/attendance.js'),memberUI=html+attendance;
const checkin=read('supabase/functions/afriflow-meeting-checkin/index.ts');
const sql=read('supabase/migrations/20261121200000_meeting_invitees_attendance.sql');
const receiptSql=read('supabase/migrations/20261126124229_meeting_attendance_evidence_and_reviews.sql');
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
test('Server validates identity and delegates its receipt time to the protected check-in transaction',()=>{
 assert.match(checkin,/service\.auth\.getUser\(token\)/);
 const receipt=checkin.indexOf('const receivedAt=new Date().toISOString()');
 const identity=checkin.indexOf('service.auth.getUser(token)');
 const transaction=checkin.indexOf('service.rpc("af_meeting_checkin_write"');
 assert.ok(receipt>=0&&identity>receipt&&transaction>identity,'trusted receipt precedes authentication latency and the protected RPC');
 assert.match(checkin,/p_user_id:user\.id,p_received_at:receivedAt/);
 assert.doesNotMatch(checkin,/p_received_at:payload\./);
 assert.match(receiptSql,/jsonb_array_elements_text\(v_meeting->'invitees'\)/);
 assert.match(receiptSql,/if v_at<v_start-15\*60000 or v_at>v_end/);
 assert.match(receiptSql,/old\.value->>'schemaVersion'='2'/);
 assert.match(receiptSql,/old\.value->>'at'\)::numeric>\(excluded\.value->>'at'\)::numeric/);
 assert.match(receiptSql,/revoke all on function public\.af_meeting_checkin_write\([^;]+from public,anon,authenticated/);
 assert.match(meetings,/afriflow-meeting-checkin/);
 assert.match(sql,/drop policy if exists af_meet_att_insert_own/);
});

test('Teams stays in AfriFlow for check-in and navigates only after server confirmation, without popups',()=>{
 const entry=meetings.indexOf('async function joinMeeting(id,options)');
 const end=meetings.indexOf('async function mark(id,source)',entry);
 assert.ok(entry>=0&&end>entry);
 const join=meetings.slice(entry,end);
 const screen=join.indexOf('screen=pointageScreen(account)');
 const checkin=join.indexOf('var result=await mark(id,options.source||"home")');
 const validation=join.indexOf('if(!okUrl(target))');
 const navigation=join.indexOf('window.location.assign(target)');
 assert.ok(screen>=0&&checkin>screen&&validation>checkin&&navigation>validation);
 assert.doesNotMatch(join,/window\.open\s*\(/);
 assert.match(join,/finally\{if\(screen\)screen\.remove\(\);joining\.delete\(id\);\}/);
 assert.match(meetings,/window\.AfriMeetings=\{join:joinMeeting,preview:previewMeeting\}/);
});

// Windows app: no popup is required, and access is granted only after check-in.
test('Native Teams launch waits for check-in and personal attendance includes administrators',()=>{
 const entry=meetings.indexOf('async function joinMeeting(id,options)');
 const checkin=meetings.indexOf('var result=await mark(id,options.source||"home")',entry);
 const native=meetings.indexOf('if(nativeOpen){',checkin);
 const launch=meetings.indexOf('await window.AfriFlowNative.openTeams(target)',native);
 assert.ok(entry>=0&&checkin>entry&&native>checkin&&launch>native);
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
 assert.match(memberUI,/Corriger et renvoyer/);
 assert.match(attendance,/Number\(jd\.at\)\s*>=\s*Number\(jf\.at\)/);
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
 assert.match(attendance,/perm = options\.permission/);
 assert.doesNotMatch(html,/id="csMine"/);
});
