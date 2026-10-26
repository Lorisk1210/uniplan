// Electron downloads its binary the first time something asks for it. Do that once here.
// Otherwise every parallel desktop test starts the download, and one runs a half-written file (ETXTBSY).
import 'electron';

export default function globalSetup(): void {}
