# 🔗 My Links

Mere saare links, ek hi jagah — colorful, column-wise.

**Live:** https://anishahamad.com/my-links/

## Naya link kaise add karein

1. GitHub pe [`links.js`](links.js) kholo aur ✏️ (pencil) icon dabao
   — ya website ke niche **"Links add / edit karo"** pe click karo.
2. Jis column me link chahiye, uski `links: [ ... ]` list me ek line jodo:

   ```js
   { title: "Mera Naya Link", url: "https://example.com" },
   ```

3. Niche **Commit changes** dabao. 1–2 minute me website update ho jayegi.

## Naya column kaise banayein

`COLUMNS` list me ye pura block copy-paste karo:

```js
{
  name: "Music",
  icon: "🎵",
  links: [
    { title: "Spotify", url: "https://open.spotify.com/" },
  ],
},
```

Har column ka color apne aap lagta hai. Apna color chahiye to `color: "#ff6600",` jod do.

## Title / subtitle badalna

`links.js` ke upar `SITE` me `title` aur `subtitle` badal do.
