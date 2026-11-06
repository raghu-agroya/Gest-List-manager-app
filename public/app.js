import {firebaseConfig,adminDomain,requireQrToken,appCheckSiteKey} from './config.js';
import {renderPass} from './pass.js';
const $=id=>document.getElementById(id), escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let guests=[], requests=[], cloud=false,db,auth,user,unsub,editing=null,stream=null,scanning=false;

const byId=id=>guests.find(g=>g.id.toUpperCase()===id.toUpperCase());
// Arrivals: `arrived` counts people in (0..pax). Older records only have checkedIn, so fall back to it.
const paxOf=g=>Math.max(1,Number(g.pax)||1);
const arrivedOf=g=>Number.isFinite(g.arrived)?g.arrived:(g.checkedIn?paxOf(g):0);
const withArrivals=(g,n)=>({...g,arrived:n,checkedIn:n>0,
  checkedInAt:n>0?(g.checkedInAt||new Date().toISOString()):null,
  checkedInBy:n>0?(g.checkedInBy||user?.email||null):null});
// History: short audit trail on each guest (who did what, when). Capped to stay small.
const logged=(g,action)=>({...g,history:[...(Array.isArray(g.history)?g.history:[]).slice(-49),{at:new Date().toISOString(),by:user?.email||'',action}]});
const newToken=()=>{const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',r=crypto.getRandomValues(new Uint8Array(10));return [...r].map(x=>a[x%a.length]).join('')};
const normalise=g=>({...g,id:String(g.id).trim().toUpperCase(),name:String(g.name??'').trim(),phone:String(g.phone??'').replace(/\D/g,''),
  pax:Math.max(1,Math.floor(Number(g.pax)||1)),amount:Math.max(0,Number(g.amount)||0),payment:String(g.payment||'Pending'),
  arrived:Math.max(0,Math.floor(Number(arrivedOf(g))||0))});
const clock=iso=>iso?new Date(iso).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}):'';
// Payment: record method + time when a guest becomes Paid.
const markPaid=(g,method)=>({...g,payment:'Paid',method:method||g.method||'',paidAt:g.paidAt||new Date().toISOString()});
function renderDash(){
  const rupee=n=>'₹'+n.toLocaleString('en-IN'), pending=guests.filter(g=>g.payment==='Pending');
  const due=pending.reduce((s,g)=>s+Number(g.amount||0),0), unsent=guests.filter(g=>!g.passSent).length;
  const notIn=guests.reduce((s,g)=>s+Math.max(0,paxOf(g)-arrivedOf(g)),0);
  const byMethod={};for(const g of guests)if(g.payment==='Paid'){const m=g.method||'Not recorded';byMethod[m]=(byMethod[m]||0)+Number(g.amount||0)}
  const chip=(label,value,filter)=>`<button class="chip" ${filter?`data-filter="${filter}"`:'disabled'}><small>${label}</small><b>${value}</b></button>`;
  $('dash').innerHTML=guests.length?[
    chip('Still to collect',`${rupee(due)} · ${pending.length}`,'Pending'),
    chip('Passes not sent',unsent,'unsent'),
    chip('Yet to arrive',notIn+' pax','notchecked'),
    ...Object.entries(byMethod).map(([m,v])=>chip('Paid · '+escape(m),rupee(v))),
  ].join(''):'';
}
$('dash').onclick=e=>{const f=e.target.closest('[data-filter]')?.dataset.filter;if(!f)return;$('filter').value=$('filter').value===f?'all':f;render()};
const sort=()=>guests.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
function render(){sort();renderDash();let paid=guests.filter(g=>g.payment==='Paid').length, checked=guests.filter(g=>g.checkedIn).length, collected=guests.filter(g=>g.payment==='Paid').reduce((s,g)=>s+Number(g.amount||0),0);$('stats').innerHTML=[['Total guests',guests.length],['Paid',paid],['Pending',guests.filter(g=>g.payment==='Pending').length],['Collected','₹'+collected.toLocaleString('en-IN')],['Arrived',guests.reduce((s,g)=>s+arrivedOf(g),0)+' / '+guests.reduce((s,g)=>s+paxOf(g),0)]].map(([a,b])=>`<div class="stat"><small>${a}</small><strong>${b}</strong></div>`).join('');let q=$('search').value.toLowerCase(),f=$('filter').value;let arr=guests.filter(g=>(g.name+' '+g.id+' '+g.phone+' '+g.notes).toLowerCase().includes(q)&&(f==='all'||g.payment===f||(f==='checked'&&arrivedOf(g)>0)||(f==='notchecked'&&arrivedOf(g)===0)||(f==='unsent'&&!g.passSent)));$('guestList').innerHTML=arr.map(g=>`<article class="guest"><div class="guest-top"><div><h3>${escape(g.name)}</h3><p>${escape(g.id)} · ${escape(g.phone)} · ${escape(g.notes)}</p></div><span class="pill ${g.payment==='Paid'?'paid':'pending'}">${escape(g.payment)}</span></div><p>${escape(g.pax)} pax · ₹${escape(g.amount)}${g.payment==='Paid'&&g.method?' '+escape(g.method):''} · Pass ${g.passSent?'sent':'not sent'} · ${arrivedOf(g)?`✓ ${arrivedOf(g)}/${paxOf(g)} arrived${g.checkedInAt?' · '+clock(g.checkedInAt):''}`:'Not arrived'}</p><div class="guest-actions"><button data-act="edit" data-id="${escape(g.id)}">Edit</button><button data-act="pay" data-id="${escape(g.id)}">${g.payment==='Paid'?'Mark pending':'Mark paid'}</button><button data-act="pass" data-id="${escape(g.id)}">QR Pass</button><button data-act="wa" data-id="${escape(g.id)}">WhatsApp</button><button data-act="check" data-id="${escape(g.id)}">${arrivedOf(g)>=paxOf(g)?'Arrived ✓':'Check in'}</button></div></article>`).join('')||'<p>No matching guests.</p>';if($('scanDialog').open)renderGate();}
async function persist(g) {
  if (!cloud) throw new Error(user
    ? `${user.email} is not authorized. Sign out, then use "Sign in with Google" (organizer) or "Admin login".`
    : 'Not signed in. Use "Sign in with Google" (organizer) or "Admin login" first.');
  const {doc, setDoc} = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
  // Not awaited: the local cache updates the UI immediately, and offline writes resolve only
  // after they reach the server. Errors (e.g. permission denied) still surface here.
  g = normalise(g);
  setDoc(doc(db, 'guests', g.id), g).catch(err => alert(`Could not save ${g.id}: ${err.message}`));
}

// Import guests from JSON (array of records) or CSV (same columns as Export CSV).
// Records without an id get the next DS-xxx number; ids that already exist are left untouched.
function parseCSV(text){
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}
    else if(c==='"')q=true;else if(c===','){row.push(cell);cell=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}
    else cell+=c}
  if(cell||row.length){row.push(cell);rows.push(row)}
  const [head,...body]=rows.filter(r=>r.some(x=>x.trim()));if(!head)return[];
  const keys=head.map(h=>h.trim().replace(/^\uFEFF/,''));
  return body.map(r=>Object.fromEntries(keys.map((k,i)=>[k,r[i]??''])));
}
$('guestFile').onchange = async event => {
  const input = event.target, file = input.files[0];
  input.value = '';
  if (!file || !cloud) return;
  try {
    const text = await file.text();
    let records = /\.csv$/i.test(file.name) || !/^\s*[\[{]/.test(text) ? parseCSV(text) : JSON.parse(text);
    if (!Array.isArray(records)) records = records?.guests;
    if (!Array.isArray(records) || !records.length) throw new Error('No guest records found in that file.');
    const bool = v => v === true || /^(true|yes|1|y)$/i.test(String(v ?? '').trim());
    let next = Number(nextPassId().split('-')[1]);
    const seen = new Set();
    records = records.filter(r => r && String(r.name ?? '').trim()).map(r => {
      let id = String(r.id ?? '').trim().toUpperCase();
      if (!id || seen.has(id)) { while (seen.has('DS-' + String(next).padStart(3, '0')) || byId('DS-' + String(next).padStart(3, '0'))) next++; id = 'DS-' + String(next++).padStart(3, '0'); }
      seen.add(id);
      const g = {...r, id, passSent: bool(r.passSent), checkedIn: bool(r.checkedIn)};
      for (const k of Object.keys(g)) if (g[k] === '') delete g[k];
      if (r.arrived !== undefined && r.arrived !== '') g.arrived = Number(r.arrived) || 0;
      return normalise(g);
    });
    if (!records.length) throw new Error('Every record needs at least a name.');
    if (records.length > 450) throw new Error('Import at most 450 guests at a time.');
    const {doc, runTransaction} = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
    const count = await runTransaction(db, async transaction => {
      const refs = records.map(record => doc(db, 'guests', record.id));
      const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
      const missing = snapshots.flatMap((snapshot, index) => snapshot.exists() ? [] : [index]);
      for (const index of missing) transaction.set(refs[index], logged(records[index], 'imported'));
      return missing.length;
    });
    alert(`${count} new guest${count === 1 ? '' : 's'} imported. ${records.length - count} already existed and were left unchanged.`);
  } catch (error) {
    alert('Import failed: ' + error.message);
  }
};

// Ask how a guest paid (list "Mark paid" button).
function askMethod(g){
  return new Promise(resolve=>{
    const d=$('methodDialog');$('methodTitle').textContent=`${g.name} paid ₹${g.amount||0} via?`;
    const done=v=>{d.onclick=null;d.close();resolve(v)};
    d.onclick=e=>{const m=e.target.closest('[data-m]')?.dataset.m;if(m)done(m);else if(e.target.id==='methodCancel')done(null)};
    d.oncancel=()=>resolve(null);d.showModal();
  });
}

// Bulk send: walk through every guest whose pass isn't sent yet.
let bulkQueue=[];
function updateBulk(){const n=bulkQueue.length;$('nextPass').hidden=!n;$('nextPass').textContent=`Next unsent → (${n} left)`}
$('bulkBtn').onclick=()=>{
  bulkQueue=guests.filter(g=>!g.passSent&&g.phone).map(g=>g.id);
  if(!bulkQueue.length)return alert('Every guest with a phone number has been sent their pass.');
  showPass(byId(bulkQueue.shift()));
};
$('nextPass').onclick=()=>{let id;while((id=bulkQueue.shift())){const g=byId(id);if(g&&!g.passSent)return showPass(g)}updateBulk()};

$('guestList').onclick=async e=>{const b=e.target.closest('button[data-act]');if(!b)return;let g=byId(b.dataset.id);if(!g)return;try{if(b.dataset.act==='edit')edit(g);if(b.dataset.act==='pay'){if(g.payment==='Paid'){if(confirm(`Mark ${g.name} as payment pending?`))await persist(logged({...g,payment:'Pending',method:'',paidAt:null},'marked pending'))}else{const m=await askMethod(g);if(m)await persist(logged(markPaid(g,m),'marked paid ('+m+')'))}}if(b.dataset.act==='check')openGate(g);if(b.dataset.act==='pass')showPass(g);if(b.dataset.act==='wa')showPass(g)}catch(err){alert(err.message)}};
const waMessage=g=>`Hi ${g.name}, your Diwali Sundowner – 3rd Edition entry pass (${g.id}) is ${g.payment==='Paid'?'confirmed':'registered'}. Saturday, 7 Nov 2026, 5 PM onwards, Rooftop All Day Kitchen. Please present your pass at entry.`;
function edit(g){editing=g?.id||null;$('formTitle').textContent=g?'Edit guest':'Add guest';$('fId').value=g?.id||'DS-'+String(Math.max(0,...guests.map(x=>Number(x.id.split('-')[1])||0))+1).padStart(3,'0');$('fId').readOnly=!!g;for(let [field,key] of [['fName','name'],['fPhone','phone'],['fPax','pax'],['fType','type'],['fPayment','payment'],['fAmount','amount'],['fNotes','notes']])$(field).value=g?.[key]??({fPax:1,fAmount:250,fType:'General',fPayment:'Pending'}[field]??'');$('fMethod').value=g?.method||'';$('deleteGuest').hidden=!g;$('fSent').checked=!!g?.passSent;$('fArrived').value=g?arrivedOf(g):0;const h=Array.isArray(g?.history)?g.history:[];$('fHistory').hidden=!h.length;$('fHistory').open=false;$('fHistory').querySelector('ol').innerHTML=h.slice().reverse().map(x=>`<li><b>${escape(x.action)}</b> · ${escape(new Date(x.at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}))}${x.by?' · '+escape(x.by):''}</li>`).join('');$('editDialog').showModal()}
$('deleteGuest').onclick=async()=>{const g=editing&&byId(editing);if(!g||!cloud)return;
  if(prompt(`Delete ${g.name} (${g.id}) permanently? Type the pass ID to confirm.`)?.trim().toUpperCase()!==g.id.toUpperCase())return;
  const {doc,deleteDoc}=await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
  deleteDoc(doc(db,'guests',g.id)).catch(err=>alert(`Could not delete ${g.id}: ${err.message}`));
  $('editDialog').close();};
$('addBtn').onclick=()=>edit(null);
// ---- Public booking requests (from book.html): approve → becomes a guest with the next pass ID. ----
const baseTitle=document.title;
const nextPassId=()=>'DS-'+String(Math.max(0,...guests.map(x=>Number(x.id.split('-')[1])||0))+1).padStart(3,'0');
function renderRequests(){
  document.title=(requests.length?`(${requests.length}) `:'')+baseTitle;
  const box=$('requests');box.hidden=!requests.length;if(!requests.length){box.innerHTML='';return}
  const list=[...requests].sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
  box.innerHTML=`<h2>Booking requests <span class="pill pending">${list.length}</span></h2>`+list.map(r=>`<article class="guest request">
<div class="guest-top"><div><h3>${escape(r.name)}</h3><p>${escape(r.phone)} · ${escape(r.pax)} pax · ₹${escape(r.amount)}${r.createdAt?' · '+new Date(r.createdAt.seconds*1000).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):''}</p></div>
<span class="pill ${r.utr?'paid':'pending'}">${r.utr?'UTR given':'Not paid yet'}</span></div>
${r.utr?`<p>UPI ref: <b>${escape(r.utr)}</b> (check it in your UPI app before marking paid)</p>`:''}${r.notes?`<p>${escape(r.notes)}</p>`:''}
<div class="guest-actions"><button data-req="paid" data-id="${escape(r._id)}">Approve · payment received</button><button data-req="unpaid" data-id="${escape(r._id)}">Approve · unpaid</button><button data-req="reject" data-id="${escape(r._id)}" class="danger">Reject</button></div></article>`).join('');
}
$('requests').onclick=async e=>{
  const b=e.target.closest('button[data-req]');if(!b||!cloud)return;
  const r=requests.find(x=>x._id===b.dataset.id);if(!r)return;
  const {doc,runTransaction,updateDoc}=await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
  b.disabled=true;
  try{
    if(b.dataset.req==='reject'){
      if(!confirm(`Reject booking from ${r.name}?`)){b.disabled=false;return}
      await updateDoc(doc(db,'requests',r._id),{status:'rejected',handledBy:user.email});return;
    }
    let g={name:r.name,phone:r.phone,pax:r.pax,type:'General',payment:'Pending',amount:r.amount,
      notes:[r.notes,r.utr&&'UTR '+r.utr].filter(Boolean).join(' · '),passSent:false,checkedIn:false,arrived:0,requestId:r._id};
    if(b.dataset.req==='paid')g=markPaid(g,'UPI');
    g=logged({...g,token:newToken()},'created from booking'+(b.dataset.req==='paid'?' (paid UPI)':''));
    // Transaction so two admins approving at once can't hand out the same pass ID.
    const id=await runTransaction(db,async t=>{
      let n=Number(nextPassId().split('-')[1]),ref;
      for(;;n++){ref=doc(db,'guests','DS-'+String(n).padStart(3,'0'));if(!(await t.get(ref)).exists())break}
      t.set(ref,normalise({...g,id:ref.id}));
      t.update(doc(db,'requests',r._id),{status:'approved',guestId:ref.id,handledBy:user.email});
      return ref.id;
    });
    if(confirm(`${r.name} added as ${id}. Open their pass to send it now?`)){const added=byId(id);if(added)showPass(added)}
  }catch(err){alert('Could not update request: '+err.message);b.disabled=false}
};
$('bookLinkBtn').onclick=async()=>{const link=new URL('book.html',location.href).href;
  try{await navigator.clipboard.writeText(link);alert('Booking link copied:\n'+link)}catch{prompt('Copy the booking link:',link)}};$('cancelEdit').onclick=()=>$('editDialog').close();$('guestForm').onsubmit=async e=>{e.preventDefault();let g={id:$('fId').value.trim().toUpperCase(),name:$('fName').value.trim(),phone:$('fPhone').value.replace(/\D/g,''),pax:Number($('fPax').value),type:$('fType').value,payment:$('fPayment').value,amount:Number($('fAmount').value),notes:$('fNotes').value,passSent:$('fSent').checked,method:$('fMethod').value};if(!editing&&byId(g.id))return alert('Pass ID already exists');const arrived=Math.min(paxOf(g),Math.max(0,Math.floor(Number($('fArrived').value)||0)));const prev=editing?byId(editing):{};let rec={...prev,...g};rec=rec.payment==='Paid'?{...rec,paidAt:prev.paidAt||new Date().toISOString()}:{...rec,paidAt:null};try{await persist(logged(withArrivals(rec,arrived),editing?'edited':'created'));$('editDialog').close()}catch(err){alert(err.message)}};
let passFile=null,passUrl=null,passGuest=null;
async function showPass(g){
  if(!g.token&&cloud){g={...g,token:newToken()};await persist(g).catch(()=>{})}
  updateBulk();
  passFile=null;passGuest=g;if(passUrl)URL.revokeObjectURL(passUrl);passUrl=null;
  $('downloadPass').disabled=$('printPass').disabled=$('waPass').disabled=true;
  $('passContent').textContent='Generating pass…';$('passDialog').showModal();
  try{
    const canvas=await renderPass(g);
    const blob=await new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error('Could not create image')),'image/png'));
    const safeName=String(g.name||'guest').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'');
    passFile=new File([blob],`${g.id}-${safeName}.png`,{type:'image/png'});
    passUrl=URL.createObjectURL(passFile);
    const img=new Image();img.alt=`Entry pass for ${g.name} (${g.id})`;img.src=passUrl;
    $('passContent').replaceChildren(img);
    $('downloadPass').disabled=$('printPass').disabled=$('waPass').disabled=false;
  }catch(err){$('passContent').textContent='Could not generate pass: '+err.message}
}
const endBulk=()=>{bulkQueue=[];updateBulk()};$('closePass').onclick=()=>{endBulk();$('passDialog').close()};$('passDialog').addEventListener('cancel',endBulk);$('printPass').onclick=()=>window.print();
const downloadPass=()=>{if(!passFile)return;const a=document.createElement('a');a.href=passUrl;a.download=passFile.name;a.click()};
$('downloadPass').onclick=downloadPass;
// wa.me links cannot carry files. On phones, the share sheet sends the image + message to WhatsApp
// (pick the guest's chat there). On desktop, download the image and open the chat to attach it.
$('waPass').onclick=async()=>{
  const g=passGuest;if(!passFile||!g)return;
  const msg=waMessage(g);
  if(navigator.canShare?.({files:[passFile]})){
    try{await navigator.share({files:[passFile],text:msg})}
    catch(err){if(err.name!=='AbortError')alert(err.message);return}
  }else{
    downloadPass();
    window.open('https://wa.me/'+String(g.phone||'').replace(/\D/g,'')+'?text='+encodeURIComponent(msg),'_blank','noopener');
    alert('Pass image downloaded. Attach it in the WhatsApp chat that just opened.');
  }
  const latest=byId(g.id)||g;
  if(!latest.passSent&&confirm(`Mark ${g.name}'s pass as sent?`)){try{await persist(logged({...latest,passSent:true},'pass sent'))}catch(err){alert(err.message)}}
};$('search').oninput=render;$('filter').onchange=render;
$('exportBtn').onclick=()=>{let columns=['id','name','phone','pax','type','payment','amount','passSent','checkedIn','arrived','checkedInAt','checkedInBy','method','paidAt','notes'];let csv=[columns.join(','),...guests.map(g=>columns.map(k=>'"'+String(k==='arrived'?arrivedOf(g):g[k]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='diwali-guests.csv';a.click();URL.revokeObjectURL(a.href)};
// ---- Gate mode: scan → big colour-coded result → admit N people, no extra confirm dialogs. ----
let gate={id:null,missing:null,count:1,admitted:0},audio=null;
function signal(tone){
  try{navigator.vibrate?.(tone==='ok'?120:tone==='warn'?[90,70,90]:[300,100,300])}catch{}
  try{
    if(!audio)return;
    const seq=tone==='ok'?[[880,.12]]:tone==='warn'?[[660,.1],[660,.1]]:[[200,.4]];
    let t=audio.currentTime;
    for(const[f,d]of seq){const o=audio.createOscillator(),v=audio.createGain();o.type=tone==='bad'?'square':'sine';o.frequency.value=f;v.gain.setValueAtTime(.2,t);v.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(v).connect(audio.destination);o.start(t);o.stop(t+d);t+=d+.07}
  }catch{}
}
function gateStatus(){
  const g=gate.id&&byId(gate.id);
  if(!g)return{tone:'bad',label:gate.invalid?'INVALID PASS':'PASS NOT FOUND'};
  const left=paxOf(g)-arrivedOf(g);
  if(gate.admitted)return{tone:'ok',label:left>0?`ADMITTED ${gate.admitted} · ${left} STILL TO COME`:`ADMITTED ${gate.admitted} ✓`};
  if(left<=0)return{tone:'bad',label:'ALREADY CHECKED IN'};
  if(g.payment==='Pending')return{tone:'warn',label:'PAYMENT PENDING'};
  if(arrivedOf(g)>0)return{tone:'warn',label:`${arrivedOf(g)} OF ${paxOf(g)} ALREADY IN`};
  return{tone:'ok',label:'VALID PASS'};
}
function renderGate(){
  const card=$('gateCard');
  if(!gate.id&&!gate.missing){card.hidden=true;return}
  const g=gate.id&&byId(gate.id),s=gateStatus();
  card.hidden=false;card.className='gate '+s.tone;
  if(!g){card.innerHTML=`<div class="gate-banner">${s.label}</div><p>Scanned: <b>${escape(gate.missing)}</b></p>${gate.invalid?`<p>${escape(gate.invalid)}</p>`:''}`;return}
  const pax=paxOf(g),arr=arrivedOf(g),left=Math.max(0,pax-arr);
  gate.count=Math.min(Math.max(1,gate.count),Math.max(1,left));
  card.innerHTML=`<div class="gate-banner">${s.label}</div>
<h3>${escape(g.name)}</h3>
<p>${escape(g.id)} · ${escape(g.type||'General')} · ${g.payment==='Pending'?'<b>₹'+escape(g.amount)+' due</b>':escape(g.payment)}${g.notes?' · '+escape(g.notes):''}</p>
<p class="gate-count">${arr} / ${pax} arrived${g.checkedInAt?` · first in ${clock(g.checkedInAt)}`:''}${g.checkedInBy?` by ${escape(g.checkedInBy)}`:''}</p>
${left>0?`<div class="gate-admit"><button data-gate="minus" class="secondary" aria-label="One fewer">−</button><strong>${gate.count}</strong><button data-gate="plus" class="secondary" aria-label="One more">+</button><button data-gate="admit">Admit ${gate.count}</button></div>${g.payment==='Pending'?`<div class="gate-pay"><button data-gate="payadmit" data-method="UPI">Paid UPI & admit</button><button data-gate="payadmit" data-method="Cash">Paid cash & admit</button></div>`:''}`:''}
${arr>0?'<button data-gate="undo" class="secondary wide">Undo arrivals</button>':''}`;
}
function showGate(code,feedback=true,typed=false){
  code=String(code||'').trim();if(!code)return;
  // QR = "ID.TOKEN" (new passes) or "ID" (older passes / typed by staff).
  const [idPart,tokenPart]=code.split('.');let g=byId(idPart),invalid='';
  if(g&&tokenPart&&g.token&&tokenPart.toUpperCase()!==g.token)invalid='Token does not match: this pass was re-issued or is fake.';
  else if(g&&!tokenPart&&!typed&&requireQrToken&&g.token)invalid='Old-format QR. Ask for the latest pass or check ID manually.';
  if(invalid)g=null;
  gate={id:g?.id||null,missing:g?null:code,invalid,count:g?paxOf(g)-arrivedOf(g):1,admitted:0};
  $('scanResult').textContent='';renderGate();if(feedback)signal(gateStatus().tone);
}
function openGate(g){
  if(!$('scanDialog').open)$('scanDialog').showModal();
  stopScan();$('scanNext').hidden=false;showGate(g.id,false);
}
$('gateCard').onclick=async e=>{
  const btn=e.target.closest('[data-gate]'),act=btn?.dataset.gate,g=gate.id&&byId(gate.id);if(!act||!g)return;
  const left=paxOf(g)-arrivedOf(g);
  if(act==='minus'){gate.count=Math.max(1,gate.count-1);return renderGate()}
  if(act==='plus'){gate.count=Math.min(left,gate.count+1);return renderGate()}
  try{
    if((act==='admit'||act==='payadmit')&&left>0){
      const n=Math.min(gate.count,left);gate.admitted=n;
      await persist(logged(withArrivals(act==='payadmit'?markPaid(g,btn.dataset.method):g,arrivedOf(g)+n),(act==='payadmit'?`paid ${btn.dataset.method} & `:'')+`admitted ${n}`));
      signal('ok');
    }
    if(act==='undo'&&confirm(`Reset arrivals for ${g.name} to 0?`)){gate.admitted=0;await persist(logged(withArrivals(g,0),'arrivals reset'))}
  }catch(err){gate.admitted=0;alert(err.message)}
  renderGate();
};
$('manualCheck').onclick=()=>{stopScan();$('scanNext').hidden=false;showGate($('scanInput').value,true,true)};
$('scanInput').onkeydown=e=>{if(e.key==='Enter')$('manualCheck').click()};
async function stopScan(){scanning=false;stream?.getTracks().forEach(t=>t.stop());stream=null;$('scanVideo').srcObject=null;$('scanVideo').hidden=true}
let scanToken=0;
async function nativeDetector(){
  try{if('BarcodeDetector'in window&&(await BarcodeDetector.getSupportedFormats()).includes('qr_code'))return new BarcodeDetector({formats:['qr_code']})}catch{}
  return null;
}
async function startScan(){
  const say=t=>$('scanResult').textContent=t;
  await stopScan();gate={id:null,missing:null,count:1,admitted:0};renderGate();say('');$('scanInput').value='';$('scanNext').hidden=true;
  const fail=t=>{say(t);$('scanNext').hidden=false};
  if(!navigator.mediaDevices?.getUserMedia)return fail('Camera needs HTTPS and a supported browser. Enter the pass ID below.');
  const detector=await nativeDetector();
  if(!detector&&!window.jsQR)return fail('QR scanner failed to load. Check connection, or enter the pass ID below.');
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false})}
  catch(e){return fail(`Camera unavailable (${e.name}). Allow camera permission for this site, or enter the pass ID below.`)}
  if(!$('scanDialog').open){await stopScan();return}
  const video=$('scanVideo');video.hidden=false;video.srcObject=stream;await video.play().catch(()=>{});
  scanning=true;const token=++scanToken;say('Point the camera at the pass QR code…');
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  while(scanning&&token===scanToken){
    let code=null;
    if(video.readyState>=2&&video.videoWidth){
      try{
        if(detector)code=(await detector.detect(video))[0]?.rawValue;
        else{
          const s=Math.min(1,800/Math.max(video.videoWidth,video.videoHeight));
          canvas.width=video.videoWidth*s|0;canvas.height=video.videoHeight*s|0;
          ctx.drawImage(video,0,0,canvas.width,canvas.height);
          const img=ctx.getImageData(0,0,canvas.width,canvas.height);
          code=jsQR(img.data,img.width,img.height,{inversionAttempts:'dontInvert'})?.data;
        }
      }catch{}
    }
    if(code){$('scanInput').value=code;await stopScan();$('scanNext').hidden=false;showGate(code);break}
    await new Promise(r=>setTimeout(r,200));
  }
}
$('scanBtn').onclick=()=>{
  // Audio must be unlocked by a tap; this click is that tap.
  try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume()}catch{}
  $('scanDialog').showModal();startScan();
};
$('scanNext').onclick=startScan;
$('closeScan').onclick=()=>$('scanDialog').close();$('scanDialog').addEventListener('close',stopScan);
async function initializeFirebase(){if(!firebaseConfig.apiKey)return;try{const [{initializeApp},{getAuth,GoogleAuthProvider,signInWithPopup,signInWithEmailAndPassword,signOut,onAuthStateChanged},{initializeFirestore,getFirestore,persistentLocalCache,persistentMultipleTabManager,collection,onSnapshot,query,where}]=await Promise.all([import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js')]);const app=initializeApp(firebaseConfig);if(appCheckSiteKey){try{const {initializeAppCheck,ReCaptchaV3Provider}=await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-check.js');initializeAppCheck(app,{provider:new ReCaptchaV3Provider(appCheckSiteKey),isTokenAutoRefreshEnabled:true})}catch(e){console.warn('App Check:',e.message)}}auth=getAuth(app);try{db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}catch{db=getFirestore(app)}$('authBtn').onclick=async()=>{try{if(auth.currentUser)await signOut(auth);else await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){alert(e.message)}};
$('adminBtn').onclick=()=>{$('adminError').textContent='';$('adminDialog').showModal()};
$('adminCancel').onclick=()=>$('adminDialog').close();
$('adminForm').onsubmit=async e=>{e.preventDefault();$('adminError').textContent='Signing in…';
  const login=$('aEmail').value.trim().toLowerCase();
  try{await signInWithEmailAndPassword(auth,login.includes('@')?login:`${login}@${adminDomain}`,$('aPassword').value);$('aPassword').value='';$('adminDialog').close()}
  catch(err){$('adminError').textContent=['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email'].includes(err.code)?'Wrong email or password.':err.code==='auth/too-many-requests'?'Too many attempts. Try again later.':err.message}};
onAuthStateChanged(auth,u=>{unsub?.();unsub=null;user=u;cloud=!!u;$('authBtn').textContent=u?'Sign out':'Sign in with Google';$('adminBtn').hidden=!!u;$('importLabel').hidden=!cloud;$('bookLinkBtn').hidden=$('bulkBtn').hidden=!cloud;if(!cloud){requests=[];renderRequests()}if(!cloud){guests=[];render();$('setup').textContent=u?`${u.email} is not authorized. Sign out and use the organizer Google account or Admin login.`:'Sign in with Google (organizer) or use Admin login to access guest records.';return}$('setup').textContent='Connecting… · '+u.email;const stopRequests=onSnapshot(query(collection(db,'requests'),where('status','==','new')),snap=>{requests=snap.docs.map(d=>({...d.data(),_id:d.id}));renderRequests()},e=>console.warn('requests:',e.message));const stopGuests=onSnapshot(collection(db,'guests'),{includeMetadataChanges:true},snap=>{guests=snap.docs.map(d=>d.data());const waiting=snap.docs.filter(d=>d.metadata.hasPendingWrites).length;$('setup').textContent=(snap.metadata.fromCache?'⚠ Offline: showing the copy saved on this device':'Cloud sync active')+(waiting?` · ${waiting} change${waiting>1?'s':''} waiting to upload`:'')+' · '+u.email;$('setup').classList.toggle('offline',snap.metadata.fromCache||waiting>0);render()},e=>{if(e.code==='permission-denied'){unsub?.();unsub=null;cloud=false;guests=[];requests=[];render();renderRequests();$('importLabel').hidden=$('bookLinkBtn').hidden=$('bulkBtn').hidden=true;$('setup').textContent=`${u.email} is not authorized. Sign out and use the organizer Google account or Admin login.`}else alert('Firestore: '+e.message)});unsub=()=>{stopGuests();stopRequests()}})}catch(e){$('setup').textContent='Firebase setup error: '+e.message}}
render();initializeFirebase();
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
