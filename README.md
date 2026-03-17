# OWU - Open Web UI

A lightweight, self-hosted LLM chat interface built with React Router, MySQL, and Docker. Features real-time streaming responses, user management, and admin-configurable model access.

## Features

- **User Authentication** - Registration, login, and session-based authentication with HTTP-only cookies
- **Admin Configuration** - Manage OpenAI API credentials and control which models users can access
- **Real-time Streaming** - SSE-based streaming responses for a smooth chat experience
- **Model Whitelist** - Admins control which OpenAI models are available to users
- **Persistent Chat** - Chat history is saved and accessible across sessions
- **Responsive Design** - Works on desktop and mobile devices

## Tech Stack

- **Framework**: React Router 7 (Framework Mode)
- **Frontend**: React 19, Tailwind CSS 4
- **Backend**: React Router loaders/actions with cookie-based sessions
- **Database**: MySQL 8 with Prisma ORM
- **AI Provider**: OpenAI API with streaming support
- **Runtime**: Node.js 22+
- **Container**: Docker & Docker Compose

## Quick Start

### Prerequisites

- Node.js >= 22.0.0
- npm (comes with Node.js)
- Docker & Docker Compose

### 1. Start MySQL

```bash
docker-compose up -d mysql
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env if needed (default values work with docker-compose)
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Initialize Database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed admin user
npm run db:seed
```

### 5. Start Development Server

```bash
npm run dev
```

Visit http://localhost:3000

## Default Credentials

### Admin Account
After seeding, login with:
- **Username**: `admin`
- **Password**: `admin123`

> **Warning**: Change this password immediately in production!

## First-Time Setup

1. Login with the admin account
2. Go to **Admin Settings** (accessible from the sidebar or directly at `/admin`)
3. Configure your OpenAI API key (required, must be non-empty)
4. Add allowed models (one per line), e.g.:
   ```
   gpt-4o-mini
   gpt-4o
   gpt-4-turbo
   ```
5. Save settings - the system will show "Ready for chat" when properly configured
6. Navigate to **New Chat** and start chatting!

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run typecheck` - Run TypeScript type checking
- `npm run db:migrate` - Run database migrations
- `npm run db:generate` - Generate Prisma client
- `npm run db:seed` - Seed database with initial data
- `npm run db:studio` - Open Prisma Studio
- `npm run db:reset` - Reset database and re-seed

## Project Structure

```
.
├── app/
│   ├── lib/
│   │   └── server/      # Server-only modules (db, env, config, auth)
│   ├── routes/          # Application routes
│   │   ├── auth/        # Login, Register, Logout
│   │   ├── chat/        # Chat interface with streaming
│   │   └── admin/       # Admin settings
│   ├── app.css          # Global styles
│   ├── root.tsx         # Root layout
│   ├── routes.ts        # Route configuration
│   └── sessions.ts      # Session configuration
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── seed.ts          # Database seed script
├── docker-compose.yml   # Docker services
├── Dockerfile           # App container
└── .env.example         # Environment template
```

## Key Features

### Streaming Chat
The chat interface uses Server-Sent Events (SSE) for real-time streaming:
- User message is persisted immediately
- Assistant response streams token-by-token
- Message is only saved after streaming completes
- Errors are displayed without creating fake messages

### Admin Configuration
- **API Key**: Required, stored securely server-side
- **Base URL**: Optional, for custom OpenAI-compatible endpoints
- **Allowed Models**: Whitelist of models users can select from

### Security
- **Server-only modules**: All sensitive operations in `app/lib/server/*` marked with `server-only` package
- **HTTP-only cookies**: Session tokens not accessible to JavaScript
- **API key protection**: OpenAI credentials never exposed to browser
- **Ownership checks**: Users can only access their own chat sessions
- **Role-based access**: Admin-only routes protected at server level

## Environment Variables

Required variables (see `.env.example`):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://user:pass@localhost:3306/owu` |
| `SHADOW_DATABASE_URL` | Dedicated Prisma shadow database for `migrate dev` | `mysql://user:pass@localhost:3306/owu_shadow` |
| `SESSION_SECRET` | Secret for signing cookies | Generate a random string |
| `APP_PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |

## Troubleshooting

### Database connection errors
Ensure MySQL is running: `docker-compose ps`

### `P3014` / shadow database permission errors
This project uses a dedicated `SHADOW_DATABASE_URL` so `prisma migrate dev` does not need `CREATE DATABASE` privileges on the application user. If you added this fix after MySQL was already initialized, run the SQL setup once in the running container or recreate the MySQL volume so `docker/mysql/init/01-grant-prisma-shadow.sh` can create the `owu_shadow` database and grants.

### "No models available" error
Admin needs to configure allowed models in Admin Settings

### Streaming not working
Check browser console for SSE connection errors. Ensure the server supports streaming responses.

## Architecture Decisions

### Why SSE over WebSockets?
SSE was chosen for streaming because:
- Simpler implementation with standard HTTP
- Automatic reconnection handling
- Works through most proxies/firewalls
- Perfect fit for one-way server-to-client streaming

### Cookie-based sessions
- No JWT storage in localStorage (XSS protection)
- Automatic browser handling of session expiration
- Simple server-side session invalidation

## Development

### Adding New Models
Admins can add any OpenAI-compatible model identifier:
- OpenAI models: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`
- Compatible endpoints: Any model identifier your API supports

### Database Schema
Key entities:
- `User` - Accounts with role (admin/user)
- `SystemConfig` - Singleton configuration record
- `ChatSession` - Conversation container
- `ChatMessage` - Individual messages

## License

Private - For internal use only
