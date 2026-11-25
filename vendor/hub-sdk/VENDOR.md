# Vendored @metaverse/hub-sdk

- repo: https://github.com/crrreatorrr/metaverse-hub
- branch: main
- sha: 273dfe3
- package: packages/hub-sdk @ 0.10.0
- iife: dist/hub-sdk.iife.js (global HubSDK; classic script, not a CDN import)
- iife sha256: 6ae110a36d9d128b4a5e48b94ed30befbc3c11a255261007cfc5be4d861323ab

This tree is the same 0.10.0 build Sproto Open World vendors (hub `273dfe3`).
`SOURCE.pin.json` is that pin, unchanged. No source was edited.

Sproto Racer imports the lean feedback entry only:

- `@metaverse/hub-sdk/feedback`: `installFeedback` (the N-N window, its screenshot and its sending)
  and `feedbackTransportFromSdk`. The adapter is `src/feedback.js`.

`GAME_IDS` in this build lists games through `sproto-open-world`. It does not list
`sproto-racer`. Feedback still sends through whatever hub session the page already has
(`feedbackAccess` / `submitFeedback`). A portal visit cannot redeem a Racer ticket until the
hub registers that id and this package is re-vendored. See the pull request report.

Re-sync from the metaverse-hub root when packages/hub-sdk changes:

`node scripts/vendor-sdk.mjs /path/to/Sproto-Racer --branch main`

Then `npm install`.
