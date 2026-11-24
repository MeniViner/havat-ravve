// The demo's copy of the API's catalog, one operation per line: name|what it does|scope|path (a read; a change goes to
// /v1/actions/<name>)|path ids|fields. A field is name, * when required, and its type. The operations the design shows are
// written out in access.ts. Made from api/src/catalog.ts; kept short because it ships with the console.
import type { CatalogOp, CatalogParam } from '../source';

const TYPES: Record<string, string> = { s: 'string', u: 'uid', i: 'id', d: 'date', b: 'bool', n: 'int', x: 'number', e: 'enum', D: 'datetime', T: 'time', E: 'email', L: 'stringList', l: 'intList' };
function param(text: string): [string, CatalogParam] {
  const [head, rest] = [text.slice(0, text.indexOf(':')), text.slice(text.indexOf(':') + 1)];
  const type = TYPES[rest[0]];
  const [spec, dflt] = rest.slice(1).split('=');
  const p: CatalogParam = { type };
  if (head.endsWith('*')) p.required = true;
  if (type === 'string' && spec) p.max = Number(spec);
  if ((type === 'int' || type === 'number') && spec) [p.min, p.max] = spec.split('~').map(Number);
  if (type === 'enum') p.values = spec.split('/');
  if (dflt !== undefined) p.default = type === 'bool' ? dflt === 'true' : type === 'enum' || type === 'string' ? dflt : Number(dflt);
  return [head.replace('*', ''), p];
}
/** "@": the paging fields of every generated list; "^": the guard against overwriting a newer change. */
const fields = (text: string) => Object.fromEntries(text.replace('@', 'limit:n1~100=25,cursor:s600,countOnly:b=false').replace('^', 'ifUpdatedAt:s40').split(',').filter(Boolean).map(param));
export const otherOps = (): CatalogOp[] => LINES.trim().split('\n').map((line) => {
  const [name, he, requiredScope, path, ids, rest] = line.split('|');
  const f = fields(rest || '');
  const pathParams = ids ? Object.fromEntries(ids.split(',').map((k) => [k, { type: 'id', required: true }])) : undefined;
  return path
    ? { name, he, kind: 'read' as const, method: 'GET' as const, path: '/v1/' + path, requiredScope, ...(pathParams ? { pathParams } : {}), params: f }
    : { name, he, kind: 'write' as const, method: 'POST' as const, path: '/v1/actions/' + name, idempotency: 'required' as const, requiredScope, body: f };
});

const LINES = `
settings.get|הגדרות: פתיח לאורחים, סוגי ביקור, פרטי תשלום (ביט/PayBox), סכומי תרומה, נוסחי הודעות|settings:read|settings||
tasks.assign|שיוך משימה קיימת לאחראי, או שחרור שלה (פנויה)|tasks:assign|||taskId*:i,assignee:u,release:b,^
tasks.complete|סימון משימה כבוצעה, בשם מי שקורא|tasks:complete|||taskId*:i,^,donePhoto:s300,doneNote:s2000
tasks.reopen|החזרת משימה שבוצעה למצב פתוח|tasks:complete|||taskId*:i,^
shopping.setBought|סימון פריט כנקנה (או ביטול הסימון)|shopping:write|||itemId*:i,^,bought:b=true,tripId:i
system.failures|תקלות אחרונות בשרת: שגיאות, פעולות שלא ברור אם נשמרו, חסימות קצב ומכסה|system:read|system/failures||hours:n1~720=24
templates.list|משימות קבועות (חוזרות): ימים בשבוע (0=ראשון), שעה, פעילה או לא|templates:read|templates||active:b,@
templates.get|משימות קבועות (חוזרות): ימים בשבוע (0=ראשון), שעה, פעילה או לא (רשומה אחת לפי מזהה)|templates:read|templates/{id}|id|
places.list|מקומות בחווה (שם וקואורדינטות)|places:read|places||@
places.get|מקומות בחווה (שם וקואורדינטות) (רשומה אחת לפי מזהה)|places:read|places/{id}|id|
profiles.list|כל האנשים הרשומים באפליקציה, כולל אורחים: תפקיד, מצב, טלפון, מייל, הערות והיסטוריה|people:read|profiles||role:eowner/manager/staff/guest,status:eactive/pending/blocked,@
profiles.get|כל האנשים הרשומים באפליקציה, כולל אורחים: תפקיד, מצב, טלפון, מייל, הערות והיסטוריה (רשומה אחת לפי מזהה)|people:read|profiles/{id}|id|
roleInvites.list|מיילים שהוגדר להם תפקיד מראש (יקבלו אותו כשיירשמו)|people:read|role-invites||@
roleInvites.get|מיילים שהוגדר להם תפקיד מראש (יקבלו אותו כשיירשמו) (רשומה אחת לפי מזהה)|people:read|role-invites/{id}|id|
joinCodes.list|קודי הצטרפות לצוות|people:read|join-codes||@
joinCodes.get|קודי הצטרפות לצוות (רשומה אחת לפי מזהה)|people:read|join-codes/{id}|id|
events.list|אירועים: מועד, מחיר, קיבולת, פתוח להרשמה, מפורסם|events:read|events||published:b,open:b,startFrom:d,startTo:d,@
events.get|אירועים: מועד, מחיר, קיבולת, פתוח להרשמה, מפורסם (רשומה אחת לפי מזהה)|events:read|events/{id}|id|
eventVendors.list|דוכנים/ספקים ששובצו לאירוע ואם אישרו הגעה|events:read|events/{eventId}/vendors|eventId|@
eventVendors.get|דוכנים/ספקים ששובצו לאירוע ואם אישרו הגעה (רשומה אחת לפי מזהה)|events:read|events/{eventId}/vendors/{id}|eventId,id|
eventProducts.list|מוצרים ומחירים בדוכן של האירוע|events:read|events/{eventId}/products|eventId|@
eventProducts.get|מוצרים ומחירים בדוכן של האירוע (רשומה אחת לפי מזהה)|events:read|events/{eventId}/products/{id}|eventId,id|
tickets.list|כרטיסים שהוזמנו: מי הזמין, לאיזה אירוע, מצב תשלום, כניסות|tickets:read|tickets||eventId:i,orderId:i,ownerUid:i,paymentStatus:efree/pending/claimed/paid/paid_onsite/cancelled,status:evalid/cancelled,@
tickets.get|כרטיסים שהוזמנו: מי הזמין, לאיזה אירוע, מצב תשלום, כניסות (רשומה אחת לפי מזהה)|tickets:read|tickets/{id}|id|
visits.list|בקשות ביקור בחווה: מי, מתי, כמה אנשים, סוג, מצב|visits:read|visits||status:enew/approved/rejected/cancelled,uid:i,dateFrom:d,dateTo:d,@
visits.get|בקשות ביקור בחווה: מי, מתי, כמה אנשים, סוג, מצב (רשומה אחת לפי מזהה)|visits:read|visits/{id}|id|
donations.list|תרומות: סכום, מטרה, הנצחה, מצב תשלום, קבלה|donations:read|donations||paymentStatus:epending/claimed/paid/cancelled,uid:i,receiptWanted:b,receiptSent:b,@
donations.get|תרומות: סכום, מטרה, הנצחה, מצב תשלום, קבלה (רשומה אחת לפי מזהה)|donations:read|donations/{id}|id|
vendors.list|ספקים ובעלי דוכנים (טלפון, מה מוכרים)|vendors:read|vendors||external:b,@
vendors.get|ספקים ובעלי דוכנים (טלפון, מה מוכרים) (רשומה אחת לפי מזהה)|vendors:read|vendors/{id}|id|
vendorInvites.list|קישורי גישה של בעלי דוכנים לאפליקציה (מי, לאיזה דוכן, אם נכנס)|vendors:read|vendor-invites||vendorId:i,@
vendorInvites.get|קישורי גישה של בעלי דוכנים לאפליקציה (מי, לאיזה דוכן, אם נכנס) (רשומה אחת לפי מזהה)|vendors:read|vendor-invites/{id}|id|
eventStaffing.list|שיבוץ הצוות לעמדות באירוע (שער, דוכן, חניה): מי, באילו שעות, כמה צריך|events:read|events/{eventId}/staffing|eventId|@
eventStaffing.get|שיבוץ הצוות לעמדות באירוע (שער, דוכן, חניה): מי, באילו שעות, כמה צריך (רשומה אחת לפי מזהה)|events:read|events/{eventId}/staffing/{id}|eventId,id|
eventFiles.list|קבצים וקישורים של האירוע (היתרים, מפות, רשימות)|events:read|events/{eventId}/files|eventId|@
eventFiles.get|קבצים וקישורים של האירוע (היתרים, מפות, רשימות) (רשומה אחת לפי מזהה)|events:read|events/{eventId}/files/{id}|eventId,id|
eventScans.list|יומן השער של האירוע: מי נכנס, מתי, מי סרק, תשלום בשער, כניסות שנדחו|events:read|events/{eventId}/scans|eventId|result:eok/paidAtGate/payLater/rejected,@
eventScans.get|יומן השער של האירוע: מי נכנס, מתי, מי סרק, תשלום בשער, כניסות שנדחו (רשומה אחת לפי מזהה)|events:read|events/{eventId}/scans/{id}|eventId,id|
eventCounters.list|מוני השער (נכנסו, סריקות, שילמו בשער, חובות) וספירת המזומן|events:read|events/{eventId}/counters|eventId|@
eventCounters.get|מוני השער (נכנסו, סריקות, שילמו בשער, חובות) וספירת המזומן (רשומה אחת לפי מזהה)|events:read|events/{eventId}/counters/{id}|eventId,id|
eventVendorRequests.list|בקשות של בעלי דוכנים ביום האירוע (חשמל, עזרה, מים)|events:read|events/{eventId}/vendor-requests|eventId|vendorId:i,@
eventVendorRequests.get|בקשות של בעלי דוכנים ביום האירוע (חשמל, עזרה, מים) (רשומה אחת לפי מזהה)|events:read|events/{eventId}/vendor-requests/{id}|eventId,id|
eventVendorInfo.list|מה בעלי הדוכנים רואים על האירוע: שעות הקמה, איש קשר, הנחיות|events:read|events/{eventId}/vendor-info|eventId|@
eventVendorInfo.get|מה בעלי הדוכנים רואים על האירוע: שעות הקמה, איש קשר, הנחיות (רשומה אחת לפי מזהה)|events:read|events/{eventId}/vendor-info/{id}|eventId,id|
emailOutbox.list|מיילים אוטומטיים של אישור תשלום: נשלח, ממתין או נכשל|notifications:read|email-outbox||@
emailOutbox.get|מיילים אוטומטיים של אישור תשלום: נשלח, ממתין או נכשל (רשומה אחת לפי מזהה)|notifications:read|email-outbox/{id}|id|
tabs.list|חשבונות פתוחים בדוכן של אירוע: מה נלקח, כמה לתשלום, מצב|tabs:read|tabs||eventId:i,guestUid:i,status:eopen/claimed/paid/waived,@
tabs.get|חשבונות פתוחים בדוכן של אירוע: מה נלקח, כמה לתשלום, מצב (רשומה אחת לפי מזהה)|tabs:read|tabs/{id}|id|
notifications.list|תור ההתראות למנהלים (ביקורים, תרומות, הזמנות, תשלומים)|notifications:read|notifications||handled:b,type:evisit/donation/join/order/receipt/tab/claim/contact,@
notifications.get|תור ההתראות למנהלים (ביקורים, תרומות, הזמנות, תשלומים) (רשומה אחת לפי מזהה)|notifications:read|notifications/{id}|id|
calendar.list|יומן החווה: נוכחות, פגישות, הכנות לפסטיבל, ביקורים מאושרים ואירועים מפורסמים|calendar:read|calendar||kind:emanual/visit/event/presence/meeting/planning,audience:eall/managers,ownerUid:i,dateFrom:d,dateTo:d,@
calendar.get|יומן החווה: נוכחות, פגישות, הכנות לפסטיבל, ביקורים מאושרים ואירועים מפורסמים (רשומה אחת לפי מזהה)|calendar:read|calendar/{id}|id|
broadcasts.list|הודעות לצוות שנשלחו: טקסט, קהל, דחוף, מי שלח, למי (recipients)|broadcasts:read|broadcasts||audience:eall/farmToday/managers/crew/vendors,urgent:b,@
broadcasts.get|הודעות לצוות שנשלחו: טקסט, קהל, דחוף, מי שלח, למי (recipients) (רשומה אחת לפי מזהה)|broadcasts:read|broadcasts/{id}|id|
broadcastReads.list|אישורי קריאה של הודעה לצוות: מי קרא (at) ומי רק ראה (seenAt)|broadcasts:read|broadcasts/{broadcastId}/reads|broadcastId|@
broadcastReads.get|אישורי קריאה של הודעה לצוות: מי קרא (at) ומי רק ראה (seenAt) (רשומה אחת לפי מזהה)|broadcasts:read|broadcasts/{broadcastId}/reads/{id}|broadcastId,id|
me.notifications.list|ההתראות האישיות שלי (מה שמופיע בפעמון באפליקציה)|me:read|me/notifications||kind:etask/urgent/trip/event/broadcast/vendor/system,refId:i,@
me.notifications.get|ההתראות האישיות שלי (מה שמופיע בפעמון באפליקציה) (רשומה אחת לפי מזהה)|me:read|me/notifications/{id}|id|
accountDeletions.list|בקשות למחיקת חשבון: מי ביקש ומתי (החשבון נמחק 30 יום אחרי הבקשה)|people:read|account-deletions||@
accountDeletions.get|בקשות למחיקת חשבון: מי ביקש ומתי (החשבון נמחק 30 יום אחרי הבקשה) (רשומה אחת לפי מזהה)|people:read|account-deletions/{id}|id|
activity.list|יומן הפעילות: מי עשה מה ומתי, בכל המערכת|activity:read|activity||kind:etask/shopping/event/ticket/tab/place/task_private/visit/donation/user/settings,refId:i,subjectUid:i,eventId:i,byUid:i,action:s200,@
activity.get|יומן הפעילות: מי עשה מה ומתי, בכל המערכת (רשומה אחת לפי מזהה)|activity:read|activity/{id}|id|
shoppingTrips.list|קניות (מישהו בחנות): מי, איזו רשימה, מתי התחילה ונסגרה, מה נקנה ומה לא היה|shopping:read|shopping-trips||@
shoppingTrips.get|קניות (מישהו בחנות): מי, איזו רשימה, מתי התחילה ונסגרה, מה נקנה ומה לא היה (רשומה אחת לפי מזהה)|shopping:read|shopping-trips/{id}|id|
projects.list|פרויקטים של המנהלים: יעד, תאריך, חברים, מצב, וכל הצעדים שלהם לפי הסדר|projects:read|projects||@
projects.get|פרויקטים של המנהלים: יעד, תאריך, חברים, מצב, וכל הצעדים שלהם לפי הסדר (רשומה אחת לפי מזהה)|projects:read|projects/{id}|id|
tasks.edit|עריכת משימה: כותרת, הערה, תאריך יעד, דחיפות, מיקום, למנהלים בלבד|tasks:edit|||^,taskId*:i,title:s200,note:s4000,dueDate:d,clearDueDate:b,urgent:b,managersOnly:b,placeId:i,clearPlace:b,eventId:i,clearEvent:b,assignee:u,clearAssignee:b
tasks.setDoneNote|הערת ביצוע למשימה (מה נעשה)|tasks:complete|||^,taskId*:i,note*:s2000
tasks.delete|מחיקת משימה|tasks:edit|||^,taskId*:i
templates.create|יצירת משימה קבועה (חוזרת)|templates:write|||title*:s200,note:s4000,days:l,time:T,active:b,managersOnly:b,assignee:u,placeId:i
templates.update|עדכון משימה קבועה|templates:write|||^,templateId*:i,title:s200,note:s4000,days:l,time:T,active:b,managersOnly:b,assignee:u,placeId:i,clearAssignee:b,clearPlace:b
templates.delete|מחיקת משימה קבועה|templates:write|||^,templateId*:i
shopping.edit|עריכת פריט ברשימת הקניות|shopping:write|||^,itemId*:i,title:s200,qty:s40,note:s1000,link:s2000,category:esuper/building/online/giveaway,urgent:b
shopping.delete|מחיקת פריט מרשימת הקניות|shopping:write|||^,itemId*:i
places.add|הוספת מקום בחווה|places:write|||name*:s120,lat*:x-90~90,lng*:x-180~180,accuracy:x0~100000
places.update|עדכון מקום: שם, מיקום, דיוק, תמונה|places:write|||placeId*:i,name:s120,lat:x-90~90,lng:x-180~180,accuracy:x0~100000,photo:s300
places.delete|מחיקת מקום (רק מנהל)|places:write|||placeId*:i
people.setRole|שינוי תפקיד של אדם (אורח, מתנדב, מנהל, בעלים)|people:write|||^,uid*:i,role*:eguest/staff/manager/owner
people.setStatus|חסימה או שחרור של אדם|people:write|||^,uid*:i,status*:eactive/blocked
people.setNotes|הערות פנימיות על אדם (רק מנהלים רואים)|people:write|||^,uid*:i,notes*:s2000
invites.setRole|הגדרת תפקיד מראש למייל (יקבל אותו כשיירשם). guest מבטל|people:write|||email*:E,role*:estaff/manager/owner/guest
events.create|יצירת אירוע|events:write|||title*:s200,description:s8000,location:s300,start*:D,end*:D,price:x0~100000,maxPerOrder:n1~20=5,capacity:n0~100000=0,open:b,published:b,entry:b,stall:b,questions:L10,questionsRequired:l,image:s300
events.update|עדכון אירוע, כולל פרסום/הסרה מפרסום ופתיחה/סגירה של הרשמה|events:write|||^,eventId*:i,title:s200,description:s8000,location:s300,start:D,end:D,price:x0~100000,maxPerOrder:n1~20,capacity:n0~100000,open:b,published:b,entry:b,stall:b,questions:L10,questionsRequired:l,image:s300
events.delete|מחיקת אירוע|events:write|||^,eventId*:i
events.saveProduct|הוספה או עדכון של מוצר בדוכן האירוע: שם, מחיר, יחידה, זמין למכירה|events:write|||eventId*:i,productId:i,name:s200,price:x0~100000,unit:s20,active:b,sort:x0~100000
events.deleteProduct|מחיקת מוצר מדוכן האירוע|events:write|||eventId*:i,productId*:i
tickets.setOrderPayment|סימון תשלום על הזמנה שלמה (כל הכרטיסים שלה)|tickets:write|||orderId*:i,paymentStatus*:epending/claimed/paid/paid_onsite/free
tickets.cancelOrder|ביטול הזמנה שלמה|tickets:write|||orderId*:i,reason:s300
tickets.setPayment|סימון תשלום על כרטיס בודד|tickets:write|||^,ticketId*:i,paymentStatus*:epending/claimed/paid/paid_onsite/free/cancelled
tickets.cancel|ביטול כרטיס בודד|tickets:write|||^,ticketId*:i,reason:s300
tabs.open|פתיחת חשבון בדוכן לאורח באירוע|tabs:write|||eventId*:i,guestUid:i,guestName:s80,guestPhone:s25,ticketId:i
tabs.addItem|רישום מוצר (או כמה) שאורח לקח מהדוכן|tabs:write|||^,tabId*:i,productId:i,qty:n1~50,items:L20
tabs.removeItem|הסרת פריט מחשבון בדוכן|tabs:write|||^,tabId*:i,index*:n0~499,reason:s300
tabs.setStatus|סגירת חשבון בדוכן: שולם, נמחל, או חזרה לפתוח|tabs:settle|||^,tabId*:i,status*:eopen/claimed/paid/waived,note:s300
visits.setStatus|אישור, דחייה או ביטול של בקשת ביקור|visits:write|||^,visitId*:i,status*:eapproved/rejected/cancelled/new,managerNote:s2000,time:T
donations.setPayment|אישור תשלום תרומה (או שינוי מצב התשלום)|donations:write|||^,donationId*:i,paymentStatus*:epaid/pending/claimed/cancelled
donations.setReceiptSent|סימון שהקבלה על התרומה נשלחה|donations:write|||^,donationId*:i,sent:b=true
notifications.setHandled|סימון התראה כטופלה (או החזרה לתור)|notifications:write|||notificationId*:i,handled:b=true
settings.update|עדכון הגדרות: פרטי תשלום, הודעות מוכנות ופתיח, סכומי תרומה, סוגי ביקור, פרטי קשר|settings:write|||guestIntro:s2000,visitTypes:L20,paymentBit:s25,paymentPaybox:s300,paymentCash:b,paymentNote:s300,donationPresets:L12,donationCustom:b,donationMemorial:b,donationReceipt:b,msgVisitApproved:s2000,msgDonationThanks:s2000,msgDebtReminder:s2000,msgPaymentConfirmation:s2000,msgTicketReminder:s2000,msgVendorInvite:s2000,contactPhone:s25,contactWhatsapp:s25,contactEmail:s200,contactAddress:s300,contactInquiries:b
presence.save|רישום נוכחות בחווה ליום אחד או כמה ימים (שעות והערה לצוות)|presence:write|||dates*:L31,from:T,to:T,note:s200,uid:i
presence.remove|הסרת רישום נוכחות מהיומן|presence:write|||itemId*:i
calendar.create|הוספת פריט ליומן החווה (פגישה, הכנות לפסטיבל, פריט אחר)|calendar:write|||title*:s200,date*:d,from:T,to:T,time:T,audience:eall/managers=all,participants:L30,reminder:b=true,kind:emanual/meeting/planning=manual
calendar.update|עדכון פריט ביומן (שינוי תאריך או שעה קובע מחדש את התזכורת)|calendar:write|||itemId*:i,title:s200,date:d,from:T,to:T,time:T,allDay:b,audience:eall/managers,participants:L30,reminder:b,kind:emanual/meeting/planning
calendar.delete|מחיקת פריט מהיומן|calendar:write|||itemId*:i
broadcasts.send|שליחת הודעה לצוות (התראה באפליקציה ותור שליחה לטלפון)|broadcasts:write|||text*:s200,audience*:eall/farmToday/managers/crew/vendors,urgent:b=false,eventId:i,preview:b=false
broadcasts.resend|שליחה חוזרת של הודעה לצוות, רק למי שעוד לא קרא|broadcasts:write|||broadcastId*:i
broadcasts.delete|מחיקת הודעה לצוות (בעלים בלבד)|broadcasts:write|||broadcastId*:i
me.notifications.markRead|סימון ההתראות האישיות שלי כנקראו|me:write|||ids:L100,all:b=false
notifications.send|שליחת התראה אישית (התראה באפליקציה ואפשרות לשליחה לטלפון)|notify:team|||uids*:L200,title*:s120,sub:s240,link*:s200,push:b=true,urgent:b=false
people.delete|מחיקת אדם מהאפליקציה (בעלים בלבד)|people:write|||^,uid*:i
visits.delete|מחיקת בקשת ביקור (עם הפריט ביומן והפריטים בתור ההתראות)|visits:write|||^,visitId*:i
donations.paymentNotArrived|תרומה: "עוד לא הגיע" (חזרה להמתנה לתשלום)|donations:write|||^,donationId*:i
donations.undoApproval|ביטול אישור תשלום של תרומה (חזרה למצב שלפני האישור)|donations:write|||^,donationId*:i,paymentStatus:eclaimed/pending=claimed
donations.delete|מחיקת תרומה (עם הפריטים בתור ההתראות)|donations:write|||^,donationId*:i
notifications.delete|מחיקת פריט מתור ההתראות למנהלים (הביקור/התרומה עצמם נשארים)|notifications:write|||notificationId*:i
settings.saveQuestion|הוספה או עריכה של שאלת הרשמה (נשאלת אורחים בהרשמה)|settings:write|||fieldId:i,label*:s200,type:etext/choice/date=text,options:L30,required:b=false
settings.removeQuestion|הסרת שאלת הרשמה|settings:write|||fieldId*:i
settings.reorderQuestions|שינוי סדר שאלות ההרשמה|settings:write|||order*:L50
tasks.take|לקחת משימה פנויה על עצמי|tasks:complete|||taskId*:i
tasks.release|לשחרר משימה שלי (חוזרת להיות פנויה)|tasks:complete|||taskId*:i
tasks.setPhoto|תמונה למשימה (מה צריך לעשות)|tasks:complete|||^,taskId*:i,photo*:s300
tasks.setDonePhoto|תמונת ביצוע למשימה (אחרי שבוצעה), ואופציונלי הערת ביצוע|tasks:complete|||^,taskId*:i,donePhoto*:s300,note:s2000
tasks.addShopping|פריט קנייה שנדרש למשימה (מקושר משני הצדדים)|shopping:write|||taskId*:i,title*:s200,qty:s40,note:s1000,link:s2000,category:esuper/building/online/giveaway=super,urgent:b=false,photo:s300
shopping.setMissing|סימון פריט "אין" (לא היה בחנות בקנייה הזו), או ביטול הסימון|shopping:write|||^,itemId*:i,tripId:i,missing:b=true
shopping.startTrip|יוצא/ת לקנות עכשיו: פתיחת קנייה לרשימה (הצוות מקבל התראה)|shopping:write|||list*:esuper/building/online/giveaway
shopping.closeTrip|סיימתי לקנות: סגירת הקנייה (מה נקנה ומה לא היה)|shopping:write|||tripId*:i
shopping.deleteTrip|מחיקת קנייה (רק מנהל). הפריטים נשארים כפי שהם|shopping:write|||tripId*:i
shopping.reopenTrip|פתיחה מחדש של קנייה שנסגרה בטעות|shopping:write|||tripId*:i
projects.create|יצירת פרויקט עם צעדים (מי שמקבל צעד מקבל התראה)|projects:write|||title*:s120,deadline:s60,steps:s12000
projects.update|עריכת פרויקט: שם, יעד, והצעדים (הוספה, שינוי, מחיקה של צעד פתוח שהוסר)|projects:write|||^,projectId*:i,title:s120,deadline:s60,steps:s12000
projects.delete|מחיקת פרויקט שלם עם כל הצעדים (רק הבעלים)|projects:write|||^,projectId*:i
projects.takeStep|לקחת צעד פנוי בפרויקט על עצמי|projects:write|||projectId*:i,stepId*:i
projects.releaseStep|לשחרר צעד שלי בפרויקט|projects:write|||projectId*:i,stepId*:i
projects.completeStep|סימון צעד כבוצע (האחרון שנשאר סוגר את הפרויקט)|projects:write|||projectId*:i,stepId*:i
projects.reopenStep|החזרת צעד שבוצע לרשימה (הפרויקט חוזר להיות פעיל)|projects:write|||projectId*:i,stepId*:i
projects.postUpdate|עדכון קצר בשרשור של צעד (חברי הפרויקט מקבלים התראה באפליקציה)|projects:write|||projectId*:i,stepId*:i,text*:s500
projects.splitStep|פיצול צעד לתתי־צעדים (באים מיד אחריו, עם אותו אחראי ותאריך)|projects:write|||projectId*:i,stepId*:i,titles*:L20
projects.updateStep|עריכת צעד: שם, תאריך יעד, הערה|projects:write|||projectId*:i,stepId*:i,title:s200,due:d,clearDue:b,note:s1000
projects.addStep|הוספת צעד בסוף הפרויקט|projects:write|||projectId*:i,title*:s200,assignee:u
events.close|סגירת האירוע בסוף היום: השער והדוכן נעצרים, חובות פתוחים נשארים לגבייה|events:write|||^,eventId*:i
events.reopen|פתיחה מחדש של אירוע שנסגר|events:write|||^,eventId*:i
events.reorderProducts|סידור מחדש של מוצרי הדוכן|events:write|||eventId*:i,productIds*:L200
events.copyProducts|העתקת מוצרי הדוכן מאירוע קודם|events:write|||eventId*:i,fromEventId*:i
events.addFileLink|הוספת קישור לקובץ באירוע (היתר, מפה, רשימה)|events:write|||eventId*:i,name*:s200,url*:s2000,kind:edoc/image=doc
events.removeFile|מחיקת קובץ מהאירוע|events:write|||^,eventId*:i,fileId:i,legacyIndex:n0~29
events.assignStation|שיבוץ איש צוות לעמדה באירוע (שער, דוכן, חניה או עמדה אחרת)|events:write|||eventId*:i,station*:i,stationName:s60,needed:n1~30,uid*:i,hours:s40
events.updateStationPerson|עדכון שעות של איש צוות בעמדה|events:write|||eventId*:i,station*:i,uid*:i,hours:s40
events.removeFromStation|הסרת איש צוות מעמדה באירוע|events:write|||eventId*:i,station*:i,uid*:i
tickets.addGuestOrder|הוספת נרשם לאירוע ידנית (טלפון, וואטסאפ)|tickets:write|||eventId*:i,name*:s80,phone:s25,count:n1~20=1,paid:b=false
tickets.deleteOrder|מחיקת הזמנה לגמרי (לא ביטול): הכרטיסים ופריטי התיבה שלה|tickets:write|||orderId*:i
tabs.delete|מחיקת חשבון דוכן ופריטי התיבה שלו|tabs:settle|||^,tabId*:i
tickets.stampReminder|רישום שנשלחה תזכורת תשלום על הזמנה|tickets:write|||orderId*:i
tabs.stampReminder|רישום שנשלחה תזכורת תשלום על חשבון דוכן|tabs:settle|||tabId*:i
payments.markConfirmation|סימון שאישור התשלום נשלח לאורח (הזמנה, תרומה או חשבון דוכן)|tickets:write|||collection*:etickets/donations/tabs,id*:i
gate.admit|הכנסת כרטיס בשער (סריקה), ואם צריך גם תשלום במקום או "ישלמו אחר כך"|tabs:write|||eventId*:i,ticketId*:i,pay:enone/gate/later=none,entries:n0~1000
gate.reject|רישום כרטיס שלא הוכנס בשער (בוטל, לא נמצא, אירוע אחר)|tabs:write|||eventId*:i,ticketId:i,name:s120,reason*:s200,meta:s300
gate.admitWalkIn|אורח בלי כרטיס: יצירת כרטיסים בשער, כבר בפנים|tabs:write|||eventId*:i,name*:s80,phone:s25,count:n1~20=1,pay:egate/later=gate
gate.reopenAndAdmit|פתיחה מחדש של הזמנה שבוטלה והכנסה בשער (מתוך כניסה שנדחתה)|tickets:write|||eventId*:i,scanId*:i
gate.keepRejected|השארת כניסה שנדחתה כדחויה (המנהל ראה)|tickets:write|||eventId*:i,scanId*:i
tickets.payOnsite|סימון הזמנה כשולמה במקום (בלי כניסה)|tabs:write|||orderId*:i
events.saveCash|רישום ספירת המזומן בסוף האירוע (בשער או בדוכן)|events:write|||eventId*:i,which*:egate/stall,amount*:x0~10000000,by:s80
vendors.create|הוספת בעל דוכן / ספק למאגר|vendors:write|||name*:s200,contact:s80,phone:s25,sells:s300,product:s300,needs:L5,notes:s2000,external:b,fem:b,photo:s300
vendors.update|עדכון בעל דוכן / ספק במאגר|vendors:write|||^,vendorId*:i,name:s200,contact:s80,phone:s25,sells:s300,product:s300,needs:L5,notes:s2000,external:b,fem:b,photo:s300
vendors.delete|מחיקת בעל דוכן מהמאגר, עם ההזמנות שלו לאירועים וקישורי הגישה|vendors:write|||^,vendorId*:i
vendors.addPerson|קישור אדם לדוכן (בעלים או עוזר): קישור גישה לאפליקציה|vendors:write|||vendorId*:i,name*:s80,phone:s25,role:eowner/helper=helper,fem:b
vendors.removePerson|הסרת אדם מהדוכן וסגירת קישור הגישה שלו|vendors:write|||vendorId*:i,code:i,name:s80,role:eowner/helper
vendors.removeAccess|הסרת הגישה של דוכן לאפליקציה: כל הקישורים נסגרים והחשבונות חוזרים לאורח|vendors:write|||vendorId*:i
events.inviteVendor|הזמנת בעל דוכן לאירוע|events:write|||eventId*:i,vendorId*:i
events.inviteVendors|הזמנת כמה בעלי דוכנים לאירוע (רשימה, או כל מי שהיה באירוע קודם)|events:write|||eventId*:i,vendorIds:L40,fromEventId:i
events.confirmVendor|רישום שבעל דוכן אישר הגעה (בטלפון או בוואטסאפ)|events:write|||eventId*:i,vendorId*:i
events.remindVendor|תזכורת לבעל דוכן שעוד לא ענה: רישום ונוסח הודעה|events:write|||eventId*:i,vendorId*:i
events.removeVendor|הסרת בעל דוכן מאירוע|events:write|||eventId*:i,vendorId*:i
events.setVendor|שיבוץ בעל דוכן לאירוע ואם אישר הגעה (ישן: עדיף events.inviteVendor / events.confirmVendor)|events:write|||eventId*:i,vendorId*:i,confirmed:b,notes:s1000
vendorRequests.close|סגירת בקשה של בעל דוכן ביום האירוע ("טופל")|tabs:write|||eventId*:i,requestId*:i
vendorRequests.delete|מחיקת בקשה של בעל דוכן|vendors:write|||eventId*:i,requestId*:i
`;
