// Views: Home landing page and About page.
import { el, icon, card, MODULES, LOGO_SVG } from './core.js';
import { pageHead } from './views1.js';

export function home(root) {
  root.append(
    el('div', { class: 'home-hero' },
      el('div', { class: 'page-watermark', 'aria-hidden': 'true' }),
      el('div', { class: 'home-logo', html: LOGO_SVG }),
      el('div', { class: 'home-hero-text' },
        el('h1', { class: 'home-title' }, 'Forensic & Regulatory Intelligence Suite'),
        el('p', { class: 'home-sub' }, 'One workspace for financial-crime, forensic and regulatory work — trace who owns a company and where its money goes, run the AML screening / monitoring / onboarding queues, and check it all against real regulation. Pick a domain below, or jump straight to the Executive Overview.'),
        el('div', { class: 'row wrap', style: { gap: '8px', marginTop: '12px' } },
          el('span', { class: 'demo-tag', title: 'All data here is fabricated for demonstration.' }, el('span', { class: 'dot' }), 'Synthetic Demo Data'),
          el('a', { class: 'btn sm', href: '#/about' }, icon('info', 14), 'What is this?'),
          el('a', { class: 'btn sm', href: '#/overview' }, icon('overview', 14), 'Executive Overview')))));

  // ── "Start here" strip: three curated shortcuts, rendered with the existing
  // full-width .module-card callout pattern (accent bar + icon + one line +
  // primary button). Everything else lives in the sectioned grids below.
  const callout = ({ href, mc, iconName, title, badge, what, cta }) => el('a', {
    class: 'module-card mt2', href, style: { '--mc': mc, display: 'block', textDecoration: 'none' }, title: cta,
  },
    el('div', { class: 'row wrap', style: { gap: '14px', alignItems: 'center' } },
      el('div', { class: 'mc-icon', style: { flex: '0 0 auto' } }, icon(iconName, 22)),
      el('div', { style: { flex: '1 1 320px', minWidth: '260px' } },
        el('div', { class: 'row wrap', style: { gap: '8px', alignItems: 'center', marginBottom: '4px' } },
          el('div', { class: 'mc-name' }, title),
          badge || null),
        el('p', { class: 'mc-what', style: { margin: '0' } }, what)),
      el('span', { class: 'btn primary', style: { flex: '0 0 auto' } }, icon(iconName, 15), cta, icon('chevron', 15))));

  root.append(callout({
    href: '#/compliance', mc: '#37c2b4', iconName: 'scale',
    title: 'Instant compliance check', cta: 'Open the sandbox',
    what: 'Describe your situation — a problem, a policy, or a plain question — and get a first-pass read of what law applies, whether to call legal, and the next steps. Regionally aware across the EU, UK, Switzerland and US states.',
  }));
  root.append(callout({
    href: '#/recovery', mc: '#c77dff', iconName: 'search',
    title: 'Follow the asset', cta: 'Open recovery map',
    badge: el('span', { class: 'badge sq', style: { background: 'rgba(199,125,255,0.16)', color: '#c77dff', borderColor: 'rgba(199,125,255,0.5)' }, title: 'The cross-suite capstone' }, 'Capstone'),
    what: 'The capstone view: pick a debtor and FRIS joins ownership (Nexus), crypto balances (Chain-Link) and the insolvency estate (Waterfall) into one “where is the recoverable value, and who controls it” picture.',
  }));
  root.append(callout({
    href: '#/screening', mc: '#f0616d', iconName: 'alert',
    title: 'Screen a name against watchlists', cta: 'Open screening',
    what: 'Paste a name, entity or wallet and get ranked sanctions / PEP / adverse-media / internal matches, each with a 0–100 score and a why-it-matched breakdown — the front door to the AML workflow.',
  }));

  // ── The five titled sections. Cards reuse the exact .module-card grid markup.
  // The four canonical modules come from MODULES (core.js); the rest are a small
  // local list built by condensing each module's own existing callout copy.
  const HOME_CARDS = {
    overview: { name: 'Executive Overview', route: '#/overview', icon: 'overview', color: '#8aa0b6', tagline: 'One-screen picture', what: 'The cross-module snapshot — headline counts, alerts and dates across every FRIS domain, with a jump into any of them.' },
    nexus: { name: 'Sovereign Nexus', route: '#/nexus', icon: 'nexus', color: '#4d8df0', tagline: 'Corporate ownership & beneficial-owner forensics', what: 'Map who really owns and controls companies — shells, parents, trusts and ultimate beneficial owners — with a transparent flight-risk score for every entity.' },
    chainlink: { name: 'Chain-Link Engine', route: '#/chainlink', icon: 'chain', color: '#37c2b4', tagline: 'Crypto transaction tracing', what: 'Follow funds across wallets, mixers and bridges with a step-through peel-chain player and laundering-pattern detectors.' },
    waterfall: { name: 'Liquidation Waterfall', route: '#/waterfall', icon: 'waterfall', color: '#a97bf0', tagline: 'Insolvency recovery modelling', what: 'Distribute an estate across creditor classes in legal priority order, to the penny, with live assumptions and clawback probabilities.' },
    regulatory: { name: 'Regulatory Horizon', route: '#/regulatory', icon: 'regulatory', color: '#e5a53b', tagline: 'Compliance monitoring & policy comparison', what: 'An operational-impact alert feed over 47 real, publicly-sourced instruments (GDPR, MiCA, DORA, FINMA, the Swiss FADP, Geneva LIPAD…), plus a policy-vs-regulation gap sandbox.' },
    recovery: { name: 'Asset Tracing & Recovery', route: '#/recovery', icon: 'search', color: '#c77dff', tagline: 'Cross-suite recovery map', badge: 'Capstone', what: 'Joins Nexus, Chain-Link and Waterfall into one view: where the recoverable value is, and who controls it.' },
    screening: { name: 'Screening & Watchlist', route: '#/screening', icon: 'alert', color: '#f0616d', tagline: 'Name / entity / wallet screening', what: 'Ranked sanctions / PEP / adverse-media / internal matches with an explainable 0–100 score and a confirm / false-positive workflow.' },
    monitoring: { name: 'Transaction Monitoring & SAR', route: '#/monitoring', icon: 'bell', color: '#e5a53b', tagline: 'Typology-rule alerting + SAR builder', what: 'Named AML/CFT typology rules raise a severity-scored alert queue over the seeded transactions; disposition each and generate a SAR narrative.' },
    adverse: { name: 'Adverse-Media / OSINT', route: '#/adverse-media', icon: 'regulatory', color: '#a97bf0', tagline: 'Negative-news monitoring', what: 'A classified feed of news-style mentions (category, severity, sentiment, source grade) that rolls up per subject to corroborate a screening hit.' },
    vendors: { name: 'Third-Party / Vendor Risk', route: '#/vendors', icon: 'nexus', color: '#c1121f', tagline: 'Composite counterparty risk file', what: 'One 0–100 vendor score aggregating ownership, screening, jurisdiction and governance signals from across the suite, with an explainable breakdown.' },
    onboarding: { name: 'KYC & Onboarding', route: '#/onboarding', icon: 'folder', color: '#38bda0', tagline: 'CDD intake & risk rating', badge: 'CDD / KYC', badgeColor: '#38bda0', what: 'Turns an applicant into an explainable Low / Medium / High / Prohibited rating by composing Screening, Adverse-Media and the Risk Index, and sets a review cadence.' },
    surveillance: { name: 'Trade Surveillance', route: '#/surveillance', icon: 'eye', color: '#5bbfb5', tagline: 'Market-abuse detection', what: 'Explainable MAR-style detectors for insider dealing, spoofing and wash trading over a synthetic order book, each with an evidence timeline.' },
    typology: { name: 'Financial-Crime Typology Lab', route: '#/typology', icon: 'chain', color: '#c77dff', tagline: 'Illicit-finance scenario & detector validation', what: 'Build a laundering / sanctions-evasion typology from stage blocks, run it, and see which real FRIS detectors catch it — and where the gaps are.' },
    compliance: { name: 'Compliance Sandbox', route: '#/compliance', icon: 'scale', color: '#37c2b4', tagline: 'Jurisdiction-aware triage', what: 'Describe a situation and get what-applies (grouped by jurisdiction), a raise-with-legal / defined-process verdict, and concrete next steps.' },
    register: { name: 'Control Register (GRC)', route: '#/register', icon: 'check', color: '#7c9cf5', tagline: 'Obligation → control → evidence', what: 'Maps real framework obligations (with citations) to controls, owners, evidence and tests, with a live compliance-posture matrix and a gaps queue.' },
    enforcement: { name: 'Enforcement Tracker', route: '#/enforcement', icon: 'alert', color: '#e07b39', tagline: 'Real, cited enforcement corpus', badge: 'Real & cited', what: 'Sixteen real, public-record regulator actions — from BNP Paribas and 1MDB to the landmark GDPR fines — with a penalties-by-year trend and a per-case factual basis linked to the official source.' },
    riskIndex: { name: 'Country & Sector Risk Index', route: '#/risk-index', icon: 'overview', color: '#d5303e', tagline: 'Jurisdiction × sector heat-map', what: 'Coarse, sourced risk bands per jurisdiction (secrecy, AML/CFT, corruption, sanctions, rule of law, tax transparency) and per sector, with a combined lookup.' },
    financials: { name: 'Financial Report', route: '#/financials', icon: 'overview', color: '#4d8df0', tagline: 'Synthetic corporate financials', what: 'A quarter of a fictional company’s numbers: a reconciling P&L, a cash-flow bridge, revenue by segment, a YoY comparison and the expense breakdown. Print-friendly.' },
    data: { name: 'Data Management', route: '#/data', icon: 'database', color: '#8aa0b6', tagline: 'Import, export & reset the seed', what: 'Load or export the seeded dataset as JSON / CSV, or restore the deterministic demonstration seed.' },
    cases: { name: 'Saved Cases', route: '#/cases', icon: 'folder', color: '#8aa0b6', tagline: 'Cross-module case dossiers', what: 'Link entities, wallets, instruments, traces and scenarios into one case, with a printable report.' },
    audit: { name: 'Audit Log', route: '#/audit', icon: 'history', color: '#8aa0b6', tagline: 'Every action, timestamped', what: 'A timestamped record of the actions taken in this local session.' },
    settings: { name: 'System Settings', route: '#/settings', icon: 'settings', color: '#8aa0b6', tagline: 'Preferences & appearance', what: 'Session preferences and appearance options for the workspace.' },
    about: { name: 'About', route: '#/about', icon: 'info', color: '#8aa0b6', tagline: 'What FRIS is, and what’s real vs synthetic', what: 'Who FRIS is for, the problem it solves, and an honest account of what is real regulation and what is synthetic demonstration data.' },
  };

  const mod = (m) => el('a', { class: 'module-card', href: m.route, style: { '--mc': m.color } },
    el('div', { class: 'mc-head' },
      el('div', { class: 'mc-icon' }, icon(m.icon, 22)),
      el('div', {},
        el('div', { class: 'row wrap', style: { gap: '7px', alignItems: 'center' } },
          el('div', { class: 'mc-name' }, m.name),
          m.badge ? el('span', { class: 'badge sq', style: m.badgeColor
            ? { background: 'color-mix(in srgb, ' + m.badgeColor + ' 16%, transparent)', color: m.badgeColor, borderColor: 'color-mix(in srgb, ' + m.badgeColor + ' 50%, transparent)' }
            : {}, title: m.badge }, m.badge) : null),
        el('div', { class: 'mc-tag' }, m.tagline))),
    el('p', { class: 'mc-what' }, m.what),
    el('div', { class: 'mc-open' }, 'Open module', icon('chevron', 15)));

  const section = (title, blurb, keys) => {
    root.append(el('div', { class: 'nav-section-title', style: { fontSize: '15px', fontWeight: '700', color: 'var(--text)', margin: '26px 0 2px', letterSpacing: '0', textTransform: 'none' } }, title));
    root.append(el('p', { class: 'muted small', style: { margin: '0 0 12px', maxWidth: '860px', lineHeight: '1.5' } }, blurb));
    const grid = el('div', { class: 'module-grid' });
    for (const k of keys) grid.append(mod(HOME_CARDS[k]));
    root.append(grid);
  };

  section('Overview', 'Start here. Get the one-screen picture, then open the domain you need.',
    ['overview']);
  section('Investigations & Forensics', 'Follow a company and its money — trace who really owns and controls it, and trace the crypto that moves through it.',
    ['nexus', 'chainlink']);
  section('Recovery & Insolvency', 'When it unwinds: model the wind-down in legal priority order and follow the assets to see what’s actually recoverable — and who controls it.',
    ['recovery', 'waterfall']);
  section('Financial Crime & AML', 'The compliance desk’s working loop — screen, monitor, corroborate, decide, and validate your detectors. Synthetic lists and alerts; never a system of record.',
    ['screening', 'monitoring', 'adverse', 'vendors', 'onboarding', 'surveillance', 'typology']);
  section('Regulatory & Compliance', 'The rules themselves, and how you stand against them — track change, triage your situation, map obligations to controls, learn from real enforcement, and rate exposure. Real, cited regulation; synthetic internal posture.',
    ['regulatory', 'compliance', 'register', 'enforcement', 'riskIndex']);
  section('Workspace', 'Read a set of financials, manage your data and cases, and see how FRIS itself is built.',
    ['financials', 'data', 'cases', 'audit', 'settings', 'about']);

  root.append(el('p', { class: 'muted small', style: { textAlign: 'center', marginTop: '24px' } },
    'All data is synthetic and for demonstration only — nothing here represents a real person or company.'));
}

/* ---------- Local helpers used only by about() ---------- */

// Section heading, self-styled so it reads as a heading without new CSS.
function aboutH(text) {
  return el('div', { style: { fontSize: '15px', fontWeight: '700', color: 'var(--text)', margin: '22px 0 6px' } }, text);
}

// A single "who it's for" row: a coloured module dot, the roles, and a one-line reason.
// Self-styled (inline) so it stays polished without depending on new CSS classes.
function roleRow(moduleKey, roles, reason) {
  const m = MODULES.find((x) => x.key === moduleKey);
  const color = m ? m.color : 'var(--accent)';
  return el('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 0' } },
    el('span', { style: { flex: '0 0 auto', width: '8px', height: '8px', borderRadius: '50%', background: color, marginTop: '6px', boxShadow: '0 0 0 3px color-mix(in srgb, ' + color + ' 22%, transparent)' } }),
    el('div', {},
      el('div', { style: { fontSize: '13.5px', fontWeight: '600', color: 'var(--text)' } }, roles),
      el('div', { style: { fontSize: '12.5px', color: 'var(--text-3)', lineHeight: '1.5', marginTop: '2px' } }, reason)));
}

// A short narrative "here is how you would actually use it" scenario card.
function useCase(step, title, ...paras) {
  return card(null, {},
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' } },
      el('span', { style: { flex: '0 0 auto', width: '30px', height: '30px', borderRadius: '8px', display: 'grid', placeContent: 'center', fontSize: '12px', fontWeight: '700', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 42%, transparent)' } }, step),
      el('div', { style: { fontSize: '14.5px', fontWeight: '700', color: 'var(--text)' } }, title)),
    ...paras.map((p) => el('p', { class: 'about-p' }, p)));
}

export function about(root) {
  root.append(el('div', { class: 'page-watermark', 'aria-hidden': 'true' }));
  root.append(pageHead('About FRIS', 'Who it is for, the problem it solves, and why you would use it'));

  // 1. Mission / positioning.
  root.append(el('div', { class: 'intro' },
    el('span', { class: 'ico' }, icon('info', 18)),
    el('div', { class: 't' },
      el('b', {}, 'FRIS brings four normally-separate investigations into one workspace.'),
      ' Tracing who really owns a company, following crypto out of a wallet, modelling who gets paid in an insolvency, and keeping up with the regulation that governs all of it are usually done in different tools, by different people, with results that never quite line up.')));

  root.append(card('The problem it solves', {},
    el('p', { class: 'about-p' }, 'Financial-crime, due-diligence and recovery work is fragmented and largely manual. An analyst pulls ownership data from one register, hand-builds a spreadsheet of wallet hops from a block explorer, models creditor recoveries in a separate workbook, and tracks regulatory change across a scatter of newsletters and PDFs. Each hand-off loses context, and no single view connects an entity to its money, its downside, and the rules that apply to it.'),
    el('p', { class: 'about-p' }, 'FRIS is built around the idea that these questions belong together. Corporate ownership forensics, crypto tracing, insolvency-recovery modelling and regulatory intelligence sit behind one enterprise interface, share a common set of cases, and use consistent, explainable scoring — so an investigator can move from “who controls this?” to “where did the money go?” to “what would creditors actually recover?” to “which regulation governs this?” without leaving the workspace.')));

  // 2. Who it's for.
  const roles = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr', gap: '2px' } },
    roleRow('nexus', 'Investigators & KYC / AML analysts', 'Trace beneficial ownership and unwind offshore layering that hides who is really in control.'),
    roleRow('nexus', 'Investigative journalists', 'Follow ownership chains across jurisdictions to substantiate a story with a defensible trail.'),
    roleRow('nexus', 'Due-diligence & corporate-intelligence teams', 'Screen counterparties and targets before a deal, and document the reasoning behind a risk call.'),
    roleRow('chainlink', 'Blockchain-forensics analysts', 'Follow funds across wallets, mixers and bridges to expose laundering and layering patterns.'),
    roleRow('chainlink', 'Financial-crime investigators', 'Reconstruct where money went and build the narrative that connects wallets to real-world actors.'),
    roleRow('chainlink', 'Exchange compliance teams', 'Assess incoming flows and flag exposure to high-risk sources before funds are credited.'),
    roleRow('waterfall', 'Insolvency practitioners & restructuring advisors', 'Model recoveries by creditor class and test assumptions before committing to a strategy.'),
    roleRow('waterfall', 'Creditors & litigation funders', 'See the realistic downside — who is paid, in what order, and what is likely recovered — before funding a claim.'),
    roleRow('regulatory', 'Compliance officers & risk managers', 'Stay ahead of regulatory change and triage which new rules actually touch the business.'),
    roleRow('regulatory', 'Legal & regulatory teams', 'Check an internal policy against a live instrument to surface gaps and contradictions early.'));

  root.append(card('Who it is for', { sub: 'Concrete roles, and the reason each would reach for FRIS' },
    roles,
    el('p', { class: 'about-p', style: { marginTop: '14px' } },
      'It also fits cross-cutting users: financial regulators mapping systemic exposure, law firms preparing cases and disclosures, fintech risk teams standing up controls, and academic or teaching settings that need a realistic, self-contained sandbox for forensic and compliance work.')));

  // 2b. What's inside — the four modules and the capabilities added since launch.
  root.append(el('div', { class: 'mt2' }, aboutH('What is inside')));
  root.append(el('div', { class: 'grid k2' },
    card('Four modules, one workspace', { sub: 'Each with a plain-English intro and per-page help' },
      el('ul', { class: 'about-list' },
        el('li', {}, el('b', {}, 'Sovereign Nexus'), ' — corporate-ownership forensics: a network explorer, an offline jurisdiction map, and an Ownership X-ray that traces the control chain up to the ultimate beneficial owner.'),
        el('li', {}, el('b', {}, 'Chain-Link Engine'), ' — crypto tracing: a transaction graph with step-through peel-chain playback, a wallet directory, and detection alerts.'),
        el('li', {}, el('b', {}, 'Liquidation Waterfall'), ' — insolvency-recovery modelling: distribute an estate across creditor classes in priority order with live, exact recalculation.'),
        el('li', {}, el('b', {}, 'Regulatory Horizon'), ' — compliance intelligence over a register of 47 real instruments: an alert feed, a coverage matrix, upcoming effective dates, and the comparison sandbox.'))),
    card('Recently added', { sub: 'Capabilities layered on since the first release' },
      el('ul', { class: 'about-list' },
        el('li', {}, el('b', {}, 'Cross-module case dossiers'), ' — link entities, wallets, instruments, traces and scenarios into one case, with a printable PDF report.'),
        el('li', {}, el('b', {}, 'Command palette'), ' (⌘/Ctrl-K) — jump to any page or record, or run a command, from the keyboard.'),
        el('li', {}, el('b', {}, 'Ownership X-ray'), ' in Nexus and a regulatory ', el('b', {}, 'coverage matrix'), ' that maps instruments by sector and jurisdiction to expose gaps.'),
        el('li', {}, el('b', {}, 'Saved views'), ', waterfall ', el('b', {}, 'scenario comparison'), ', and a sandbox that ', el('b', {}, 'auto-detects'), ' which regulations a pasted policy matches.')))));

  // 3. Representative use cases.
  root.append(aboutH('How it comes together'));
  root.append(el('p', { class: 'muted', style: { margin: '0 0 14px', maxWidth: '820px', lineHeight: '1.6' } },
    'The modules are most useful when chained. Two representative walkthroughs:'));

  root.append(el('div', { class: 'grid k2' },
    useCase('01', 'An offshore ownership chain, end to end',
      'A due-diligence analyst opens Sovereign Nexus and starts from a Geneva holding company. The ownership network traces it up through a BVI parent and a Cayman trust to an ultimate beneficial owner, and each entity carries a transparent Jurisdictional Asset Flight Risk score they can open factor by factor.',
      'Noticing outbound crypto activity tied to the structure, they switch to the Chain-Link Engine and follow the funds across a peel chain — through a mixer and a bridge — until the flow converges on an exchange. Before acting, they open Regulatory Horizon to confirm which instruments (data-protection and crypto-asset rules) govern the request, each linking to its official source.'),
    useCase('02', 'From a failing company to what creditors recover',
      'A restructuring advisor loads a case into the Liquidation Waterfall and distributes the estate across secured, preferential and unsecured classes in legal priority order. Adjusting the live assumptions, they watch recovery rates and shortfalls change, and read clawback probabilities on suspect transfers.',
      'To pressure-test the picture, they pivot to Sovereign Nexus to check whether assets were moved to related parties before the wind-down, and log the whole thread — entity, trace and scenario — into a single saved case that a colleague can pick up later.')));

  // 4. Honest data-provenance note.
  root.append(el('div', { class: 'mt2' }, aboutH('What is real, and what is synthetic')));
  root.append(el('div', { class: 'grid k2' },
    card('Real, publicly-sourced regulation', { sub: 'Regulatory Horizon' },
      el('p', { class: 'about-p' }, 'The regulatory register is genuine. Regulatory Horizon is built on 47 real, publicly-sourced instruments \u2014 including the GDPR, MiCA, DORA, FINMA circulars, the Swiss FADP / nFADP and Geneva\u2019s LIPAD \u2014 and every instrument links out to its official source so you can verify the obligations, authority and effective dates yourself.'),
      el('p', { class: 'about-p' }, 'Only the internal policies compared against those rules in the sandbox are fabricated, so the comparison has something to check against. The register itself is the real thing, and is meant to be verified rather than trusted blindly.')),
    card('Synthetic demonstration data', { sub: 'Nexus \u00b7 Chain-Link \u00b7 Waterfall' },
      el('p', { class: 'about-p' }, 'The corporate, crypto and insolvency modules run on synthetic demonstration data \u2014 realistic but entirely fictional entities, wallets and cases. This is a deliberate, responsible design choice: attaching a flight-risk, laundering or recovery score to a real, named party would be inappropriate and could defame someone, so no record here represents a real person or company.'),
      el('p', { class: 'about-p' }, 'The engines, however, are real and deterministic. The scoring, the peel-chain simulation and the insolvency distribution are the same production logic you would run on real data \u2014 only the inputs are fictional.'))));

  // 5. Built & verified \u2014 capabilities, kept brief.
  root.append(el('div', { class: 'mt2' }, card('Built & verified', { sub: 'Why the outputs can be trusted' },
    el('p', { class: 'about-p' }, 'FRIS is built framework-free \u2014 vanilla JavaScript, SVG and CSS with zero third-party runtime dependencies \u2014 and every analytical result is deterministic, explainable and unit-tested. Analytical scores are decision-support signals and triage aids, not factual allegations or legal advice; they are designed to be opened and inspected rather than taken on faith.'),
    el('ul', { class: 'about-list' },
      el('li', {}, 'Exact BigInt money maths \u2014 insolvency distributions reconcile to the penny.'),
      el('li', {}, 'Value-conserving crypto peel-chain simulation (initial = residual + peeled + fees).'),
      el('li', {}, 'Every risk score can be opened and read factor by factor \u2014 nothing is a black box.'),
      el('li', {}, 'The same engines run on a server, fully in the browser, and inside the desktop and mobile wrappers.'),
      el('li', {}, 'Built for accessibility: keyboard-operable controls and rows, screen-reader announcements for alerts and confirmations, associated form labels, and respect for the OS reduced-motion setting.')))));
}
