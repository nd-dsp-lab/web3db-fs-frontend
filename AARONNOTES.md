# Disconnection Feature

On Disconnection, everything is reset to the initial state.

`walletConnected` ref added to synchronize states in the case that an async function from the account connection has returned after `disconnect` has triggered. This way, the retrieved data is trashed instead of used to change the state.