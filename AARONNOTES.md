# Disconnection Feature

On Disconnection, everything is reset to the initial state.

`walletConnected` ref added to synchronize states in the case that an async function from the account connection has returned after `disconnect` has triggered. This way, the retrieved data is trashed instead of used to change the state.

# Coinbase Wallet Feature

Redid ethereum requests to ensure they are sent to the correct wallet provider and not just the most recently mounted one. When the coinbase wallet is attached, it will only ever send requests through the coinbase API not through metamask