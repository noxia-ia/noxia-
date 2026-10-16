# NOXIA — Atomic generation admission

Generation creation is now server-only and serialized per `user + module` for the admission transaction.

Flow:

1. authenticated/age-verified server action validates the request;
2. the atomic rate limiter reserves a request slot;
3. `create_generation_atomic()` takes a transaction-scoped advisory lock;
4. an existing recent `pending`/`processing` generation for the same user/module blocks the new request;
5. otherwise the generation is inserted as `pending`;
6. only then can the provider be called.

This closes the race where two simultaneous requests could both pass an in-flight check and both reach an expensive provider before either request was recorded.

The browser no longer has a direct `INSERT` privilege on `public.generations`. Creation is restricted to the server-side RPC using `service_role`.
