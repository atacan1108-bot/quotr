/**
 * Renders a fully-filled HTML quote document to a PDF buffer using headless
 * Chromium via puppeteer-core. SERVER-ONLY.
 *
 * Two execution paths, chosen automatically:
 *  - Vercel (or any env with VERCEL set): @sparticuz/chromium supplies a
 *    Linux binary built for serverless — this is the production path.
 *  - Local dev: @sparticuz/chromium ships a Linux-only binary and will not
 *    execute on macOS/Windows, so local dev launches the machine's actual
 *    Chrome install instead (override with CHROME_EXECUTABLE_PATH).
 *
 * This split was validated directly, not assumed: @sparticuz/chromium's
 * executablePath() resolves without error on macOS, but the binary it
 * points to is a Linux ELF and never actually runs there.
 */
import puppeteer, { type Browser } from 'puppeteer-core'

const DEFAULT_MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const DEFAULT_LINUX_CHROME_CANDIDATES = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium']

async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default
    return puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
    })
  }

  const executablePath =
    process.env.CHROME_EXECUTABLE_PATH ||
    (process.platform === 'darwin' ? DEFAULT_MAC_CHROME : DEFAULT_LINUX_CHROME_CANDIDATES[0])

  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    // puppeteer-core disallows 'networkidle0'/'networkidle2' specifically
    // for setContent (only meaningful for real navigation) — 'load' also
    // waits for referenced images (e.g. the business logo) to finish.
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
