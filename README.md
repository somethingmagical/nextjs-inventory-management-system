# Inventory

Inventory is a web-based system for managing products, stock, warehouses, suppliers, customers, and staff accounts. It includes role-based access, searchable management pages, purchases and sales with returns, stock adjustments, transfers, expenses, and reports. Data is stored in MySQL or MariaDB through Prisma.

The **Stock** page (`/stock`) organizes on-hand balances by warehouse and is available to roles with the `View Stock` permission. Warehouse setup remains on the separate Warehouse page; changes to quantities continue through the existing purchase, return, adjustment, and transfer workflows.

Role permissions separate read access from changes: **View** grants read-only access to a resource, while **Manage** grants write access and includes its matching View permission. Existing roles that have Manage permissions continue to receive the implied View access.

Administrators can update the application name, favicon, and header logo from Settings. The header logo accepts PNG, JPEG, or WebP images up to 2 MB; after replacing it, apply the checked-in database migrations to make the new setting available.

## Project Setup

Follow these steps to prepare a local development environment: install dependencies, connect the app to MySQL or MariaDB, apply the database schema, create the initial administrator account, and start the development server.

### Requirements

- Node.js 20.9 or newer
- npm
- MySQL or MariaDB

### Install and configure

1. From the repository root, install dependencies:

   ```bash
   npm ci
   ```

2. Create an empty MySQL or MariaDB database for the application.

3. Create a `.env` file in the repository root:

   ```env
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USERNAME='root'
   DB_PASSWORD=''
   DB_DATABASE='nextinventory'
   AUTH_SECRET="replace-with-a-random-secret"
   # Set to true only when a trusted reverse proxy overwrites X-Forwarded-For.
   AUTH_TRUST_PROXY_IP="false"
   ADMIN_EMAIL="admin@example.com"
   ADMIN_PASSWORD="choose-a-strong-password"
   NEXT_PUBLIC_APP_NAME="Inventory Management System"
   NEXT_PUBLIC_APP_URL="http://localhost:3000"

   # Optional account details
   ADMIN_FIRST_NAME="Admin"
   ADMIN_LAST_NAME="User"
   ADMIN_PHONE_NUMBER=""
   ADMIN_IMAGE=""
   ```

   TiDB Cloud hosts automatically use certificate-verified TLS. Generate an authentication secret, for example with `openssl rand -base64 32`. Keep `.env` private; it is ignored by git.

4. Generate the Prisma client and apply the checked-in database migrations:

   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

5. Seed the default walk-in customer and administrator account:

   ```bash
   npx prisma db seed
   ```

   The seed script creates the walk-in customer and an `admin` role with all permissions, then upserts the administrator using `ADMIN_EMAIL`. It hashes `ADMIN_PASSWORD` with bcrypt before storing it. Rerunning the seed updates the matching administrator's details and password hash.

6. Start the development server:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) and sign in with the configured `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

### Environment variables

Credential sign-in is throttled after 5 failed attempts per email/IP pair and 20
failed attempts per IP in a 15-minute window. When no trusted client IP is
configured, the fallback is 30 failed attempts per email. A threshold triggers a
15-minute lockout. These limits are stored in the database; apply the checked-in
`LoginAttemptBucket` migration before deploying this version.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DB_HOST` | Yes | MySQL/MariaDB server hostname or IP address. |
| `DB_PORT` | Yes | MySQL/MariaDB server port. |
| `DB_USERNAME` | Yes | Database username. |
| `DB_PASSWORD` | Yes | Database password; may be empty for local development. |
| `DB_DATABASE` | Yes | Database name. |
| `AUTH_SECRET` | Yes | Secret used to sign authentication tokens. |
| `AUTH_TRUST_PROXY_IP` | No | Set to `true` only when a trusted reverse proxy overwrites `X-Forwarded-For`; enables per-IP login throttling. |
| `ADMIN_EMAIL` | Yes, for seeding | Email address for the initial administrator account. |
| `ADMIN_PASSWORD` | Yes, for seeding | Initial administrator password. |
| `ADMIN_FIRST_NAME` | No | Administrator first name; defaults to `Admin`. |
| `ADMIN_LAST_NAME` | No | Administrator last name; defaults to `User`. |
| `ADMIN_PHONE_NUMBER` | No | Administrator phone number. |
| `ADMIN_IMAGE` | No | Administrator avatar URL. |
| `NEXT_PUBLIC_APP_NAME` | No | App name shown in the interface; defaults to `Inventory`. |
| `NEXT_PUBLIC_APP_URL` | No | Absolute HTTP(S) public app URL used for metadata; defaults to `http://localhost:3000`. Invalid values are reported and omitted from metadata. |
| `GEONAMES_USERNAME` | No | Server-only GeoNames username for loading postal-code options after city selection in warehouse, customer, and supplier forms. If unset or unavailable, the postal code can be entered manually. |

### Other useful commands

```bash
npm run build   # Create a production build
npm run start   # Serve the production build
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)

## Deploy

See the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for deployment guidance.
