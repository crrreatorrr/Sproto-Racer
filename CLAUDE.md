# Sproto Racer

## Test with the sound off

Ken wants every browser test of this game to run muted. Before you open the game in a browser:

- Start the server from the `sproto-dev` entry in `.claude/launch.json`. It runs `npm run dev:muted`, and the game opens muted on it.
- On any other server or build (`npm run dev`, `npm run preview`, a deployed page), add `?mute=1` to the address.
- On a branch that does not have `src/sound-pref.js` yet, run `localStorage.setItem('sproto.mute','1')` in the page and reload before testing.

Check it before driving: the paddock's speaker button reads "Enable sound" when the game is muted. Do not unmute the game while testing, unless the test is about sound itself.
