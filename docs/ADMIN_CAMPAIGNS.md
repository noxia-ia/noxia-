# NOXIA Admin — campaign control

The admin panel is a control surface, not the reward authority.

Admin can configure:
- campaign name;
- provider;
- creative URL;
- action URL;
- duration;
- reward amount;
- max rewards;
- start/end dates;
- draft/active/paused/ended state.

Persistence must be implemented through authenticated server actions/RPCs
with an admin role check. The client component must never write campaign
tables directly with elevated privileges.

Changing reward amount or max rewards should be audited.
Credit balances remain exclusively controlled by the existing ledger.
