# Proposal: Equipment-aware electronic receipt lines

## Why

Sales created from a multi-equipment service order currently collapse the
confirmed quote into order-level concepts. The electronic receipt therefore
cannot identify which service or product belongs to each returned equipment.

## What changes

- Build sale lines from the confirmed commercial version of every equipment.
- Include the equipment item code and a short equipment description in service
  concepts.
- Include the equipment item code in product concepts.
- Keep the aggregate agreement snapshots as a compatibility fallback for old
  records without item-version links.
- Continue sending the sale item snapshots to the electronic billing provider;
  no provider PDF customization is introduced.

## Rollback

Restore order-level draft line construction. No schema rollback is required.
