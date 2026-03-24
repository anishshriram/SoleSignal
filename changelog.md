# Changelog

## [Unreleased]

### Added
- Initial project setup for SoleSignal MVP.
- Created changelog.md to track all updates and decisions.
- Created backend/ directory for server-side code.
- Initialized Node.js project with npm init -y in backend/.
- Installed core dependencies: express (web framework), @prisma/client and prisma (ORM for PostgreSQL), jsonwebtoken (JWT auth), bcryptjs (password hashing), dotenv (environment variables).
- Installed dev dependency: nodemon (auto-restart server on changes).
- Updated package.json scripts: added "start" for production and "dev" for development with nodemon.
- Initialized Prisma with schema.prisma for database models (User, Sensor, EmergencyContact, Alert).
- Changed database provider to SQLite for quick setup (adaptable to PostgreSQL later).
- Set DATABASE_URL in .env for SQLite.
- Applied schema to database using prisma db push, created dev.db and generated Prisma Client (with import issues to resolve).
- Created basic server.js with Express, middleware, and root route.
- Added "type": "module" then reverted to CommonJS for compatibility.
- Installed ts-node for potential TypeScript support.
- Server is running on port 3000 (Prisma commented out for now, to be fixed).
- Committed and pushed Day 1 changes to GitHub repository at https://github.com/anishshriram/SoleSignal.git.
- Implemented Day 2: API endpoints for user registration (/users/register), login (/users/login), and adding emergency contacts (/contacts) with JWT authentication.
- Created middleware/auth.ts for JWT token verification.
- Created routes/users.ts with registration and login logic, including password hashing, validation, and JWT generation.
- Created routes/contacts.ts with protected route for adding contacts.
- Added clear comments to all routes and models.
- Updated server.ts to mount routes and use ES modules with tsx for TypeScript support.
- Prisma import issues persist; routes use direct path to generated client.

### Decisions
- Backend: Node.js with Express, PostgreSQL via Docker, Prisma for ORM.
- Adaptability: Use .env for configs, modular routes.
- Timeline: 1-week sprint with daily milestones.
- Dependencies: Chose bcryptjs over bcrypt for cross-platform compatibility; Prisma for type-safe database interactions.
- Database: Switched to SQLite for MVP speed (no external setup needed); can migrate to PostgreSQL later by changing provider and URL.
- Modules: Used CommonJS initially, switched to ES modules with TypeScript for better development experience.
- Prisma Import: Used custom output path; import from generated client directory.
- JWT: 24h expiry, no refresh token as per MVP.
- API: RESTful endpoints with JSON responses, error handling, and input validation.
- Comments: JSDoc for functions, inline for logic.</content>
<parameter name="filePath">/Users/anishshriram/Desktop/SoleSignal/SoleSignal/changelog.md