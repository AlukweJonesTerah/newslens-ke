const DEFAULTS = {
  enabled: false,
  windowStart: "08:00",
  windowEnd: "12:00",
  day: "Monday",
  lookbackDays: 7,
  timezone: "Africa/Nairobi",
  maxSegments: 2,
  maxRetries: 2,
  retryDelayMs: 1000,
  sendDelayMs: 1000,
  batchSize: 20,
};

const GSM_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const GSM_EXTENDED = new Set(["\f", "^", "{", "}", "\\", "[", "~", "]", "|", "€"]);

const FOLLOWUP_TEMPLATES = [
  "Hi! Here is a quick follow-up on ",
  "Hi again. Read more about ",
  "A little more context on ",
];

const SMS_FOOTER = " Reply STOP to opt out.";

function parseClock(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error(`Invalid clock time: ${value}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function zonedParts(date, timeZone = DEFAULTS.timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    weekday: values.weekday,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function isWithinWindow(date, config = {}) {
  const settings = { ...DEFAULTS, ...config };
  const { weekday, minutes } = zonedParts(date, settings.timezone);
  return (
    weekday.toLowerCase() === settings.day.toLowerCase() &&
    minutes >= parseClock(settings.windowStart) &&
    minutes < parseClock(settings.windowEnd)
  );
}

function normalizePhone(phone) {
  if (typeof phone !== "string") return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  let normalized;

  if (trimmed.startsWith("+")) normalized = `+${digits}`;
  else if (digits.startsWith("00")) normalized = `+${digits.slice(2)}`;
  else if (digits.startsWith("254")) normalized = `+${digits}`;
  else if (digits.startsWith("0") && digits.length === 10) normalized = `+254${digits.slice(1)}`;
  else if (digits.length === 9) normalized = `+254${digits}`;
  else return null;

  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

function maskPhone(phone) {
  const normalized = normalizePhone(phone);
  return normalized ? `***${normalized.slice(-3)}` : "***";
}

function sanitizeGsm7(value) {
  const replacements = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2013": "-",
    "\u2014": "-",
    "\u2026": "...",
    "\u00a0": " ",
  };
  const normalized = String(value ?? "")
    .replace(/[\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u00a0]/g, (char) => replacements[char])
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");

  let output = "";
  for (const char of normalized) {
    if (GSM_BASIC.has(char) || GSM_EXTENDED.has(char)) output += char;
    else if (/\s/u.test(char)) output += " ";
  }
  return output.replace(/[ \t]+/g, " ").trim();
}

function countGsmSeptets(text) {
  let count = 0;
  for (const char of text) {
    if (GSM_BASIC.has(char)) count += 1;
    else if (GSM_EXTENDED.has(char)) count += 2;
    else return Infinity;
  }
  return count;
}

function countSmsSegments(text) {
  const septets = countGsmSeptets(text);
  if (!Number.isFinite(septets)) return Infinity;
  return septets <= 160 ? 1 : Math.ceil(septets / 153);
}

function buildStoryUrl(appBaseUrl, storyId) {
  const base = new URL(appBaseUrl);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && base.hostname === "localhost")) {
    throw new Error("APP_BASE_URL must use HTTPS");
  }
  base.pathname = `${base.pathname.replace(/\/$/, "")}/stories/${encodeURIComponent(storyId)}`;
  base.search = "";
  base.hash = "";
  return base.toString();
}

function truncateGsmText(value, maxSeptets) {
  const text = sanitizeGsm7(value);
  if (countGsmSeptets(text) <= maxSeptets) return text;

  let output = "";
  let used = 0;
  for (const char of text) {
    const cost = GSM_EXTENDED.has(char) ? 2 : 1;
    if (used + cost > maxSeptets) break;
    output += char;
    used += cost;
  }
  return output.replace(/\s+\S*$/, "").trimEnd();
}

function buildFollowupMessage({ title, storyUrl, templateIndex = 0, maxSegments = 2 }) {
  const safeUrl = new URL(storyUrl);
  if (safeUrl.protocol !== "https:" && !(safeUrl.protocol === "http:" && safeUrl.hostname === "localhost")) {
    throw new Error("Story URL must use HTTPS");
  }

  const link = safeUrl.toString();
  const prefix = FOLLOWUP_TEMPLATES[Math.abs(templateIndex) % FOLLOWUP_TEMPLATES.length];
  const fixedText = `${prefix}${link}${SMS_FOOTER}`;
  const maxSeptets = maxSegments === 1 ? 160 : 306;
  const titleBudget = maxSeptets - countGsmSeptets(fixedText) - 2;
  if (titleBudget < 1) throw new Error("Story link and opt-out text exceed the SMS segment limit");

  const safeTitle = truncateGsmText(title || "this story", titleBudget) || "this story";
  const message = `${prefix}${safeTitle}: ${link}${SMS_FOOTER}`;
  if (countSmsSegments(message) > maxSegments) {
    throw new Error("Follow-up message exceeds the SMS segment limit");
  }
  return message;
}

function isValidSubscriber(subscriber) {
  return Boolean(
    subscriber &&
      subscriber.opted_in_at &&
      !subscriber.opted_out_at &&
      normalizePhone(subscriber.phone_number),
  );
}

function isEligibleStoryDelivery(delivery, cutoff, now = new Date()) {
  if (!delivery || !["sent", "delivered"].includes(delivery.status)) return false;
  if (!isValidSubscriber(delivery.subscriber)) return false;
  const deliveredAt = new Date(delivery.sent_at || delivery.created_at);
  return (
    !Number.isNaN(deliveredAt.getTime()) &&
    deliveredAt >= cutoff &&
    deliveredAt <= now
  );
}

function selectCandidates(deliveries, now, lookbackDays = DEFAULTS.lookbackDays, testMsisdn = null) {
  const cutoff = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const testNumber = testMsisdn ? normalizePhone(testMsisdn) : null;
  const latestBySubscriber = new Map();

  for (const delivery of deliveries) {
    if (!isEligibleStoryDelivery(delivery, cutoff, now)) continue;
    const phone = normalizePhone(delivery.subscriber.phone_number);
    if (testNumber && phone !== testNumber) continue;
    const key = delivery.subscriber.id;
    const previous = latestBySubscriber.get(key);
    const deliveredAt = new Date(delivery.sent_at || delivery.created_at);
    if (!previous || deliveredAt > previous.deliveredAt) {
      latestBySubscriber.set(key, { delivery, deliveredAt });
    }
  }

  return [...latestBySubscriber.values()]
    .sort((a, b) => a.deliveredAt - b.deliveredAt)
    .map(({ delivery }) => delivery);
}

function isFatalProviderError(error) {
  return Boolean(error && ([400, 401, 403].includes(error.status) || error.configurationError));
}

function isTransientProviderError(error) {
  return Boolean(error && (error.status === 429 || error.status >= 500 || !error.status));
}

async function runFollowups(options) {
  const settings = { ...DEFAULTS, ...(options.config || {}) };
  const clock = options.now || (() => new Date());
  const logger = options.logger || console;
  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const manual = options.manual === true;

  if (!settings.enabled) return { skipped: true, reason: "disabled", sent: 0, dryRun: 0 };
  if (manual && !normalizePhone(options.testMsisdn)) {
    throw new Error("A valid TEST_MSISDN is required for a manual run");
  }
  if (!manual && !isWithinWindow(clock(), settings)) {
    return { skipped: true, reason: "outside_window", sent: 0, dryRun: 0 };
  }

  const nowAtStart = clock();
  const deliveries = await options.store.getRecentStoryDeliveries({
    since: new Date(nowAtStart.getTime() - settings.lookbackDays * 24 * 60 * 60 * 1000),
  });
  const candidates = selectCandidates(deliveries, nowAtStart, settings.lookbackDays, manual ? options.testMsisdn : null);
  candidates.splice(settings.batchSize);
  const result = { skipped: false, sent: 0, dryRun: 0, failed: 0, ignored: 0, stoppedAtWindowEnd: false };

  for (let index = 0; index < candidates.length; index += 1) {
    if (!manual && !isWithinWindow(clock(), settings)) {
      result.stoppedAtWindowEnd = true;
      break;
    }

    const candidate = candidates[index];
    const subscriberId = candidate.subscriber.id;
    const storyId = candidate.story_id;
    const currentSubscriber = await options.store.getSubscriber(subscriberId);
    if (!isValidSubscriber(currentSubscriber)) {
      result.ignored += 1;
      continue;
    }

    const storyUrl = buildStoryUrl(settings.appBaseUrl, storyId);
    const message = buildFollowupMessage({
      title: candidate.story_title || "this story",
      storyUrl,
      templateIndex: Number(storyId.slice(-2).replace(/[^\da-f]/gi, "")) || index,
      maxSegments: settings.maxSegments,
    });
    const phoneNumber = normalizePhone(currentSubscriber.phone_number);

    if (options.dryRun) {
      logger.log(`[SMS dry-run] to ${maskPhone(phoneNumber)} story ${storyId}: ${message}`);
      result.dryRun += 1;
      continue;
    }

    if (!manual && !isWithinWindow(clock(), settings)) {
      result.stoppedAtWindowEnd = true;
      break;
    }

    const claim = await options.store.claimFollowupDelivery({ subscriberId, storyId });
    if (!claim) {
      result.ignored += 1;
      continue;
    }

    let accepted = false;
    for (let attempt = 0; attempt <= settings.maxRetries; attempt += 1) {
      if (!manual && !isWithinWindow(clock(), settings)) {
        await options.store.updateDelivery(claim.id, { status: "skipped_window" });
        result.stoppedAtWindowEnd = true;
        break;
      }

      const subscriberAtSend = await options.store.getSubscriber(subscriberId);
      if (!isValidSubscriber(subscriberAtSend)) {
        await options.store.updateDelivery(claim.id, { status: "skipped_opt_out" });
        result.ignored += 1;
        break;
      }

      try {
        const providerResult = await options.send({
          to: normalizePhone(subscriberAtSend.phone_number),
          sender: options.sender,
          message,
          messageId: claim.id,
          callbackData: claim.callback_data,
        });
        await options.store.updateDelivery(claim.id, {
          status: "accepted",
          provider_message_id: providerResult.messageId,
          provider_status: providerResult.status,
          accepted_at: clock().toISOString(),
        });
        result.sent += 1;
        accepted = true;
        break;
      } catch (error) {
        await options.store.updateDelivery(claim.id, {
          status: "failed",
          error_code: error.code || null,
        });
        if (isFatalProviderError(error)) throw error;
        if (!isTransientProviderError(error) || attempt >= settings.maxRetries) {
          result.failed += 1;
          break;
        }
        await sleep(settings.retryDelayMs * (attempt + 1));
      }
    }

    if (result.stoppedAtWindowEnd) break;
    if (index < candidates.length - 1 && accepted) {
      await sleep(settings.sendDelayMs);
    }
  }

  return result;
}

module.exports = {
  DEFAULTS,
  buildFollowupMessage,
  buildStoryUrl,
  countGsmSeptets,
  countSmsSegments,
  isEligibleStoryDelivery,
  isFatalProviderError,
  isTransientProviderError,
  isValidSubscriber,
  isWithinWindow,
  maskPhone,
  normalizePhone,
  runFollowups,
  sanitizeGsm7,
  selectCandidates,
  zonedParts,
};