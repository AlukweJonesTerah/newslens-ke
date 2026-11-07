const assert = require("node:assert/strict");
const {
  buildFollowupMessage,
  buildStoryUrl,
  countGsmSeptets,
  countSmsSegments,
  isEligibleStoryDelivery,
  isWithinWindow,
  normalizePhone,
  runFollowups,
  selectCandidates,
} = require("./sms-followup.js");

const monday = (hour, minute = 0) => new Date(Date.UTC(2026, 10, 9, hour - 3, minute));
const openWindow = { enabled: true, windowStart: "08:00", windowEnd: "12:00", day: "Monday", timezone: "Africa/Nairobi" };
const subscriber = { id: "sub-1", phone_number: "+254712345678", opted_in_at: "2026-10-01T10:00:00Z", opted_out_at: null };
const delivery = (overrides = {}) => ({
  subscriber,
  story_id: "12345678-1234-1234-1234-123456789012",
  story_title: "Court publishes its ruling",
  status: "delivered",
  sent_at: "2026-11-06T08:00:00Z",
  ...overrides,
});

async function test(name, fn) {
  await fn();
  console.log(`ok - ${name}`);
}

async function main() {
  await test("runs only Monday within the Nairobi window", () => {
    assert.equal(isWithinWindow(monday(7, 59), openWindow), false);
    assert.equal(isWithinWindow(monday(8), openWindow), true);
    assert.equal(isWithinWindow(monday(12), openWindow), false);
    assert.equal(isWithinWindow(new Date("2026-11-08T23:00:00Z"), openWindow), false);
    assert.equal(isWithinWindow(new Date("2026-11-10T06:00:00Z"), openWindow), false);
  });

  await test("normalizes Kenyan numbers and rejects invalid numbers", () => {
    assert.equal(normalizePhone("0712 345 678"), "+254712345678");
    assert.equal(normalizePhone("254712345678"), "+254712345678");
    assert.equal(normalizePhone("not a phone"), null);
  });

  await test("eligibility requires consent, a valid phone, and sent/delivered status within lookback", () => {
    const now = new Date("2026-11-09T06:00:00Z");
    const cutoff = new Date(now.getTime() - 7 * 86400000);
    assert.equal(isEligibleStoryDelivery(delivery(), cutoff, now), true);
    assert.equal(isEligibleStoryDelivery(delivery({ status: "failed" }), cutoff, now), false);
    assert.equal(isEligibleStoryDelivery(delivery({ status: "accepted" }), cutoff, now), false);
    assert.equal(isEligibleStoryDelivery(delivery({ sent_at: "2026-11-01T05:59:59Z" }), cutoff, now), false);
    assert.equal(isEligibleStoryDelivery(delivery({ subscriber: { ...subscriber, opted_out_at: now.toISOString() } }), cutoff, now), false);
    assert.equal(isEligibleStoryDelivery(delivery({ subscriber: { ...subscriber, opted_in_at: null } }), cutoff, now), false);
    assert.equal(isEligibleStoryDelivery(delivery({ subscriber: { ...subscriber, phone_number: "invalid" } }), cutoff, now), false);
  });

  await test("selects only the most recent eligible story per subscriber", () => {
    const older = delivery({ story_id: "00000000-0000-0000-0000-000000000001", sent_at: "2026-11-05T08:00:00Z" });
    const newest = delivery({ sent_at: "2026-11-06T08:00:00Z" });
    const selected = selectCandidates([newest, older], new Date("2026-11-09T06:00:00Z"));
    assert.equal(selected.length, 1);
    assert.equal(selected[0].story_id, newest.story_id);
  });

  await test("constructs the real story route from APP_BASE_URL", () => {
    assert.equal(buildStoryUrl("https://newslens.example/", delivery().story_id), `https://newslens.example/stories/${delivery().story_id}`);
  });

  await test("keeps the complete link, removes smart punctuation, and fits within two GSM-7 segments", () => {
    const link = "https://newslens.example/stories/123";
    const message = buildFollowupMessage({ title: `${"Long headline ".repeat(80)}“No emojis 🚫”`, storyUrl: link });
    assert.ok(message.includes(link));
    assert.ok(message.endsWith("Reply STOP to opt out."));
    assert.ok(!/[“”‘’🚫]/u.test(message));
    assert.ok(countGsmSeptets(message) <= 306);
    assert.ok(countSmsSegments(message) <= 2);
  });

  await test("keeps a short follow-up to one GSM-7 segment", () => {
    const message = buildFollowupMessage({
      title: "Court publishes its ruling",
      storyUrl: "https://newslens.example/stories/123",
    });
    assert.equal(countSmsSegments(message), 1);
  });

  await test("dry-run sends nothing and persists nothing", async () => {
    let writes = 0;
    let sends = 0;
    const logs = [];
    const store = {
      getRecentStoryDeliveries: async () => [delivery()],
      getSubscriber: async () => subscriber,
      claimFollowupDelivery: async () => { writes += 1; return { id: "delivery-1" }; },
      updateDelivery: async () => { writes += 1; },
    };
    const result = await runFollowups({
      now: () => monday(9),
      config: { ...openWindow, appBaseUrl: "https://newslens.example" },
      store,
      send: async () => { sends += 1; },
      logger: { log: (message) => logs.push(message) },
      dryRun: true,
    });
    assert.equal(result.dryRun, 1);
    assert.equal(writes, 0);
    assert.equal(sends, 0);
    assert.match(logs[0], /\*\*\*678/);
  });

  await test("rechecks opt-out immediately before send", async () => {
    let sends = 0;
    const store = {
      getRecentStoryDeliveries: async () => [delivery()],
      getSubscriber: async () => ({ ...subscriber, opted_out_at: "2026-11-09T06:00:00Z" }),
      claimFollowupDelivery: async () => { throw new Error("should not claim"); },
      updateDelivery: async () => {},
    };
    const result = await runFollowups({
      now: () => monday(9),
      config: { ...openWindow, appBaseUrl: "https://newslens.example" },
      store,
      send: async () => { sends += 1; },
    });
    assert.equal(result.ignored, 1);
    assert.equal(sends, 0);
  });

  await test("the database claim allows at most one follow-up for a user/story pair", async () => {
    const claimed = new Set();
    let sends = 0;
    const store = {
      getRecentStoryDeliveries: async () => [delivery()],
      getSubscriber: async () => subscriber,
      claimFollowupDelivery: async ({ subscriberId, storyId }) => {
        const key = `${subscriberId}:${storyId}`;
        if (claimed.has(key)) return null;
        claimed.add(key);
        return { id: "delivery-1", callback_data: "token" };
      },
      updateDelivery: async () => {},
    };
    const options = {
      now: () => monday(9),
      config: { ...openWindow, appBaseUrl: "https://newslens.example" },
      store,
      send: async () => { sends += 1; return { messageId: "accepted-id" }; },
    };
    assert.equal((await runFollowups(options)).sent, 1);
    assert.equal((await runFollowups(options)).ignored, 1);
    assert.equal(sends, 1);
  });

  await test("does not retry after provider acceptance if delivery persistence fails", async () => {
    let sends = 0;
    const store = {
      getRecentStoryDeliveries: async () => [delivery()],
      getSubscriber: async () => subscriber,
      claimFollowupDelivery: async () => ({ id: "delivery-1", callback_data: "token" }),
      updateDelivery: async (id, values) => {
        if (values.status === "accepted") throw new Error("database unavailable");
      },
    };
    await assert.rejects(runFollowups({
      now: () => monday(9),
      config: { ...openWindow, appBaseUrl: "https://newslens.example" },
      store,
      send: async () => { sends += 1; return { messageId: "accepted-id" }; },
    }), /not retrying to avoid a duplicate/);
    assert.equal(sends, 1);
  });

  await test("manual flag bypasses the window only for TEST_MSISDN", async () => {
    const otherSubscriber = { ...subscriber, id: "sub-2", phone_number: "+254722345678" };
    const sentTo = [];
    const store = {
      getRecentStoryDeliveries: async () => [delivery(), delivery({ subscriber: otherSubscriber })],
      getSubscriber: async (id) => id === subscriber.id ? subscriber : otherSubscriber,
      claimFollowupDelivery: async () => ({ id: "delivery-1", callback_data: "token" }),
      updateDelivery: async () => {},
    };
    const result = await runFollowups({
      now: () => new Date("2026-11-10T09:00:00Z"),
      config: { ...openWindow, appBaseUrl: "https://newslens.example" },
      store,
      send: async ({ to }) => { sentTo.push(to); return { messageId: "accepted-id" }; },
      manual: true,
      testMsisdn: "0712 345 678",
    });
    assert.equal(result.sent, 1);
    assert.deepEqual(sentTo, [subscriber.phone_number]);
  });

  await test("stops at the window end and leaves later candidates unsent", async () => {
    const secondSubscriber = { ...subscriber, id: "sub-2", phone_number: "+254722345678" };
    const candidates = [delivery(), delivery({ subscriber: secondSubscriber })];
    let now = monday(11, 59);
    let sends = 0;
    const store = {
      getRecentStoryDeliveries: async () => candidates,
      getSubscriber: async (id) => id === "sub-1" ? subscriber : secondSubscriber,
      claimFollowupDelivery: async ({ subscriberId }) => ({ id: subscriberId, callback_data: subscriberId }),
      updateDelivery: async () => {},
    };
    const result = await runFollowups({
      now: () => now,
      sleep: async () => { now = monday(12); },
      config: { ...openWindow, appBaseUrl: "https://newslens.example", sendDelayMs: 1 },
      store,
      send: async () => { sends += 1; return { messageId: `msg-${sends}` }; },
    });
    assert.equal(result.sent, 1);
    assert.equal(result.stoppedAtWindowEnd, true);
    assert.equal(sends, 1);
  });

  await test("retries transient errors, but aborts on provider auth/config errors", async () => {
    let attempts = 0;
    const store = {
      getRecentStoryDeliveries: async () => [delivery()],
      getSubscriber: async () => subscriber,
      claimFollowupDelivery: async () => ({ id: "delivery-1", callback_data: "token" }),
      updateDelivery: async () => {},
    };
    const result = await runFollowups({
      now: () => monday(9),
      sleep: async () => {},
      config: { ...openWindow, appBaseUrl: "https://newslens.example", maxRetries: 2 },
      store,
      send: async () => {
        attempts += 1;
        if (attempts < 3) throw Object.assign(new Error("temporary"), { status: 503 });
        return { messageId: "accepted-id" };
      },
    });
    assert.equal(attempts, 3);
    assert.equal(result.sent, 1);

    let authAttempts = 0;
    let laterUserSendAttempts = 0;
    const authStore = {
      ...store,
      getRecentStoryDeliveries: async () => [delivery(), delivery({ subscriber: { ...subscriber, id: "sub-2" } })],
      claimFollowupDelivery: async ({ subscriberId }) => ({ id: subscriberId, callback_data: "token" }),
      getSubscriber: async (id) => ({ ...subscriber, id }),
    };
    await assert.rejects(runFollowups({
      now: () => monday(9),
      config: { ...openWindow, appBaseUrl: "https://newslens.example" },
      store: authStore,
      send: async ({ to }) => {
        if (to === subscriber.phone_number) authAttempts += 1;
        else laterUserSendAttempts += 1;
        throw Object.assign(new Error("unauthorized"), { status: 401 });
      },
    }), /unauthorized/);
    assert.equal(authAttempts, 1);
    assert.equal(laterUserSendAttempts, 0);
  });

  console.log("SMS follow-up tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});