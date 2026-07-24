// Permission bitmasks — the single source of truth for permission bits on the
// frontend. These MUST stay in sync with the same constants in the contract
// (smart-contracts/contracts/FileStorage.sol) and the backend
// (app/permissions.py); there is no shared module across Solidity/Python/JS.
export const READ = 1 << 0
export const WRITE = 1 << 1
export const DOWNLOAD = 1 << 2
export const DELETE = 1 << 3
export const SHARE = 1 << 4
export const MOVE = 1 << 5
export const CHANGE_OWNER = 1 << 6
export const CHANGE_ROLE = 1 << 7