# Balance Forecast

A self-hosted personal finance forecasting app. Enter your recurring and one-time income/expenses, set your current balance, and see a running projection of where your money will be — days, months, or years from now.

![Balance Forecast screenshot](https://raw.githubusercontent.com/beanpoppa/balance-forecast-app/master/public/screenshot.png)

## Features

- **Balance forecast chart** — area chart showing projected balance over 30 days to 5 years
- **Recurring & one-time items** — weekly, bi-weekly, monthly, quarterly, annual, or one-time transactions
- **Inline item editing** — edit name, amount, type, frequency, and dates without deleting and recreating
- **Override amounts** — adjust a single future occurrence or update all future occurrences at once
- **Reconcile transactions** — mark items as cleared to keep your starting balance in sync with your bank
- **Cancel occurrences** — skip a single instance of a recurring item without deleting it
- **Calendar view** — month calendar showing every scheduled transaction with reconcile/cancel controls
- **Low balance alerts** — configurable threshold with warning banner and chart reference line
- **CSV import/export** — bulk-load items from a spreadsheet or back them up
- **Multi-user** — each login has its own isolated dataset; admin can create and delete accounts
- **Dark/light mode** — preference saved per user
- **Fully self-hosted** — SQLite database, no external services required

## Quick start (Docker)

The easiest way to run Balance Forecast is with the provided `docker-compose.yml`.

```yaml
services:
  backend:
    image: beanpoppa/balance-forecast-backend:latest
    container_name: balance-forecast-backend
    environment:
      - JWT_SECRET=replace-with-a-long-random-string
      - DB_PATH=/data/forecast.db
    volumes:
      - /your/data/path:/data
    restart: unless-stopped

  frontend:
    image: beanpoppa/balance-forecast-frontend:latest
    container_name: balance-forecast-frontend
    ports:
      - "3050:80"
    depends_on:
      - backend
    restart: unless-stopped
```

```bash
docker compose up -d
```

Then open `http://localhost:3050`. On first run you'll be prompted to create an admin account.

> **Note:** `JWT_SECRET` must be set to a strong, random string. The backend will refuse to start without it.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | *(required)* | Secret used to sign auth tokens. Use a long random string. |
| `DB_PATH` | `/data/forecast.db` | Path to the SQLite database file inside the container. |
| `PORT` | `3001` | Port the backend listens on. |

## Architecture

```
Browser → Nginx (port 3050)
            ├── /api/*  →  Express backend (port 3001)
            │                └── SQLite (DB_PATH)
            └── /*      →  React SPA
```

The frontend calls `/api/*` with a JWT bearer token. Nginx proxies those requests to the backend container over the internal Docker network. There is no direct external exposure of the backend.

## Development

### Prerequisites

- Node.js 20+

### Frontend

```bash
cd my-forecast-app
npm install
npm run dev        # http://localhost:5173 with HMR
```

The dev server proxies `/api/*` to `localhost:3001` (configure in `vite.config.js` if needed).

### Backend

```bash
cd my-forecast-backend
JWT_SECRET=dev-secret npm start   # http://localhost:3001
```

The database will be created at `/data/forecast.db` by default. Override with `DB_PATH=./local.db`.

### Building Docker images manually

```bash
# Backend
cd my-forecast-backend
docker build -t balance-forecast-backend .

# Frontend
cd my-forecast-app
docker build -t balance-forecast-frontend .
```

## User management

- The first account is created through the setup screen on first launch.
- Additional users are created by an admin via the **⚙️ Admin** panel.
- Each user has their own items, settings, reconciled marks, and overrides — data is never shared between accounts.
- Passwords must be at least 8 characters.

## CSV format

Export/import uses a simple CSV with a header row:

```
name,amount,type,frequency,startDate,endDate
Rent,1500,expense,Monthly,2024-01-01,
Salary,3000,income,Bi-weekly,2024-01-05,
Bonus,500,income,One-time,2024-06-01,
```

| Field | Values |
|---|---|
| `type` | `income` or `expense` |
| `frequency` | `One-time`, `Weekly`, `Bi-weekly`, `Monthly`, `Quarterly`, `Annual` |
| `startDate` | `YYYY-MM-DD` |
| `endDate` | `YYYY-MM-DD` or empty |

Fields containing commas are automatically quoted on export and handled correctly on import.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Recharts |
| Backend | Node.js, Express |
| Database | SQLite (via better-sqlite3) |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Serving | Nginx (reverse proxy + SPA routing) |
| Container | Docker / Docker Compose |
