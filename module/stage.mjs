/**
 * The stage: presentation only, no rules.
 *
 * 1. Dialogue box. An in-character chat message (typed while speaking as a
 *    character or token) or an emote also appears at the bottom of the
 *    screen, visual novel style: the speaker's art standing beside a paper
 *    dialogue box with their name on an orange plate, the words typed out.
 *    Click the box to finish the line, click again to dismiss it. Lines
 *    queue up and play one after another.
 *
 * 2. Triumph and Ruin splashes. When a chat card shows a Triumph or a Ruin
 *    (a test, attack, defence, poison or panic card with that result), a
 *    tilted black band slams across every player's screen with the roller's
 *    art and the word. Triumph: a paper flash and a burst of orange rays.
 *    Ruin: the screen darkens, the art turns grey and the word drops and
 *    cracks. It waits for Dice So Nice, if that module is on. It also plays
 *    when Fortune changes a card to a Triumph or Ruin after the roll. The
 *    "Demoralised" morale card and a fallen foe's note only borrow the Ruin
 *    colour and play nothing.
 *
 * Settings: the Dark Master can switch the splashes off for everyone (world
 * setting); each player can also switch them off on their own screen, and
 * switch the dialogue box off (client settings). With "reduced motion" asked
 * for by the computer (Windows: animation effects off), the splash drops its
 * flash and screen shake.
 */

const SYSTEM = "var-borg";
const DIALOGUE = "dialogueStage";
const TRIUMPH = "triumphSplash";
const SPLASH_WORLD = "splashesForAll";

/** Called once at init. */
export function registerStage() {
  game.settings.register(SYSTEM, DIALOGUE, {
    name: "VARBORG.Settings.DialogueStage.Name",
    hint: "VARBORG.Settings.DialogueStage.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(SYSTEM, SPLASH_WORLD, {
    name: "VARBORG.Settings.SplashesForAll.Name",
    hint: "VARBORG.Settings.SplashesForAll.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(SYSTEM, TRIUMPH, {
    name: "VARBORG.Settings.TriumphSplash.Name",
    hint: "VARBORG.Settings.TriumphSplash.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  Hooks.once("ready", rememberResults);
  Hooks.on("createChatMessage", onCreateMessage);
  Hooks.on("updateChatMessage", onUpdateMessage);
}

/* -------------------------------------------- */
/*  Shared helpers                              */
/* -------------------------------------------- */

const DEFAULT_ART = new Set(["icons/svg/mystery-man.svg", "icons/svg/item-bag.svg"]);

/** Turn chat HTML into plain text without running anything inside it. */
function parseHTML(html) {
  return new DOMParser().parseFromString(html ?? "", "text/html").body;
}

/** The speaker's art: the actor's portrait, else the token's image, else none. */
function speakerArt(message) {
  const actor = ChatMessage.implementation.getSpeakerActor(message.speaker);
  const tokenDoc = message.speaker?.token
    ? game.scenes.get(message.speaker.scene)?.tokens.get(message.speaker.token)
    : null;
  for (const src of [actor?.img, tokenDoc?.texture?.src, actor?.prototypeToken?.texture?.src]) {
    if (src && !DEFAULT_ART.has(src)) return src;
  }
  return null;
}

function speakerName(message) {
  return message.alias || message.speaker?.alias || message.author?.name || "";
}

/** Wait for Dice So Nice to finish rolling this message's dice (at most 8 seconds). */
function afterDice(message) {
  if (!game.dice3d || !message.rolls?.length) return Promise.resolve();
  return new Promise(resolve => {
    let id = null;
    const done = () => { if (id !== null) Hooks.off("diceSoNiceRollComplete", id); clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 8000);
    id = Hooks.on("diceSoNiceRollComplete", messageId => { if (messageId === message.id) done(); });
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function on(setting) {
  try { return game.settings.get(SYSTEM, setting); } catch { return false; }
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/** Which result each card already showed, so a later edit does not replay it. */
const shownResults = new Map();
const RESULT_MARK = /class="tier tier-(triumph|ruin)"/;
/** Cards that borrow the Ruin colour without being a Ruin. */
const NOT_A_RESULT = ".morale-card, .foe-damage-card";

/** "triumph", "ruin" or null: the result a chat card shows. */
function cardResult(message) {
  const content = message.content ?? "";
  if (!RESULT_MARK.test(content)) return null;
  for (const el of parseHTML(content).querySelectorAll(".tier.tier-triumph, .tier.tier-ruin")) {
    if (el.closest(NOT_A_RESULT)) continue;
    return el.classList.contains("tier-triumph") ? "triumph" : "ruin";
  }
  return null;
}

function rememberResults() {
  for (const message of game.messages) shownResults.set(message.id, cardResult(message));
}

function onCreateMessage(message) {
  const styles = CONST.CHAT_MESSAGE_STYLES;
  if ((message.style === styles.IC || message.style === styles.EMOTE) && message.visible && on(DIALOGUE)) {
    queueLine(message);
  }
  const result = cardResult(message);
  shownResults.set(message.id, result);
  if (result) playSplash(message, result);
}

function onUpdateMessage(message, changes) {
  if (!("content" in changes)) return;
  const result = cardResult(message);
  const before = shownResults.get(message.id) ?? null;
  shownResults.set(message.id, result);
  if (result && result !== before) playSplash(message, result);
}

/* -------------------------------------------- */
/*  1. Dialogue box                             */
/* -------------------------------------------- */

const queue = [];
let playing = false;
let stage = null;

function queueLine(message) {
  const text = parseHTML(message.content).textContent.replace(/\s+/g, " ").trim();
  if (!text) return;
  queue.push({
    text,
    name: speakerName(message),
    art: speakerArt(message),
    emote: message.style === CONST.CHAT_MESSAGE_STYLES.EMOTE
  });
  if (!playing) playQueue();
}

/** Build the dialogue box once, the first time someone speaks. */
function buildStage() {
  const root = document.createElement("section");
  root.id = "vb-dialogue";
  root.className = "vb-dialogue";
  root.setAttribute("aria-live", "polite");
  root.innerHTML = `
    <img class="vb-dialogue__art" alt="">
    <div class="vb-dialogue__box" role="button" tabindex="0">
      <span class="vb-dialogue__name"></span>
      <p class="vb-dialogue__text"></p>
      <span class="vb-dialogue__next" aria-hidden="true"></span>
    </div>`;
  root.querySelector(".vb-dialogue__box").title = game.i18n.localize("VARBORG.Stage.ClickToContinue");
  document.body.append(root);
  return root;
}

async function playQueue() {
  playing = true;
  stage ??= buildStage();
  stage.classList.remove("is-leaving");
  stage.classList.add("is-open");
  let lastArt;
  while (queue.length) {
    const line = queue.shift();
    await playLine(line, line.art !== lastArt);
    lastArt = line.art;
  }
  stage.classList.add("is-leaving");
  await wait(350);
  // Someone may have spoken during the exit.
  if (queue.length) return playQueue();
  stage.classList.remove("is-open", "is-leaving");
  playing = false;
}

/** Show one line. Resolves when it is dismissed or its time is up. */
function playLine(line, newSpeaker) {
  const art = stage.querySelector(".vb-dialogue__art");
  const box = stage.querySelector(".vb-dialogue__box");
  const name = stage.querySelector(".vb-dialogue__name");
  const text = stage.querySelector(".vb-dialogue__text");

  stage.classList.toggle("has-art", !!line.art);
  stage.classList.toggle("is-emote", line.emote);
  if (newSpeaker) {
    if (line.art) art.src = line.art;
    stage.classList.remove("speaker-in");
    void stage.offsetWidth; // restart the entrance animation
    stage.classList.add("speaker-in");
  }
  name.textContent = line.name;
  name.hidden = line.emote || !line.name;
  text.textContent = "";
  stage.classList.remove("is-done");

  return new Promise(resolve => {
    const letters = Array.from(line.text);
    let shown = 0;
    let typing = null;
    let hold = null;

    const finishTyping = () => {
      clearInterval(typing);
      typing = null;
      text.textContent = line.text;
      stage.classList.add("is-done");
      // Long enough to read, shorter when others are waiting to speak.
      const ms = queue.length ? 1800 : Math.min(12000, 3000 + line.text.length * 40);
      hold = setTimeout(end, ms);
    };
    const end = () => {
      clearInterval(typing);
      clearTimeout(hold);
      box.removeEventListener("click", onClick);
      box.removeEventListener("keydown", onKey);
      resolve();
    };
    const onClick = () => (typing ? finishTyping() : end());
    const onKey = event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onClick(); }
    };
    box.addEventListener("click", onClick);
    box.addEventListener("keydown", onKey);

    typing = setInterval(() => {
      shown += 2;
      text.textContent = letters.slice(0, shown).join("");
      if (shown >= letters.length) finishTyping();
    }, 30);
  });
}

/* -------------------------------------------- */
/*  2. Triumph and Ruin splashes                */
/* -------------------------------------------- */

const splashQueue = [];
let splashing = false;

/** How long the splash holds before it leaves, and how long leaving takes (ms). */
const SPLASH_HOLD = 2300;
const SPLASH_LEAVE = 300;

async function playSplash(message, result) {
  if (!on(SPLASH_WORLD) || !on(TRIUMPH) || !message.isContentVisible) return;
  const title = parseHTML(message.content).querySelector("h3")?.textContent.trim() ?? "";
  const entry = { result, name: speakerName(message), art: speakerArt(message), title };
  await afterDice(message);
  splashQueue.push(entry);
  if (splashing) return;
  splashing = true;
  while (splashQueue.length) await showSplash(splashQueue.shift());
  splashing = false;
}

async function showSplash({ result, name, art, title }) {
  const root = document.createElement("div");
  root.className = `vb-splash vb-splash--${result}`;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="vb-splash__flash"></div>
    <div class="vb-splash__rays"></div>
    <div class="vb-splash__band">
      <div class="vb-splash__words">
        <span class="vb-splash__name"></span>
        <span class="vb-splash__word"></span>
        <span class="vb-splash__title"></span>
      </div>
    </div>
    <img class="vb-splash__art" alt="">`;
  root.querySelector(".vb-splash__name").textContent = name;
  root.querySelector(".vb-splash__word").textContent = game.i18n.localize(`VARBORG.Tier.${result}`);
  root.querySelector(".vb-splash__title").textContent = title;
  const img = root.querySelector(".vb-splash__art");
  if (art) img.src = art;
  else img.remove();
  document.body.append(root);

  // A jolt of the map as the band lands (heavier for a Ruin).
  const board = document.getElementById("board");
  const shake = `vb-shake--${result}`;
  setTimeout(() => board?.classList.add(shake), 250);
  setTimeout(() => board?.classList.remove(shake), 800);

  await wait(SPLASH_HOLD);
  root.classList.add("is-leaving");
  await wait(SPLASH_LEAVE);
  root.remove();
}
