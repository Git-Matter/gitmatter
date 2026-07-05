// External links for the marketing site, kept in one place.
export const SITE = {
  url: "https://gitmatter.com", // production origin — canonical/OG/sitemap base
  github: "https://github.com/Git-Matter/gitmatter", // public repo
  docs: "/docs",
  email: "contact@gitmatter.com", // single contact address for legal/privacy/security
  get contact() {
    return `mailto:${this.email}`;
  },
  bookDemo: "https://www.cal.eu/gitmatter/demo",
};
