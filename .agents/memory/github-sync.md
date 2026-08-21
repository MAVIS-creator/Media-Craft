---
name: GitHub synchronization
description: How to safely synchronize this project when its local Git credential is invalid.
---

Use the authenticated GitHub connector for repository writes when a command-line push reports invalid credentials. Create a remote safety branch before moving a shared branch, and verify the remote ref afterward.

**Why:** The local HTTPS remote can retain an expired or unavailable credential even when the project’s GitHub integration is authorized.

**How to apply:** Keep chat attachments out of the remote snapshot unless they are intentional product assets. After the authenticated update, fetch the branch and align local `main` to the verified remote ref so later pushes do not reintroduce a divergent-history error.