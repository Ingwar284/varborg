/**
 * VÅR BORG system entry point.
 * Foundry loads this file first (see "esmodules" in system.json).
 */

Hooks.once("init", () => {
  console.log("VÅR BORG | Initialising system");
});

Hooks.once("ready", () => {
  console.log("VÅR BORG | Ready");
});
