# Design

The pricing query calculates customer-facing prices including IGV. Cost selection is current CPP first, followed by the latest positive inventory movement unit cost. The cost source is returned and persisted for audit but omitted from the UI. Commercial revision validation recalculates the recommendation server-side inside the request flow.
