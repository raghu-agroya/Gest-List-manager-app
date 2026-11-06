import {firebaseConfig,allowedEmails,passwordAdmins,adminDomain} from './config.js';
import {renderPass} from './pass.js';
const $=id=>document.getElementById(id), escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let guests=[], cloud=false,db,auth,user,unsub,editing=null,stream=null,scanning=false;

const byId=id=>guests.find(g=>g.id.toUpperCase()===id.toUpperCase());
const sort=()=>guests.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
function render(){sort();let paid=guests.filter(g=>g.payment==='Paid').length, checked=guests.filter(g=>g.checkedIn).length, collected=guests.filter(g=>g.payment==='Paid').reduce((s,g)=>s+Number(g.amount||0),0);$('stats').innerHTML=[['Total guests',guests.length],['Paid',paid],['Pending',guests.filter(g=>g.payment==='Pending').length],['Collected','₹'+collected.toLocaleString('en-IN')]].map(([a,b])=>`<div class="stat"><small>${a}</small><strong>${b}</strong></div>`).join('');let q=$('search').value.toLowerCase(),f=$('filter').value;let arr=guests.filter(g=>(g.name+' '+g.id+' '+g.phone+' '+g.notes).toLowerCase().includes(q)&&(f==='all'||g.payment===f||(f==='checked'&&g.checkedIn)||(f==='notchecked'&&!g.checkedIn)));$('guestList').innerHTML=arr.map(g=>`<article class="guest"><div class="guest-top"><div><h3>${escape(g.name)}</h3><p>${escape(g.id)} · ${escape(g.phone)} · ${escape(g.notes)}</p></div><span class="pill ${g.payment==='Paid'?'paid':'pending'}">${escape(g.payment)}</span></div><p>${escape(g.pax)} pax · ₹${escape(g.amount)} · Pass ${g.passSent?'sent':'not sent'} · ${g.checkedIn?'✓ Checked in':'Not checked in'}</p><div class="guest-actions"><button data-act="edit" data-id="${escape(g.id)}">Edit</button><button data-act="pay" data-id="${escape(g.id)}">${g.payment==='Paid'?'Mark pending':'Mark paid'}</button><button data-act="pass" data-id="${escape(g.id)}">QR Pass</button><button data-act="wa" data-id="${escape(g.id)}">WhatsApp</button><button data-act="check" data-id="${escape(g.id)}">${g.checkedIn?'Undo check-in':'Check in'}</button></div></article>`).join('')||'<p>No matching guests.</p>';}
async function persist(g) {
  if (!cloud) throw new Error(user
    ? `${user.email} is not authorized. Sign out, then use "Sign in with Google" (organizer) or "Admin login".`
    : 'Not signed in. Use "Sign in with Google" (organizer) or "Admin login" first.');
  const {doc, setDoc} = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
  await setDoc(doc(db, 'guests', g.id), g);
}

$('guestFile').onchange = async event => {
  const input = event.target;
  const file = input.files[0];
  input.value = '';
  if (!file || !cloud) return;
  try {
    const records = JSON.parse(await file.text());
    if (!Array.isArray(records) || records.length !== 14 ||
        records.some(record => !record || !/^DS-0(0[1-9]|1[0-4])$/.test(record.id)) ||
        new Set(records.map(record => record.id)).size !== 14) {
      throw new Error('Select the original guests.json containing the 14 event records.');
    }
    const {doc, runTransaction} = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
    const count = await runTransaction(db, async transaction => {
      const refs = records.map(record => doc(db, 'guests', record.id));
      const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
      const missing = snapshots.flatMap((snapshot, index) => snapshot.exists() ? [] : [index]);
      for (const index of missing) transaction.set(refs[index], records[index]);
      return missing.length;
    });
    alert(count + ' new records imported. Existing records were preserved.');
  } catch (error) {
    alert(error.message);
  }
};

$('guestList').onclick=async e=>{const b=e.target.closest('button[data-act]');if(!b)return;let g=byId(b.dataset.id);if(!g)return;try{if(b.dataset.act==='edit')edit(g);if(b.dataset.act==='pay')await persist({...g,payment:g.payment==='Paid'?'Pending':'Paid'});if(b.dataset.act==='check')await persist({...g,checkedIn:!g.checkedIn});if(b.dataset.act==='pass')showPass(g);if(b.dataset.act==='wa')showPass(g)}catch(err){alert(err.message)}};
const waMessage=g=>`Hi ${g.name}, your Diwali Sundowner – 3rd Edition entry pass (${g.id}) is ${g.payment==='Paid'?'confirmed':'registered'}. Saturday, 7 Nov 2026, 5 PM onwards, Rooftop All Day Kitchen. Please present your pass at entry.`;
function edit(g){editing=g?.id||null;$('formTitle').textContent=g?'Edit guest':'Add guest';$('fId').value=g?.id||'DS-'+String(Math.max(0,...guests.map(x=>Number(x.id.split('-')[1])||0))+1).padStart(3,'0');$('fId').readOnly=!!g;for(let [field,key] of [['fName','name'],['fPhone','phone'],['fPax','pax'],['fType','type'],['fPayment','payment'],['fAmount','amount'],['fNotes','notes']])$(field).value=g?.[key]??({fPax:1,fAmount:250,fType:'General',fPayment:'Pending'}[field]??'');$('fSent').checked=!!g?.passSent;$('fChecked').checked=!!g?.checkedIn;$('editDialog').showModal()}
$('addBtn').onclick=()=>edit(null);$('cancelEdit').onclick=()=>$('editDialog').close();$('guestForm').onsubmit=async e=>{e.preventDefault();let g={id:$('fId').value.trim().toUpperCase(),name:$('fName').value.trim(),phone:$('fPhone').value.replace(/\D/g,''),pax:Number($('fPax').value),type:$('fType').value,payment:$('fPayment').value,amount:Number($('fAmount').value),notes:$('fNotes').value,passSent:$('fSent').checked,checkedIn:$('fChecked').checked};if(!editing&&byId(g.id))return alert('Pass ID already exists');try{await persist(g);$('editDialog').close()}catch(err){alert(err.message)}};
let passFile=null,passUrl=null,passGuest=null;
async function showPass(g){
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
$('closePass').onclick=()=>$('passDialog').close();$('printPass').onclick=()=>window.print();
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
  if(!latest.passSent&&confirm(`Mark ${g.name}'s pass as sent?`)){try{await persist({...latest,passSent:true})}catch(err){alert(err.message)}}
};$('search').oninput=render;$('filter').onchange=render;
$('exportBtn').onclick=()=>{let columns=['id','name','phone','pax','type','payment','amount','passSent','checkedIn','notes'];let csv=[columns.join(','),...guests.map(g=>columns.map(k=>'"'+String(g[k]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='diwali-guests.csv';a.click();URL.revokeObjectURL(a.href)};
async function check(id){let g=byId(id.trim());if(!g){$('scanResult').textContent='Pass not found';return}if(g.checkedIn){$('scanResult').textContent=`ALREADY CHECKED IN: ${g.name}`;return}if(!confirm(`Check in ${g.name} (${g.id})? Payment: ${g.payment}`))return;try{await persist({...g,checkedIn:true});$('scanResult').textContent=`✓ Checked in: ${g.name}`}catch(err){$('scanResult').textContent=err.message}}
$('manualCheck').onclick=()=>check($('scanInput').value);$('scanInput').onkeydown=e=>{if(e.key==='Enter')check(e.target.value)};
async function stopScan(){scanning=false;stream?.getTracks().forEach(t=>t.stop());stream=null;$('scanVideo').srcObject=null}
let scanToken=0;
async function nativeDetector(){
  try{if('BarcodeDetector'in window&&(await BarcodeDetector.getSupportedFormats()).includes('qr_code'))return new BarcodeDetector({formats:['qr_code']})}catch{}
  return null;
}
$('scanBtn').onclick=async()=>{
  const say=t=>$('scanResult').textContent=t;
  await stopScan();$('scanDialog').showModal();say('');$('scanInput').value='';
  if(!navigator.mediaDevices?.getUserMedia)return say('Camera needs HTTPS and a supported browser. Enter the pass ID below.');
  const detector=await nativeDetector();
  if(!detector&&!window.jsQR)return say('QR scanner failed to load. Check connection, or enter the pass ID below.');
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false})}
  catch(e){return say(`Camera unavailable (${e.name}). Allow camera permission for this site, or enter the pass ID below.`)}
  if(!$('scanDialog').open){await stopScan();return}
  const video=$('scanVideo');video.srcObject=stream;await video.play().catch(()=>{});
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
    if(code){$('scanInput').value=code;await stopScan();await check(code);break}
    await new Promise(r=>setTimeout(r,200));
  }
};
$('closeScan').onclick=()=>$('scanDialog').close();$('scanDialog').addEventListener('close',stopScan);
const signInProvider=u=>u.providerData?.[0]?.providerId;
const isAllowed=u=>signInProvider(u)==='password'?passwordAdmins.includes(u.email):(u.emailVerified&&allowedEmails.includes(u.email));
async function initializeFirebase(){if(!firebaseConfig.apiKey)return;try{const [{initializeApp},{getAuth,GoogleAuthProvider,signInWithPopup,signInWithEmailAndPassword,signOut,onAuthStateChanged},{getFirestore,collection,onSnapshot}]=await Promise.all([import('https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js')]);const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);$('authBtn').onclick=async()=>{try{if(auth.currentUser)await signOut(auth);else await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){alert(e.message)}};
$('adminBtn').onclick=()=>{$('adminError').textContent='';$('adminDialog').showModal()};
$('adminCancel').onclick=()=>$('adminDialog').close();
$('adminForm').onsubmit=async e=>{e.preventDefault();$('adminError').textContent='Signing in…';
  const login=$('aEmail').value.trim().toLowerCase();
  try{await signInWithEmailAndPassword(auth,login.includes('@')?login:`${login}@${adminDomain}`,$('aPassword').value);$('aPassword').value='';$('adminDialog').close()}
  catch(err){$('adminError').textContent=['auth/invalid-credential','auth/wrong-password','auth/user-not-found','auth/invalid-email'].includes(err.code)?'Wrong email or password.':err.code==='auth/too-many-requests'?'Too many attempts. Try again later.':err.message}};
onAuthStateChanged(auth,u=>{unsub?.();unsub=null;user=u;cloud=!!u&&isAllowed(u);$('authBtn').textContent=u?'Sign out':'Sign in with Google';$('adminBtn').hidden=!!u;$('importLabel').hidden=!cloud;if(!cloud){guests=[];render();$('setup').textContent=u?`${u.email} is not authorized. Sign out and use the organizer Google account or Admin login.`:'Sign in with Google (organizer) or use Admin login to access guest records.';return}$('setup').textContent='Cloud sync active · '+u.email;unsub=onSnapshot(collection(db,'guests'),snap=>{guests=snap.docs.map(d=>d.data());render()},e=>alert('Firestore: '+e.message))})}catch(e){$('setup').textContent='Firebase setup error: '+e.message}}
render();initializeFirebase();
