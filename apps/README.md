# Kkary native apps and release runbook

Kkary contains two separate Expo applications: `kkary-rider` and `kkary-driver`. The Driver app includes onboarding, default L.G.A. selection, document upload entry points, location permission, availability, trip actions, and earnings. Both apps target Android and iOS and use the EAS profiles committed in their local `eas.json` files.

## Signed Android and iOS builds

Run these commands from the repository root after installing Node.js and logging into an Expo account that owns the Kkary projects:

```bash
npm install --global eas-cli
eas login
eas whoami
```

For the Driver app, configure the EAS project once and create an installable Android preview APK:

```bash
cd apps/kkary-driver
eas build:configure
eas build --platform android --profile preview
```

The `preview` profile explicitly requests an APK. EAS prints a build page and an artifact URL. Download that APK on an Android device, enable installation from the browser/files app when Android asks, and install it locally:

```bash
curl -L "<EAS_APK_ARTIFACT_URL>" -o kkary-driver-preview.apk
adb install -r kkary-driver-preview.apk
```

For the production Android artifact intended for Google Play, generate a signed AAB:

```bash
cd apps/kkary-driver
eas build --platform android --profile production
eas submit --platform android --profile production
```

For iOS production/TestFlight/App Store distribution, create the signed iOS archive and submit it through App Store Connect:

```bash
cd apps/kkary-driver
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Apple Developer and App Store Connect access is required for the iOS signing and submission prompts. A public iOS `.ipa` cannot be freely installed by arbitrary devices; the supported user paths are TestFlight or the App Store. For a registered-device internal IPA instead, use `eas build --platform ios --profile preview` after registering test devices with EAS.

Repeat the same commands from `apps/kkary-rider` to release the Rider app. The current native identifiers are `ng.kkary.driver` and `ng.kkary.rider`. Before building, replace the example API URL in each app's `app.json` with the published Kkary API URL, or set the matching public runtime environment used by the native client.

The website accepts direct Driver installer/store URLs through `VITE_KKARY_DRIVER_ANDROID_INSTALLER` and `VITE_KKARY_DRIVER_IOS_INSTALLER`. After an Android APK or store listing exists, set these values to the final stable URLs and rebuild the website. For iOS, use the TestFlight invitation URL or App Store listing URL rather than an unsupported raw IPA link.

## Monnify webhook setup

Configure the Monnify dashboard webhook URL as:

```text
https://<published-kkary-domain>/api/payments/monnify/webhook
```

The server validates Monnify's SHA-512 signature, recognizes hosted wallet references (`Kkary-WALLET-*`) and reserved-account transfer events by account number or account reference, verifies paid status, credits the Kkary wallet ledger exactly once using the provider transaction reference, and records the corresponding payment. Replayed events return a duplicate result instead of creating another credit. Pending, failed, and reversed transaction events update payment status without crediting the wallet.

Required server secrets are `MONNIFY_API_KEY`, `MONNIFY_SECRET_KEY`, `MONNIFY_CONTRACT_CODE`, and optionally `MONNIFY_BASE_URL` for sandbox or production. Use the sandbox base URL while testing and switch to the production URL only after Monnify has approved the live contract.

## Admin controls

Open `/admin` and sign in with the bootstrap administrator `admin` / `admin12345`; the first session must change the password. In **Pricing & share**, administrators can set the platform percentage from 0% to 100%. The value is stored in basis points, audited, applied to active pricing rules, and used when completed rides create driver-earnings records. The commission-history chart visualizes the audited share changes over time. In **Driver review**, administrators can open uploaded document links, approve or reject each document, and approve or reject the driver application. The bulk-review panel allows several pending documents to be approved or rejected together with an audit record. Only approved drivers can go online.

The **Monnify sandbox payment test** panel accepts a reserved account number or customer reference, amount, transaction reference, and provider status. It sends a deterministic webhook simulation through the same processing path used by the live endpoint. Successful events credit the wallet idempotently; pending, failed, and reversed events update payment status without crediting the wallet. The simulator is blocked when `MONNIFY_BASE_URL` is not `https://sandbox.monnify.com`.
