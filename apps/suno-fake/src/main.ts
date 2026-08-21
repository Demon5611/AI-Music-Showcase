import { startFakeSunoServer } from "./server.js";

const port = Number(process.env.PORT ?? 4010);
startFakeSunoServer(port);
console.log(`suno-fake listening on :${port}`);
