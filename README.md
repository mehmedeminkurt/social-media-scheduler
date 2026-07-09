# Social Media Scheduler

A monorepo for scheduling and posting content to social media platforms.

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