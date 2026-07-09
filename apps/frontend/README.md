## Setup

### 1. Install dependencies

From the repository root:

```bash
npm install
```

### 2. Configure environment variables

```bash
cd apps/frontend
cp .env.example .env
```

Edit `.env` and set at least:

- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
- `NEXTAUTH_URL` — `http://localhost:3000` for local development
- `RESEND_API_KEY` — optional locally; required for password-reset emails

Never commit `.env`; it is listed in `.gitignore`.

### 3. Create the database

Create a PostgreSQL database matching the name in your `DATABASE_URL`, for example:

```sql
CREATE DATABASE social_media_scheduler;
```

### 4. Push the Prisma schema

From `apps/frontend`:

```bash
npx prisma db push
```

This syncs the schema in `prisma/schema.prisma` to your database.

### 5. Start the dev server

From the repository root:

```bash
npm run dev
```

Or from `apps/frontend`:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

If required environment variables are missing, the app fails at startup with a clear error instead of connecting to a wrong database.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
