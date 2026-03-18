# Security Policy

## Supported Versions

Only the latest production deployment of Lemons is actively supported with security updates.

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public GitHub issue.

Instead, report it by emailing the maintainers directly or using GitHub's private vulnerability reporting feature:
**Security → Report a vulnerability** on the repository page.

Please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce the issue
- Any relevant logs, screenshots, or proof-of-concept code

You can expect an acknowledgement within **48 hours** and a status update within **7 days**.

## Scope

The following are in scope for security reports:

- Authentication and session management issues
- Row Level Security (RLS) bypass or data access across households
- SQL injection or database vulnerabilities
- API authorization flaws (accessing another user's data)
- Sensitive data exposure (credentials, personal information)
- Cross-site scripting (XSS) or cross-site request forgery (CSRF)
- Insecure file upload handling (recipe images, avatars)

The following are out of scope:

- Vulnerabilities in third-party services (Supabase, Vercel, Anthropic)
- Social engineering or phishing attacks
- Denial of service attacks
- Issues affecting only the reporter's own account

## Security Practices

- All database tables with `household_id` enforce Row Level Security at the Postgres level
- Authentication is handled by Supabase Auth (email/password and OAuth)
- Images uploaded via the Claude API are size-limited and compressed client-side before transmission
- Environment variables and secrets are never committed to the repository
- Staging and production databases are isolated; local development uses a local Docker instance
