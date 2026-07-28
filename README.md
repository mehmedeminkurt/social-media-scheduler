# Social Media Scheduler

A monorepo for scheduling and posting content to social media platforms.

## Prerequisites
- Node.js: `>= 18.0.0`
- npm: `>= 10.0.0`

## Getting Started


### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cd apps/frontend
cp .env.example .env
# Update .env with your required credentials and database URL
```

### 3. Initialize database
```bash
npx prisma db push
```

### 4. Run development
```bash
cd ../..
npm run dev
```

In a second terminal, start the publish worker (required for scheduled and queued posts):
```bash
npm run dev:worker
```

The worker polls Postgres with `FOR UPDATE SKIP LOCKED` and publishes due posts in the background — including Reels polling that would timeout in a serverless API route.