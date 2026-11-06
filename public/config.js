export const firebaseConfig = {"apiKey": "AIzaSyCTTQW-88KtMGcJ7tNGu5XqaWhDTSBWMsY", "authDomain": "diwali-sundowner-guest-manager.firebaseapp.com", "projectId": "diwali-sundowner-guest-manager", "appId": "1:240182928396:web:69f88dbed19585a0747a29"};
// Who may manage guests is decided ONLY by firestore.rules (isGoogleOrganizer / isPasswordAdmin).
// Edit the email lists there and deploy rules; the app asks Firestore and shows "not authorized" if refused.
// Email + password admins are created in Firebase Console > Authentication > Users. Never put passwords here.
// A username typed without "@" gets adminDomain appended (admin -> admin@...).
export const adminDomain = "diwali-sundowner-guest-manager.firebaseapp.com";
// Public booking page (book.html). pricePerPerson and maxPax must match the `requests` rule in firestore.rules.
// Set upiId (e.g. "yourname@okhdfcbank") to show the UPI pay button and QR; leave "" to collect payment on WhatsApp.
export const booking = {open: true, upiId: "", payeeName: "Diwali Sundowner", pricePerPerson: 250, maxPax: 10};
// Pass QR codes carry "ID.TOKEN". While old passes (plain ID) are in circulation keep this false;
// set true to reject scans without a valid token. Typing an ID by hand at the gate always works.
export const requireQrToken = false;
// Firebase App Check (spam protection for book.html). Create a reCAPTCHA v3 key, register it in
// Firebase Console > App Check, paste the site key here, deploy, then turn on enforcement for Firestore.
export const appCheckSiteKey = "";
