// yakrobot-4wd: 4WD rover for TT motors with their stock 65 mm wheels, 2x18650,
// Arduino Nano + 2x DRV8833 and an ESP32-CAM: a rounded lower body and a sloped, filleted top cover with a proud lip where
// they meet, with the camera in a rounded pod at the front between two
// bezelled LEDs. Every part prints in one filament.
//
// Chassis frame: origin at the bottom centre of the base plate, x forward,
// y left, z up, millimetres. Every part is modelled in place, so the
// simulator's assembly offsets are all zero.
//
// Export one part:  openscad -D 'part="base_plate"' -o base_plate.stl yakrobot-4wd.scad
// Printed parts:    base_plate, top_deck, body_lower, top_cover, camera_shell, bumper
// Reference only:   motors, battery, electronics, esp32cam (bought parts)

part = "all";
$fn = 40;

// ---- key dimensions --------------------------------------------------------
plate_l = 190;  plate_w = 100;  plate_t = 3;  plate_r = 10;
axle_x = 65;                    // half the 130 mm wheelbase
motor_outer_y = 47;             // gearbox outer face; shafts exit here
deck_z = 33;  deck_t = 3;  deck_l = 170;  deck_w = 92;
standoff_x = 80;  standoff_y = 22;  standoff_d = 7;   // inside the body shell, clear of motors and battery
// body: lower ring + top cover (with its proud lip), on the plate behind the bumper
body_x0 = -95;  body_x1 = 89;  body_w = 100;  body_wall = 2;  body_r = 14;
lower_top = 35;  band_h = 4;                      // lower ring z 3..35, cover lip 35..39
cover_rear = 58;  cover_front = 52;  cover_fillet = 9;   // sloped, filleted top
// bumper: an LED block each side of the camera, joined by a bar under it
bumper_x0 = 89;  bumper_x1 = 108;  bumper_w = 90;  bumper_h = 38;  bumper_gap = 38;
led_y = 32;  led_z = 26;  led_d = 20;
// camera shell: in the middle of the front, ESP32-CAM upright, lens near the top
shell_x0 = 89;  shell_d = 22;  shell_w = 34;  shell_h = 48;  shell_wall = 2;  shell_z0 = 3;
lens_z = 38;  cam_pitch = 8;   // degrees nose-down

// ---- TT gear motor (approximate; check against your motors) ---------------
tt_t = 18.8;          // thickness along the shaft
tt_h = 22.5;          // height
tt_box = 46;          // gearbox length
tt_shaft_from_end = 11.5;
tt_can_r = 10;  tt_can_l = 20;
shaft_z = plate_t + tt_h / 2;   // 14.25: the axle height

module rounded_rect(l, w, t, r) {
  linear_extrude(t) offset(r) square([l - 2 * r, w - 2 * r], center = true);
}

// sx = +1 front / -1 rear, sy = +1 left / -1 right
module tt_motor(sx, sy) {
  y0 = sy > 0 ? motor_outer_y - tt_t : -motor_outer_y;
  x_end = sx * (axle_x + tt_shaft_from_end);       // outer end of the gearbox
  x_in = x_end - sx * tt_box;                      // inner end, where the can starts
  translate([min(x_end, x_in), y0, plate_t]) cube([tt_box, tt_t, tt_h]);
  translate([x_in, y0 + tt_t / 2, shaft_z]) rotate([0, sx > 0 ? -90 : 90, 0]) cylinder(r = tt_can_r, h = tt_can_l);
  // short shaft stub on the inner side (the outer one is drawn by the simulator)
  translate([sx * axle_x, sy > 0 ? y0 : y0 + tt_t, shaft_z]) rotate([sy > 0 ? 90 : -90, 0, 0]) cylinder(d = 5.4, h = 8);
}

module motor_tab(sx, sy) {
  // vertical tab against the gearbox inner face, two M3 holes through to the motor
  y_in = sy > 0 ? motor_outer_y - tt_t - 3 : -motor_outer_y + tt_t;
  x_lo = sx > 0 ? axle_x - 26 : -axle_x + 2;
  difference() {
    translate([x_lo, y_in, plate_t - 0.01]) cube([24, 3, tt_h]);
    for (dx = [5, 19]) translate([x_lo + dx, y_in - 1, shaft_z]) rotate([-90, 0, 0]) cylinder(d = 3.2, h = 5);
  }
}

module standoffs(h) {
  for (x = [-standoff_x, standoff_x], y = [-standoff_y, standoff_y])
    translate([x, y, 0]) difference() {
      cylinder(d = standoff_d, h = h);
      translate([0, 0, -1]) cylinder(d = 2.8, h = h + 2);
    }
}

module base_plate() {
  difference() {
    rounded_rect(plate_l, plate_w, plate_t, plate_r);
    // wiring slots and weight-saving windows
    for (x = [-35, 35]) translate([x, 0, -1]) rounded_rect(30, 14, plate_t + 2, 6);
    translate([0, 0, -1]) cylinder(d = 16, h = plate_t + 2);
    // bumper screws
    for (y = [-30, 30]) translate([92, y, -1]) cylinder(d = 3.2, h = plate_t + 2);
  }
  for (sx = [-1, 1], sy = [-1, 1]) motor_tab(sx, sy);
  translate([0, 0, plate_t - 0.01]) standoffs(deck_z - plate_t + 0.01);
}

module top_deck() {
  translate([0, 0, deck_z]) difference() {
    rounded_rect(deck_l, deck_w, deck_t, 8);
    for (x = [-standoff_x, standoff_x], y = [-standoff_y, standoff_y]) translate([x, y, -1]) cylinder(d = 3.2, h = deck_t + 2);
    translate([0, 0, -1]) rounded_rect(40, 22, deck_t + 2, 8);                 // cable pass-through
  }
}

module rounded_box(size, r) {
  // box from the origin, every edge rounded by r
  hull() for (x = [r, size[0] - r], y = [r, size[1] - r], z = [r, size[2] - r]) translate([x, y, z]) sphere(r = r);
}

module camera_shell() {
  // rounded pod: closed front and sides, open at the back for the cable; the
  // board sits in two slots and looks out through a bezelled lens window
  z0 = shell_z0;
  lens_at = [shell_x0 + shell_d, 0, lens_z];
  difference() {
    union() {
      translate([shell_x0, -shell_w / 2, z0]) rounded_box([shell_d, shell_w, shell_h], 5);
      translate(lens_at) rotate([0, 90 - cam_pitch, 0]) cylinder(d = 19, h = 2);   // bezel
    }
    translate([shell_x0 - 1, -shell_w / 2 + shell_wall, z0 + shell_wall]) cube([shell_d - shell_wall + 1, shell_w - 2 * shell_wall, shell_h - 2 * shell_wall]);
    translate(lens_at + [-shell_wall - 1, 0, 0]) rotate([0, 90 - cam_pitch, 0]) cylinder(d1 = 11, d2 = 15, h = shell_wall + 4);
    for (y = [-10, 10]) translate([shell_x0 + shell_d / 2 + 4, y, z0 - 1]) cylinder(d = 3.2, h = shell_wall + 2);
  }
  for (y = [-1, 1]) translate([shell_x0 + shell_d - 9, y * (shell_w / 2 - shell_wall - 1.5) - 1.5, z0 + shell_wall]) cube([1.5, 3, shell_h - 2 * shell_wall]);
}

module bumper() {
  difference() {
    union() {
      // LED blocks either side of the camera shell, rounded, with LED bezels
      for (sy = [-1, 1]) translate([bumper_x0, sy > 0 ? bumper_gap / 2 : -bumper_w / 2, 0])
        rounded_box([bumper_x1 - bumper_x0, (bumper_w - bumper_gap) / 2, bumper_h], 4);
      for (y = [-led_y, led_y]) translate([bumper_x1 - 0.5, y, led_z]) rotate([0, 90, 0]) cylinder(d = led_d + 4, h = 2);
      // bar under the camera shell
      translate([bumper_x0, -bumper_w / 2, 0]) cube([shell_x0 + shell_d - bumper_x0, bumper_w, shell_z0]);
    }
    // the base plate slots into the back of the bumper
    translate([bumper_x0 - 1, -plate_w / 2 - 1, -0.01]) cube([95 - bumper_x0 + 1, plate_w + 2, plate_t + 0.2]);
    // COB LED pockets
    for (y = [-led_y, led_y]) translate([bumper_x1 - 4, y, led_z]) rotate([0, 90, 0]) cylinder(d = led_d, h = 5);
    // screws up into the plate
    for (y = [-30, 30]) translate([92, y, -1]) cylinder(d = 3.2, h = 12);
  }
}

// ---- body ------------------------------------------------------------------
body_l = body_x1 - body_x0;
body_cx = (body_x0 + body_x1) / 2;

// rounded-rectangle ring, slightly drafted (narrower at the top), z from z0, height h
module ring(z0, h, inset = 0, draft = 0.985) {
  translate([body_cx, 0, z0]) linear_extrude(h, scale = draft)
    offset(body_r - inset) square([body_l - 2 * body_r, body_w - 2 * body_r], center = true);
}

module shaft_slots() {
  for (sx = [-1, 1], sy = [-1, 1]) translate([sx * axle_x, sy * (body_w / 2 - body_wall / 2), plate_t - 0.01]) {
    translate([-5, -body_wall * 2, 0]) cube([10, 4 * body_wall, shaft_z - plate_t]);
    translate([0, 0, shaft_z - plate_t]) rotate([90, 0, 0]) cylinder(d = 10, h = 4 * body_wall, center = true);
  }
}

module body_lower() {
  h = lower_top - plate_t;
  difference() {
    ring(plate_t, h);
    ring(plate_t - 1, h + 2, body_wall);
    shaft_slots();
    // panel line all round
    difference() {
      ring(plate_t + 17, 1.2, -1, 1);
      ring(plate_t + 16, 3.2, 0.6, 1);
    }
    // camera cable pass-through and rear switch / USB
    translate([body_x1 - body_r, -10, plate_t + 8]) cube([body_r + 2, 20, 20]);
    translate([body_x0 - 2, -20, 12]) cube([body_r, 12, 8]);
    translate([body_x0 - 2, 8, 13]) cube([body_r, 10, 5]);
  }
}

// proud lip at the bottom of the top cover, printed as part of the cover
module cover_lip() {
  difference() {
    ring(lower_top, band_h, -0.8, 1);
    ring(lower_top - 1, band_h + 2, body_wall, 1);
  }
}

// solid of the top cover: a straight skirt, then a top whose edge is a true
// quarter-circle fillet, sheared so the top slopes down toward the nose.
// inset = 0 gives the outer skin, inset = body_wall the inner one.
module cover_solid(inset) {
  f = cover_fillet;
  z0 = lower_top + band_h;
  top_c = (cover_rear + cover_front) / 2;          // top height at the body centre
  k = (cover_front - cover_rear) / body_l;         // dz per mm forward
  hull() {
    ring(z0, 4, inset, 1);
    multmatrix([[1, 0, 0, 0], [0, 1, 0, 0], [k, 0, 1, -k * body_cx], [0, 0, 0, 1]])
      for (a = [0 : 15 : 90])
        ring(top_c - f + (f - inset) * sin(a) - 0.01, 0.01, inset + (f - inset) * (1 - cos(a)), 1);
  }
}

module top_cover() {
  z0 = lower_top + band_h;
  cover_lip();
  difference() {
    cover_solid(0);
    cover_solid(body_wall);
    ring(z0 - 1, 6, body_wall, 1);                 // open underneath
    // rear vents
    for (i = [0 : 4]) translate([-80 + i * 7, -18, cover_rear - 8]) cube([3, 36, 12]);
    // engraved name, 0.8 mm deep, following the slope; reads from behind the rover
    k = (cover_front - cover_rear) / body_l;
    top_here = (cover_rear + cover_front) / 2 + k * (5 - body_cx);
    translate([5, 0, top_here]) rotate([0, -atan(k), 0]) translate([0, 0, -0.8]) linear_extrude(5)
      rotate([0, 0, -90]) text("YAK", size = 16, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
  }
}

module motors() { for (sx = [-1, 1], sy = [-1, 1]) tt_motor(sx, sy); }

module battery() {
  // 2x18650 holder, centred between the motors
  translate([-38.5, -20.5, plate_t]) cube([77, 41, 21]);
}

module electronics() {
  translate([-62, 8, deck_z + deck_t]) cube([43, 18, 8]);                     // Arduino Nano on a carrier
  for (y = [-30, 12]) translate([-10, y, deck_z + deck_t]) cube([18, 16, 6]);  // 2x DRV8833
  translate([20, -12, deck_z + deck_t]) cube([24, 24, 9]);                     // IP5306 charger / switch
}

module esp32cam() {
  // board upright in the shell, lens module tilted to match the window
  translate([shell_x0 + shell_d - 10, -13.5, shell_z0 + shell_wall + 2]) cube([1.6, 27, 40]);
  translate([shell_x0 + shell_d - 8.4, 0, lens_z]) rotate([0, 90 - cam_pitch, 0]) cylinder(d = 8, h = 8);
}

if (part == "base_plate") base_plate();
else if (part == "top_deck") top_deck();
else if (part == "camera_shell") camera_shell();
else if (part == "body_lower") body_lower();
else if (part == "top_cover") top_cover();
else if (part == "bumper") bumper();
else if (part == "motors") motors();
else if (part == "battery") battery();
else if (part == "electronics") electronics();
else if (part == "esp32cam") esp32cam();
else {
  color("#2d3138") base_plate();
  color("#3c434c") top_deck();
  color("#e8902a") body_lower();
  color("#1f8a70") top_cover();
  color("#e8902a") camera_shell();
  color("#2d3138") bumper();
  color("#f2d33c") motors();
  color("#3a6fb0") battery();
  color("#7a3db8") electronics();
  color("#222222") esp32cam();
}
