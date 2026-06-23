// External links for the marketing site, kept in one place. mike is credited in
// the README, not on the marketing page.
export const SITE = {
  url: "https://gitmatter.com", // production origin — canonical/OG/sitemap base
  github: "https://github.com/peteqian/gitmatter", // public repo
  docs: "/docs",
  email: "contact@gitmatter.com", // single contact address for legal/privacy/security
  get contact() {
    return `mailto:${this.email}`;
  },
};
