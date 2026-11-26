// UI journey on the isolated Android build. The coordinates are emulator inputs, never a farm default.
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { testOwner, webview, adb, tapSystem } from './android-survey-recorder.mjs';

const app = 'com.menis10tec.havatravve',
  u = await testOwner();
const ui = await webview(),
  ev = ui.evaluate;
const stamp = Date.now().toString().slice(-6);
const placeName = 'שער בדיקה ' + stamp,
  trailName = 'שביל בדיקה ' + stamp;
const wait = async (expr, ms = 20000) => {
  const until = Date.now() + ms;
  do {
    try {
      const a = await ev(expr);
      if (a) return a;
    } catch {}
    await delay(280);
  } while (Date.now() < until);
  throw Error('Timed out: ' + expr + '\n' + (await ev('document.body.innerText.slice(-1100)')));
};
const findBtn = (t) =>
  'Array.from(document.querySelectorAll("button,a")).find(x=>x.textContent.trim()===' +
  JSON.stringify(t) +
  '&&!x.disabled)';
const click = async (t) => {
  await wait('!!(' + findBtn(t) + ')');
  await ev('(' + findBtn(t) + ').click()');
};
const fill = async (label, val) => {
  const field =
    'Array.from(document.querySelectorAll("label")).find(l=>l.textContent.includes(' + JSON.stringify(label) + '))';
  await wait('!!(' + field + ')');
  await ev(
    '(()=>{const l=' +
      field +
      ';const x=l.control||l.querySelector("input")||l.parentElement.querySelector("input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(x,' +
      JSON.stringify(val) +
      ');x.dispatchEvent(new Event("input",{bubbles:true}));})()'
  );
};
const shot = async (name) => {
  const dir = process.env.SURVEY_SHOTS;
  if (!dir) return;
  await ev('document.querySelector(".k-screen__body")?.scrollTo(0,0);window.scrollTo(0,0)');
  if (name === '03-review') await ev('document.querySelector(".survey-review")?.scrollIntoView({block:"start"})');
  await delay(400);
  const raw = dir + '/' + name + '.tmp.png',
    jpeg = dir + '/' + name + '.jpg';
  fs.writeFileSync(raw, execFileSync('adb', ['-s', process.env.ANDROID_SERIAL, 'exec-out', 'screencap', '-p']));
  execFileSync('sips', ['-Z', '920', '-s', 'format', 'jpeg', '-s', 'formatOptions', '72', raw, '--out', jpeg]);
  fs.unlinkSync(raw);
};
const documents = 'http://127.0.0.1:8080/v1/projects/demo-havat-ravve/databases/(default)/documents';
const lookup = async (col, name) => {
  const r = await fetch(documents + ':runQuery', {
    method: 'POST',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: col }],
        where: { fieldFilter: { field: { fieldPath: 'name' }, op: 'EQUAL', value: { stringValue: name } } },
      },
    }),
  });
  return (await r.json()).map((x) => x.document).filter(Boolean);
};
const fix = (lng, lat) => adb('emu', 'geo', 'fix', String(lng), String(lat));
const text = (t) => 'document.body.innerText.includes(' + JSON.stringify(t) + ')';
try {
  await wait('typeof Capacitor!=="undefined" && document.body.innerText.includes("משימות")');
  await delay(1600);
  if (await ev('!!(' + findBtn('יציאה') + ')')) {
    await click('יציאה');
    await wait('!document.body.innerText.includes("נתוני דמו")');
  }
  await delay(500);
  const navigate = async (path) => {
    await ev(
      'history.pushState({}, "",' + JSON.stringify('/app' + path) + ');dispatchEvent(new PopStateEvent("popstate"))'
    );
  };
  await navigate('/farm');
  await wait('Array.from(document.querySelectorAll("a")).some(x=>x.textContent.includes("מפת החווה"))');
  if (await ev('!!(' + findBtn('לא תודה') + ')')) await click('לא תודה');
  await wait('!document.body.innerText.includes("רוצה לראות איך נראים נתוני דמו")');
  await shot('01-farm');
  await ev('Array.from(document.querySelectorAll("a")).find(a=>a.textContent.includes("מפת החווה")).click()');
  await wait(text('מדריך הסקר'));
  await wait('Object.keys(localStorage).some(k=>k.startsWith("farm-survey-auth:"))');
  await delay(450);
  if (!adb('shell', 'dumpsys', 'package', app).includes('ACCESS_FINE_LOCATION: granted=true')) {
    await click('לאפשר גישה למיקום');
    await tapSystem('permission_allow_foreground_only_button');
  }
  fix(10.0, 50.0);
  await wait(text('דיוק משוער'));
  // A human-scale overview makes roads and land use visible in the field screenshot.
  await ev('document.querySelector(".leaflet-control-zoom-out").click()');
  await delay(400);
  await ev('document.querySelector(".leaflet-control-zoom-out").click()');
  await wait('document.querySelectorAll("img.leaflet-tile-loaded").length > 0');
  await delay(1000);
  await shot('02-map');
  if (await ev('!!document.querySelector(".survey-review")')) {
    await fill('שם השביל', 'טיוטת בדיקה ' + stamp);
    await click('שמירת טיוטה');
    await wait('!document.querySelector(".survey-review")');
  }
  // idempotent re-run after an interrupted test
  if (await ev('!!(' + findBtn('ביטול') + ')')) await click('ביטול');
  if (await ev('!!(' + findBtn('סיום ההקלטה') + ')')) {
    await click('סיום ההקלטה');
    await click('סקירה ושמירה');
    await fill('שם השביל', 'טיוטת בדיקה ' + stamp);
    await click('שמירת טיוטה');
  }
  if (await ev('!!(' + findBtn('סקירה ושמירה') + ')')) {
    await click('סקירה ושמירה');
    await fill('שם השביל', 'טיוטת בדיקה ' + stamp);
    await click('שמירת טיוטה');
  }
  await click('התחלת הקלטת שביל');
  if (!(await ev(text('מקליט שביל')))) {
    await delay(600);
    const dump =
      adb('shell', 'dumpsys', 'activity', 'activities')
        .split('\n')
        .find((x) => x.includes('topResumedActivity')) || '';
    if (dump.includes('GrantPermissionsActivity')) await tapSystem('permission_allow_button');
  }
  await wait(text('מקליט שביל'));
  await click('שמירת מקום כאן');
  await fill('שם המקום', placeName);
  const capture = await ev('document.querySelector(".survey-panel bdi").textContent');
  await click('הוספת תמונה');
  await delay(1100);
  let activity =
    adb('shell', 'dumpsys', 'activity', 'activities')
      .split('\n')
      .find((x) => x.includes('topResumedActivity')) || '';
  if (activity.includes('GrantPermissionsActivity')) {
    await tapSystem('permission_allow_foreground_only_button');
    await delay(600);
  }
  activity =
    adb('shell', 'dumpsys', 'activity', 'activities')
      .split('\n')
      .find((x) => x.includes('topResumedActivity')) || '';
  assert.match(
    activity
      .split('\n')
      .filter((x) => x.includes('topResumedActivity'))
      .join(''),
    /camera|chooser|ResolverActivity/i,
    'Android camera or system camera chooser'
  );
  fix(10.00005, 50.00002);
  await delay(3500);
  await tapSystem('(?:shutter_button|button_capture|shutter)');
  await tapSystem('(?:done_button|review_done|btn_done|done)');
  await wait(text('החלפת תמונה'));
  assert.ok(
    await wait(
      'Array.from(document.querySelectorAll("input")).some(x=>x.value===' + JSON.stringify(placeName) + ')'
    )
  );
  assert.equal(await ev('document.querySelector(".survey-panel bdi").textContent'), capture);
  await wait(text('הקלטת השביל נמשכת'));
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  await wait('!navigator.onLine');
  await click('שמירת המקום');
  await wait(text('ממתינות לסנכרון'));
  assert.equal((await lookup('places', placeName)).length, 0);
  fix(10.00011, 50.00002);
  await delay(3400);
  fix(10.00011, 50.00008);
  await delay(3400);
  adb('shell', 'svc', 'wifi', 'enable');
  adb('shell', 'svc', 'data', 'enable');
  await wait('navigator.onLine');
  await wait('!document.body.innerText.includes("ממתינות לסנכרון")', 35000);
  const [place] = await lookup('places', placeName);
  assert.ok(place);
  const value = (x) => Number(x.doubleValue ?? x.integerValue);
  assert.equal([value(place.fields.lat).toFixed(6), value(place.fields.lng).toFixed(6)].join(', '), capture);
  assert.ok(value(place.fields.measuredAt) > 0);
  assert.ok(place.fields.photo.stringValue.startsWith('data:image/'));
  await click('סיום ההקלטה');
  await click('סקירה ושמירה');
  await fill('שם השביל', trailName);
  await ev('Array.from(document.querySelectorAll("label")).find(l=>l.innerText==="הליכה").click()');
  await ev(
    'Array.from(document.querySelectorAll("summary")).find(s=>s.innerText.includes("כניסות וחיבורים")).click()'
  );
  const pid = place.name.split('/').at(-1);
  await ev(
    '(()=>{const s=Array.from(document.querySelectorAll("select")).find(s=>Array.from(s.options).some(o=>o.value==="place:' +
      pid +
      '"));s.value="place:' +
      pid +
      '";s.dispatchEvent(new Event("change",{bubbles:true}));})()'
  );
  await click('אישור החיבור בשטח');
  await wait(text('כניסות וחיבורים (1)'));
  await shot('03-review');
  await click('אישור ושמירת השביל');
  await wait('!document.body.innerText.includes("סקירת השביל")');
  let saved;
  for (let i = 0; i < 45; i++) {
    [saved] = await lookup('farmTrails', trailName);
    if (saved) break;
    await delay(450);
  }
  assert.equal(saved?.fields.status.stringValue, 'confirmed');
  assert.equal(saved.fields.connections.arrayValue.values.length, 1);
  assert.ok(value(saved.fields.count) >= 3);
  await click('חיפוש ורשימה');
  await click(trailName + ' · מאושר');
  await wait(text('סקירת השביל'));
  await ev('Array.from(document.querySelectorAll("summary")).find(s=>s.innerText.includes("תיקון נקודה")).click()');
  await click('הסרת נקודה');
  assert.equal(await ev('document.querySelector(".survey-modes input").checked'), false);
  await click('ביטול התיקון האחרון');
  assert.equal(await ev('document.querySelector(".survey-modes input").checked'), true);
  await click('שמירת טיוטה');
  await wait('!document.body.innerText.includes("סקירת השביל")');
  if (await ev('!!(' + findBtn('ניסיון סנכרון נוסף') + ')')) await click('ניסיון סנכרון נוסף');
  assert.equal((await lookup('places', placeName)).length, 1);
  assert.equal((await lookup('farmTrails', trailName)).length, 1);
  console.log(
    JSON.stringify({
      place: placeName,
      trail: trailName,
      capture,
      samples: value(saved.fields.count),
      modes: saved.fields.modes.arrayValue.values,
      entrances: saved.fields.connections.arrayValue.values.length,
      owner: u.localId.length > 0,
    })
  );
} finally {
  adb('shell', 'svc', 'wifi', 'enable');
  adb('shell', 'svc', 'data', 'enable');
  ui.close();
}
