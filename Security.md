# Security Policy

Security fixes apply to the latest code on the default branch. Upgrade older deployments promptly.

## Reporting Vulnerabilities

Do not report vulnerabilities in public issues or pull requests. Use GitHub **Security > Advisories > Report a vulnerability** for private reporting.

Include the affected area, reproduction steps, potential impact, environment details, and relevant logs with passwords, tokens, and personal data removed. Allow time for triage and a fix before public disclosure.

Do not access or modify data you do not own, test against real accounts, or disrupt a production deployment.

## Security Measures

- Bcrypt password verification and JWT sessions
- Server-side authentication and role/permission checks
- Login attempt throttling and temporary lockouts
- Prisma database access
- Validated image uploads with size, MIME, and signature checks
- Server-side OpenAI API keys
- TLS for supported TiDB Cloud connections

## Deployment

- Keep `.env` files and secrets out of source control.
- Use strong, unique database, administrator, authentication, and API credentials.
- Use HTTPS and restrict database access.
- Set `AUTH_TRUST_PROXY_IP=true` only behind a trusted reverse proxy.
- Grant administrator and manage permissions only to trusted users.
- Back up the database and files in `public/uploads/`.
- Apply Prisma migrations before deployment.
- Patch dependencies and runtime platforms regularly.
- Do not log passwords, tokens, API keys, or sensitive personal data.

