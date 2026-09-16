# Postiz: Telegram formatting changes

Base: upstream `gitroomhq/postiz-app` tag `v2.23.0`, commit
`1e4c8dd5c4f70c4d0abd01e23cc42d5b533d1ab9`.

This branch moves the Telegram formatting customizations into TypeScript source.
No generated frontend chunks, installed-service files, channel posts or credentials
are part of the change. The upstream AGPL-3.0 license is retained.

## Changes

- The HTML editor preserves block quotes and soft line breaks; use `Mod+Shift+B`
  and `Shift+Enter`. The extensions are enabled for HTML destinations.
- Sanitization retains quotes. The outgoing HTML filter retains quotes, breaks
  and encoded entities, so literal `<tags>` remain text after parsing.
- The Telegram formatter preserves named HTTP(S) links, emphasis, quotes and
  explicit paragraph spacing. It uses the existing `parse5` dependency.
- One photo with more than 1024 visible UTF-16 code units uses a single
  `sendRichMessage`, with the photo before the body. Other send routes remain.
- Full outgoing post text is no longer printed to the console.

The current `node-telegram-bot-api` version has no public `sendRichMessage` wrapper.
`telegram.format.ts` contains a small typed compatibility boundary for its
`_formatSendData` and `_request` methods. Recheck it when updating that dependency.
See the [Telegram Bot API](https://core.telegram.org/bots/api#sendrichmessage).

## Development and validation

Use Node 22.20 and pnpm 10.6.1, matching the Dockerfile and package manager pin.

```sh
pnpm install --frozen-lockfile
pnpm run test:telegram
pnpm run build
docker build -f Dockerfile.dev --build-arg NEXT_PUBLIC_VERSION=v2.23.0-telegram.1 -t postiz-app:v2.23.0-telegram.1 .
```

The focused tests cover the complete editor/sanitizer/outgoing-filter/Telegram
path, entities, quotes, spacing, unsafe links, upload/reference transport and the
provider's text/photo/video/document/album routing. Telegram calls are mocked.
They do not publish posts or validate visual rendering in Telegram clients.

The existing Build workflow and Dockerfile run these tests before building. The container
workflow derives its GHCR namespace from the fork repository instead of writing
to the upstream project's registry. The workflow accepts tag refs only. Run it after tests and
build review; it publishes an image and updates `latest` in that fork namespace.

## Installation transition

Preparing this branch does not update the running service. Before switching:

1. Build and test the image from an immutable reviewed commit/tag.
2. Compare current installed behavior with this source version in a separate
   instance, without connecting production channels for test sends.
3. Point the service to the fork image and remove only the old code override
   mounts. Keep database, storage, secrets and other service configuration.
4. Recreate only the Postiz application container during agreed maintenance.

Until then, the current service continues to use its existing local overrides.
Rollback means restoring the previous image and code-mount configuration; no
database reset is part of this change. Future updates should merge/rebase from
upstream and rerun the focused tests and full build.

## Validation on 2026-09-16

- All 26 regression tests passed (22 formatter/provider checks and 4 editor
  pipeline checks). All Telegram operations were mocked; test containers had no network.
- The new formatter and editor extension passed a focused TypeScript check.
- Backend, orchestrator and frontend production builds passed in disposable
  containers using the dependencies from the official v2.23.0 image. Frontend
  compilation required network access to download its existing Google font.
- A fresh dependency installation, final release-image build, GitHub CI run and
  deployment have not been performed. No running service was changed.
