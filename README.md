# AFTERLIGHT

**A field study in survival.** A self-contained, original neon arena-survival game built for desktop and mobile browsers. Find the signal. Hold the line. Get out alive.

## Play

Open `index.html` in a modern browser. For the installable/offline experience, serve the folder over HTTPS or localhost (service workers do not run from `file://`). No dependencies, build step, or account required. On Android, open the hosted game in Chrome and use **Install app / Add to Home screen**.

## Deploy to Vercel

This is a static site and needs no build command. Sign in to Vercel, then run `npx vercel` from this folder to create a preview deployment. Run `npx vercel --prod` to publish the production URL. Vercel's Hobby plan is free for eligible personal projects; check its current usage and plan terms before publishing. The included `vercel.json` sets a safe revalidation policy for the service worker so game updates are picked up.

## Controls

- **WASD / arrow keys:** move
- **Space:** dash (brief invulnerability; directional movement required)
- **Esc / P:** pause or resume
- **Touch:** left virtual joystick to move, dash button on the right
- The weapon automatically fires at the nearest hostile.
- **Score:** earn points for each hostile and a larger reward for defeating the Warden.

## The run

Survive increasingly dangerous sectors, collect signal shards, and choose a new upgrade on each level. Stalkers close in, brutes hit hard, and shooters attack from range. At 90 seconds, the Warden arrives. Your best score is saved on your device.

## Project contents

- `index.html` — accessible game shell and UI
- `styles.css` — responsive visual design and touch layout
- `game.js` — canvas renderer, gameplay, input and progression
- `manifest.webmanifest`, `sw.js`, `icon.svg` — install and offline support

## Release checklist

This is a complete playable browser-game prototype, not a certified store release. Before public distribution, test on target Android devices and browsers, add any desired privacy/support pages, verify hosting over HTTPS, and review the current Google Play policies and packaging requirements. The UI uses a Google Fonts stylesheet when online and falls back to system fonts. All gameplay code and visual assets in this project are original; no external game repository or third-party game assets are bundled.
