function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export default function verifyEmailTemplate(verificationUrl, expiryMinutes) {
  const safeUrl = escapeHtml(verificationUrl);
  const expiryNotice = `This link expires in ${expiryMinutes} minutes.`;

  return {
    subject: "Verify your PadhaHai email address",
    text: [
      "Welcome to PadhaHai!",
      "Verify your email address using this link:",
      verificationUrl,
      "",
      expiryNotice,
      "If you did not create a PadhaHai account, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="margin:0;background:#f4f7fb;padding:40px 16px;font-family:Arial,sans-serif;color:#1f2937">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:36px">
          <h1 style="margin:0 0 16px;color:#155eef;font-size:26px">Welcome to PadhaHai</h1>
          <p style="font-size:16px;line-height:1.6">Verify your email address to finish setting up your PadhaHai account.</p>
          <p style="margin:28px 0">
            <a href="${safeUrl}" style="display:inline-block;border-radius:8px;background:#155eef;padding:13px 22px;color:#ffffff;text-decoration:none;font-weight:bold">Verify email address</a>
          </p>
          <p style="font-size:14px;line-height:1.6">${expiryNotice} If the button does not work, copy and paste this URL into your browser:</p>
          <p style="font-size:13px;line-height:1.6;word-break:break-all"><a href="${safeUrl}" style="color:#155eef">${safeUrl}</a></p>
          <p style="margin-top:28px;font-size:13px;line-height:1.6;color:#667085">If you did not create a PadhaHai account, you can ignore this email.</p>
        </div>
      </div>
    `,
  };
}