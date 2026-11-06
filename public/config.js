export const firebaseConfig = {"apiKey": "AIzaSyCTTQW-88KtMGcJ7tNGu5XqaWhDTSBWMsY", "authDomain": "diwali-sundowner-guest-manager.firebaseapp.com", "projectId": "diwali-sundowner-guest-manager", "appId": "1:240182928396:web:69f88dbed19585a0747a29"};
// Keep both lists in sync with firestore.rules (the rules are what actually enforce access).
// Google sign-in accounts:
export const allowedEmails = ["raghunandanagroya@gmail.com"];
// Email + password accounts (created in Firebase Console > Authentication > Users). Never put passwords here.
// These need no real mailbox. A username typed without "@" gets adminDomain appended (admin -> admin@...).
export const adminDomain = "diwali-sundowner-guest-manager.firebaseapp.com";
export const passwordAdmins = ["admin@diwali-sundowner-guest-manager.firebaseapp.com"];
// Public booking page (book.html). pricePerPerson and maxPax must match the `requests` rule in firestore.rules.
// Set upiId (e.g. "yourname@okhdfcbank") to show the UPI pay button and QR; leave "" to collect payment on WhatsApp.
export const booking = {open: true, upiId: "", payeeName: "Diwali Sundowner", pricePerPerson: 250, maxPax: 10};
