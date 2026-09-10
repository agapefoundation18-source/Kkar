# Kkary Expansion Todo

## Product direction
- [x] Replace incorrect Oru wording with Oro where geographic identity is used.
- [x] Public website describes Kkary and provides functional Android/iOS download actions.
- [x] Rider and driver experiences are separate native Expo apps for Android and iOS.
- [x] Admin operations are only reachable at `/admin`.

## Backend and data
- [x] Driver registration with a required default Akwa Ibom L.G.A.
- [x] Driver document uploads, storage references, review statuses, and admin decisions.
- [x] Driver current-location heartbeat and GPS/L.G.A.-aware ride matching.
- [x] Trip state transition history, rider cancellation, and user/driver notifications.
- [x] Monnify hosted checkout, dedicated reserved-account funding, verification, and idempotent transaction history.
- [x] Admin-controlled commission/income percentage applied to completed-trip driver earnings with audit logs.
- [x] First-admin bootstrap (`admin` / `admin12345`) with forced password change.
- [x] Super-admin creation of admins and super-admins; self-service credential edits.

## Client surfaces
- [x] Kkary public marketing website.
- [x] Rider app: required location permission, native current-location map, booking entry point, and wallet surface.
- [x] Driver app: onboarding, document capture/upload entry points, L.G.A. selection, online status, and earnings surface.
- [x] Admin console: review queue with document links, Google Maps live-driver view, operations snapshot, revenue settings, and administrator credentials.

## Verification
- [x] Generated and applied non-destructive database migrations `0002_large_onslaught.sql` and `0003_busy_swordsman.sql`.
- [x] Added and passed pricing, logout, admin-session, ride-state/fare, Monnify credential/signature, and webhook idempotency tests.
- [x] Passed root TypeScript check and production build.
- [x] Passed TypeScript checks for both Expo apps.
- [x] Captured desktop, mobile, and `/admin` preview screenshots.
- [x] Added EAS build profiles and functional Google Play/App Store discovery links; publishing signed binaries is the external store-credentials step after handoff.
- [x] Added exact EAS commands for signed Android APK/AAB and iOS TestFlight/App Store artifacts.
- [x] Extended Monnify webhooks to persist pending, failed, reversed, and successful transaction states while crediting hosted and reserved-account funding idempotently.
- [x] Confirmed admin commission controls, audit logging, and driver-document review actions in the `/admin` dashboard.
- [x] Added audited commission-history charting to the admin finance section.
- [x] Added bulk approve/reject document review with one audit record per batch.
- [x] Added admin-only Monnify sandbox payment simulation for successful, pending, failed, and reversed events.
- [x] Added an interactive four-step driver onboarding and document-upload guide to `/drivers`.
