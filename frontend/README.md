# Reaggie Frontend

## Local Development

To facilitate local development, you can seamlessly switch between a production API server and a local one. This flexibility is achieved by configuring the environment through the `.env` file.

### Getting Started

1. Create a `.env` file in the project root.

   - You can check the [`.env.example`](.env.example) file for guidance on specifying your preferred API server.

2. Install [pnpm](https://pnpm.io) and run `pnpm install` to install the dependencies.

3. Run `pnpm dev` to start the development server.

Operator inbox: `/alerts` (admin password / `MONGOPASS`). Player feedback and graphics reports POST to `/api/contact` on this backend instead of a hardcoded third-party URL.
