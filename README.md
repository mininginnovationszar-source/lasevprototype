# Lasev Production

This folder is for the full-stack production build.

- `App/` is the production management app.
- `Website/` is the public production website.
- `Backend/` is the Express/Postgres API.

Production website requests post to `/api/website-requests`, and the production app reads those requests from the backend/database.
