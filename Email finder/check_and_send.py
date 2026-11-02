import re
import smtplib
import socket

try:
    import dns.resolver  # type: ignore[import-not-found]
except ImportError:
    dns = None  # type: ignore[assignment]

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# Used only as the "from" address during the check. Nothing is sent.
PROBE_FROM = "check@example.com"


def check_format(email: str) -> bool:
    return bool(EMAIL_REGEX.match(email))


def get_mx_host(domain: str):
    """Return the domain's main mail server, or None if it has none."""
    try:
        records = dns.resolver.resolve(domain, "MX")
        best = sorted(records, key=lambda r: r.preference)[0]
        return str(best.exchange).rstrip(".")
    except Exception:
        return None


def smtp_probe(email: str, mx_host: str):
    """
    Ask the mail server if it would accept this address.
    No email is sent. Returns True, False, or None (could not tell).
    """
    try:
        with smtplib.SMTP(mx_host, 25, timeout=10) as server:
            server.helo("example.com")
            server.mail(PROBE_FROM)
            code, _ = server.rcpt(email)
            if code in (250, 251):
                return True
            if code in (550, 551, 553):
                return False
            return None
    except (socket.timeout, OSError, smtplib.SMTPException):
        # Port 25 is blocked on many home networks
        return None


def check_email(email: str) -> str:
    email = email.strip().lower()

    if not check_format(email):
        return "INVALID: not a valid email format"

    domain = email.split("@")[1]
    mx_host = get_mx_host(domain)
    if not mx_host:
        return f"INVALID: the domain '{domain}' cannot receive email"

    result = smtp_probe(email, mx_host)
    if result is False:
        return "INVALID: the mail server says this mailbox does not exist"
    if result is True:
        return "LIKELY VALID: the mail server accepted it"
    return "UNKNOWN: domain is fine, but the mailbox could not be confirmed"


if __name__ == "__main__":
    while True:
        email = input("Enter an email to check (or press Enter to quit): ").strip()
        if not email:
            break
        print(check_email(email))
        print()