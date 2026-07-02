This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Troubleshooting

### Page renders unstyled (serif font, plain form controls)

This almost always means a **stale/zombie `next dev` server** is still holding
port 3000 and serving an old build, while your new `npm run dev` silently
bounced to port 3001/3002. On Windows, `Ctrl+C` (or a killed terminal) doesn't
always terminate the underlying Node process.

Fix — free the port, then start fresh:

```powershell
npm run dev:clean
```

`dev:clean` runs `scripts/free-port.ps1` (kills whatever listens on port 3000)
and then starts `next dev`. You can also free a specific port manually:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/free-port.ps1 -Port 3000
```

If styling still looks wrong after that, clear the Next build cache and retry:
delete the `.next` folder, then `npm run dev:clean`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
