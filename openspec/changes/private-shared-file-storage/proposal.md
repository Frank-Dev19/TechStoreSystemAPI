# Proposal: Private shared file storage

## Why

Inbox attachments are written below the process working directory. In a deployment with replaced containers or multiple API replicas, another process may not have the same file.

## What changes

- Centralize private binary writes behind a storage service.
- Make the private root configurable with `PRIVATE_STORAGE_ROOT`.
- Keep downloads authenticated through the API.

## Deployment note

Production MUST point `PRIVATE_STORAGE_ROOT` to a persistent private volume shared by all API replicas. The default remains `./storage` for local development.

## Rollback

Remove the storage service and restore direct filesystem writes.
