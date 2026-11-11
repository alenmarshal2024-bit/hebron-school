import { rowsFromCsv } from './csv.js';
const $=x=>document.querySelector(x),app=$('#app');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const INR=v=>'₹'+(Number(v||0)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const roleLabel={principal:'Principal',teacher:'Teacher',accountant:'Accountant',store:'Store',office:'Front Office',canteen:'Canteen',sports:'Sports'};
const S={user:null,view:'dashboard',students:[],classes:[],staff:[],dashboard:null,feeSummary:null,ledger:null,selectedStudent:null,modal:'',pendingImport:[],importPreview:null,inviteResult:null,error:'',notice:'',loading:false};
function has(role){return S.user?.roles?.includes(role)}
function feeRole(){return has('principal')||has('accountant')}
function studentRole(){return has('principal')||has('accountant')||has('teacher')||has('office')||has('store')}
async function api(path,method='GET',data=null){
 const options={method,credentials:'same-origin',headers:{'Accept':'application/json'}};
 if(data!==null){options.headers['Content-Type']='application/json';options.body=JSON.stringify(data)}
 const r=await fetch('/api/'+path.replace(/^\//,''),options);
 let body={};try{body=await r.json()}catch{}
 if(!r.ok){const e=new Error(body.error||'Request failed ('+r.status+')');e.code=r.status;throw e}
 return body;
}
function toast(msg,error=false){S.notice=msg;S.error=error?msg:'';render();setTimeout(()=>{if(S.notice===msg){S.notice='';$('#toast')?.remove()}},5000)}
function navi(page){S.view=page;S.modal='';S.error='';loadView().catch(e=>toast(e.message,true))}
function navItems(){const items=[['dashboard','🏠','Home']];if(studentRole())items.push(['students','🎒','Students']);if(feeRole())items.push(['fees','💳','Fees']);if(has('principal'))items.push(['staff','👩‍🏫','Staff']);if(has('teacher'))items.push(['teacher','🌱','My Class']);items.push(['profile','👤','Profile']);return items}
function field(label,name,value='',type='text',attrs=''){return `<div class="field"><label class="label" for="${esc(name)}">${esc(label)}</label><input id="${esc(name)}" name="${esc(name)}" type="${type}" value="${esc(value)}" ${attrs}/></div>`}
function select(label,name,values,selected=''){return `<div class="field"><label class="label" for="${esc(name)}">${esc(label)}</label><select id="${esc(name)}" name="${esc(name)}">${values.map(([v,l])=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(l)}</option>`).join('')}</select></div>`}
const panel=(title,content)=>`<section class="panel"><h3>${esc(title)}</h3>${content}</section>`;
function notice(text,kind=''){return `<div class="notice ${kind}">${text}</div>`}
function heading(title,desc,buttons=''){return `<div class="heading"><div><h2>${esc(title)}</h2><p class="sub">${esc(desc)}</p></div>${buttons}</div>`}
function welcome(){const u=S.user;const icon=has('principal')?'👋':has('accountant')?'💳':'🌼';const name=esc(u.name.split(' ')[0]);return `<div class="hero"><span class="eyebrow" style="color:#bfdbfe">HEBRON SCHOOL · STAFF PORTAL</span><h2>${icon} Good morning, ${name}!</h2><p class="sub">${has('principal')?'Here is what needs attention across the school.':has('accountant')?'Your daily payment collection workspace.':'Your students and teaching tasks are here.'}</p></div>`}
function login(){return `<div class="login-page"><section class="login-card"><div class="brand-icon">🏫</div><h1>Welcome to Hebron</h1><p class="sub">Sign in with your school staff email</p>${S.error?notice(esc(S.error),'error'):''}<form data-form="login">
 ${field('Email address','email','','email','required autocomplete="username" placeholder="staff@school.org"')}${field('Password','password','','password','required autocomplete="current-password"')}
 <button class="btn primary full" type="submit">Sign in →</button></form>
 <div class="login-help">${notice('🔐 This is the real-app sign-in screen. Demo accounts are separate and cannot access Neon. Use credentials created by your school principal.')}
 <p class="help mt"><a href="/preview/" target="_blank" rel="noreferrer">Open the fictional-data demo with sample logins</a></p></div></section></div>`}
function topbar(){return `<header class="topbar"><div class="brand"><div class="brand-icon">🏫</div><div><div class="eyebrow">Hebron School</div><h1>Staff Workspace</h1></div></div><button class="userchip" data-act="navigate" data-page="profile">👤 ${esc(S.user.name)} <span class="sub">⌄</span></button></header>`}
function dashboard(){const d=S.dashboard||{absent_today:0,escalations:[]};if(has('principal')){
const rows=d.attendance_by_class||[], total=rows.reduce((n,r)=>n+Number(r.total),0), marked=rows.reduce((n,r)=>n+Number(r.marked),0), present=rows.reduce((n,r)=>n+Number(r.present),0), absent=rows.reduce((n,r)=>n+Number(r.absent),0), pct=marked?Math.round(present/marked*100):0;
const metric=(icon,label,value,tone,detail)=>`<div class="card metric ${tone}"><span class="icon">${icon}</span><div><strong>${value}</strong><p class="label">${label}</p><p class="tiny">${detail}</p></div></div>`;
return `<div class="dashboard-intro"><div><p class="eyebrow">A little care, every day ☀️</p><h2>Welcome, ${esc(S.user.name.split(' ')[0])}</h2><p class="sub">Here is what needs your attention at Hebron today.</p></div><span class="date-chip">📅 ${new Date().toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric'})}</span></div>
${S.dashboard?'':notice('Dashboard data could not be loaded. Refresh to try again.','error')}
<div class="cards dashboard-stats">${metric('🙋','Present today',marked?present:'—','mint','Includes late and half-day entries')}${metric('🎒','Absent today',marked?absent:'—','peach',`${Math.max(0,total-marked)} students not yet marked`)}${metric('🗓️','Absent 3+ school days','—','butter','School calendar not connected')}${metric('📚','Pending approvals','—','lavender','Lesson review not connected')}</div>
<div class="dashboard-grid">
<section class="panel attendance-panel"><div class="panel-heading"><h3>Attendance today</h3><span class="status ${marked===total&&total?'good':'warn'}">${marked} / ${total} marked</span></div><div class="attendance-overview"><div class="attendance-ring" style="--attendance:${pct}%" role="img" aria-label="${pct}% present among marked students"><div><strong>${marked?pct+'%':'—'}</strong><span>of marked</span></div></div><div class="attendance-legend"><p><i class="dot green"></i>Present <b>${present}</b></p><p><i class="dot coral"></i>Absent <b>${absent}</b></p><p><i class="dot grey"></i>Unmarked <b>${Math.max(0,total-marked)}</b></p></div></div><p class="tiny">Present includes late and half-day records. Unmarked students are excluded from the percentage.</p><h4 class="mt">Attendance by class</h4>${rows.map(r=>`<div class="class-progress"><div><strong>${esc(r.name)}</strong><span>${r.marked?Math.round(Number(r.present)/Number(r.marked)*100)+'%':'Not marked'}</span></div><progress max="${Math.max(1,Number(r.total))}" value="${Number(r.present)}" aria-label="${esc(r.name)} present out of total"></progress><p class="tiny">${Number(r.present)} present · ${Number(r.absent)} absent · ${Number(r.total)-Number(r.marked)} unmarked</p></div>`).join('')||'<div class="empty">No class attendance available yet.</div>'}</section>
<section class="panel attention-panel"><div class="panel-heading"><h3>Needs attention</h3><span class="status warn">${d.escalations?.length||0} recent</span></div>${d.escalations?.length?d.escalations.map(e=>`<div class="row"><div><div class="name">${esc(e.title)}</div><div class="meta">${esc(e.student_name)}</div></div><span class="status ${e.urgency==='high'?'bad':'warn'}">${esc(e.urgency)}</span></div>`).join(''):'<div class="empty"><span class="empty-icon">🌿</span><strong>No open escalations</strong>Teacher concerns will appear here.</div>'}<p class="tiny mt">Latest 10 unresolved teacher escalations.</p></section>
<section class="panel quick-panel"><h3>Quick actions</h3><div class="stack"><button class="btn primary full" data-act="navigate" data-page="fees">💳 Record daily fee payment</button><button class="btn full" data-act="navigate" data-page="students">🎒 Student directory</button><button class="btn full" data-act="navigate" data-page="staff">👩‍🏫 Manage teachers</button></div><div class="announcement-note"><span>📣</span><h4>School announcements</h4><p class="sub">Recipient selection, message preview and WhatsApp delivery are not connected in this version.</p></div></section>
<section class="panel lessons-panel"><div class="panel-heading"><h3>Recent lesson submissions</h3><span class="status">Not connected</span></div><p class="sub">Lesson uploads and approval workflows are not available in this app yet. Pending approvals will appear here once connected.</p></section>
<section class="panel updates-panel"><h3>Today’s updates</h3><div class="row"><div><div class="name">Attendance progress</div><div class="meta">${marked} of ${total} students have a recorded status today.</div></div><span>📋</span></div><div class="row"><div><div class="name">Parent attendance updates</div><div class="meta">10:00 AM IST cutoff · WhatsApp delivery not connected</div></div><span>💬</span></div></section>
</div>`;
}
if(has('accountant'))return welcome()+heading('Fee collection','Record received payments and review balances.')+financeSummary()+panel('Quick actions',`<button class="btn primary" data-act="navigate" data-page="fees">💳 Open fee register</button>`);
return welcome()+heading('Teacher workspace','Only students from your assigned classes appear here.')+`<div class="mini-grid">${`<div class="card"><div class="icon">👧</div><p class="label">My students</p><strong>${S.students.length}</strong></div>`}<div class="card"><div class="icon">🌱</div><p class="label">Student care</p><strong>My class</strong></div></div><div class="mt">${panel('What you can do',`<div class="stack"><button class="btn primary full" data-act="navigate" data-page="teacher">Daily & weekly student observations</button><button class="btn full" data-act="navigate" data-page="students">View my class register</button></div>`)}</div>`;
}
function studentsPage(){const options=S.classes.map(c=>[c.name,c.name]);
 return heading('Students','Add a single student or import a complete class roster.',has('principal')?`<button class="btn primary" data-act="modal" data-modal="student">+ Add student</button>`:'')+`<div class="bar mb">${has('principal')?`<button class="btn" data-act="modal" data-modal="import">📄 Import CSV</button><button class="btn" data-act="template">⬇ CSV template</button>`:''}<label class="grow screen-reader" for="student-search">Search students</label><input id="student-search" placeholder="🔍 Search by name or admission…" style="flex:1;min-width:170px;border:1px solid var(--line);border-radius:12px;padding:11px"/></div>
 ${panel('Student directory',`<div id="student-list">${studentList(S.students)}</div>`)}`;
}
function studentList(students){return students.length?students.map(s=>`<div class="row"><div><div class="name">${esc(s.name)}</div><div class="meta">${esc(s.admission_number)} · ${esc(s.class_name)}</div></div>${feeRole()?`<button class="btn small" data-act="ledger" data-id="${esc(s.id)}">Ledger</button>`:''}</div>`).join(''):'<div class="empty">No students found. The principal can add a student or import a CSV.</div>'}
function feeData(){return S.feeSummary?.summary||{charges:'0',discounts:'0',collected:'0',collected_today:'0'}}
function financeSummary(){const f=feeData();const due=BigInt(f.charges)-BigInt(f.discounts),collected=BigInt(f.collected);return `<div class="cards"><div class="card highlight"><span class="icon">💳</span><p class="label">Collected today</p><strong>${INR(f.collected_today)}</strong></div><div class="card"><span class="icon">📊</span><p class="label">Collected overall</p><strong>${INR(f.collected)}</strong></div><div class="card"><span class="icon">🧾</span><p class="label">Fees charged</p><strong>${INR(due)}</strong></div><div class="card"><span class="icon">🟡</span><p class="label">Outstanding</p><strong>${INR(due-collected)}</strong></div></div>`}
function feesPage(){return heading('Fee collection','Enter payments already received. No online payment gateway.')+financeSummary()+`<div class="split">${panel('Record fee payment',`<form data-form="payment">
 ${select('Student','student_id',S.students.map(s=>[s.id,s.name+' · '+s.admission_number]))}
 <div class="form-grid">${field('Amount received (₹)','amount_rupees','','number','required min="0.01" step="0.01"')}
 ${select('Payment method','payment_method',[['Cash','Cash'],['UPI','UPI'],['Bank transfer','Bank transfer'],['Cheque','Cheque'],['Other','Other']])}
 ${field('Payment date','paid_on',new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Kolkata'}),'date','required')}
 ${field('Reference (optional)','reference')}
 </div>${field('Note (optional)','note')}
 <button class="btn primary full" ${S.students.length?'':'disabled'}>Record payment</button></form>`)}${panel('Student ledger',`<div class="field"><label class="label">Select student</label><select id="ledger-select"><option value="">Select a student</option>${S.students.map(s=>`<option value="${esc(s.id)}" ${S.selectedStudent===s.id?'selected':''}>${esc(s.name)} · ${esc(s.admission_number)}</option>`).join('')}</select></div><div id="ledger">${ledgerView()}</div>`)}</div>`}
function ledgerView(){const v=S.ledger;if(!v)return '<p class="sub">Choose a student to view individual fee charges, payments and outstanding balance.</p>';
 const due=v.charges.reduce((s,x)=>s+Number(x.amount_paise),0)-v.discounts.reduce((s,x)=>s+Number(x.amount_paise),0),paid=v.payments.filter(x=>x.status==='posted').reduce((s,x)=>s+Number(x.amount_paise),0);
 return `<div class="cards" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="card"><div class="label">Total due</div><strong>${INR(due)}</strong></div><div class="card"><div class="label">Balance</div><strong>${INR(due-paid)}</strong></div></div><h4 class="mt">Charges</h4>${v.charges.map(x=>`<div class="row"><span>${esc(x.category)}</span><strong>${INR(x.amount_paise)}</strong></div>`).join('')||'<p class="help">No charges created</p>'}
 <h4 class="mt">Payments</h4>${v.payments.map(x=>`<div class="row"><div><span>${esc(x.payment_method)} · ${esc(x.paid_on)}</span><p class="tiny">${esc(x.status)}</p></div><strong>${INR(x.amount_paise)}</strong></div>`).join('')||'<p class="help">No payments</p>'}
 <button class="btn full mt" data-act="modal" data-modal="charge">+ Add fee charge</button>`;
}
function staffPage(){return heading('Staff access & invitations','Create staff logins and revoke access. Email is the primary identifier.',`<button class="btn primary" data-act="modal" data-modal="invite">+ Invite staff</button>`)+panel('Staff accounts',S.staff.length?S.staff.map(s=>`<div class="row"><div><div class="name">${esc(s.name)}</div><div class="meta">${esc(s.email)} · ${esc(s.roles.join(', '))}</div></div><div class="bar"><span class="status ${s.status==='disabled'?'bad':s.status==='invited'?'warn':'good'}">${esc(s.status)}</span>${s.status!=='disabled'&&!s.roles.includes('principal')?`<button class="btn danger small" data-act="disable" data-id="${esc(s.id)}">Remove</button>`:''}</div></div>`).join(''):'<div class="empty">No staff accounts loaded.</div>')+`<p class="help mt">Removing access disables login immediately. Historical teaching and payment records remain intact.</p>`;
}
function profilePage(){const u=S.user;return heading('My profile','Update your details; only the principal manages role and login email.')+panel('Staff details',notice(`Login: <strong>${esc(u.email)}</strong><br>Roles: <strong>${esc(u.roles.join(', '))}</strong>`)+`<form data-form="profile"><div class="form-grid">${field('Full name','name',u.name,'text','required')}${field('Phone number','phone',u.phone||'','tel')}${field('Qualification','qualification',u.qualification||'')}${field('Teaching experience (years)','years_experience',u.years_experience??0,'number','min="0" max="60"')}${field('Subjects taught','subjects',u.subjects||'')}${field('Address','address',u.address||'')}</div><button class="btn primary">Save profile</button></form>`);
}
function teacherPage(){return heading('Daily student care','Only the assigned class teacher can post updates or teacher escalations.')+
 `${notice('Parent WhatsApp drafts and weekly summaries are in the fictional demo. This real-app foundation records observations securely; automated WhatsApp sending is not yet active.','warn')}`+
 `<div class="split">${panel('Record an observation',`<form data-form="observation">${select('My student','student_id',S.students.map(s=>[s.id,s.name+' · '+s.class_name]))}${select('Category','kind',[['homework','Homework'],['uniform','Uniform'],['books','Books'],['late','Late arrival'],['punctuality','Weekly punctuality'],['cleanliness','Weekly cleanliness'],['outcome','Weekly outcome']])}${select('Outcome','outcome',[['good','Good'],['needs_improvement','Needs improvement'],['missing','Missing'],['incomplete','Incomplete'],['late','Late'],['not_observed','Not observed']])}<div class="field"><label class="label">Notes (optional)</label><textarea name="comments" maxlength="1000" placeholder="A brief, constructive comment"></textarea></div><button class="btn primary full" ${S.students.length?'':'disabled'}>Save student observation</button></form>`)}
 ${panel('Escalate to principal',`<form data-form="escalation">${select('Student','student_id',S.students.map(s=>[s.id,s.name]))}${field('Concern title','title','','text','required maxlength="160"')}${select('Urgency','urgency',[['normal','Normal'],['high','High']])}<div class="field"><label class="label">Details</label><textarea name="details" maxlength="2000"></textarea></div><button class="btn yellow full" ${S.students.length?'':'disabled'}>Notify principal</button></form>`)}</div>`}
function modalContent(){const M=S.modal;if(!M)return '';
 let content='';if(M==='student')content=`<form data-form="student"><div class="form-grid">${field('Admission number','admission_number','','text','required')}${field('Student full name','name','','text','required')}${select('Class','class',S.classes.map(c=>[c.name,c.name]))}${field('Parent/guardian name','guardian_name')}${field('Guardian WhatsApp number','guardian_phone','','tel','placeholder="+9198..."')}${select('Parent language','preferred_language',[['en','English'],['ml','Malayalam']])}</div>${notice('Parent messaging consent is OFF by default and requires separate confirmation.')}<div class="form-footer"><button class="btn" type="button" data-act="close">Cancel</button><button class="btn primary">Add student</button></div></form>`;
 if(M==='import')content=`<div class="stack"><p class="help">Upload a UTF-8 CSV file with admission number, student name and class. Optional guardian contact and language columns are supported. Preview errors before importing.</p><input type="file" id="csv-file" accept=".csv,text/csv"/><button class="btn" data-act="template">⬇ Download sample template</button>${S.pendingImport.length?`<p class="help">${S.pendingImport.length} rows loaded.</p><button class="btn primary" data-act="csv-preview">Check rows against Neon</button>`:''}${S.importPreview?`<div class="notice">${S.importPreview.valid} valid · ${S.importPreview.invalid} rejected</div><div class="table-scroll"><table class="simple-table"><thead><tr><th>Row</th><th>Student</th><th>Status</th></tr></thead><tbody>${S.importPreview.rows.slice(0,40).map(r=>`<tr><td>${esc(r.row_number)}</td><td>${esc(r.name)}</td><td>${r.valid?'✓ Ready':esc(r.error)}</td></tr>`).join('')}</tbody></table></div><button class="btn primary" data-act="csv-commit" ${S.importPreview.valid?'':'disabled'}>Import ${S.importPreview.valid} valid students</button>`:''}</div>`;
 if(M==='invite')content=`<form data-form="invite">${field('Staff full name','name','','text','required')}${field('Login email','email','','email','required')}<p class="label">Assign roles</p><div class="chip-box mb">${['teacher','accountant','store','office','canteen','sports'].map((r,i)=>`<label><input type="checkbox" name="role" value="${r}" ${i===0?'checked':''}>${roleLabel[r]}</label>`).join('')}</div><p class="label">Classes this staff member can access (optional)</p><div class="chip-box mb">${S.classes.map(c=>`<label><input type="checkbox" name="class_id" value="${esc(c.id)}">${esc(c.name)}</label>`).join('')}</div>${select('Class teacher of','class_teacher_id',[['','Not class teacher'],...S.classes.map(c=>[c.id,c.name])])}<p class="help">A unique temporary password is generated. It is shown once for the principal to share securely. Email is not automatically sent.</p><div class="form-footer"><button class="btn" type="button" data-act="close">Cancel</button><button class="btn primary">Create invitation</button></div></form>`;
 if(M==='invite-result')content=notice(`Invitation created.<br><strong>${esc(S.inviteResult?.staff?.email)}</strong><br>Temporary password: <code>${esc(S.inviteResult?.temporary_password)}</code><br>Share privately with the intended staff member. They must change it on first login.`,'warn')+`<div class="form-footer"><button class="btn" data-act="close">Done</button></div>`;
 if(M==='charge')content=S.selectedStudent?`<form data-form="charge"><p class="help">The selected student is <strong>${esc(S.students.find(x=>x.id===S.selectedStudent)?.name)}</strong></p>${field('Fee category','category','Tuition','text','required')}${field('Amount (₹)','amount_rupees','','number','required min="0.01" step="0.01"')}${field('Due date','due_on','','date')}<div class="form-footer"><button class="btn" type="button" data-act="close">Cancel</button><button class="btn primary">Save charge</button></div></form>`:'Select a student first';
 return `<div class="modal-bg" id="modal-bg"><section class="modal" role="dialog" aria-modal="true" aria-label="Dialog"><h3>${esc({student:'Add a student',import:'Import students',invite:'Invite staff', 'invite-result':'Invitation created',charge:'New fee charge'}[M]||'Details')}</h3>${content}</section></div>`;
}
function onboarding(){const u=S.user;
 if(u.must_change_password)return `<div class="login-page"><section class="login-card"><div class="brand-icon">🔐</div><h1>Set your password</h1><p class="sub">This is your first sign-in. Replace the temporary password before continuing.</p><form data-form="password">${field('Current temporary password','current_password','','password','required')}${field('New password (10+ characters)','new_password','','password','minlength="10" required')}<button class="btn primary full">Change password</button></form></section></div>`;
 if(has('teacher')&&!u.profile_complete)return `<div class="login-page"><section class="login-card"><div class="brand-icon">👩‍🏫</div><h1>Complete your profile</h1><p class="sub">Add teaching details before you access your class workspace.</p><form data-form="profile">${field('Full name','name',u.name,'text','required')}${field('Phone','phone','','tel')}${field('Qualification','qualification','','text')}${field('Experience (years)','years_experience','0','number','min="0" max="60"')}${field('Subjects','subjects')}${field('Address','address')}<button class="btn primary full">Save and continue</button></form></section></div>`;
 return null;
}
function render(){if(!S.user){app.innerHTML=login();return}const onboard=onboarding();if(onboard){app.innerHTML=onboard;return}
 const titles={dashboard:'Home',students:'Students',fees:'Fees',staff:'Staff',teacher:'Student Care',profile:'Profile'};
 let body=S.view==='dashboard'?dashboard():S.view==='students'?studentsPage():S.view==='fees'?feesPage():S.view==='staff'?staffPage():S.view==='teacher'?teacherPage():profilePage();
 app.innerHTML=`<div class="app"><div class="shell">${topbar()}${body}${notice('Real-app foundation: Neon connection and live service deployment require configuration. WhatsApp, storage, AI and realtime are not active in the UI.','warn')}<p class="tiny mt">Other school modules are available for fictional-data preview only: <a href="/preview/" target="_blank" rel="noreferrer">Open full demo ↗</a></p></div>
 <nav class="nav" aria-label="Main navigation"><div class="nav-inner">${navItems().map(([id,icon,label])=>`<button data-act="navigate" data-page="${id}" class="${S.view===id?'active':''}"><span>${icon}</span>${label}</button>`).join('')}</div></nav>${modalContent()}${S.notice?`<div class="toast" id="toast">${esc(S.notice)}</div>`:''}</div>`;
}
async function loadView(){if(!S.user)return render();if(S.user.must_change_password||(has('teacher')&&!S.user.profile_complete))return render();
 if(S.view==='students'||S.view==='fees'||S.view==='teacher'||S.view==='dashboard'){
   const r=await Promise.allSettled([api('students'),api('classes')]);
   if(r[0].status==='fulfilled')S.students=r[0].value.students;
   if(r[1].status==='fulfilled')S.classes=r[1].value.classes;
 }
 if(S.view==='dashboard'){
  const a=await Promise.allSettled([api('dashboard'),feeRole()&&has('accountant')?api('fees/summary'):Promise.resolve(null)]);
  S.dashboard=a[0].status==='fulfilled'?a[0].value:null;if(a[1].status==='fulfilled'&&a[1].value)S.feeSummary=a[1].value;
 }
 if(S.view==='fees')S.feeSummary=await api('fees/summary');
 if(S.view==='staff')S.staff=(await api('staff')).staff;
 render();
}
async function refreshUser(){try{S.user=(await api('me')).user}catch(e){S.user=null};
 if(S.user){S.view=has('accountant')&&!has('principal')?'fees':'dashboard';await loadView()}else render();}
function download(name,text,type='text/csv'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),800)}
function template(){download('hebron_student_import_template.csv','admission_number,name,class,guardian_name,guardian_phone,preferred_language\nHB2001,"Sample Student",Class 3,"Sample Guardian",+919999999999,en\nHB2002,"Demo Student",Class 4,"Demo Guardian",+919888888888,ml\n')}
function obj(form){return Object.fromEntries(new FormData(form))}
app.addEventListener('click',async e=>{
 const b=e.target.closest('[data-act]');if(!b)return;const act=b.dataset.act;
 try{
  if(act==='navigate')return navi(b.dataset.page);
  if(act==='modal'){S.modal=b.dataset.modal;S.importPreview=null;S.pendingImport=[];render();return}
  if(act==='close'){S.modal='';render();return}
  if(act==='template')return template();
  if(act==='disable'){
    if(!confirm('Remove staff access? Historical records will stay available to authorized staff.'))return;
    await api('staff/'+b.dataset.id,'PATCH',{status:'disabled'});await loadView();return toast('Staff access revoked');
  }
  if(act==='ledger'){
    S.selectedStudent=b.dataset.id;S.ledger=await api('fees/students/'+b.dataset.id);S.view='fees';await loadView();return;
  }
  if(act==='csv-preview'){
    S.importPreview=await api('students/import/preview','POST',{rows:S.pendingImport});render();return;
  }
  if(act==='csv-commit'){
    if(!confirm('Import these validated students into the live school database?'))return;
    const result=await api('students/import','POST',{rows:S.pendingImport});
    S.modal='';S.pendingImport=[];S.importPreview=null;await loadView();return toast(`${result.accepted} imported; ${result.rejected} rejected. ${result.errors.slice(0,3).map(x=>'Row '+x.row+': '+x.reason).join('; ')}`);
  }
 }catch(err){toast(err.message,true)}
});
app.addEventListener('change',async e=>{
 if(e.target.id==='csv-file'){
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>3_000_000)return toast('CSV must be smaller than 3 MB',true);
  try{S.pendingImport=rowsFromCsv(await file.text());S.importPreview=null;render();toast(`${S.pendingImport.length} rows loaded. Select Check rows against Neon.`)}catch(x){toast(x.message,true)}
 }
 if(e.target.id==='ledger-select'){
  const id=e.target.value;S.selectedStudent=id;S.ledger=id?await api('fees/students/'+id):null;
  const el=$('#ledger');if(el)el.innerHTML=ledgerView();
 }
});
app.addEventListener('input',e=>{if(e.target.id==='student-search'){const q=e.target.value.toLowerCase().trim();$('#student-list').innerHTML=studentList(S.students.filter(s=>(s.name+' '+s.admission_number+' '+s.class_name).toLowerCase().includes(q)))}});
app.addEventListener('submit',async e=>{
 const form=e.target.closest('form[data-form]');if(!form)return;e.preventDefault();const type=form.dataset.form,params=obj(form);const btn=form.querySelector('button[type=submit],button:not([type])');if(btn)btn.disabled=true;
 try{
  if(type==='login'){const r=await api('login','POST',params);S.user=r.user;S.error='';S.view=has('accountant')&&!has('principal')?'fees':'dashboard';await loadView();return}
  if(type==='password'){await api('change-password','POST',params);S.user=(await api('me')).user;await loadView();return toast('Password changed successfully')}
  if(type==='profile'){await api('profile','POST',params);S.user=(await api('me')).user;await loadView();return toast('Profile saved')}
  if(type==='student'){await api('students','POST',params);S.modal='';await loadView();return toast('Student added to the school database')}
  if(type==='invite'){const fd=new FormData(form);const roles=fd.getAll('role'),ids=fd.getAll('class_id');let classTeacher=fd.get('class_teacher_id');if(classTeacher&&!ids.includes(classTeacher))ids.push(classTeacher);S.inviteResult=await api('staff/invite','POST',{name:fd.get('name'),email:fd.get('email'),roles,class_ids:ids,class_teacher_id:classTeacher});S.modal='invite-result';render();return}
  if(type==='payment'){S.pendingPaymentKey ||= crypto.randomUUID();const data={...params,idempotency_key:S.pendingPaymentKey};await api('fees/payment','POST',data);S.pendingPaymentKey=null;await loadView();return toast('Fee payment recorded in Neon')}
  if(type==='charge'){await api('fees/charge','POST',{...params,student_id:S.selectedStudent});S.ledger=await api('fees/students/'+S.selectedStudent);S.modal='';await loadView();return toast('Fee charge added')}
  if(type==='observation'){await api('observations','POST',params);form.reset();return toast('Observation saved for your class student')}
  if(type==='escalation'){await api('escalations','POST',params);form.reset();return toast('Escalation shared with principal')}
 }catch(err){if(type==='login'){S.error=err.message;render()}else toast(err.message,true)}finally{if(btn)btn.disabled=false}
});
window.addEventListener('unhandledrejection',e=>{console.warn('Network request failed:',e.reason?.message);toast('A request could not be completed. Please check the connection.',true)});
refreshUser();
