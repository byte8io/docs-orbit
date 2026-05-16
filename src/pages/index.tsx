import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './index.module.css';

interface FeatureCardProps {
  href: string;
  icon: string;
  title: string;
  body: string;
  cta: string;
}

function FeatureCard({ href, icon, title, body, cta }: FeatureCardProps) {
  return (
    <Link to={href} className={styles.featureCard}>
      <span className={styles.featureIcon} aria-hidden>{icon}</span>
      <h3 className={styles.featureTitle}>{title}</h3>
      <p className={styles.featureBody}>{body}</p>
      <span className={styles.featureFooter}>{cta} ↘</span>
    </Link>
  );
}

export default function Home(): React.ReactElement {
  return (
    <Layout
      title="Byte8 Orbit — Zero-downtime Magento 2 deployments"
      description="Atomic Capistrano-style releases, automatic health-check rollback, no maintenance window for code-only deploys. Deploy Magento at 2 PM on a Tuesday."
    >
      <main>
        {/* Hero */}
        <section className={styles.heroSection}>
          <div className={styles.heroContent}>
            <span className={styles.eyebrow}>Magento 2 · Zero-downtime · Atomic releases</span>
            <h1 className={styles.heroTitle}>
              Deploy Magento at 2 PM.{' '}
              <span className={styles.heroTitleAccent}>Hands-off.</span>
            </h1>
            <p className={styles.heroSubtitle}>
              Atomic Capistrano-style releases with an instant symlink swap. Health-check
              auto-rollback. Maintenance window only when a DB migration actually needs
              one — code-only deploys stay 200 the whole way through.
            </p>
            <div className={styles.heroCtas}>
              <Link className="button button--primary button--lg" to="/docs/getting-started/quick-start">
                Quick start
              </Link>
              <Link className="button button--secondary button--lg" to="/docs/">
                Read the docs
              </Link>
            </div>

            <div className={styles.statsRow}>
              <div className={styles.stat}>
                <span className={styles.statValue}>0s</span>
                <span className={styles.statLabel}>Downtime for code deploys</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>&lt; 1s</span>
                <span className={styles.statLabel}>Symlink swap</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>5</span>
                <span className={styles.statLabel}>Releases kept (default)</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>Auto</span>
                <span className={styles.statLabel}>Rollback on health-check fail</span>
              </div>
            </div>
          </div>
        </section>

        {/* Core deployment pipeline */}
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <span className={styles.sectionEyebrow}>Deployment pipeline</span>
            <p className={styles.sectionLead}>
              Atomic releases, conditional maintenance, automatic rollback —
              every deploy follows the same predictable shape.
            </p>
          </header>

          <div className={styles.cardGrid}>
            <FeatureCard
              href="/docs/zero-downtime/overview"
              icon="🪐"
              title="Atomic symlink swap"
              body="Each deploy lands in releases/{TIMESTAMP}/ alongside the live one. When everything's ready, a single ln -sfn flips the current symlink. No customer ever waits for clone, composer, or static-content:deploy."
              cta="Zero-downtime"
            />
            <FeatureCard
              href="/docs/zero-downtime/maintenance-window"
              icon="🚦"
              title="Conditional maintenance"
              body="bin/magento setup:db:status decides whether maintenance mode is needed. Code-only deploys never flip the 503. DB-migration deploys flip it only for the upgrade window — not the whole build."
              cta="Maintenance window"
            />
            <FeatureCard
              href="/docs/deployments/rollback"
              icon="↩️"
              title="Health-check rollback"
              body="After the swap, the agent curls your health-check URL. Non-2xx response → automatic symlink revert, cache:flush, and maintenance:disable on the old release. The site is back up before you see the failure alert."
              cta="Rollback"
            />
          </div>
        </section>

        {/* Architecture */}
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <span className={styles.sectionEyebrow}>Architecture</span>
            <p className={styles.sectionLead}>
              A small agent on your host plus a hosted control plane.
              Outbound-only traffic, no inbound exposure required.
            </p>
          </header>

          <div className={styles.cardGrid}>
            <FeatureCard
              href="/docs/agent/install"
              icon="📡"
              title="orbit-agent on your host"
              body="A single ~10 MB Rust binary. curl | sh installs it. Polls the Orbit control plane for tasks, executes git clone / composer / bin/magento commands locally, streams stdout/stderr back to the dashboard live."
              cta="Install the agent"
            />
            <FeatureCard
              href="/docs/getting-started/installation"
              icon="🎛️"
              title="Cloud control plane"
              body="orbit.byte8.io stores environments, schedules deploys, holds the deployment history. Multi-host, multi-environment from a single dashboard. Built on Rust + async-graphql + PostgreSQL."
              cta="Sign up"
            />
            <FeatureCard
              href="/docs/api/personal-access-tokens"
              icon="🔑"
              title="PATs for CI / scripting"
              body="Personal Access Tokens authenticate the GraphQL API for GitHub Actions, scripts, or your own tooling. Scoped per-user, revocable, hashed at rest. No session cookies, no OAuth dance."
              cta="API tokens"
            />
          </div>
        </section>

        {/* CTA band */}
        <section className={styles.ctaBand}>
          <h2 className={styles.ctaTitle}>Stop paying developers to deploy at 2 AM.</h2>
          <p className={styles.ctaSubtitle}>
            <code>curl -fsSL https://get.byte8.io/orbit-agent | sh</code> · run <code>orbit-agent init</code> · click Deploy.
          </p>
          <div className={styles.heroCtas}>
            <Link className="button button--primary button--lg" to="/docs/getting-started/quick-start">
              Quick start
            </Link>
            <Link className="button button--secondary button--lg" to="https://byte8.io/products/orbit">
              Plans & pricing
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
