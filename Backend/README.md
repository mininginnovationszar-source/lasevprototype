# Lasev Resort — Backend API

## Stack
- Node.js + Express
- PostgreSQL (via `pg`)
- JWT auth + bcrypt passwords

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create the database
```bash
psql -U postgres -c "CREATE DATABASE lasev_db;"
```

### 3. Configure environment
Copy `.env.example` to `.env` and fill in your Postgres password and a JWT secret:
```bash
cp .env.example .env
```

### 4. Run the migration (creates all tables)
```bash
psql -U postgres -d lasev_db -f src/db/migrations/001_init.sql
```

### 5. Seed first accounts and default data
Set the `SEED_*` values in `.env` first. The developer login is created from:

- `SEED_DEV_NAME`
- `SEED_DEV_PASSWORD`

```bash
npm run seed
```

### 6. Start the server
```bash
npm run dev        # development (auto-restarts)
npm start          # production
```

### 7. Test it
Check:
```bash
curl /api/health
curl /api/ready
```

---

## Backups

```bash
npm run backup
npm run restore -- path/to/lasev-backup.json
```

---

## API Endpoints

### Auth
| Method | Path           | Auth | Description        |
|--------|----------------|------|--------------------|
| POST   | /api/auth/login | No  | Login, returns JWT |
| GET    | /api/auth/me    | Yes | Get current user   |

### Rooms
| Method | Path           | Roles               |
|--------|----------------|---------------------|
| GET    | /api/rooms     | All                 |
| POST   | /api/rooms     | owner, developer    |
| PUT    | /api/rooms/:id | owner, developer    |
| DELETE | /api/rooms/:id | owner, developer    |

### Bookings
| Method | Path              | Roles               |
|--------|-------------------|---------------------|
| GET    | /api/bookings     | All                 |
| POST   | /api/bookings     | All                 |
| PUT    | /api/bookings/:id | All                 |
| DELETE | /api/bookings/:id | owner, developer    |

### Venues
Same pattern as bookings at `/api/venues`

### Staff
| Method | Path                      | Roles            |
|--------|---------------------------|------------------|
| GET    | /api/staff                | All              |
| POST   | /api/staff                | owner, developer |
| GET    | /api/staff/shifts?date=   | All              |
| POST   | /api/staff/shifts/clock-in  | All            |
| POST   | /api/staff/shifts/clock-out | All            |

### Reports
- `GET /api/reports/revenue?month=5&year=2026` — owner/developer only
- `GET /api/reports/occupancy` — owner/developer only

### Activity
- `GET /api/activity?limit=50` — developer only
