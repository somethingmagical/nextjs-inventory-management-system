# Inventory

Inventory is a web-based system for managing products, stock, warehouses, suppliers, customers, and staff accounts. It includes role-based access, searchable management pages, purchases and sales with returns, stock adjustments, transfers, expenses, and reports. Data is stored in MySQL or MariaDB through Prisma.

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
   DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE"
   AUTH_SECRET="replace-with-a-random-secret"
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

   The database URL must use the `mysql://` or `mariadb://` protocol and include the database name. URL-encode special characters in the username or password. Generate an authentication secret, for example with `openssl rand -base64 32`. Keep `.env` private; it is ignored by git.

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

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | MySQL/MariaDB connection URL and database name. |
| `AUTH_SECRET` | Yes | Secret used to sign authentication tokens. |
| `ADMIN_EMAIL` | Yes, for seeding | Email address for the initial administrator account. |
| `ADMIN_PASSWORD` | Yes, for seeding | Initial administrator password. |
| `ADMIN_FIRST_NAME` | No | Administrator first name; defaults to `Admin`. |
| `ADMIN_LAST_NAME` | No | Administrator last name; defaults to `User`. |
| `ADMIN_PHONE_NUMBER` | No | Administrator phone number. |
| `ADMIN_IMAGE` | No | Administrator avatar URL. |
| `NEXT_PUBLIC_APP_NAME` | No | App name shown in the interface; defaults to `Inventory`. |
| `NEXT_PUBLIC_APP_URL` | No | Public app URL used for metadata; defaults to `http://localhost:3000`. |

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
