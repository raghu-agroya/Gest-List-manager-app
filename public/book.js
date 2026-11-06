// Public booking page. Anyone with the link can submit a request; firestore.rules only allows
// creating a well-formed document in `requests` (no reads), and the organiser approves it in the app.
import {firebaseConfig, booking, appCheckSiteKey} from './config.js';

const FS = 'https://www.gstatic.com/firebasejs/11.6.0/';
const $ = id => document.getElementById(id);
const rupee = n => '₹' + n.toLocaleString('en-IN');
const paxValue = () => Math.min(booking.maxPax, Math.max(1, Math.floor(Number($('bPax').value) || 1)));
const total = () => paxValue() * booking.pricePerPerson;

function upiLink(amount) {
  const q = {pa: booking.upiId, pn: booking.payeeName, am: String(amount), cu: 'INR', tn: 'Diwali Sundowner booking'};
  return 'upi://pay?' + Object.entries(q).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
}

function update() {
  const amount = total();
  $('bTotal').textContent = `${rupee(amount)}  (${paxValue()} × ${rupee(booking.pricePerPerson)})`;
  if (!booking.upiId) return;
  $('payAmt').textContent = rupee(amount);
  $('payBtn').href = upiLink(amount);
  // QR for people booking on a laptop: scan it with any UPI app.
  if (typeof qrcode === 'function') {
    const qr = qrcode(0, 'M'); qr.addData(upiLink(amount)); qr.make();
    $('upiQr').innerHTML = qr.createSvgTag(4, 8);
  }
}

function normalisePhone(raw) {
  let d = String(raw).replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10) d = '91' + d; // Indian mobile without country code
  return d;
}

let db, addDoc, collection, serverTimestamp;
async function firestore() {
  if (db) return;
  const [{initializeApp}, fs] = await Promise.all([import(FS + 'firebase-app.js'), import(FS + 'firebase-firestore.js')]);
  ({addDoc, collection, serverTimestamp} = fs);
  const app = initializeApp(firebaseConfig);
  if (appCheckSiteKey) {
    const {initializeAppCheck, ReCaptchaV3Provider} = await import(FS + 'firebase-app-check.js');
    initializeAppCheck(app, {provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true});
  }
  db = fs.getFirestore(app);
}

$('bookForm').onsubmit = async e => {
  e.preventDefault();
  const err = t => { $('bError').textContent = t; };
  const name = $('bName').value.trim().replace(/\s+/g, ' ');
  const phone = normalisePhone($('bPhone').value);
  const pax = Number($('bPax').value);
  if (name.length < 2) return err('Please enter your full name.');
  if (!/^[0-9]{11,15}$/.test(phone)) return err('Please enter a valid WhatsApp number.');
  if (!Number.isInteger(pax) || pax < 1 || pax > booking.maxPax) return err(`Number of people must be between 1 and ${booking.maxPax}.`);
  err('');
  $('bSubmit').disabled = true; $('bSubmit').textContent = 'Sending…';
  try {
    await firestore();
    const ref = await addDoc(collection(db, 'requests'), {
      name, phone, pax,
      amount: pax * booking.pricePerPerson,
      notes: $('bNotes').value.trim().slice(0, 200),
      utr: ($('bUtr')?.value || '').trim().slice(0, 40),
      status: 'new',
      createdAt: serverTimestamp(),
    });
    $('doneText').textContent = `Thank you, ${name}! We have your request for ${pax} ${pax > 1 ? 'people' : 'person'} (${rupee(pax * booking.pricePerPerson)}).`;
    $('doneRef').textContent = ref.id.slice(0, 6).toUpperCase();
    $('bookForm').hidden = true; $('done').hidden = false;
    $('bookForm').reset(); update();
  } catch (e2) {
    err(e2.code === 'permission-denied' ? 'Booking could not be saved. Please check your details and try again.' : 'Could not send booking: ' + e2.message);
  } finally {
    $('bSubmit').disabled = false; $('bSubmit').textContent = 'Request booking';
  }
};

$('another').onclick = () => { $('done').hidden = true; $('bookForm').hidden = false; };
$('copyUpi').onclick = () => navigator.clipboard?.writeText(booking.upiId).then(() => { $('copyUpi').textContent = 'Copied'; });
$('bPax').max = booking.maxPax;
$('bPax').oninput = update;

if (!booking.open) { $('bookForm').hidden = true; $('closed').hidden = false; }
if (booking.upiId) { $('paySection').hidden = false; $('upiId').textContent = booking.upiId; }
else $('payLater').hidden = false;
update();
