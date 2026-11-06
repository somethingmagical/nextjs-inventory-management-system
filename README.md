This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Seeding the Admin User

Configure the admin account and database connection in your local `.env` file:

```env
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DATABASE"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="choose-a-strong-password"

# Optional account details
ADMIN_FIRST_NAME="Admin"
ADMIN_LAST_NAME="User"
ADMIN_PHONE_NUMBER=""
ADMIN_IMAGE=""
```

Keep `.env` private and do not commit it. The seed script reads `ADMIN_PASSWORD` as input, hashes it with `bcryptjs` before writing to the database, and stores only the hash. It does not require you to generate a password hash yourself.

Run the seed from the project root:

```bash
npx prisma db seed
```

The script upserts the admin by email: it creates the account if that email is not in the database, or updates its details and password hash if it already exists.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
