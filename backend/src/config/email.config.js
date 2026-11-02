function requiredEnvironmentValue(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to send email`);
  }
  return value;
}

export function getEmailConfig() {
  const host = requiredEnvironmentValue("EMAIL_SMTP_HOST");
  const portValue = requiredEnvironmentValue("EMAIL_SMTP_PORT");
  const secureValue = requiredEnvironmentValue("EMAIL_SMTP_SECURE").toLowerCase();
  const user = requiredEnvironmentValue("EMAIL_SMTP_USER");
  const password = requiredEnvironmentValue("EMAIL_SMTP_PASSWORD");
  const from = requiredEnvironmentValue("EMAIL_FROM");
  const frontendUrl = requiredEnvironmentValue("FRONTEND_URL");
  const port = Number(portValue);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("EMAIL_SMTP_PORT must be a valid port number");
  }
  if (secureValue !== "true" && secureValue !== "false") {
    throw new Error("EMAIL_SMTP_SECURE must be true or false");
  }

  let parsedFrontendUrl;
  try {
    parsedFrontendUrl = new URL(frontendUrl);
  } catch {
    throw new Error("FRONTEND_URL must be a valid HTTP(S) URL");
  }

  if (
    !["http:", "https:"].includes(parsedFrontendUrl.protocol) ||
    parsedFrontendUrl.username ||
    parsedFrontendUrl.password ||
    (process.env.NODE_ENV === "production" &&
      parsedFrontendUrl.protocol !== "https:")
  ) {
    throw new Error("FRONTEND_URL must use HTTPS in production");
  }

  return {
    host,
    port,
    secure: secureValue === "true",
    auth: { user, pass: password },
    from,
    frontendUrl: `${parsedFrontendUrl.origin}${parsedFrontendUrl.pathname.replace(/\/$/, "")}`,
  };
}