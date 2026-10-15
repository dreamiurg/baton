# baton

Ran out of weekly Claude quota on one account? Open the Claude Desktop window of another account, type `/bring`, and pick up your stalled Code sessions there with their full history.

## What it does

`/bring` opens a panel beside the conversation. It lists your other Claude Desktop accounts with their weekly usage, and under each one its live Code sessions, the ones that hit their limit first. **Bring** copies a session into the window you're in and opens it. The original stays where it was.

## You need

- macOS and Claude Desktop with the Code tab.
- One Desktop window per account, each on its own profile. The default profile is `~/Library/Application Support/Claude`. Start another with:

  ```bash
  open -n -a Claude --args --user-data-dir="$HOME/Library/Application Support/Claude-Work"
  ```

  and sign in to the other account in that window. Any folder name starting with `Claude` works.

## Install

In a terminal Claude Code session:

```
/plugin install baton --marketplace dreamiurg/baton
```

Answer `y` to add the marketplace and pick the user scope. Every Desktop window loads it from then on.

## Optional: names and emails

baton labels each account by its profile folder. To show your own names and emails, create `~/.config/baton/config.json`:

```json
{
  "profiles": {
    "Claude": { "label": "Personal", "email": "me@example.com" },
    "Claude-Work": { "label": "Work", "email": "me@work.example" }
  }
}
```

## Good to know

- Bring makes a copy. Continuing in both windows makes two separate conversations.
- The first message after a bring rebuilds the prompt cache on the new account, so a long session costs more tokens once.
- Weekly usage for an account appears after baton has run in that account's window once.
- Only Code-tab sessions. claude.ai chats and Cowork sessions aren't covered.

## Develop

```bash
npm install
git config core.hooksPath .githooks
scripts/lay-types.sh
npm run check && npm run test:mod
```

MIT licensed.
