// Builds about/map-data.js: the world land shape, India's outline and every pin, all pre-projected.
// Run: npm i d3-geo topojson-client world-atlas && node scripts/build-map.mjs
// To add a place, add a line to PINS and run it again. Format: [name, group, latitude, longitude].
import { readFileSync, writeFileSync } from "node:fs";
import { geoNaturalEarth1, geoPath, geoCentroid } from "d3-geo";
import { feature } from "topojson-client";

const read = (f) => JSON.parse(readFileSync(new URL(`./node_modules/world-atlas/${f}`, import.meta.url)));
const W = 1000, H = 520;

const PINS = [
  // World
  ["Hong Kong", "world", 22.32, 114.17], ["Macau", "world", 22.2, 113.54], ["Thailand", "world", 13.75, 100.5],
  ["Singapore", "world", 1.35, 103.82], ["Dubai", "world", 25.2, 55.27], ["Switzerland", "world", 46.8, 8.2],
  ["Paris", "world", 48.86, 2.35], ["Austria", "world", 47.6, 14.1], ["Indonesia", "world", -8.65, 115.2],
  ["Mauritius", "world", -20.2, 57.5], ["Sri Lanka", "world", 7.87, 80.77], ["Iceland", "world", 64.96, -19.02],
  // USA
  ["Acadia, Maine", "usa", 44.35, -68.21], ["Vermont", "usa", 44.0, -72.7], ["Florida", "usa", 27.99, -81.76],
  ["Austin, Texas", "usa", 30.27, -97.74], ["Washington, DC", "usa", 38.91, -77.04], ["Rhode Island", "usa", 41.82, -71.41],
  ["Martha's Vineyard", "usa", 41.39, -70.62], ["California", "usa", 36.5, -119.4], ["Pennsylvania", "usa", 40.9, -77.8],
  ["Las Vegas", "usa", 36.17, -115.14], ["Grand Canyon, Arizona", "usa", 36.1, -112.1], ["New York City", "usa", 40.71, -74.0],
  // India
  ["Delhi", "india", 28.61, 77.21], ["Mumbai", "india", 19.07, 72.88], ["Agra", "india", 27.18, 78.02],
  ["Varanasi", "india", 25.32, 83.01], ["Manali", "india", 32.24, 77.19], ["Rishikesh", "india", 30.09, 78.27],
  ["Chennai", "india", 13.08, 80.27], ["Pondicherry", "india", 11.94, 79.81], ["Kerala", "india", 10.0, 76.3],
  ["Jaipur", "india", 26.91, 75.79], ["Udaipur", "india", 24.58, 73.68], ["Jodhpur", "india", 26.29, 73.02],
  ["Jaisalmer", "india", 26.92, 70.9], ["Ranthambore", "india", 26.02, 76.5], ["Goa", "india", 15.3, 74.12],
  ["Ajanta and Ellora caves", "india", 20.03, 75.18], ["Elephanta caves", "india", 18.96, 72.93], ["Lonavala", "india", 18.75, 73.41],
  ["Panchgani", "india", 17.92, 73.82], ["Mahabaleshwar", "india", 17.92, 73.66], ["Matheran", "india", 18.99, 73.27],
  ["Kolhapur", "india", 16.7, 74.24],
];

const proj = geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: "Sphere" });
const path = geoPath(proj).digits(1);

// Land, minus Antarctica (keeps the file small and the map centred on where people live).
const land = read("land-50m.json");
const landFeature = feature(land, land.objects.land);
const geoms = landFeature.features ? landFeature.features.map((f) => f.geometry) : [landFeature.geometry];
const polys = geoms
  .flatMap((g) => (g.type === "MultiPolygon" ? g.coordinates : [g.coordinates]))
  .filter((p) => geoCentroid({ type: "Polygon", coordinates: p })[1] > -58)
  // Drop specks (under 1px at world scale) except around India, where the map zooms in close.
  .filter((p) => {
    const poly = { type: "Polygon", coordinates: p };
    const [lon, lat] = geoCentroid(poly);
    return path.area(poly) >= 1 || (lon > 55 && lon < 100 && lat > 0 && lat < 40);
  });
const landFull = path({ type: "MultiPolygon", coordinates: polys });

// Simplify the coastline everywhere except near India, where the scroll zoom looks closely.
// Points inside KEEP are never dropped; elsewhere, Douglas-Peucker at TOL map units.
const TOL = 0.45;
const KEEP = [640, 110, 800, 270];
const inKeep = ([x, y]) => x > KEEP[0] && x < KEEP[2] && y > KEEP[1] && y < KEEP[3];
function rdp(pts, lo, hi, out) {
  let dmax = 0, idx = -1;
  const [ax, ay] = pts[lo], [bx, by] = pts[hi], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
  for (let i = lo + 1; i < hi; i++) {
    const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > TOL) { rdp(pts, lo, idx, out); rdp(pts, idx, hi, out); } else out.push(pts[hi]);
}
function simplifyRing(pts) {
  if (pts.length < 8) return pts;
  const keep = pts.map((p, i) => i === 0 || i === pts.length - 1 || inKeep(p));
  const out = [pts[0]]; let last = 0;
  for (let i = 1; i < pts.length; i++) if (keep[i]) { rdp(pts, last, i, out); last = i; }
  return out;
}
const landD = landFull.split("M").filter(Boolean).map((sub) => {
  const closed = sub.endsWith("Z");
  const pts = sub.replace("Z", "").split("L").map((p) => p.split(",").map(Number));
  const q = simplifyRing(pts);
  return q.length < 3 ? "" : "M" + q.map((p) => p[0] + "," + p[1]).join("L") + (closed ? "Z" : "");
}).join("");
console.log("land bytes", landFull.length, "->", landD.length);

const countries = feature(read("countries-50m.json"), read("countries-50m.json").objects.countries).features;
const indiaD = path(countries.find((c) => c.properties.name === "India"));

const pins = PINS.map(([n, g, lat, lon]) => {
  const [x, y] = proj([lon, lat]);
  return { n, g, x: +x.toFixed(1), y: +y.toFixed(1) };
});

// The box the zoom should frame: India's corners, projected.
const corners = [[68.1, 6.7], [97.4, 6.7], [68.1, 35.7], [97.4, 35.7]].map((c) => proj(c));
const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
const focus = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => +v.toFixed(1));

const out = `// Generated by scripts/build-map.mjs. Do not edit by hand.\nwindow.MAP=${JSON.stringify({ w: W, h: H, focus, land: landD, india: indiaD, pins })};\n`;
writeFileSync(new URL("../about/map-data.js", import.meta.url), out);
console.log("pins:", pins.length, "bytes:", out.length, "focus:", focus);
