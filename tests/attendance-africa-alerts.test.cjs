const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const attendance = fs.readFileSync(path.join(root,'modules/collaboration/attendance.js'),'utf8');
const style = fs.readFileSync(path.join(root,'modules/collaboration/attendance.css'),'utf8');
const news = fs.readFileSync(path.join(root,'supabase/functions/afriflow-agro-brief/index.ts'),'utf8');
const settings = fs.readFileSync(path.join(root,'modules/collaboration/notification-settings.js'),'utf8');

function app() {
  const document = { addEventListener() {} };
  const window = { addEventListener() {}, USER_ROLE: 'shareholder' };
  vm.runInNewContext(attendance, {window,document,Date,Intl,console,CustomEvent:class{}});
  return window.AfriAttendance;
}
test('late pointages show elapsed minutes/seconds rather than an opaque status',() => {
  const model = app(), start=Date.parse('2026-11-26T12:00:00Z');
  const meeting={ id:'mtest01', start, dur:60, grace:5};
  const record={at:start+11*60000+23*1000,scheduledStart:start,graceMinutes:5};
  const late=model.status(meeting,record);
  assert.equal(late.t,'Retard');
  assert.match(late.detail,/11 min 23 s/);
  assert.match(late.detail,/à confirmer/);
  assert.match(model.statusHTML(late),/11 min 23 s/);
  const ontime=model.status(meeting,{...record,at:start+5*60000});
  assert.equal(ontime.t,'Présent');
  const excuse=model.status(meeting,record,{justification:{at:1},decision:{ok:true,at:2}});
  assert.equal(excuse.t,'Excusé');
  assert.doesNotMatch(excuse.detail,/11 min/);
});
test('confirmed lateness uses reviewed arrival when available but does not alter original pointage',() => {
  const model=app(),start=Date.parse('2026-11-26T12:00:00Z');
  const meeting={id:'mtest01',start,dur:60,grace:5},record={at:start+17*60000};
  const request={id:'req',kind:'request',created_at:new Date(start+20*60000).toISOString()};
  const decision={id:'dec',kind:'decision',request_id:'req',outcome:'late',occurred_at:new Date(start+8*60000+13*1000).toISOString(),created_at:new Date(start+25*60000).toISOString()};
  const value=model.status(meeting,record,{events:[request,decision]});
  assert.equal(value.t,'Retard');
  assert.match(value.detail,/8 min 13 s/);
  assert.equal(value.rawAt,record.at);
});
test('translucent contrast and subtle animation remain accessible',()=>{
  assert.match(style,/background:rgba\(232,249,236,\.43\)/);
  assert.match(style,/backdrop-filter:blur\(12px\)/);
  assert.match(style,/prefers-reduced-motion:reduce/);
  assert.match(style,/animation:none/);
});
test('Africa-only editor uses African feeds and requires verified article before publication',()=>{
  assert.match(news,/https:\/\/www\.rfi\.fr\/fr\/afrique\/rss/);
  assert.match(news,/news\/world\/africa\/rss\.xml/);
  assert.match(news,/const african = recent\.filter/);
  assert.match(news,/if\(!african\.length\)throw/);
  assert.match(news,/if\(article\.length>=350\)/);
  assert.doesNotMatch(news,/const lead=candidates\.find/);
});
test('notification test requires explicit click and browser permission',()=>{
  assert.match(settings,/Tester une notification/);
  assert.match(settings,/permission\(\) !== "granted"/);
  assert.match(settings,/window\.AfriFlowPush\.test\(\)/);
  assert.match(settings,/Envoi de la notification de test à votre propre compte/);
});
