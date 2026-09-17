# 🔗 My Links

All my links in one place — colorful, column-wise, and editable right on the website.

**Live:** https://annilinks.github.io/

## Editing links on the website

Visitors only see the links. Editing is only for you:

1. Click **Login** at the bottom of the page and sign in.
2. Click **✏️ Edit** (bottom-right).
3. Add, edit, move or delete links and columns. Click the title to change the title and subtitle.
4. Click **💾 Save**. Everyone sees the update in 1–2 minutes.

To change the login password, use **🔒 Password** in edit mode.
The login is stored in [`auth.json`](auth.json) as a salted hash, never the password itself.

The first time you save, the site asks for a GitHub token. It is stored only in that browser.

**Creating the token (one time):**

1. Go to https://github.com/settings/personal-access-tokens/new
2. Resource owner: `annilinks`
3. Repository access → Only select repositories → `annilinks.github.io`
4. Permissions → Contents → **Read and write**
5. Generate the token and paste it into the website

Visitors without a token can't save anything.

## Stats

After logging in, click **📊 Stats** (bottom-right) to see:

- page views, visitors (by IP address) and link taps for today, the last 7 or 30 days, or all time
- taps and copies for every link, including links nobody has tapped
- each visitor IP with how many times it visited, what it tapped, location and device
- where visitors came from, countries, devices, browsers and recent activity

Your own visits aren't counted while you're logged in. Stats also need the GitHub token on that device.

Visits are recorded by a small Cloudflare Worker with a D1 database. Its code is in [`stats-worker/`](stats-worker/).
To redeploy it: `cd stats-worker && npx wrangler deploy`.

## Where the links live

All links are stored in [`links.json`](links.json). You can also edit that file directly on GitHub.
