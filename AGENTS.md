# AGENTS.md — yakrobot-simulator

Static browser simulator for 4WD skid-steer rovers (Vite + TypeScript + three.js + MuJoCo
WASM). It has no backend and no network calls at runtime. Architecture, module map and
data contracts are in [README.md](README.md). Read it first.

## Layout

```
src/main.ts      wiring: options, UI, fixed-step loop, robot/physics switching, host API
src/input/       keyboard, joystick, gamepad -> InputHub (deadband, merge); Actions
src/control/     robot.json contract + pure skid-steer controller and watchdog
src/physics/     PhysicsBackend interface; mujoco.ts + mjcf.ts; simple.ts
src/sim/         fixed-step loop and the simple vehicle/collision model
src/robots/      profile registry (robots/*/robot.json + assembly.json)
src/world/       room.ts (shared by both backends and the renderer), claw geometry
src/render/      three.js scene, room, rover, onboard camera (read-only on SimState)
src/embed/       query-param options and postMessage command parsing
robots/<id>/     robot.json, assembly.json, optional cad.json + cad/*.scad
scripts/         build-cad.ts (OpenSCAD -> STL), build-model.ts (STL -> GLB)
tests/           vitest
```

## Commands

```bash
npm ci
npm run dev                 # http://localhost:5173 (add -- --host <ip> to expose)
npm test                    # vitest, must pass before every commit
npx tsc --noEmit            # type-check
npm run build               # tsc + vite build -> dist/
npm run cad -- yakrobot-4wd # needs openscad
npm run model               # STLs -> public/models/<id>.glb
```

## Rules

- **Commits:** every commit is `git commit -S -s`. Never use `--no-verify`. Stage files by name,
  never `git add -A` / `git add .`. Short subject, at most a couple of short body lines.
- **Ask first** before pushing, using `gh`, or changing anything on GitHub.
- **Never run `wrangler login` or `wrangler deploy`, or change Cloudflare settings.** Deploys
  are the user's action. Prepare the config, then stop.
- **Never commit third-party models or build outputs.** The repo is Apache-2.0: only our own
  designs (`robots/<id>/cad/*.scad`) go in. STLs, GLBs and `*.zip` are gitignored. Keep them
  that way.
- **The robot is data.** Dimensions, limits and physics constants live in
  `robots/<id>/robot.json` / `assembly.json`, not in code. If you change a robot's
  geometry, update its `.scad`, `robot.json` and `assembly.json` together.
  `tests/profiles.test.ts` checks that they agree.
- **Don't invent measurements.** New or changed physics values get a `provenance` entry.
  Estimates are tagged `provisional`.
- **One room.** `src/world/room.ts` is the single scene description. Both physics backends
  and the renderer read it. Don't duplicate geometry elsewhere.
- **The renderer only reads `SimState`.** Simulation state changes only in a
  `PhysicsBackend`.
- **Both backends implement the same interface.** A feature that affects motion must work
  (or degrade sensibly) in `simple` as well as `mujoco`.
- **Embed API is a contract.** `src/embed/api.ts` validates every message, `parent` pins the
  origin, and theme params accept hex colours only. Keep `tests/embed.test.ts`,
  the README's embed section and `public/embed-example.html` in step with any change.
- **Tests never touch the network.** MuJoCo runs under Node in vitest.
- Out of scope unless asked: a backend server, mecanum wheels, non-skid-steer drive.
