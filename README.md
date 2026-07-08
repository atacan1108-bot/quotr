This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

There are two ways to run the app locally. Use whichever matches what you're doing:

### `npm run dev` — everyday development, on this computer

```bash
npm run dev
```

Starts the app and, once it's ready, prints exactly what to open:

```
✅ Your app is running.
   On this computer, open: http://localhost:3000
   On your phone (same wifi), open: http://192.168.x.x:3000
```

The "on your phone" link works from any device on the same wifi network, over
plain http. That's fine for quickly eyeballing the layout on your phone, but
it will **not** let you install the app as a PWA or test offline/service-worker
behavior — phones require https for those.

### `npm run phone` — testing on your phone as a real app (https + QR code)

```bash
npm run phone
```

Starts the app the same way, then opens a free [Cloudflare quick
tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)
(via `cloudflared`) that gives it a temporary public **https** address —
no account or signup needed. It prints that link and a QR code right in the
terminal, so you can just point your phone's camera at it:

```
✅ Your app is available on your phone.
   Open this link: https://random-words.trycloudflare.com

📱 Or scan this QR code with your phone's camera:
   [QR code]
```

Use this whenever you need to install the app as a PWA on your phone or test
anything that depends on https (service workers, offline mode, etc.) — those
features are blocked over plain http.

The link is temporary and stops working as soon as you press Ctrl+C.

If you don't have `cloudflared` installed yet, `npm run phone` will tell you
the exact command to install it (`brew install cloudflared`) and stop —
just run the command it gives you, then run `npm run phone` again.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
