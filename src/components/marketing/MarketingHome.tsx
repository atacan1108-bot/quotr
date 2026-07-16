/**
 * The public Stipt marketing/introduction page — rendered at both `/`
 * (Dutch, default) and `/en` (English; see src/proxy.ts for how that
 * route sets the locale cookie before this renders). Ported from the
 * design reference at ./stipt-introductie.html: same layout, same copy
 * (now in messages/{nl,en}.json under "marketing" instead of inline
 * data-nl/data-en spans), same visual design (CSS below is a scoped,
 * near-verbatim port of the reference file's <style> block — a deliberate
 * choice over hand-translating everything into Tailwind utilities, so
 * this stays a faithful match to the approved design rather than drifting
 * from it). The only real behavioural change: the original's JS language
 * toggle is replaced by real links to `/` and `/en` (see LangToggle
 * below), and the CTAs route into the actual auth flow.
 *
 * Pure Server Component — no client-side state needed anywhere on this
 * page (the "toggle" is just navigation between two routes).
 */
import Link from 'next/link'
import { Space_Grotesk, Hanken_Grotesk, Space_Mono } from 'next/font/google'
import { getTranslations, getLocale } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { MARKETING_PRICING } from '@/lib/marketingPricing'

const spaceGrotesk = Space_Grotesk({ variable: '--font-stipt-display', subsets: ['latin'], weight: ['500', '600', '700'] })
const hankenGrotesk = Hanken_Grotesk({ variable: '--font-stipt-body', subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const spaceMono = Space_Mono({ variable: '--font-stipt-mono', subsets: ['latin'], weight: ['400', '700'] })

export default async function MarketingHome() {
  const t = await getTranslations('marketing')
  const locale = await getLocale() as Locale
  const year = new Date().getFullYear()

  return (
    <div className={`stipt ${spaceGrotesk.variable} ${hankenGrotesk.variable} ${spaceMono.variable}`}>
      <style>{STIPT_CSS}</style>

      <nav>
        <div className="wrap">
          <Link href="/" className="logo"><span className="w">Stipt</span><span className="d" /></Link>
          <div className="nav-links">
            <a href="#functies" className="hide-m">{t('nav.features')}</a>
            <a href="#hoe" className="hide-m">{t('nav.how')}</a>
            <a href="#prijzen" className="hide-m">{t('nav.pricing')}</a>
            <LangToggle locale={locale} />
            <Link href="/register" className="btn btn-primary">{t('nav.startFree')}</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <header className="hero">
        <div className="dots" />
        <div className="wrap">
          <div>
            <span className="badge"><span className="dot" />{t('hero.badge')}</span>
            <h1 className="big">
              {t('hero.titlePart1')} <span className="u">{t('hero.titleAccent')}</span> {t('hero.titlePart2')}<br />{t('hero.titleLine2')}
            </h1>
            <p className="sub">{t('hero.subtitle')}</p>
            <div className="cta">
              <Link href="/register" className="btn btn-primary">{t('hero.ctaPrimary')}</Link>
              <a href="#hoe" className="btn btn-ghost">{t('hero.ctaSecondary')}</a>
            </div>
            <p className="micro">{t('hero.micro')}</p>
          </div>

          <div className="phone">
            <div className="screen">
              <div className="top">
                <span className="l"><span className="w">Stipt</span><span className="d" /></span>
                <span className="k">{t('hero.phoneBadge')}</span>
              </div>
              <div className="bd">
                <div className="row"><span>{t('hero.phoneItem1')}</span><span className="a">{t('hero.phoneItem1Price')}</span></div>
                <div className="row"><span>{t('hero.phoneItem2')}</span><span className="a">{t('hero.phoneItem2Price')}</span></div>
                <div className="row"><span>{t('hero.phoneItem3')}</span><span className="a">{t('hero.phoneItem3Price')}</span></div>
                <div className="tot"><span>{t('hero.phoneTotal')}</span><span className="a">{t('hero.phoneTotalPrice')}</span></div>
                <div className="send">{t('hero.phoneSend')}</div>
                <div className="stamp">{t('hero.phoneStamp')}</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* TRUST STRIP */}
      <div className="strip">
        <div className="wrap">
          <div className="it"><span className="n">{t('trustStrip.stat1Number')}</span><span className="t">{t('trustStrip.stat1Text')}</span></div>
          <div className="it"><span className="n">{t('trustStrip.stat2Number')}</span><span className="t">{t('trustStrip.stat2Text')}</span></div>
          <div className="it"><span className="n">{t('trustStrip.stat3Number')}</span><span className="t">{t('trustStrip.stat3Text')}</span></div>
          <div className="it"><span className="n">{t('trustStrip.stat4Number')}</span><span className="t">{t('trustStrip.stat4Text')}</span></div>
        </div>
      </div>

      {/* FEATURES */}
      <section className="pad" id="functies">
        <div className="wrap">
          <span className="eyebrow">{t('features.eyebrow')}</span>
          <h2 className="hd">{t('features.title')}</h2>
          <p className="sec-lead">{t('features.lead')}</p>

          <div className="feat-grid">
            <div className="feat">
              <div className="ic"><svg viewBox="0 0 24 24"><path d="M4 5h16M4 12h16M4 19h10" /></svg></div>
              <h3>{t('features.f1Title')}</h3>
              <p>{t('features.f1Body')}</p>
            </div>
            <div className="feat">
              <div className="ic"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /><path d="M8 9h8M8 13h5" /></svg></div>
              <h3>{t('features.f2Title')}</h3>
              <p>{t('features.f2Body')}</p>
            </div>
            <div className="feat">
              <div className="ic"><svg viewBox="0 0 24 24"><path d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16" /></svg></div>
              <h3>{t('features.f3Title')}</h3>
              <p>{t('features.f3Body')}</p>
            </div>
            <div className="feat">
              <div className="ic"><svg viewBox="0 0 24 24"><path d="M12 3l7 4v5c0 4-3 7-7 8-4-1-7-4-7-8V7z" /><path d="M9 12l2 2 4-4" /></svg></div>
              <h3>{t('features.f4Title')}</h3>
              <p>{t('features.f4Body')}</p>
            </div>
            <div className="feat wide">
              <div className="ic" style={{ background: 'var(--oker-tint)' }}>
                <svg viewBox="0 0 24 24" style={{ stroke: 'var(--oker)' }}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 9h6v6H9z" /></svg>
              </div>
              <h3>{t('features.f5Title')}</h3>
              <p style={{ maxWidth: '70ch' }}>{t('features.f5Body')}</p>
              <span className="tag">{t('features.f5Tag')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="pad how" id="hoe">
        <div className="wrap">
          <span className="eyebrow">{t('how.eyebrow')}</span>
          <h2 className="hd">{t('how.title')}</h2>
          <p className="sec-lead">{t('how.lead')}</p>

          <div className="steps">
            <div className="step">
              <h3>{t('how.step1Title')}</h3>
              <p>{t('how.step1Body')}</p>
            </div>
            <div className="step">
              <h3>{t('how.step2Title')}</h3>
              <p>{t('how.step2Body')}</p>
            </div>
            <div className="step">
              <h3>{t('how.step3Title')}</h3>
              <p>{t('how.step3Body')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="pad" id="prijzen">
        <div className="wrap">
          <span className="eyebrow">{t('pricing.eyebrow')}</span>
          <h2 className="hd">{t('pricing.title')}</h2>
          <p className="sec-lead">{t('pricing.lead')}</p>

          <div className="price-grid">
            <div className="plan">
              <div className="pn">{t('pricing.freeName')}</div>
              <div className="pd">{t('pricing.freeDesc')}</div>
              <div className="amt">{t('pricing.freeAmount', { amount: MARKETING_PRICING.free.amount })}<span className="per"> {t('pricing.freePer')}</span></div>
              <ul>
                <li><CheckIcon />{t('pricing.freeFeature1')}</li>
                <li><CheckIcon />{t('pricing.freeFeature2')}</li>
                <li><CheckIcon />{t('pricing.freeFeature3')}</li>
                <li><CheckIcon />{t('pricing.freeFeature4')}</li>
                <li className="muted"><CrossIcon />{t('pricing.freeFeature5')}</li>
                <li className="muted"><CrossIcon />{t('pricing.freeFeature6')}</li>
              </ul>
              <Link href="/register" className="btn btn-ghost">{t('pricing.freeCta')}</Link>
            </div>

            <div className="plan featured">
              <span className="rib">{t('pricing.premiumBadge')}</span>
              <div className="pn">Premium</div>
              <div className="pd">{t('pricing.premiumDesc')}</div>
              <div className="amt">{t('pricing.premiumAmount', { amount: MARKETING_PRICING.premium.amount })}<span className="per"> {t('pricing.premiumPer')}</span></div>
              <ul>
                <li><CheckIcon />{t('pricing.premiumFeature1')}</li>
                <li><CheckIcon />{t('pricing.premiumFeature2')}</li>
                <li><CheckIcon />{t('pricing.premiumFeature3')}</li>
                <li><CheckIcon />{t('pricing.premiumFeature4')}</li>
                <li><CheckIcon />{t('pricing.premiumFeature5')}</li>
                <li><CheckIcon />{t('pricing.premiumFeature6')}</li>
              </ul>
              <Link href="/register" className="btn btn-amber">{t('pricing.premiumCta')}</Link>
            </div>
          </div>
          <p className="price-note">{t('pricing.note')}</p>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="final">
        <div className="dots" />
        <div className="wrap">
          <h2>{t('finalCta.title')}<span className="d">.</span></h2>
          <p>{t('finalCta.body')}</p>
          <div className="cta">
            <Link href="/register" className="btn btn-amber">{t('finalCta.ctaPrimary')}</Link>
            <a href="#functies" className="btn btn-ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>{t('finalCta.ctaSecondary')}</a>
          </div>
        </div>
      </section>

      <footer className="ft">
        <div className="wrap">
          <Link href="/" className="logo"><span className="w">Stipt</span><span className="d" /></Link>
          <div className="fl">
            <a href="#functies">{t('footer.features')}</a>
            <a href="#prijzen">{t('footer.pricing')}</a>
            <Link href="/login">{t('footer.login')}</Link>
            <a href="mailto:hallo@stipt.app">{t('footer.contact')}</a>
          </div>
          <small>{t('footer.copyright', { year })}</small>
        </div>
      </footer>
    </div>
  )
}

/** Real navigation between `/` and `/en` — not client-side state, see
 * src/proxy.ts for how visiting `/en` sets the locale cookie so the rest
 * of the app (if the visitor logs in) also opens in English. */
function LangToggle({ locale }: { locale: Locale }) {
  return (
    <div className="lang">
      <Link href="/" className={locale === 'nl' ? 'active' : ''}>NL</Link>
      <Link href="/en" className={locale === 'en' ? 'active' : ''}>EN</Link>
    </div>
  )
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" /></svg>
}

function CrossIcon() {
  return <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
}

/**
 * Scoped, near-verbatim port of stipt-introductie.html's <style> block —
 * class names (.hero, .feat, .plan, .step, etc.) are unusual/specific
 * enough that they don't collide with the portal's own Tailwind-utility-
 * only styling. Everything is nested under .stipt so none of this can
 * ever leak into or be affected by portal pages.
 */
const STIPT_CSS = `
.stipt{
  --diep-teal:#0F766E; --nacht-teal:#0A3C38; --teal-tint:#D6F2EC;
  --oker:#E4952B; --oker-tint:#FBEBCF;
  --papier:#FAF6EC; --papier-2:#F3ECDA; --inkt:#17201E;
  --steen-700:#575751; --steen-400:#9A988E; --steen-200:#E5E0D3; --lijn:#DAD4C4;
  --succes:#1F8A5B; --fout:#C4472C;
  --font-display: var(--font-stipt-display), ui-sans-serif, system-ui, sans-serif;
  --font-body: var(--font-stipt-body), system-ui, -apple-system, sans-serif;
  --font-mono: var(--font-stipt-mono), ui-monospace, monospace;
  background:var(--papier);color:var(--inkt);font-family:var(--font-body);line-height:1.55;-webkit-font-smoothing:antialiased;
}
.stipt *{box-sizing:border-box}
.stipt .wrap{max-width:1080px;margin:0 auto;padding:0 26px}
.stipt h1,.stipt h2,.stipt h3{font-family:var(--font-display);font-weight:600;letter-spacing:-0.025em;line-height:1.03;margin:0}
.stipt a{text-decoration:none;color:inherit}
.stipt p{margin:0}
.stipt ul{list-style:none;margin:0;padding:0}

/* NAV */
.stipt nav{position:sticky;top:0;z-index:40;background:rgba(250,246,236,0.88);backdrop-filter:blur(8px);border-bottom:1px solid var(--lijn)}
.stipt nav .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.stipt .logo{display:flex;align-items:baseline;gap:2px}
.stipt .logo .w{font-family:var(--font-display);font-weight:700;font-size:26px;letter-spacing:-0.04em;color:var(--inkt)}
.stipt .logo .d{width:7px;height:7px;border-radius:50%;background:var(--oker);margin-bottom:4px}
.stipt .nav-links{display:flex;align-items:center;gap:26px}
.stipt .nav-links a{font-size:14.5px;color:var(--steen-700)}
.stipt .nav-links a:hover{color:var(--diep-teal)}
.stipt .lang{display:flex;border:1px solid var(--lijn);border-radius:999px;overflow:hidden;font-family:var(--font-mono);font-size:12px}
.stipt .lang a{padding:5px 11px;color:var(--steen-400);min-width:11px;text-align:center}
.stipt .lang a.active{background:var(--diep-teal);color:#fff}
.stipt .btn{display:inline-block;font-weight:600;font-size:14.5px;padding:10px 18px;border-radius:10px;cursor:pointer;border:none;font-family:var(--font-body)}
.stipt .btn-primary{background:var(--diep-teal);color:#fff}
.stipt .btn-primary:hover{background:var(--nacht-teal)}
.stipt .btn-ghost{background:transparent;color:var(--inkt);border:1px solid var(--lijn)}
.stipt .btn-amber{background:var(--oker);color:#3a2606}
.stipt .btn-amber:hover{background:#cf861f}
@media(max-width:720px){.stipt .nav-links a.hide-m{display:none}}

/* HERO */
.stipt .hero{position:relative;overflow:hidden;padding:78px 0 66px}
.stipt .hero .dots{position:absolute;inset:0;background-image:radial-gradient(var(--steen-200) 1.3px,transparent 1.3px);background-size:24px 24px;opacity:0.6;pointer-events:none}
.stipt .hero .wrap{position:relative;z-index:1;display:grid;gap:46px}
@media(min-width:860px){.stipt .hero .wrap{grid-template-columns:1.05fr 0.95fr;align-items:center}}
.stipt .badge{display:inline-flex;align-items:center;gap:8px;background:var(--teal-tint);color:var(--nacht-teal);font-family:var(--font-mono);font-size:12px;letter-spacing:0.05em;padding:6px 13px;border-radius:999px}
.stipt .badge .dot{width:7px;height:7px;border-radius:50%;background:var(--oker)}
.stipt h1.big{font-size:clamp(38px,6.4vw,64px);font-weight:700;letter-spacing:-0.04em;margin:20px 0 0}
.stipt h1.big .u{color:var(--diep-teal)}
.stipt .hero p.sub{font-size:19px;color:var(--steen-700);max-width:46ch;margin-top:20px}
.stipt .hero .cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.stipt .hero .cta .btn{padding:13px 22px;font-size:15.5px}
.stipt .hero .micro{margin-top:16px;font-size:13.5px;color:var(--steen-400)}

/* PHONE MOCK */
.stipt .phone{justify-self:center;width:290px;background:var(--nacht-teal);border-radius:34px;padding:14px;box-shadow:0 40px 70px -40px rgba(10,60,56,0.7)}
.stipt .phone .screen{background:var(--papier);border-radius:22px;overflow:hidden}
.stipt .phone .top{background:var(--diep-teal);color:#fff;padding:16px 16px 14px;display:flex;align-items:center;justify-content:space-between}
.stipt .phone .top .l{display:flex;align-items:baseline;gap:2px}
.stipt .phone .top .l .w{font-family:var(--font-display);font-weight:700;font-size:17px}
.stipt .phone .top .l .d{width:5px;height:5px;border-radius:50%;background:var(--oker);margin-bottom:3px}
.stipt .phone .top .k{font-family:var(--font-mono);font-size:10px;opacity:0.85}
.stipt .phone .bd{padding:15px 16px 18px}
.stipt .phone .row{display:flex;justify-content:space-between;font-size:12.5px;padding:8px 0;border-bottom:1px solid var(--steen-200)}
.stipt .phone .row .a{font-family:var(--font-mono)}
.stipt .phone .tot{display:flex;justify-content:space-between;font-family:var(--font-display);font-weight:600;font-size:14px;margin-top:12px;padding-top:11px;border-top:2px solid var(--inkt)}
.stipt .phone .tot .a{font-family:var(--font-mono)}
.stipt .phone .send{margin-top:15px;background:var(--oker);color:#3a2606;text-align:center;font-weight:600;font-size:13.5px;padding:11px;border-radius:10px}
.stipt .phone .stamp{margin-top:10px;text-align:center;font-family:var(--font-mono);font-size:10.5px;color:var(--succes)}

/* TRUST STRIP */
.stipt .strip{background:var(--nacht-teal);color:var(--teal-tint)}
.stipt .strip .wrap{display:flex;flex-wrap:wrap;gap:26px 46px;justify-content:space-between;padding:26px 26px}
.stipt .strip .it{display:flex;flex-direction:column}
.stipt .strip .n{font-family:var(--font-mono);font-weight:700;font-size:24px;color:#fff}
.stipt .strip .t{font-size:13px;color:#8FC9C1}

/* SECTION SHELL */
.stipt section.pad{padding:82px 0}
.stipt .eyebrow{font-family:var(--font-mono);font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:var(--diep-teal)}
.stipt h2.hd{font-size:clamp(28px,4.4vw,42px);font-weight:700;letter-spacing:-0.03em;margin-top:12px}
.stipt .sec-lead{font-size:18px;color:var(--steen-700);max-width:58ch;margin-top:14px}

/* FEATURES */
.stipt .feat-grid{display:grid;gap:18px;margin-top:44px}
@media(min-width:720px){.stipt .feat-grid{grid-template-columns:1fr 1fr}}
.stipt .feat{background:#fff;border:1px solid var(--lijn);border-radius:16px;padding:26px 26px 28px}
.stipt .feat.wide{grid-column:1/-1;background:var(--papier-2);border-style:dashed}
.stipt .feat .ic{width:42px;height:42px;border-radius:11px;background:var(--teal-tint);display:flex;align-items:center;justify-content:center;margin-bottom:16px}
.stipt .feat .ic svg{width:22px;height:22px;stroke:var(--diep-teal);fill:none;stroke-width:1.8}
.stipt .feat h3{font-size:19px;margin-bottom:8px}
.stipt .feat p{font-size:15px;color:var(--steen-700)}
.stipt .feat .tag{display:inline-block;margin-top:14px;font-family:var(--font-mono);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--oker);background:var(--oker-tint);padding:4px 9px;border-radius:6px}

/* HOW */
.stipt .how{background:var(--papier-2)}
.stipt .steps{display:grid;gap:20px;margin-top:44px;counter-reset:s}
@media(min-width:720px){.stipt .steps{grid-template-columns:repeat(3,1fr)}}
.stipt .step{position:relative;background:var(--papier);border:1px solid var(--lijn);border-radius:16px;padding:30px 24px 26px}
.stipt .step::before{counter-increment:s;content:"0" counter(s);font-family:var(--font-mono);font-weight:700;font-size:14px;color:#fff;background:var(--diep-teal);width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:16px}
.stipt .step h3{font-size:18px;margin-bottom:7px}
.stipt .step p{font-size:14.5px;color:var(--steen-700)}

/* PRICING */
.stipt .price-grid{display:grid;gap:22px;margin-top:46px;align-items:stretch}
@media(min-width:820px){.stipt .price-grid{grid-template-columns:1fr 1fr}}
.stipt .plan{background:#fff;border:1px solid var(--lijn);border-radius:20px;padding:34px 30px 32px;display:flex;flex-direction:column}
.stipt .plan.featured{border:2px solid var(--diep-teal);position:relative;box-shadow:0 30px 60px -40px rgba(10,60,56,0.55)}
.stipt .plan .rib{position:absolute;top:-13px;left:30px;background:var(--oker);color:#3a2606;font-family:var(--font-mono);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;padding:5px 12px;border-radius:999px;font-weight:700}
.stipt .plan .pn{font-family:var(--font-display);font-weight:600;font-size:22px}
.stipt .plan .pd{font-size:14px;color:var(--steen-700);margin-top:6px;min-height:40px}
.stipt .plan .amt{font-family:var(--font-display);font-weight:700;font-size:46px;letter-spacing:-0.03em;margin-top:18px}
.stipt .plan .amt .per{font-family:var(--font-body);font-weight:500;font-size:15px;color:var(--steen-400)}
.stipt .plan ul{margin:22px 0 26px;display:flex;flex-direction:column;gap:11px}
.stipt .plan li{display:flex;gap:10px;font-size:14.5px;color:var(--inkt)}
.stipt .plan li svg{width:18px;height:18px;stroke:var(--succes);fill:none;stroke-width:2.4;flex-shrink:0;margin-top:2px}
.stipt .plan li.muted{color:var(--steen-400)}
.stipt .plan li.muted svg{stroke:var(--steen-400)}
.stipt .plan .btn{margin-top:auto;text-align:center;padding:13px;font-size:15px}
.stipt .price-note{text-align:center;font-size:13px;color:var(--steen-400);margin-top:22px}

/* FINAL CTA */
.stipt .final{background:var(--nacht-teal);color:var(--papier);position:relative;overflow:hidden}
.stipt .final .dots{position:absolute;inset:0;background-image:radial-gradient(var(--diep-teal) 1.4px,transparent 1.4px);background-size:26px 26px;opacity:0.4}
.stipt .final .wrap{position:relative;z-index:1;text-align:center;padding:82px 26px}
.stipt .final h2{font-size:clamp(30px,5vw,50px);font-weight:700;letter-spacing:-0.03em;color:#fff}
.stipt .final h2 .d{color:var(--oker)}
.stipt .final p{color:#8FC9C1;font-size:18px;margin:16px auto 0;max-width:46ch}
.stipt .final .cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:30px}

/* FOOTER */
.stipt footer.ft{background:var(--papier);border-top:1px solid var(--lijn);padding:40px 0}
.stipt footer.ft .wrap{display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px;align-items:center}
.stipt footer.ft .logo .w{font-size:22px}
.stipt footer.ft .fl{display:flex;gap:22px;flex-wrap:wrap;font-size:14px;color:var(--steen-700)}
.stipt footer.ft small{color:var(--steen-400);font-size:12.5px;width:100%;margin-top:8px}
`
