export class InfobipSmsError extends Error {
  status: number | undefined;
  code: string | null;
  configurationError: boolean;

  constructor(message: string, status?: number, code: string | null = null) {
    super(message);
    this.name = "InfobipSmsError";
    this.status = status;
    this.code = code;
    this.configurationError = status === 400 || status === 401 || status === 403;
  }
}

function getInfobipBaseUrl(): URL {
  const configured = process.env.INFOBIP_BASE_URL;
  if (!configured) throw new InfobipSmsError("Infobip base URL is not configured", 400);

  let baseUrl: URL;
  try {
    baseUrl = new URL(configured.startsWith("https://") ? configured : `https://${configured}`);
  } catch {
    throw new InfobipSmsError("Infobip base URL is invalid", 400);
  }

  if (
    baseUrl.protocol !== "https:" ||
    !(baseUrl.hostname === "api.infobip.com" || baseUrl.hostname.endsWith(".api.infobip.com"))
  ) {
    throw new InfobipSmsError("Infobip base URL is invalid", 400);
  }
  return baseUrl;
}

export async function sendInfobipSms({
  to,
  sender,
  text,
  callbackData,
  messageId,
}: {
  to: string;
  sender: string;
  text: string;
  callbackData?: string;
  messageId?: string;
}) {
  const apiKey = process.env.INFOBIP_API_KEY;
  if (!apiKey) throw new InfobipSmsError("Infobip API key is not configured", 400);

  const baseUrl = getInfobipBaseUrl();
  let response: Response;
  try {
    response = await fetch(new URL("/sms/3/messages", baseUrl), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `App ${apiKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            sender,
            destinations: [{ to, ...(messageId ? { messageId } : {}) }],
            content: { text },
            ...(callbackData
              ? { webhooks: { contentType: "application/json", callbackData } }
              : {}),
          },
        ],
      }),
    });
  } catch {
    throw new InfobipSmsError("Could not reach Infobip");
  }

  const result = await response.json().catch(() => null);
  const sentMessage = result?.messages?.[0];
  const statusName = sentMessage?.status?.name || null;
  const statusGroup = sentMessage?.status?.groupName || null;

  if (!response.ok || !sentMessage || statusGroup === "REJECTED") {
    const status = response.ok && statusGroup === "REJECTED" ? 400 : response.status;
    throw new InfobipSmsError("Infobip rejected the SMS", status, statusName);
  }

  return {
    messageId: sentMessage.messageId || null,
    status: statusName || statusGroup || "ACCEPTED",
  };
}