# Campaign UI

The rewarded campaign component is deliberately only a UI state machine.
It never awards credits itself.

Production flow:
1. server starts/records impression;
2. client displays the creative and progress;
3. server/provider verifies completion;
4. provider verifies the required action where officially supported;
5. trusted server calls the Supabase reward function;
6. the existing credit ledger applies the returned amount atomically.

Do not treat client state as proof of completion.
