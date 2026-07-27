# Changelog

## 0.1.1

- Removed the unintended vertical scrollbar and native arrow controls from the website detail tab bar.
- No other application behavior or design was changed.

## 0.1.0

- Initial complete release of Pages.
- Added multi-site static website hosting.
- Added an Umbrel-style responsive light and dark dashboard.
- Added dedicated Overview, Sites, Templates, and Settings sections.
- Added dashboard totals for published sites, drafts, visits, storage, backups, and Tor status.
- Added a searchable and filterable template library with full live previews.
- Added nine complete responsive templates: Noir Portfolio, Orbit Launch, Aura Links, Northstar Docs, Paper Journal, Atelier Studio, Afterglow, Purple Nostr, and Blank Canvas.
- Kept every bundled template local and editable without remote fonts, images, analytics, or third-party assets.
- Added one-click website creation directly from template cards and preview dialogs.
- Added draft and published states, authenticated draft previews, and publish/unpublish controls.
- Added richer site cards and recent-site previews based on the selected template.
- Applied the final Pages logo consistently across the dashboard, login screen, browser icons, and Umbrel assets.
- Removed the lower-left privacy information card for a cleaner sidebar.
- Added browser file management and text editing.
- Added file, folder, and hardened ZIP imports plus ZIP exports.
- Added local-network and shared Umbrel Onion address detection.
- Added a dedicated Sharing view for every website.
- Added optional independent Onion v3 identities for individual websites.
- Added a dedicated Tor sidecar managed through authenticated Unix control sockets.
- Added persistent per-site Onion keys and generate, disable, enable, and regenerate actions.
- Added direct root routing for independent Onion hostnames without `/p/<slug>/`.
- Added blocking for disabled and retired Onion identities so they cannot expose the dashboard.
- Added automatic reconciliation and restoration of enabled Onion services after restarts.
- Added open, copy, and locally generated QR-code actions for local, shared Onion, independent Onion, and custom-domain URLs.
- Added graceful handling of missing or placeholder Umbrel Hidden Service values.
- Added custom domains, CORS, SPA fallback, directory listings, and cache controls.
- Added local page-view counters and restorable website backups.
- Added automated tests for all template bundles, startup, publishing, draft protection, address detection, QR output, independent Onion lifecycle, direct host routing, retired-address blocking, and modal interactions.
- Fixed first-start permissions for Umbrel bind mounts by initializing storage as root and dropping permanently to UID/GID `1000:1000` before service processes start.
- Fixed modal click handling so form fields and template cards remain interactive and website creation submits correctly.
