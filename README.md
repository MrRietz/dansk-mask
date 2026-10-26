# Dansk Mask

Worms-inspirerat artilleri-spel i webbläsaren (2D, turordning, förstörbar terräng). MVP: du mot AI.
Ren JavaScript (ES-moduler) och Canvas — inget bygg-steg, inga beroenden.

## Starta

```
npm start        # http://localhost:8080
npm test         # enhetstester + AI-mot-AI-simulering
```

Kräver Node 18+. (ES-moduler fungerar inte via `file://`, därför den lilla servern.)

Spela direkt utan installation: https://mrrietz.github.io/dansk-mask/ (GitHub Pages, serveras från `main`, rotkatalogen).
Spelet är helt statiskt med relativa sökvägar, så det fungerar lika bra under en underkatalog som på localhost.

## Spelet

- Lag mot lag, ett lag i taget, 60 s per tur (inställbart), 3 s reträtt efter skott.
- Vind byts varje tur. Vatten dödar. Efter runda 12 = sudden death (alla worms 1 HP, vattnet stiger).
- Lådor droppas i fallskärm: hälsa (+25) eller vapen.
- Sex banor (`settings.layout`, eller `random`): Floating Isles, Rolling Hills, Caverns, Canyon, Bridges, Arena — se `src/core/maps.mjs`.
- 60 vapen i Worms Armageddons 12 grupper (F1–F12): bl.a. Bazooka, Homing Missile, Mortar, Homing Pigeon,
  Banana, Holy Hand Grenade, Dynamite, Sheep/Super Sheep, Air/Napalm/Mail/Mine strike, Mole Bomb,
  Blow Torch, Drill, Ninja Rope, Bungee, Parachute, Jet Pack, Teleport, Flame Thrower, Skunk, Mad Cow,
  Concrete Donkey, Nuclear Test, Armageddon m.fl. Superwapen finns bara i lådor. Panelens layout: `docs/PANEL.md`.
- Allt ritas procedurellt och ljuden syntetiseras (WebAudio: tecknade effekter som boing, sorgsen trombon och
  fårbräkande, plus en egenkomponerad musikslinga) — inga tillgångar från originalspelet.
- Skada, radier och tider är egna kalibreringar (W:A-wikin blockerar automatisk läsning), inte exakta W:A-värden.

Kontroller (W:A): ←/→ gå, **Enter** hopp (dubbelt = bakåt), **Backspace** högt hopp (dubbelt = volt),
↑/↓ sikta, **Space** håll för kraft och släpp för att skjuta, 1–5 stubin, **F1–F12** väljer vapengrupp
(tryck igen för nästa i gruppen), högerklick/E vapenpanel, vänsterklick för målval (teleport, flyganfall,
girder, homing), R/Space roterar girder, ←/→ väljer riktning på flyganfall, Tab byter mask (Select Worm),
Home centrerar kameran, P paus, M allt ljud av, N musik av/på. B växlar studs (osäker W:A-mappning).

Visuella teman (Meadow, Desert, Arctic, Volcano, Space, Candy) är rena datablock i `src/client/themes.mjs` — se `docs/EXTENDING.md`.

Att lägga till fler vapen: se `docs/EXTENDING.md`. AI:n använder bazooka, granater, HHG, eldvapen (shotgun, uzi, handgun, minigun), närstrid och flyganfall (airstrike, napalm, mail, carpet, donkey) och walkers (sheep, sheeplauncher, supersheep, madcow, oldwoman, salvation, skunk) — inte verktyg.

## Arkitektur (förberedd för server + websockets)

```
src/core/     Ren spellogik. Ingen DOM, inga timers — körs lika bra i Node.
  game.mjs      Game: tillstånd + update() med fast steg (1/60 s). Tar emot command(), sänder events.
  ai.mjs        AI spelar via samma command()-gränssnitt som en människa.
  terrain.mjs   Terräng som bitmask. maps.mjs genererar kartor ur ett seed.
  physics.mjs   Delad fysik (även AI:ns skottsimulering). weapons.mjs: vapendata.
src/client/   Webbläsaren: renderer, indata, ljud, huvudloop. Läser bara spelets tillstånd.
server/       serve.mjs = statisk filserver.
```

Flödet är **kommando in → tillstånd + events ut**. Klienten ritar tillståndet och spelar upp `events`
(explosioner, ljud, kratrar). Därför kan samma `Game` köras auktoritativt på en server senare.

### Plan för multiplayer (inte gjort än)

1. `server/` kör en `Game` och en WebSocket (t.ex. `ws`), startbar lokalt: `npm run host`.
2. Klienter skickar bara kommandon (`input`, `jump`, `fireDown`, `useAt`, …) med sitt lag-id;
   servern validerar att det är lagets tur (det gör `Game.applyCommand` redan).
3. Servern skickar `seed` + lagdefinition vid start (kartan genereras identiskt av seedet) och sedan
   per tick/några ticks: `events` plus en kompakt ögonblicksbild (worms, objects, crates, wind, turn).
   Klienten tillämpar ögonblicksbilden och spelar `events` — samma renderare som idag.
4. Att lägga till: `Game.snapshot()` / `applySnapshot()`, lobby (namn, lag, färg), reconnect,
   och att AI-lag kan köras serverside (`AiBrain` ligger redan i `core`).

Notera: simuleringen använder `Math.sin/cos`, som kan avvika mellan webbläsarmotorer; därför
auktoritativ server + ögonblicksbilder i stället för ren lockstep.

## Idéer framåt

Fler vapen (Homing, Mortar, Baseball Bat, Blowtorch, Drill, Jet Pack, Bungee), vattenminor/oljefat,
kartväljare/egen terräng från bild, lagets egna röster/gravstenar, replay, fler AI-personligheter.
