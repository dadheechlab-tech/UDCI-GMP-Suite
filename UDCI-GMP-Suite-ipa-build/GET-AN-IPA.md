# Getting UDCI GMP Suite onto the iPad — the honest options

**There is no iPad `.ipa` you can copy over and tap to install.** iOS runs an app
only if it's code‑signed and tied to your device/account. So every route below
ends in one of four installers: **AltStore/Sideloadly**, **TestFlight**, **Xcode**,
or your organisation's **MDM**. Pick by what you have.

These tools build the app into an **`.ipa`** for you (the two scripts here produce
an *unsigned* `.ipa`, which is exactly what a sideloader expects).

---

## Fastest, no Mac, no `.ipa` at all — the real "just install it on the iPad"
Use the **web‑app (PWA)** from the main package: host the `ios-pwa/` folder on HTTPS,
open it in **Safari** on the iPad, **Share → Add to Home Screen**. You get a Home‑Screen
app with the UDCI icon, offline, in under a minute. No build, no account, no signing.
*(This is genuinely the only "tap and it's installed" path on a stock iPad.)*

---

## Get an actual `.ipa` to download — without owning a Mac
**GitHub Actions builds it in the cloud.**
1. Put the Xcode project in a GitHub repo: push the **contents of the `xcode/` folder**
   to a repo so `UDCIGMPSuite.xcodeproj` sits at the repo root, and include the
   **`.github/`** folder from here.
2. On GitHub → **Actions** tab → run **“Build iOS IPA (unsigned)”** (or just push).
3. When it finishes, download the **`UDCI-GMP-Suite-ipa`** artifact — that's your `.ipa`.

Then install it on the iPad with a **free Apple ID**:
- **AltStore** (altstore.io) or **Sideloadly** (sideloadly.io): install AltServer/Sideloadly
  on any Mac or Windows PC, plug in or Wi‑Fi‑connect the iPad, drag the `.ipa` in, sign in
  with your Apple ID. It installs.
- Free‑Apple‑ID limits: the app **expires after 7 days** (AltStore can auto‑refresh over
  Wi‑Fi while AltServer runs on a computer on the same network), and max 3 sideloaded apps.

## Build the `.ipa` on your own Mac instead
Put **`make-ipa.command`** next to `UDCIGMPSuite.xcodeproj` and double‑click it →
it produces `out/UDCI-GMP-Suite-unsigned.ipa`. Install it the same way (AltStore/Sideloadly).

---

## Tap‑to‑install for the whole lab — TestFlight (needs paid account, $99/yr)
This is the closest to "grab and install" for a native app, and it's shareable.
1. In Xcode (or via CI with signing), open the project, set your **Team** under
   Signing & Capabilities, then **Product → Archive → Distribute App → TestFlight**.
2. Add testers' emails in App Store Connect. Everyone installs by tapping **Install**
   in the **TestFlight** app on their iPad. Builds last 90 days.

## Managed iPads — MDM (institutional)
If SUNY Upstate uses **Apple Business Manager / an MDM** (Jamf, Intune, etc.), your IT
can sign an in‑house build and **push it to managed iPads** centrally — no per‑device
sideloading, no expiry. Share the Xcode project with them and they handle distribution.

---

### Which should you use?
- **Just me, right now, no fuss:** the **PWA** (Add to Home Screen).
- **I want a real `.ipa` file, free account:** **GitHub Actions** → download `.ipa` → **AltStore**.
- **The whole lab, cleanly:** **TestFlight** (paid account).
- **Institutional fleet:** **MDM** via Upstate IT.
