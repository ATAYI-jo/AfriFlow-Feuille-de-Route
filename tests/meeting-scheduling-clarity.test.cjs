const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','modules/collaboration/meetings.js'),'utf8');
test('meeting form suggests a future time in the scheduler local timezone',()=>{
  assert.match(source,/function suggestedMeetingStart\(now\)/);
  assert.match(source,/var d=suggestedMeetingStart\(Date\.now\(\)\)/);
  assert.match(source,/value="'\+startHour\+'"/);
  assert.doesNotMatch(source,/id="csH" value="14:00"/);
});
test('only future meeting start can be scheduled, not a past start with remaining duration',()=>{
  assert.match(source,/if\(!isFutureMeetingStart\(st,Date\.now\(\)\)\)/);
  assert.doesNotMatch(source,/if\(st\+du\*6e4<Date\.now\(\)\)/);
});
test('selected audience requires checked people and explains when notifications fire',()=>{
  assert.match(source,/id="csInviteCount"/);
  assert.match(source,/Sélectionnez au moins une personne invitée/);
  assert.match(source,/La sélection d’invités ne déclenche pas d’appel immédiat/);
  assert.match(source,/Programmer les invitations/);
  assert.match(source,/Les alertes ne sont pas envoyées immédiatement/);
});
