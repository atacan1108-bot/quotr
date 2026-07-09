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

// Generous but bounded — page.setContent() can hang indefinitely if a
// template references a slow/unreachable external image, font, or
// stylesheet, since `waitUntil: 'load'` waits for every referenced
// resource. Each stage gets its own budget so a stuck render fails fast
// with a specific message instead of running until the platform kills the
// whole function.
const LAUNCH_TIMEOUT_MS = 15_000
const CONTENT_TIMEOUT_MS = 20_000
const PDF_TIMEOUT_MS = 15_000

/** Carries a plain-language, stage-specific message — never a raw stack trace. */
export class PdfRenderError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'PdfRenderError'
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new PdfRenderError(timeoutMessage)), ms)
    promise.then(
      value => { clearTimeout(timer); resolve(value) },
      err   => { clearTimeout(timer); reject(err) },
    )
  })
}

function describeLaunchError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('ENOENT') || msg.toLowerCase().includes('failed to launch')) {
    return 'Could not start the PDF engine (headless Chrome) in this environment — it may not be installed or reachable here.'
  }
  return `Could not start the PDF engine: ${msg}`
}

function describeRenderError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.toLowerCase().includes('target closed') || msg.toLowerCase().includes('protocol error')) {
    return 'The PDF engine crashed while rendering — this can happen with a very large or overly complex template.'
  }
  return `PDF rendering failed: ${msg}`
}

async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default
    // Matches @sparticuz/chromium's own documented usage for this package
    // version exactly (puppeteer.defaultArgs({ args: chromium.args,
    // headless: "shell" }), not a plain `headless: true` + raw chromium.args)
    // — the two diverged in recent releases and using the wrong combination
    // is a known cause of the launch silently failing on Lambda/Vercel.
    return puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
      headless: 'shell',
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
  let browser: Browser
  try {
    browser = await withTimeout(
      launchBrowser(),
      LAUNCH_TIMEOUT_MS,
      'The PDF engine took too long to start.',
    )
  } catch (err) {
    if (err instanceof PdfRenderError) throw err
    throw new PdfRenderError(describeLaunchError(err), err)
  }

  try {
    const page = await browser.newPage()
    try {
      // puppeteer-core disallows 'networkidle0'/'networkidle2' specifically
      // for setContent (only meaningful for real navigation) — 'load' also
      // waits for referenced images (e.g. the business logo) to finish.
      await withTimeout(
        page.setContent(html, { waitUntil: 'load' }),
        CONTENT_TIMEOUT_MS,
        'Rendering timed out — the template likely references a slow-loading or unreachable image, font, or external resource. Use embedded/inline images and fonts instead of remote URLs.',
      )
      const pdf = await withTimeout(
        page.pdf({ format: 'A4', printBackground: true }),
        PDF_TIMEOUT_MS,
        'Generating the PDF file itself timed out.',
      )
      return Buffer.from(pdf)
    } catch (err) {
      if (err instanceof PdfRenderError) throw err
      throw new PdfRenderError(describeRenderError(err), err)
    }
  } finally {
    await browser.close().catch(() => {})
  }
}
