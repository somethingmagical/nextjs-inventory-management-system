# Inventory

Inventory is a web-based system for managing products, stock, warehouses, suppliers, customers, and staff accounts. It includes role-based access, searchable management pages, and per-warehouse stock tracking, with MySQL persistence through Prisma.

## Project Setup

Follow these steps to prepare a local development environment: install dependencies, connect the app to MySQL, apply the database schema, create the initial admin account, and start the development server.

### Requirements

- Node.js 20.9 or newer
- npm
- MySQL

### Install and configure

1. From the repository root, install dependencies:

   ```bash
   npm ci
   ```

2. Create a MySQL database for the application.

3. Create a `.env` file in the repository root:

   ```env
   DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE"
   AUTH_SECRET="replace-with-a-random-secret"
   ADMIN_EMAIL="admin@example.com"
   ADMIN_PASSWORD="choose-a-strong-password"

   # Optional account details
   ADMIN_FIRST_NAME="Admin"
   ADMIN_LAST_NAME="User"
   ADMIN_PHONE_NUMBER=""
   ADMIN_IMAGE=""
   ```

   Generate an authentication secret, for example with `openssl rand -base64 32`. URL-encode special characters in the database username or password if needed. Keep `.env` private; it is ignored by git.

4. Apply the checked-in Prisma migrations:

   ```bash
   npx prisma migrate deploy
   ```

5. Seed the default walk-in customer and admin user:

   ```bash
   npx prisma db seed
   ```

   The seed script hashes `ADMIN_PASSWORD` with `bcryptjs` before storing it. It upserts the admin by email, so rerunning the seed updates that account's details and password hash.

6. Start the development server:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) and sign in with the configured `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

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
