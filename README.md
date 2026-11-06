# Diwali Sundowner Guest Manager

Deploy to the existing Firebase Spark project from this directory using a signed-in Firebase CLI.

```sh
firebase deploy --project diwali-sundowner-guest-manager --only hosting,firestore:rules
```

Open the Hosting URL printed by the CLI. Sign in with the organizer Google account and select **Import guest JSON**. Choose `guests.json` extracted from the original Guest Manager ZIP. Expected totals are 14 guest records and ₹1,500 collected. The import preserves existing IDs when rerun.

Only files under `public/` are served by Hosting. Keep the guest JSON outside that folder. The app tracks payments manually. WhatsApp opens a draft and printable QR passes can be attached manually.
