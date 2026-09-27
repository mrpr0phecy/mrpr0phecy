# Drive mailbox

Not part of the website. Do not merge this folder to `main`.

`job.json` and `result.json` are sealed notes for the owner's own computer.
They are ciphertext. The key is not in this repository.
Nothing here is served as a tool, and nothing here should be linked from the site.

`start.sh` runs on the owner's computer. It downloads the pinned agent, stores the key only in `~/.arena-bridge/key`, and starts the listener. It does not read or change other files. Jan's local API cannot carry this link: it listens on that computer, and this session cannot dial in. GitHub is the path both sides can reach.
