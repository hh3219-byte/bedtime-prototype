// State uses simulated seconds since midnight, including fractional seconds.
const originalBedtime = 3 * 60 * 60;
const simulatedSecondsPerMs = (5 * 60) / (20 * 1000);
let currentTime = originalBedtime;
let nextStop = originalBedtime;
let postponements = [];
let isViewing = false;
let hasStopped = false;
let lastTick = null;
let frameId = null;
let clipIndex = 0;
let clipElapsed = 0;

const stage = document.querySelector("#stage");
const decision = document.querySelector("#decision");
const nextButton = document.querySelector("#nextItem");
const clockPanel = document.querySelector("#clockPanel");
const thoughts = [
  "I'm not ready to stop.",
  "Just one more.",
  "Losing half an hour should be okay.",
  "Losing a little sleep should be okay."
];

// These are small, scripted scenes, not real videos or predictions of behavior.
const clips = [
  { title: "The last tile", creator: "@little.patterns", accent: "#c9b3ff", wash: "#392b4a",
    hints: [[0, "Wait for the last piece."], [3500, "A few more pieces to go…"], [8000, "Every piece found its place."]] },
  { title: "Can it find the gap?", creator: "@small.detours", accent: "#9cd6cf", wash: "#234044",
    hints: [[0, "One ball. Three turns."], [4500, "There is a way through…"], [10000, "And it made it home."]] },
  { title: "One line becomes a place", creator: "@quiet.sketches", accent: "#edc89a", wash: "#42382c",
    hints: [[0, "A little scene, line by line."], [5000, "Something is taking shape…"], [11500, "A cabin under the mountains."]] },
  { title: "A tiny solar system", creator: "@slow.orbits", accent: "#bba1f0", wash: "#292740",
    hints: [[0, "It starts with one small sun."], [3500, "Another orbit appears…"], [7500, "A whole little world, still moving."]] },
  { title: "Guess the picture", creator: "@pixel.by.pixel", accent: "#f29aad", wash: "#40293c",
    hints: [[0, "What will these pixels make?"], [3500, "Almost enough to guess…"], [8000, "A little heart."]] }
];

function formatTime(seconds, includeSeconds = false) {
  const whole = Math.floor(seconds + 0.000001);
  const days = Math.floor(whole / 86400);
  const hour = Math.floor((whole % 86400) / 3600);
  const minute = String(Math.floor((whole % 3600) / 60)).padStart(2, "0");
  const second = includeSeconds ? ":" + String(whole % 60).padStart(2, "0") : "";
  const dayLabel = days ? " (+" + days + " day" + (days === 1 ? "" : "s") + ")" : "";
  return (hour % 12 || 12) + ":" + minute + second + (hour >= 12 ? " PM" : " AM") + dayLabel;
}

function formatDelay(seconds) {
  const whole = Math.max(0, Math.floor(seconds + 0.000001));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  return (hours ? hours + " h " : "") + (hours || minutes ? minutes + " min " : "") + (whole % 60) + " sec";
}

function updateClock() {
  document.querySelector("#clock").textContent = formatTime(currentTime);
  document.querySelector("#clockDetail").textContent = formatTime(currentTime, true);
  document.querySelector("#nextStop").textContent = formatTime(nextStop);
}

function hideClockPanel() {
  clockPanel.hidden = true;
  document.querySelector("#clockButton").setAttribute("aria-expanded", "false");
}

function updateHint() {
  const hints = clips[clipIndex % clips.length].hints;
  let text = hints[0][1];
  hints.forEach(function (hint) {
    if (clipElapsed >= hint[0]) text = hint[1];
  });
  document.querySelector("#clipHint").textContent = text;
}

function showThought() {
  // Variation is for presentation; it does not model tiredness or desire.
  const thought = "“" + thoughts[(clipIndex + postponements.length) % thoughts.length] + "”";
  document.querySelector("#thought").textContent = thought;
  document.querySelector("#decisionThought").textContent = thought;
}

function makeClipArt(index) {
  if (index === 0) {
    let tiles = "";
    for (let i = 0; i < 16; i++) tiles += '<div class="tile" style="--i:' + (i - 3) + '"></div>';
    return '<div class="tile-grid">' + tiles + '</div>';
  }
  if (index === 1) {
    return '<div class="arena"><div class="ledge one"></div><div class="ledge two"></div><div class="ledge three"></div><div class="goal"></div><div class="marble"></div></div>';
  }
  if (index === 2) {
    return '<svg class="drawing" viewBox="0 0 320 280" aria-hidden="true"><path pathLength="1" d="M20 145 L83 50 L133 114 L190 25 L300 145 M20 237 H300 M83 230 V151 L157 93 L231 151 V230 M70 156 L157 85 L244 156 M140 230 V182 H176 V230 M39 222 V145 M19 173 L39 140 L59 173 M21 194 L39 160 L57 194 M271 222 V145 M251 173 L271 140 L291 173 M253 194 L271 160 L289 194"/><path class="window" pathLength="1" d="M101 166 H126 V191 H101 Z M113 166 V191 M101 179 H126 M189 166 H214 V191 H189 Z M201 166 V191 M189 179 H214"/></svg>';
  }
  if (index === 3) {
    return '<div class="solar"><div class="sun"></div><div class="orbit one"><div class="planet"></div></div><div class="orbit two"><div class="planet"></div></div><div class="orbit three"><div class="planet"></div></div></div>';
  }
  const picture = ["000000000", "011001100", "111111110", "111111110", "011111100", "001111000", "000110000", "000000000", "000000000"].join("");
  let pixels = "";
  for (let i = 0; i < picture.length; i++) {
    pixels += '<div class="pixel' + (picture[i] === "1" ? " filled" : "") + '" style="--i:' + i + '"></div>';
  }
  return '<div class="pixel-grid">' + pixels + '</div>';
}

function showClip() {
  const index = clipIndex % clips.length;
  const clip = clips[index];
  document.querySelector("#clipArt").innerHTML = makeClipArt(index);
  document.querySelector("#videoTitle").textContent = clip.title;
  document.querySelector("#creator").textContent = clip.creator;
  document.querySelector("#videoNumber").textContent = "SIMULATED ITEM " + String(clipIndex + 1).padStart(2, "0");
  document.querySelector("#upNext").textContent = "Up next: " + clips[(index + 1) % clips.length].title;
  stage.style.setProperty("--accent", clip.accent);
  stage.style.setProperty("--wash", clip.wash);
  updateHint();
  showThought();
}

function showDecision() {
  decision.hidden = false;
  nextButton.disabled = true;
  stage.classList.add("paused");
  document.querySelector("#decisionTitle").textContent = postponements.length ? "I said I'd stop at " + formatTime(nextStop) + "." : "I planned to stop at 3:00 AM.";
  showThought();
  document.querySelector("#five").focus();
}

function syncTime(now) {
  if (!isViewing || lastTick === null) return;
  // Use elapsed real time, not frame counts. Clamp at the chosen stopping point.
  const realNow = Math.max(now, lastTick);
  const realMs = Math.min(realNow - lastTick, (nextStop - currentTime) / simulatedSecondsPerMs);
  currentTime = Math.min(nextStop, currentTime + realMs * simulatedSecondsPerMs);
  clipElapsed += realMs;
  lastTick = realNow;
  updateClock();
  updateHint();
  if (currentTime >= nextStop - 0.000001) {
    currentTime = nextStop;
    postponements[postponements.length - 1].end = currentTime;
    cancelAnimationFrame(frameId);
    frameId = null;
    isViewing = false;
    lastTick = null;
    updateClock();
    showDecision();
  }
}

function tick(now) {
  frameId = null;
  if (!isViewing || hasStopped || document.hidden) return;
  syncTime(now);
  if (isViewing) frameId = requestAnimationFrame(tick);
}

function postpone(minutes) {
  if (isViewing || hasStopped || document.hidden) return;
  nextStop = currentTime + minutes * 60;
  postponements.push({ start: currentTime, plannedEnd: nextStop, minutes: minutes, end: null });
  isViewing = true;
  decision.hidden = true;
  hideClockPanel();
  nextButton.disabled = false;
  stage.classList.remove("paused");
  updateClock();
  showThought();
  lastTick = performance.now();
  frameId = requestAnimationFrame(tick);
}

function nextItem() {
  if (!isViewing || hasStopped) return;
  syncTime(performance.now());
  if (!isViewing) return;
  clipIndex++;
  clipElapsed = 0;
  hideClockPanel();
  showClip(); // Browsing resets the scene, not the clock or stopping point.
}

function buildTimeline() {
  const timeline = document.querySelector("#timeline");
  const strip = document.querySelector("#delayStrip");
  timeline.replaceChildren();
  strip.replaceChildren();
  document.querySelector("#emptyHistory").hidden = postponements.length > 0;
  postponements.forEach(function (extension) {
    const elapsed = extension.end - extension.start;
    const partial = elapsed < extension.minutes * 60 - 0.000001;
    const entry = document.createElement("li");
    entry.textContent = "Requested +" + extension.minutes + " min · planned stop " + formatTime(extension.plannedEnd);
    const detail = document.createElement("span");
    detail.textContent = formatTime(extension.start, true) + " → " + formatTime(extension.end, true) + " · viewed " + formatDelay(elapsed) + (partial ? " (partial extension)" : " (completed)");
    entry.appendChild(detail);
    timeline.appendChild(entry);
    const block = document.createElement("span");
    block.style.width = elapsed / 60 * 6 + "px";
    strip.appendChild(block);
  });
}

function stopWatching() {
  if (hasStopped) return;
  syncTime(performance.now()); // Include time since the last animation frame.
  hasStopped = true;
  isViewing = false;
  cancelAnimationFrame(frameId);
  frameId = null;
  lastTick = null;
  stage.classList.add("paused");
  const last = postponements[postponements.length - 1];
  if (last && last.end === null) last.end = currentTime;
  document.querySelector("#feed").hidden = true;
  document.querySelector("#summary").hidden = false;
  document.querySelector("#actualStop").textContent = formatTime(currentTime, true);
  document.querySelector("#finalCount").textContent = postponements.length;
  // Sum of requested extensions is not the actual bedtime delay.
  document.querySelector("#finalDelay").textContent = formatDelay(currentTime - originalBedtime);
  buildTimeline();
  document.querySelector("#summary").scrollTop = 0;
  document.querySelector("#summaryTitle").focus();
}

function handleVisibility() {
  if (!isViewing || hasStopped) return;
  if (document.hidden) {
    syncTime(performance.now());
    cancelAnimationFrame(frameId);
    frameId = null;
    lastTick = null;
    stage.classList.add("paused");
  } else {
    lastTick = performance.now();
    stage.classList.remove("paused");
    frameId = requestAnimationFrame(tick);
  }
}

function restart() {
  cancelAnimationFrame(frameId);
  frameId = null;
  lastTick = null;
  currentTime = originalBedtime;
  nextStop = originalBedtime;
  postponements = [];
  clipIndex = 0;
  clipElapsed = 0;
  isViewing = false;
  hasStopped = false;
  document.querySelector("#timeline").replaceChildren();
  document.querySelector("#delayStrip").replaceChildren();
  document.querySelector("#feed").hidden = false;
  document.querySelector("#summary").hidden = true;
  hideClockPanel();
  showClip();
  updateClock();
  showDecision();
}

document.querySelector("#five").addEventListener("click", function () { postpone(5); });
document.querySelector("#ten").addEventListener("click", function () { postpone(10); });
document.querySelector("#stop").addEventListener("click", stopWatching);
document.querySelector("#stopAnytime").addEventListener("click", stopWatching);
document.querySelector("#restart").addEventListener("click", restart);
nextButton.addEventListener("click", nextItem);
document.querySelector("#clockButton").addEventListener("click", function () {
  syncTime(performance.now());
  clockPanel.hidden = !clockPanel.hidden;
  this.setAttribute("aria-expanded", String(!clockPanel.hidden));
});
document.addEventListener("visibilitychange", handleVisibility);
restart();
