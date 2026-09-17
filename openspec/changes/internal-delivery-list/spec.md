# Internal delivery register
- Show one paginated row per internal guide under Service orders for admin/supervisor.
- Filter by receiving technician (historical delivery recipient) with searchable ng-select and inclusive Lima date range. Validate dates and pagination server-side.
- Detail exposes products, quantities, exact serials, faulty returns and sale references. No inventory mutations from this register.
- View order navigates directly to supervisor order/item/materials, including orders outside the currently loaded list.
- Preserve filters on returning; handle loading, empty, errors and keyboard/mobile use.
