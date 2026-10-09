# yakrobot-4wd

4WD rover designed for this simulator, on the stock 65 mm TT wheels: a rounded lower body and a sloped, filleted top cover with a proud lip, with the ESP32-CAM
in a rounded pod at the front between two bezelled LEDs. Everything prints in one filament;
the colours in the simulator are only for telling the parts apart. Electronics: 4 TT gear
motors, Arduino Nano + 2x DRV8833, ESP32-CAM, 2x18650. Source: [`cad/yakrobot-4wd.scad`](cad/yakrobot-4wd.scad) (OpenSCAD).

```
npm run cad -- yakrobot-4wd     # export STLs to robots/yakrobot-4wd/stl/
npm run model -- yakrobot-4wd   # build public/models/yakrobot-4wd.glb for the simulator
```

## Parts

| Part | Print | Notes |
|---|---|---|
| `base_plate` | Flat, as modelled. No supports | 190 x 100 x 3 mm plate with motor tabs and 30 mm standoffs |
| `top_deck` | Flat | 170 x 92 x 3 mm electronics deck (inside the body shell) |
| `body_lower` | Upright | Rounded, slightly drafted lower body (32 mm tall, 2 mm walls) with a panel line. U slots drop over the motor shafts; rear holes for the switch and USB charging |
| `top_cover` | Upside down (top on the bed); no supports | Rounded top with a 9 mm fillet, sloping from 58 mm at the rear to 52 mm at the nose; a 0.8 mm proud lip where it meets the body; rear vents and an engraved "YAK" |
| `camera_shell` | Upright on its base, no supports | Rounded ESP32-CAM pod in the middle of the front, open at the back for the cable. Bezelled lens window ~56 mm off the floor, tilted 8° down |
| `bumper` | On its back face | Rounded LED block each side of the camera pod (20 mm COB pockets with bezel rings), joined by a bar the pod sits on; the claw mounts in front |
| `motors`, `battery`, `electronics`, `esp32cam` | Not printed | Reference shapes for the bought parts, used by the simulator |

## Hardware (estimate)

- 4x TT gear motor (1:48) with the stock 65 mm yellow TT wheels
- 8x M3 x 30 bolts + nuts (motors to tabs), 8x M3 x 8 (deck to standoffs, camera shell, bumper), 4x M3 x 6 (body to plate)
- 2x18650 holder, IP5306 charger/switch board, Arduino Nano, 2x DRV8833, ESP32-CAM
- 2x COB LED, optional SG90 servos for the claw (simulator accessory)

## Key dimensions

Wheelbase 130 mm, track 136 mm, axle 14.25 mm above the plate bottom, ground clearance
~18 mm on the 65 mm TT wheels. All of these live as named variables at the top of the `.scad`
file. If you change them, update `robot.json` and `assembly.json` to match; the profile
tests check that the axle, wheelbase, claw and camera still agree.

The TT motor shape is approximate. Measure your motors' mounting holes before printing
the base plate.
