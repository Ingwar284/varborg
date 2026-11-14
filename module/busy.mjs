/**
 * Buttons that must not run twice at once in Foundry (REVIEW.md S2; bug B11).
 *
 * Many buttons read something, wait (for a question box, a roll or a save to
 * the server) and only then write. A second click in that wait passes the
 * same check, so the effect happens twice: two torches used, Ember gained
 * twice, a medicine box applied from two question boxes. This file holds the
 * two small tools that stop that. They know nothing about Foundry, so they
 * are tested on their own (tests/busy.test.mjs).
 *
 * Choose by what one click means:
 * - oneAtATime: a click starts a JOB that must happen once (light a torch,
 *   use a relic). While the job runs, another click with the same key is
 *   ignored. Once it has finished, the next click works as normal.
 * - inOrder: every click is a STEP that must count (the + and - under an
 *   ability, a tick box). Clicks wait their turn and all of them run, each
 *   one reading the state the one before it left.
 *
 * The key says what is shared. Make it specific, such as `light:${actor.uuid}`,
 * so that different characters and items never hold each other up. This only
 * covers one browser; two players pressing at once are separate computers
 * (those are the Dark Master's queues in pools.mjs, fortune.mjs and card-once.mjs).
 */

/** The keys of the jobs running now. */
const running = new Set();

/**
 * Run a job unless a job with the same key is already running here.
 * @param {string} key
 * @param {() => any} job  May be async. Whatever it throws is thrown to the caller.
 * @returns {Promise<any>}  What the job returned, or undefined when it was not run
 *   because the key was busy (so `if (!result) return;` works as it did for a cancel).
 */
export async function oneAtATime(key, job) {
  if (running.has(key)) return undefined;
  running.add(key);
  try {
    return await job();
  } finally {
    running.delete(key);
  }
}

/** The end of the line of jobs waiting under each key. */
const lines = new Map();

/**
 * Run a job after every earlier job with the same key has finished. A job that
 * fails does not hold up the next one (as in module/fortune.mjs). A job must not
 * wait on another job with its own key: it would wait for itself.
 * @param {string} key
 * @param {() => any} job  May be async.
 * @returns {Promise<any>}  What the job returned; rejects if the job threw.
 */
export function inOrder(key, job) {
  const run = (lines.get(key) ?? Promise.resolve()).then(job);
  const end = run.catch(() => {});
  lines.set(key, end);
  // Forget the key once its line is empty, so the map does not grow.
  end.then(() => {
    if (lines.get(key) === end) lines.delete(key);
  });
  return run;
}
