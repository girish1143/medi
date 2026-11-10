# Database Directory (SQLite + Prisma)

This project uses **SQLite** managed exclusively via **Prisma ORM** inside the decoupled Express `backend/` service (`frontend/` contains zero Prisma dependencies or direct database access).

- **Schema:** [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma)
- **Migrations:** [`backend/prisma/migrations/`](../backend/prisma/migrations/)
- **Connection String (`backend/.env`):** `DATABASE_URL="file:./dev.db"`

Run Prisma commands from `backend/` or the workspace root:

```bash
cd backend
npm run db:validate
npm run db:generate
npm run db:migrate
npm run db:status
```
