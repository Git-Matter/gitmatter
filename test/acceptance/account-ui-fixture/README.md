# Settings, shell and authentication UI fixture

Start from the repository root:

```
vp dev --config test/acceptance/account-ui-fixture/vite.config.ts
```

Port 4280 runs current settings/authentication components, the real Better Auth browser client,
shared navigation guards and sidebar in a memory router. Only the shell's session resolution is
fictional. It has no application/auth backend or environment loading: unhandled API paths return 599. Browser scripts must intercept all API and remote requests before opening a page. Challenge
callbacks and API outcomes are fictional, with no real mail, key, password, token or passkey action.

`window.accountFixture` exposes only route history, query invalidation and intentional scenario
reset. Draft input stays in component memory. These checks do not establish real authentication,
server permissions, mail delivery, credential storage, physical passkeys or live challenge service
behavior. The native unload prompt is excluded during explicit scenario resets; client route exit
guards remain active.
