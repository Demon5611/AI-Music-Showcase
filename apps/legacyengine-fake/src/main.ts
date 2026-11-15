import { startFakeLegacyengineServer } from "./server.js";

const port = Number(process.env.PORT ?? 4010);
startFakeLegacyengineServer(port);
console.log(`legacyengine-fake listening on :${port}`);
