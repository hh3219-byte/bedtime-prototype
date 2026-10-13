// Run: node test.js. Fake real time tests the actual browser script deterministically.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

class Element {
  constructor() {
    this.children = [];
    this.hidden = false;
    this.disabled = false;
    this.listeners = {};
    this.attributes = {};
    this.style = { setProperty: (name, value) => { this.style[name] = value; } };
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name)
    };
  }
  set textContent(value) { this.text = String(value); }
  get textContent() { return this.text || ""; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() {}
  click() { if (!this.disabled) this.listeners.click.call(this); }
}

const nodes = {};
const markup = fs.readFileSync(path.join(__dirname, "codepen.html"), "utf8");
for (const match of markup.matchAll(/id="([^"]+)"/g)) {
  assert.ok(!nodes["#" + match[1]], "Duplicate HTML id");
  nodes["#" + match[1]] = new Element();
}
let now = 0;
let frameCounter = 0;
const frames = new Map();
const document = {
  hidden: false,
  listeners: {},
  querySelector: (selector) => {
    assert.ok(nodes[selector], "Missing HTML target: " + selector);
    return nodes[selector];
  },
  createElement: () => new Element(),
  addEventListener(name, callback) { this.listeners[name] = callback; }
};
const context = vm.createContext({
  document,
  performance: { now: () => now },
  requestAnimationFrame: (callback) => { frames.set(++frameCounter, callback); return frameCounter; },
  cancelAnimationFrame: (id) => frames.delete(id)
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "script.js"), "utf8"), context);
function read(expression) { return vm.runInContext(expression, context); }
function step(milliseconds) {
  now += milliseconds;
  const queued = [...frames.values()];
  frames.clear();
  queued.forEach((callback) => callback(now));
}
function click(id) { nodes[id].click(); }
function reset() { document.hidden = false; read("restart()"); }
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 0.000001, actual + " != " + expected); }

assert.equal(nodes["#clock"].textContent, "3:00 AM");
assert.equal(nodes["#summary"].hidden, true);
assert.equal(nodes["#decision"].hidden, false);
assert.equal(nodes["#nextItem"].disabled, true);
assert.equal(frames.size, 0);
click("#stopAnytime");
assert.equal(nodes["#finalCount"].textContent, "0");
assert.equal(nodes["#finalDelay"].textContent, "0 sec");
assert.equal(nodes["#actualStop"].textContent, "3:00:00 AM");

reset();
click("#five");
assert.equal(nodes["#decision"].hidden, true);
assert.equal(nodes["#nextItem"].disabled, false);
assert.equal(nodes["#stage"].classList.contains("paused"), false);
assert.equal(frames.size, 1);
read("postpone(10)");
assert.equal(read("postponements.length"), 1); // An active extension cannot be queued twice.
step(2000);
assert.equal(nodes["#clockDetail"].textContent, "3:00:30 AM");
step(8000);
assert.equal(nodes["#clockDetail"].textContent, "3:02:30 AM");
assert.equal(nodes["#timeline"].children.length, 0); // History is built only after stopping.
click("#nextItem");
assert.equal(nodes["#videoTitle"].textContent, "Can it find the gap?");
assert.equal(read("clipElapsed"), 0);
assert.equal(nodes["#nextStop"].textContent, "3:05 AM");
step(4000);
click("#stopAnytime");
assert.equal(nodes["#actualStop"].textContent, "3:03:30 AM");
assert.equal(nodes["#finalDelay"].textContent, "3 min 30 sec");
assert.equal(nodes["#finalCount"].textContent, "1");
assert.match(nodes["#timeline"].children[0].children[0].textContent, /viewed 3 min 30 sec \(partial extension\)/);
assert.equal(nodes["#delayStrip"].children[0].style.width, "21px");
assert.equal(frames.size, 0);
step(60000);
assert.equal(nodes["#actualStop"].textContent, "3:03:30 AM");

reset();
click("#five");
step(20000);
assert.equal(nodes["#clockDetail"].textContent, "3:05:00 AM");
assert.equal(nodes["#decision"].hidden, false);
assert.equal(nodes["#stage"].classList.contains("paused"), true);
assert.equal(frames.size, 0);
step(60000); // Waiting at a stopping-point choice does not add delay.
assert.equal(nodes["#clockDetail"].textContent, "3:05:00 AM");
click("#ten");
step(10000);
click("#stopAnytime");
assert.equal(nodes["#finalDelay"].textContent, "7 min 30 sec");
assert.equal(nodes["#finalCount"].textContent, "2");
assert.equal(nodes["#actualStop"].textContent, "3:07:30 AM");
assert.match(nodes["#timeline"].children[0].children[0].textContent, /completed/);
assert.match(nodes["#timeline"].children[1].children[0].textContent, /partial extension/);
near(read("postponements.reduce(function(sum, entry) { return sum + entry.end - entry.start; }, 0)"), read("currentTime - originalBedtime"));

reset();
click("#ten");
now += 12345; // Stop between frames; do not lose the final fraction of viewing time.
click("#stopAnytime");
assert.equal(nodes["#finalDelay"].textContent, "3 min 5 sec");
assert.equal(nodes["#actualStop"].textContent, "3:03:05 AM");

reset();
click("#five");
now += 1000;
click("#clockButton");
const [staleFrameId, staleFrame] = [...frames][0];
frames.delete(staleFrameId);
staleFrame(now - 10); // A frame timestamp can precede a click within the same frame.
step(1000);
near(read("currentTime - originalBedtime"), 30);

reset();
click("#five");
now += 25000;
click("#clockButton"); // Hitting the boundary outside tick must cancel the old frame.
assert.equal(frames.size, 0);
assert.equal(nodes["#clockDetail"].textContent, "3:05:00 AM");
click("#five");
assert.equal(frames.size, 1);
step(20000);
click("#stop");
assert.equal(nodes["#finalDelay"].textContent, "10 min 0 sec");

reset();
click("#ten");
now += 500;
document.hidden = true;
document.listeners.visibilitychange();
near(read("currentTime - originalBedtime"), 7.5);
assert.equal(frames.size, 0);
step(30000);
document.hidden = false;
document.listeners.visibilitychange();
assert.equal(frames.size, 1);
step(1000);
click("#stopAnytime");
assert.equal(nodes["#finalDelay"].textContent, "22 sec");

reset();
for (let i = 0; i < 13; i++) { click("#ten"); step(40000); }
assert.equal(nodes["#clockDetail"].textContent, "5:10:00 AM");
assert.equal(read("hasStopped"), false);
click("#five");
step(1000);
assert.equal(read("isViewing"), true);
click("#stopAnytime");
assert.equal(nodes["#finalDelay"].textContent, "2 h 10 min 15 sec");
assert.equal(nodes["#finalCount"].textContent, "14");

reset();
for (let i = 0; i < 126; i++) { click("#ten"); step(40000); }
assert.equal(nodes["#clockDetail"].textContent, "12:00:00 AM (+1 day)");
click("#stop");
assert.equal(nodes["#finalDelay"].textContent, "21 h 0 min 0 sec");
assert.equal(read("formatTime(43200)"), "12:00 PM");

reset();
click("#ten");
for (let i = 0; i < 5; i++) { step(500); click("#nextItem"); }
assert.equal(nodes["#videoTitle"].textContent, "The last tile");
assert.equal(read("clipIndex"), 5);
near(read("currentTime - originalBedtime"), 37.5);
click("#clockButton");
assert.equal(nodes["#clockPanel"].hidden, false);
read("restart()");
assert.equal(frames.size, 0);
assert.equal(nodes["#clockPanel"].hidden, true);
assert.equal(nodes["#timeline"].children.length, 0);
assert.equal(nodes["#delayStrip"].children.length, 0);
assert.equal(read("clipIndex"), 0);
assert.equal(read("clipElapsed"), 0);
assert.equal(nodes["#clock"].textContent, "3:00 AM");
assert.equal(nodes["#summary"].hidden, true);
assert.equal(nodes["#decision"].hidden, false);
assert.equal(read("postponements.length"), 0);
console.log("PASS: gradual timing, browsing, prompts, partial stops, summaries, history, visibility pause, restart, hour/day boundaries, no forced cutoff.");
